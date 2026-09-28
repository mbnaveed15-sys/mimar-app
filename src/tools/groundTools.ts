import type { Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import { formatLevel } from '../lib/drawings/levels';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import { GROUND_LEVEL, type Point, type Tool } from '../types';

/** The bits of a zustand store these tools need. */
interface Store {
  getState: () => PlannerState;
}

/** Tools that draw the ground: spot levels, contour lines and levelled areas. */
export const GROUND_TOOLS: Tool[] = ['level', 'contour', 'pad'];

const rectPoints = (a: Point, b: Point): Point[] => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

/** The ground is drawn on the ground floor: go there first. */
function onGroundFloor(s: PlannerState): boolean {
  if (s.activeLevel === GROUND_LEVEL) return true;
  s.setActiveLevel(GROUND_LEVEL);
  s.setWarning('The ground is drawn on the ground floor, so that floor is shown now. Click again.');
  return false;
}

export function groundPress(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  const p = inf.point;
  if (!d && !onGroundFloor(s)) return;
  switch (s.tool) {
    case 'level':
      s.addSpotLevel(p, s.site.groundMm);
      return;
    case 'contour': {
      if (d?.type !== 'contour') return s.setDraft({ type: 'contour', points: [p], cursor: p });
      const last = d.points[d.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1) return;
      // Clicking the first point again closes the line round a hill or a hollow.
      const tol = 10 * s.reach() * s.pxUnits();
      const first = d.points[0];
      if (d.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= tol) {
        s.addContour([...d.points, first], s.site.groundMm);
        return s.setDraft(null);
      }
      return s.setDraft({ ...d, points: [...d.points, p], cursor: p });
    }
    case 'pad':
      if (d?.type !== 'pad') return s.setDraft({ type: 'pad', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      if (Math.abs(p.x - d.x1) > 1 && Math.abs(p.y - d.y1) > 1) s.addPad(rectPoints({ x: d.x1, y: d.y1 }, p));
      return s.setDraft(null);
  }
}

export function groundHover(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'contour') s.setDraft({ ...d, cursor: inf.point });
  if (d?.type === 'pad') s.setDraft({ ...d, x2: inf.point.x, y2: inf.point.y });
}

/** A levelled area dragged out is finished when the button comes up. */
export function groundRelease(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
  if (s.tool === 'pad' && d?.type === 'pad' && dragged) {
    if (Math.abs(d.x2 - d.x1) > 1 && Math.abs(d.y2 - d.y1) > 1)
      s.addPad(rectPoints({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }));
    s.setDraft(null);
  }
}

/** Enter (or a right-click): finish the contour line being drawn. */
export function finishContour(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'contour') return false;
  if (d.points.length < 2) {
    s.setWarning('A contour line needs at least two points.');
    return true;
  }
  s.addContour(d.points, s.site.groundMm);
  s.setDraft(null);
  return true;
}

/** A typed height sets the height of the next spot levels and contour lines; a levelled area takes its size. */
export function groundMeasure(store: Store, m: Measure): string | null {
  const s = store.getState();
  const d = s.draft;
  if (s.tool === 'pad') {
    if (d?.type !== 'pad') return `Click one corner, then type width and depth, e.g. 30',40'.`;
    const [a, b] = m.kind === 'pair' ? [m.a, m.b] : m.kind === 'length' ? [m.mm, m.mm] : [0, 0];
    if (!a || !b) return `Type width and depth, e.g. 30',40'.`;
    const sx = d.x2 < d.x1 ? -1 : 1;
    const sy = d.y2 < d.y1 ? -1 : 1;
    const u = (mm: number) => mm / MM_PER_UNIT;
    s.addPad(rectPoints({ x: d.x1, y: d.y1 }, { x: d.x1 + sx * u(a), y: d.y1 + sy * u(b) }));
    s.setDraft(null);
    return null;
  }
  if (m.kind !== 'length') return heightExample(s);
  s.setSite({ groundMm: m.mm });
  return null;
}

const heightExample = (s: PlannerState) =>
  s.units === 'metric'
    ? 'Type the height above the road level, e.g. 450 mm, 1.2 m or -0.6 m.'
    : `Type the height above the road level, e.g. 1'6" or -2'.`;

export function groundReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  if (s.tool === 'pad')
    return {
      label: 'Size',
      value:
        d?.type === 'pad'
          ? `${formatLength(Math.abs(d.x2 - d.x1) * MM_PER_UNIT, s.units)}, ${formatLength(Math.abs(d.y2 - d.y1) * MM_PER_UNIT, s.units)}`
          : '',
    };
  return { label: 'Height', value: formatLevel(s.site.groundMm, s.units) };
}

export function groundHint(s: PlannerState): string {
  const d = s.draft;
  const h = formatLevel(s.site.groundMm, s.units);
  switch (s.tool) {
    case 'level':
      return `Click to put a spot level of ${h} there. Type another height first to change it (heights are above the road level, ±0).`;
    case 'contour':
      return d?.type === 'contour'
        ? `Click the next point of the ${h} contour. Enter (or a right-click) finishes it; click its first point to close it. Ctrl+Z takes back a point.`
        : `Click along a contour line of the ground at ${h}, point by point. Type another height first to change it.`;
    case 'pad':
      return d?.type === 'pad'
        ? `Click the opposite corner, or type width, depth (e.g. 30',40').`
        : 'Drag (or click two corners of) an area to level, such as a pad under the house. Set its height on the right once it is drawn.';
    default:
      return '';
  }
}
