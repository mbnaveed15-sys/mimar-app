/**
 * Corners to snap to on every item that isn't a wall or a layout line (those snap by their own rules
 * in `inference.ts`): slabs and their voids, columns, beams, stairs, furniture, blocks and pads, roofs,
 * plots and neighbouring buildings, and the jambs of doors and windows; with the middles of straight
 * edges, and the centres of round things. Pure.
 */
import { elementOutline } from '../geometry';
import { curveOf, holeOutline } from './curvedEdges';
import type { PlanElement, Point, Wall } from '../types';
import { thicknessOf } from '../walls';
import type { SnapPoint } from './inference';
import { outlinePoints } from './plot';

/** Outlines with more points than this are round or curved: only their centre is offered. */
const MAX_CORNERS = 24;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function centreOf(pts: Point[]): Point {
  const s = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
}

/** A closed outline's corners and edge middles (`edges` false: corners only, for curved outlines). */
function outline(pts: Point[], out: SnapPoint[], edges = true) {
  if (pts.length < 2) return;
  if (pts.length > MAX_CORNERS) {
    out.push({ point: centreOf(pts), kind: 'centre' });
    return;
  }
  for (let i = 0; i < pts.length; i++) {
    out.push({ point: pts[i], kind: 'item-corner' });
    if (edges) out.push({ point: mid(pts[i], pts[(i + 1) % pts.length]), kind: 'midpoint' });
  }
}

/** A beam's outline from its centre line and width. */
function beamCorners(el: Extract<PlanElement, { type: 'beam' }>): Point[] {
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  if (!len) return [];
  const [nx, ny] = [(-(el.y2 - el.y1) / len) * (el.width / 2), ((el.x2 - el.x1) / len) * (el.width / 2)];
  return [
    { x: el.x1 + nx, y: el.y1 + ny },
    { x: el.x2 + nx, y: el.y2 + ny },
    { x: el.x2 - nx, y: el.y2 - ny },
    { x: el.x1 - nx, y: el.y1 - ny },
  ];
}

/** The four jamb corners of a door or window: its two ends on both faces of its wall. */
function jambCorners(el: Extract<PlanElement, { type: 'door' | 'window' }>, wall: Wall | undefined): Point[] {
  const a = (el.angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const half = el.width / 2;
  const t = wall ? thicknessOf(wall) / 2 : 0;
  const pts: Point[] = [];
  for (const s of [-1, 1])
    for (const f of t ? [-1, 1] : [0])
      pts.push({ x: el.x + ux * half * s - uy * t * f, y: el.y + uy * half * s + ux * t * f });
  return pts;
}

/** Snap points of one item. */
function pointsOf(el: PlanElement, walls: Map<string, Wall>, out: SnapPoint[]) {
  switch (el.type) {
    case 'furniture':
    case 'stair':
      outline(elementOutline(el), out);
      out.push({ point: { x: el.x, y: el.y }, kind: 'centre' });
      return;
    case 'column':
      if (el.shape === 'round') out.push({ point: { x: el.x, y: el.y }, kind: 'centre' });
      else outline(elementOutline(el), out);
      return;
    case 'beam':
      outline(beamCorners(el), out);
      return;
    case 'slab':
      outline(el.curve?.corners ?? el.points, out, !el.curve);
      // A curved void snaps at its corners (its straight edges at their middles too).
      (el.holes ?? []).forEach((hole, j) => {
        const curve = curveOf(holeOutline(el, j));
        outline(curve?.corners ?? hole, out, !curve);
      });
      return;
    case 'pad':
      outline(el.curve?.corners ?? el.points, out, !el.curve);
      return;
    case 'block':
      if (!el.path) outline(el.points, out);
      return;
    case 'roof':
    case 'context':
      outline(el.points, out);
      return;
    case 'plot': {
      const curved = (el.sideList ?? []).some((s) => s.bow);
      outline(curved ? el.points : outlinePoints(el), out, !curved);
      return;
    }
    case 'door':
    case 'window':
      for (const p of jambCorners(el, walls.get(el.wallId))) out.push({ point: p, kind: 'item-corner' });
      return;
    default:
      return;
  }
}

/** Every item's snap points (those in `ignoreIds` left out). */
export function snapPoints(elements: PlanElement[], ignoreIds?: Set<string>): SnapPoint[] {
  const walls = new Map(elements.filter((el): el is Wall => el.type === 'wall').map((w) => [w.id, w]));
  const out: SnapPoint[] = [];
  for (const el of elements) if (!el.hidden && !ignoreIds?.has(el.id)) pointsOf(el, walls, out);
  return out;
}
