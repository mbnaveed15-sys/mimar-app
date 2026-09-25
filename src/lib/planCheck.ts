/**
 * The plan check: the plan measured against the plot's bylaws, as rows of ✓ / ✗ / "check". Pure:
 * plan in, rows out. It is indicative only; the authority's own check is what counts.
 */
import { elementOutline, pointInPolygon, pointToSegmentDistance } from '../geometry';
import { plotRule, plotSetbacks, type Authority, type PlotRule } from './bylaws';
import { MM_PER_UNIT } from './scale';
import { buildableArea } from './site';
import { formatLength } from './units';
import { roomAreaSqMm } from '../rooms';
import { levelBaseM, SLAB_MM } from '../three/model';
import {
  levelOf,
  type Id,
  type PlanDoc,
  type PlanElement,
  type Plot,
  type Point,
  type Units,
  type Wall,
} from '../types';
import { thicknessOf } from '../walls';

export type CheckStatus = 'ok' | 'fail' | 'check';

export interface CheckRow {
  id: string;
  label: string;
  /** What the bylaws ask for, and what the plan has. */
  required: string;
  actual: string;
  status: CheckStatus;
  clause: string;
  /** Items to select to see the problem. */
  ids?: Id[];
}

export interface PlanCheck {
  authority: Authority;
  rule: PlotRule | null;
  plot: Plot;
  rows: CheckRow[];
}

const SQ_MM_PER_SQ_FT = 92903.04;
const TOLERANCE = 1; // plan units (10 mm)
const BUILT_KINDS = (w: Wall) => !w.kind;

/** A wall's four corners, thickness included. */
function wallCorners(w: Wall): Point[] {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const h = thicknessOf(w) / 2;
  const n = { x: (-(w.y2 - w.y1) / len) * h, y: ((w.x2 - w.x1) / len) * h };
  return [
    { x: w.x1 + n.x, y: w.y1 + n.y },
    { x: w.x2 + n.x, y: w.y2 + n.y },
    { x: w.x2 - n.x, y: w.y2 - n.y },
    { x: w.x1 - n.x, y: w.y1 - n.y },
  ];
}

function inside(p: Point, poly: Point[]): boolean {
  if (pointInPolygon(p, poly)) return true;
  return poly.some((a, i) => pointToSegmentDistance(p, a, poly[(i + 1) % poly.length]) <= TOLERANCE);
}

/** The ground plan area of what's built on a floor: its rooms plus its walls (about). */
function builtAreaSqFt(doc: PlanDoc, levelId: string): number {
  const rooms = doc.rooms.filter((r) => levelOf(r) === levelId).reduce((s, r) => s + roomAreaSqMm(r), 0);
  const walls = doc.elements
    .filter((el): el is Wall => el.type === 'wall' && BUILT_KINDS(el) && levelOf(el) === levelId)
    .reduce((s, w) => s + Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * thicknessOf(w) * MM_PER_UNIT * MM_PER_UNIT, 0);
  return (rooms + walls) / SQ_MM_PER_SQ_FT;
}

const pct = (v: number) => `${Math.round(v)}%`;
const sqft = (v: number) => `${Math.round(v).toLocaleString('en-US')} sq ft`;

/**
 * Check the plan against the first plot that has bylaws, or null when no plot has any.
 * `wallHeightMm` is the usual wall height (for floors and the total height).
 */
