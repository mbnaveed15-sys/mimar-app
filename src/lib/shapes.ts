import { MM_PER_UNIT } from './scale';
import type { Opening, Point, ShapeKind } from '../types';

/** Segments round a full circle. */
export const CIRCLE_SEGMENTS = 32;

/** A circle as a polygon. */
export function circlePoints(c: Point, r: number, n = CIRCLE_SEGMENTS): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}

/** The four corners of the box with opposite corners a and b. */
export function rectPoints(a: Point, b: Point): Point[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ];
}

/**
 * An arch: straight sides from `base` (y) towards `top` (y), rounded at the top end with a half
 * circle as wide as the arch (flattened when the arch is lower than half its width).
 */
export function archPoints(left: number, right: number, base: number, top: number, n = CIRCLE_SEGMENTS / 2): Point[] {
  const [l, r] = left < right ? [left, right] : [right, left];
  const dir = top >= base ? 1 : -1;
  const height = Math.abs(top - base);
  const rx = (r - l) / 2;
  const ry = Math.min(rx, height);
  const spring = base + dir * (height - ry);
  const cx = (l + r) / 2;
  const curve = Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI;
    return { x: cx + rx * Math.cos(a), y: spring + dir * ry * Math.sin(a) };
  });
  return [{ x: l, y: base }, { x: r, y: base }, ...curve.slice(0, -1), { x: l, y: spring }];
}

/**
 * The outline a shape draft makes so far: from its clicked points and the pointer. A rectangle or
 * arch spans from the first point to the pointer, a circle is centred on the first point.
 */
export function draftOutline(kind: ShapeKind, points: Point[], cursor: Point): Point[] {
  const [a] = points;
  if (!a) return [];
  switch (kind) {
    case 'rect':
      return rectPoints(a, cursor);
    case 'circle': {
      const r = Math.hypot(cursor.x - a.x, cursor.y - a.y);
      return r > 0 ? circlePoints(a, r) : [];
    }
    case 'arch':
      return archPoints(a.x, cursor.x, a.y, cursor.y);
    case 'polygon':
      return [...points, cursor];
  }
}

/** Signed area of an outline (positive when it runs anticlockwise with y up). */
export function signedArea(points: Point[]): number {
  let sum = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  });
  return sum / 2;
}

/** Is the outline big enough to keep (not a click or a line)? */
export function isRealOutline(points: Point[], minArea: number): boolean {
  return points.length >= 3 && Math.abs(signedArea(points)) >= minArea;
}

/** A window's default height when none is set: 3' sill to 7' head. */
export const WINDOW_HEIGHT_MM = 1220;

/**
 * A window's (or shaped opening's) outline in millimetres: x along the wall from its centre, y up
 * from its sill.
 */
export function openingProfileMm(o: Opening): Point[] {
  const w = o.width * MM_PER_UNIT;
  const h = o.heightMm ?? WINDOW_HEIGHT_MM;
  switch (o.shape) {
    case 'circle':
      // Round when as tall as it is wide, otherwise an oval.
      return circlePoints({ x: 0, y: 0 }, 1).map((p) => ({ x: (p.x * w) / 2, y: h / 2 + (p.y * h) / 2 }));
    case 'arch':
      return archPoints(-w / 2, w / 2, 0, h);
    case 'polygon':
      if (o.profile && o.profile.length >= 3) return o.profile;
      break;
  }
  return rectPoints({ x: -w / 2, y: 0 }, { x: w / 2, y: h });
}
