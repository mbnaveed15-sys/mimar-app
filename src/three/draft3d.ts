import { plotRect, stairLayout } from '../lib/site';
import { MM_PER_UNIT } from '../lib/scale';
import { SLAB_MM } from './model';
import type { PlannerState } from '../store/plannerStore';
import type { PlanElement, Point } from '../types';

const DRAFT = 'draft';

/**
 * What the current tool is about to make, as plan items on the floor being drawn, so the 3D view
 * can show it see-through before it is placed.
 */
export function draftElements(s: PlannerState): PlanElement[] {
  const d = s.draft;
  const levelId = s.activeLevel;
  const at = { levelId };
  const thickness = s.wallThicknessMm / MM_PER_UNIT;
  const wall = (a: Point, b: Point, i = 0): PlanElement => ({
    id: `${DRAFT}-w${i}`,
    type: 'wall',
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    thickness,
    ...at,
  });
  const rect = (x1: number, y1: number, x2: number, y2: number): Point[] => [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
  const long = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) > 1;

  if (d?.type === 'wall' && long(d.x1, d.y1, d.x2, d.y2)) return [wall({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 })];
  if (d?.type === 'rectangle' && Math.abs(d.x2 - d.x1) > 1 && Math.abs(d.y2 - d.y1) > 1) {
    const c = rect(d.x1, d.y1, d.x2, d.y2);
    return c.map((p, i) => wall(p, c[(i + 1) % 4], i));
  }
  if (d?.type === 'beam' && long(d.x1, d.y1, d.x2, d.y2))
    return [
      {
        id: `${DRAFT}-beam`,
        type: 'beam',
        x1: d.x1,
        y1: d.y1,
        x2: d.x2,
        y2: d.y2,
        width: s.structure.beamWidth,
        depth: s.structure.beamDepth,
        ...at,
      },
    ];
  if (d?.type === 'slab' && Math.abs(d.x2 - d.x1) > 1 && Math.abs(d.y2 - d.y1) > 1)
    return [
      {
        id: `${DRAFT}-slab`,
        type: 'slab',
        points: rect(d.x1, d.y1, d.x2, d.y2),
        thickness: s.structure.slabThickness,
        ...at,
      },
    ];
  if (d?.type === 'plot' && Math.abs(d.x2 - d.x1) > 1 && Math.abs(d.y2 - d.y1) > 1)
    return [
      {
        id: `${DRAFT}-plot`,
        type: 'plot',
        points: plotRect({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }),
        front: 2,
        setbacks: { ...s.site.setbacks },
      },
    ];

  // Tools that place one thing: show it where it would go.
  const p = s.inference?.point;
  if (!d && p && s.tool === 'column') {
    const c = s.structure;
    return [
      {
        id: `${DRAFT}-col`,
        type: 'column',
        x: p.x,
        y: p.y,
        w: c.columnW,
        h: c.columnShape === 'round' ? c.columnW : c.columnH,
        shape: c.columnShape,
        ...at,
      },
    ];
  }
  if (!d && p && s.tool === 'stairs') {
    const { site } = s;
    const riseMm = site.climb === 'plinth' ? s.doc.plinthMm : s.wallHeightMm + SLAB_MM;
    const spec = { shape: site.stairShape, width: site.stairWidthMm / MM_PER_UNIT, riseMm, treadMm: site.treadMm };
    const l = stairLayout(spec);
    return [
      { id: `${DRAFT}-stair`, type: 'stair', x: p.x, y: p.y, ...spec, riserMm: l.riserMm, w: l.w, h: l.h, ...at },
    ];
  }
  return [];
}

/** Guide lines on the floor for drafts that are lines rather than things (tape, boxes, mirror lines). */
export function draftLines(s: PlannerState): [Point, Point][] {
  const d = s.draft;
  if (!d) return [];
  const box = (x1: number, y1: number, x2: number, y2: number): [Point, Point][] => {
    const c = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    return c.map((q, i) => [q, c[(i + 1) % 4]]);
  };
  switch (d.type) {
    case 'tape':
      return [[d.a, d.b]];
    case 'line':
      return [
        [
          { x: d.x1, y: d.y1 },
          { x: d.x2, y: d.y2 },
        ],
      ];
    case 'marquee':
      return box(d.x1, d.y1, d.x2, d.y2);
    case 'stretch':
      return box(d.x1, d.y1, d.x2, d.y2);
    case 'mirror':
      return [[d.a, d.b]];
    case 'offset':
      return [
        [
          { x: d.x1, y: d.y1 },
          { x: d.x2, y: d.y2 },
        ],
      ];
    case 'move':
      return [[d.base, d.to]];
    case 'rotate':
      return d.start ? [[d.center, d.start]] : [];
    case 'mask': {
      const pts = [...d.points, ...(d.cursor ? [d.cursor] : [])];
      return pts.slice(1).map((q, i): [Point, Point] => [pts[i], q]);
    }
    default:
      return [];
  }
}