export function planCheck(doc: PlanDoc, ctx: { wallHeightMm: number; units: Units }): PlanCheck | null {
  const plot = doc.elements.find((el): el is Plot => el.type === 'plot' && !!plotRule(el));
  const found = plot && plotRule(plot);
  if (!plot || !found) return null;
  const { authority, rule } = found;
  const len = (mm: number) => formatLength(mm, ctx.units);
  const rows: CheckRow[] = [];
  const clause = (c: string) => (c === 'summary' ? 'Summary (provisional)' : c);

  if (rule) {
    // Setbacks: the plan's own, if they are the bylaws' either way round; otherwise the bylaws'.
    const fromRule = plotSetbacks(rule);
    const swapped = plotSetbacks(rule, true);
    const matches = (a: Plot['setbacks']) =>
      Math.abs(a.sides - plot.setbacks.sides) < 1 &&
      Math.abs((a.side2 ?? 0) - (plot.setbacks.side2 ?? plot.setbacks.sides)) < 1;
    const setbacks = matches(swapped) && !matches(fromRule) ? swapped : fromRule;
    const line = buildableArea({ ...plot, setbacks });
    const outside = (pts: Point[]) => pts.some((p) => !inside(p, line));
    const hard: Id[] = [];
    const soft: Id[] = [];
    for (const el of doc.elements) {
      if (el.hidden) continue;
      const pts = itemOutline(el);
      if (!pts || !outside(pts)) continue;
      if (el.type === 'wall' || (el.type === 'block' && el.heightMm > 0)) hard.push(el.id);
      else soft.push(el.id);
    }
    const { front, rear, side1, side2 } = rule.setbacks;
    rows.push({
      id: 'setbacks',
      label: 'Setbacks',
      required: `Front ${len(front)}, rear ${len(rear)}, sides ${side1 ? len(side1) : '–'} / ${side2 ? len(side2) : '–'}`,
      actual: hard.length
        ? `${hard.length} ${hard.length === 1 ? 'item crosses' : 'items cross'} the building line`
        : 'Inside the building line',
      status: hard.length ? 'fail' : 'ok',
      clause: clause(authority.setbackClause),
      ids: hard,
    });
    if (soft.length)
      rows.push({
        id: 'setback-items',
        label: 'Items in the setbacks',
        required: 'Only porches, open stairs, projections and the like',
        actual: `${soft.length} ${soft.length === 1 ? 'item' : 'items'} (columns, slabs, stairs…)`,
        status: 'check',
        clause: clause(authority.setbackClause),
        ids: soft,
      });

    // Projections (chajjas, ledges) that reach into the setbacks.
    if (authority.projection) {
      const max = authority.projection.maxMm;
      const deep = doc.elements.filter((el) => el.type === 'window' && el.flat && (el.depthMm ?? 0) > max);
      if (doc.elements.some((el) => el.type === 'window' && el.flat && (el.depthMm ?? 0) > 0))
        rows.push({
          id: 'projections',
          label: 'Projections (chajjas, ledges)',
          required: `At most ${len(max)} into a setback`,
          actual: deep.length ? `${deep.length} deeper than that` : 'Within the limit',
          status: deep.length ? 'fail' : 'ok',
          clause: authority.projection.clause,
          ids: deep.map((el) => el.id),
        });
    }

    const plotSqFt = plotAreaSqFt(plot);
    const ground = doc.levels[0]?.id ?? 'ground';
    const groundSqFt = builtAreaSqFt(doc, ground);
    if (rule.coveragePct !== undefined && groundSqFt > 0) {
      const cover = (groundSqFt / plotSqFt) * 100;
      rows.push({
        id: 'coverage',
        label: 'Ground floor coverage',
        required: `At most ${pct(rule.coveragePct)} of the plot (with the porch)`,
        actual: `About ${pct(cover)} (${sqft(groundSqFt)})`,
        status: cover <= rule.coveragePct + 0.5 ? 'ok' : 'fail',
        clause: clause(authority.setbackClause),
      });
    }
    const first = doc.levels[1]?.id;
    const firstSqFt = first ? builtAreaSqFt(doc, first) : 0;
    if (rule.firstFloorPct !== undefined && firstSqFt > 0 && groundSqFt > 0) {
      const share = (firstSqFt / groundSqFt) * 100;
      rows.push({
        id: 'first-floor',
        label: 'First floor',
        required: `At most ${pct(rule.firstFloorPct)} of the ground floor`,
        actual: `About ${pct(share)} (${sqft(firstSqFt)})`,
        status: share <= rule.firstFloorPct + 0.5 ? 'ok' : 'fail',
        clause: clause(authority.setbackClause),
      });
    }
    if (rule.plinthMm !== undefined)
      rows.push({
        id: 'plinth',
        label: 'Plinth',
        required: `At most ${len(rule.plinthMm)}`,
        actual: len(doc.plinthMm),
        status: doc.plinthMm <= rule.plinthMm + 1 ? 'ok' : 'fail',
        clause: clause(authority.plinth?.clause ?? authority.setbackClause),
      });
  }

  // Storeys and height: floors that have ordinary walls, and the top of everything built.
  const built = doc.elements.filter((el) => !el.hidden && el.type !== 'plot' && el.type !== 'line');
  const storeyLevels = doc.levels.filter((l) =>
    built.some((el) => el.type === 'wall' && BUILT_KINDS(el) && levelOf(el) === l.id),
  );
  if (authority.storeys && storeyLevels.length)
    rows.push({
      id: 'storeys',
      label: 'Storeys',
      required: `At most ${authority.storeys.max}`,
      actual: String(storeyLevels.length),
      status: storeyLevels.length <= authority.storeys.max ? 'ok' : 'fail',
      clause: clause(authority.storeys.clause),
    });
  const topMm = buildingTopMm(doc, built, ctx.wallHeightMm);
  if (authority.height && topMm > 0)
    rows.push({
      id: 'height',
      label: 'Height',
      required: `At most ${len(authority.height.maxMm)}${authority.height.note ? ` (${authority.height.note.replace(/\.$/, '').toLowerCase()})` : ''}`,
      actual: `About ${len(topMm)} from the ground`,
      status: topMm <= authority.height.maxMm + 1 ? 'ok' : 'fail',
      clause: clause(authority.height.clause),
    });

  // Boundary walls.
  const boundary = built.filter((el): el is Wall => el.type === 'wall' && el.kind === 'boundary');
  if (authority.boundaryWall && boundary.length) {
    const { minMm, maxMm } = authority.boundaryWall;
    const bad = boundary.filter((w) => {
      const h = w.heightMm ?? 2133.6;
      return h > maxMm + 1 || (minMm !== undefined && h < minMm - 1);
    });
    rows.push({
      id: 'boundary',
      label: 'Boundary wall',
      required: minMm ? `${len(minMm)} to ${len(maxMm)} high` : `At most ${len(maxMm)} high`,
      actual: bad.length
        ? `${bad.length} ${bad.length === 1 ? 'wall is' : 'walls are'} outside that`
        : 'Within the limit',
      status: bad.length ? 'fail' : 'ok',
      clause: clause(authority.boundaryWall.clause),
      ids: bad.map((w) => w.id),
    });
  }

  // Rooms by name: area and (roughly) width.
  if (authority.rooms) {
    const small: { id: Id; name: string }[] = [];
    let checked = 0;
    for (const r of doc.rooms) {
      if (r.hidden) continue;
      const rr = authority.rooms.rules.find((x) => x.names.test(r.name));
      if (!rr) continue;
      checked++;
      const area = roomAreaSqMm(r) / SQ_MM_PER_SQ_FT;
      const xs = r.points.map((p) => p.x);
      const ys = r.points.map((p) => p.y);
      const width = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * MM_PER_UNIT;
      if (area < rr.minSqFt - 0.5 || (rr.minWidthMm && width < rr.minWidthMm - 5))
        small.push({ id: r.id, name: r.name });
    }
    if (checked)
      rows.push({
        id: 'rooms',
        label: 'Room sizes',
        required: authority.rooms.rules
          .map((x) => `${x.label} ${x.minSqFt} sq ft${x.minWidthMm ? `, ${len(x.minWidthMm)} wide` : ''}`)
          .join('; '),
        actual: small.length
          ? `Too small: ${small.map((s) => s.name).join(', ')}`
          : `All ${checked} named rooms are big enough`,
        status: small.length ? 'fail' : 'ok',
        clause: clause(authority.rooms.clause),
        ids: small.map((s) => s.id),
      });
  }

  // The whole house's covered area.
  if (authority.minTotalSqFt) {
    const total = doc.levels.reduce((s, l) => s + builtAreaSqFt(doc, l.id), 0);
    if (total > 0)
      rows.push({
        id: 'total',
        label: 'Total covered area',
        required: `At least ${sqft(authority.minTotalSqFt.value)}`,
        actual: `About ${sqft(total)}`,
        status: total >= authority.minTotalSqFt.value ? 'ok' : 'fail',
        clause: clause(authority.minTotalSqFt.clause),
      });
  }

  return { authority, rule, plot, rows };
}

/** The outline an item takes up on the plan, for the setback check (null for things that don't count). */
function itemOutline(el: PlanElement): Point[] | null {
  switch (el.type) {
    case 'wall':
      return el.kind === 'boundary' ? null : wallCorners(el);
    case 'column':
    case 'beam':
    case 'slab':
    case 'stair':
      return elementOutline(el);
    case 'block':
      return el.heightMm > 0 ? el.points : null;
    default:
      return null;
  }
}

function plotAreaSqFt(plot: Plot): number {
  let twice = 0;
  plot.points.forEach((p, i) => {
    const q = plot.points[(i + 1) % plot.points.length];
    twice += p.x * q.y - q.x * p.y;
  });
  return ((Math.abs(twice) / 2) * MM_PER_UNIT * MM_PER_UNIT) / SQ_MM_PER_SQ_FT;
}

/** How high the top of the building is above the ground (mm): walls, slabs and blocks. */
function buildingTopMm(doc: PlanDoc, built: PlanElement[], wallHeightMm: number): number {
  let top = 0;
  for (const el of built) {
    const base = levelBaseM(doc, levelOf(el), wallHeightMm) * 1000 + (el.elevMm ?? 0);
    if (el.type === 'wall' && el.kind !== 'boundary') top = Math.max(top, base + (el.heightMm ?? wallHeightMm));
    if (el.type === 'slab') top = Math.max(top, base + wallHeightMm + el.thickness * MM_PER_UNIT);
    if (el.type === 'block' && el.heightMm > 0) top = Math.max(top, base + el.heightMm);
  }
  // A floor with walls carries a slab over it even when none is drawn.
  const floors = doc.levels.filter((l) =>
    built.some((el) => el.type === 'wall' && !el.kind && levelOf(el) === l.id),
  ).length;
  if (floors)
    top = Math.max(top, levelBaseM(doc, doc.levels[floors - 1].id, wallHeightMm) * 1000 + wallHeightMm + SLAB_MM);
  return top;
}
