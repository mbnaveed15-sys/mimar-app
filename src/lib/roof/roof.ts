/**
 * Pitched roofs as plan items: their shape (by the straight skeleton), where their slopes sit over the walls,
 * the gable walls rising to meet them, their sloped area, and the pieces the 3D model and drawings are made
 * of. Heights here are in plan units above the roof's eaves unless named otherwise. Pure.
 */
import type { Point, Roof, RoofKind, Units } from '../../types';
import { MM_PER_UNIT } from '../scale';
import { insetPolygon } from '../plot';
import { shedRoof, skeletonRoof, type Point3, type RoofFace, type RoofShape } from './skeleton';

export const ROOF_PITCH_DEG = 30;
/** The eaves reach 1'6" past the walls in a house, 450 mm in a metric project. */
export const ROOF_OVERHANG_MM: Record<Units, number> = { imperial: 457.2, metric: 450 };
/** A roof's thickness: 6" (deck, insulation and covering). */
export const ROOF_THICKNESS_MM = 152.4;
/** A gable wall: 9" brick. */
export const GABLE_WALL_MM = 228.6;
/** Steepest slope a roof takes. */
export const MAX_PITCH_DEG = 75;

export const ROOF_KINDS: { id: RoofKind; label: string }[] = [
  { id: 'hip', label: 'Hip' },
  { id: 'gable', label: 'Gable' },
  { id: 'shed', label: 'Shed' },
  { id: 'flat', label: 'Flat' },
];

const clampPitch = (deg: number) => Math.min(MAX_PITCH_DEG, Math.max(0, Number.isFinite(deg) ? deg : 0));

/** Rise over run. Flat roofs have none. */
export const slopeOf = (roof: Pick<Roof, 'shape' | 'pitchDeg'>) =>
  roof.shape === 'flat' ? 0 : Math.tan((clampPitch(roof.pitchDeg) * Math.PI) / 180);

/** A pitch as the rise in 12 of run (30° is about 6.9 in 12). */
export const riseIn12 = (pitchDeg: number) => 12 * Math.tan((clampPitch(pitchDeg) * Math.PI) / 180);

/** The pitch of a rise in 12 of run. */
export const pitchOfRise = (rise: number) => clampPitch((Math.atan(rise / 12) * 180) / Math.PI);

const edgeLength = (pts: Point[], i: number) => {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  return Math.hypot(b.x - a.x, b.y - a.y);
};

/**
 * The gable ends of a gabled roof: the ones set on it, else the ends of its wings: the two short ends of a
 * four-sided one, and on any other shape each side between two outside corners that is shorter than the
 * sides between outside corners next to it.
 */
export function gableEdges(roof: Pick<Roof, 'points' | 'gables'>): number[] {
  const pts = roof.points;
  const n = pts.length;
  if (roof.gables) return [...new Set(roof.gables.filter((i) => Number.isInteger(i) && i >= 0 && i < n))];
  if (n === 4) {
    const across = edgeLength(pts, 0) + edgeLength(pts, 2);
    const along = edgeLength(pts, 1) + edgeLength(pts, 3);
    return across <= along ? [0, 2] : [1, 3];
  }
  if (n < 4) return [];
  const turn = signedArea(pts) >= 0 ? 1 : -1;
  const convex = pts.map((p, i) => {
    const a = pts[(i + n - 1) % n];
    const b = pts[(i + 1) % n];
    return ((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) * turn > 0;
  });
  const end = (i: number) => convex[i] && convex[(i + 1) % n];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!end(i)) continue;
    const near = [(i + n - 1) % n, (i + 1) % n].filter(end);
    if (near.length && near.every((j) => edgeLength(pts, i) < edgeLength(pts, j) - 1e-9)) out.push(i);
  }
  return out;
}

/** A shed roof's low side: the one set on it, else its longest edge. */
export function lowEdgeOf(roof: Pick<Roof, 'points' | 'lowEdge'>): number {
  const n = roof.points.length;
  if (roof.lowEdge !== undefined && roof.lowEdge >= 0 && roof.lowEdge < n) return roof.lowEdge;
  let best = 0;
  for (let i = 1; i < n; i++) if (edgeLength(roof.points, i) > edgeLength(roof.points, best)) best = i;
  return best;
}

const shapes = new WeakMap<Roof, RoofShape>();

/** The roof's faces and lines, heights in plan units above its eaves. */
export function roofShape(roof: Roof): RoofShape {
  let shape = shapes.get(roof);
  if (shape) return shape;
  const slope = slopeOf(roof);
  if (roof.shape === 'shed') shape = shedRoof(roof.points, slope, lowEdgeOf(roof));
  else if (roof.shape === 'gable') {
    const ends = new Set(gableEdges(roof));
    shape = skeletonRoof(
      roof.points,
      slope,
      roof.points.map((_, i) => ends.has(i)),
    );
  } else shape = skeletonRoof(roof.points, slope);
  shapes.set(roof, shape);
  return shape;
}

/** How far (mm) the eaves are below the top of the walls: the slope carried on over the overhang. */
export const eaveDropMm = (roof: Roof) => roof.overhangMm * slopeOf(roof);

/** Height (mm above its floor) of the underside of the roof at its eaves. */
export const eaveMm = (roof: Roof, wallTopMm: number) => wallTopMm - eaveDropMm(roof) + (roof.elevMm ?? 0);

/** Height (mm above its floor) of the roof's highest point, on top. */
export const roofTopMm = (roof: Roof, wallTopMm: number) =>
  eaveMm(roof, wallTopMm) + roofShape(roof).peak * MM_PER_UNIT + thicknessUpMm(roof);

/** The roof's thickness measured straight up through a slope. */
export const thicknessUpMm = (roof: Roof) => roof.thicknessMm / Math.cos(Math.atan(slopeOf(roof)));

/** True area of a flat 3D polygon (Newell's method). */
export function area3(poly: Point3[]): number {
  let x = 0;
  let y = 0;
  let z = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  });
  return Math.hypot(x, y, z) / 2;
}

/** The sloped (roofing) faces: every face but the upright gable ends. */
export const slopedFaces = (roof: Roof): RoofFace[] => roofShape(roof).faces.filter((f) => !f.vertical);

/** The area of the roof along its slopes, in square plan units. */
export const slopedArea = (roof: Roof) => slopedFaces(roof).reduce((sum, f) => sum + area3(f.points), 0);

/** Signed area, positive when the outline turns the way that puts (-dy, dx) inside. */
function signedArea(pts: Point[]): number {
  let s = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  });
  return s / 2;
}

/** An upright wall filling a gable end (or a shed roof's high side) from the top of the walls up to the roof. */
export interface GableWall {
  /** The edge it stands under. */
  edge: number;
  /** Where along the walls' line it starts, and the way it runs (a unit vector), in plan. */
  at: Point;
  dir: Point;
  /** Its outline: [along, up] in plan units from `at` and the top of the walls. */
  outline: [number, number][];
}

const polyArea = (pts: [number, number][]) =>
  Math.abs(pts.reduce((s, a, i) => s + a[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * a[1], 0)) /
  2;

/**
 * The gable walls: under each upright face of the roof, a wall standing flush with the walls' outside faces
 * (the eaves brought in by the overhang), from one corner of the walls to the next, reaching from the top of
 * the walls up to the underside of the roof over it.
 */
export function gableWalls(roof: Roof): GableWall[] {
  const shape = roofShape(roof);
  const n = roof.points.length;
  const inward = signedArea(roof.points) >= 0 ? 1 : -1;
  const over = roof.overhangMm / MM_PER_UNIT;
  const drop = over * slopeOf(roof);
  const inset = over + GABLE_WALL_MM / 2 / MM_PER_UNIT;
  // The walls' outside line: where each gable wall starts and ends.
  const line =
    over > 0
      ? insetPolygon(
          roof.points,
          roof.points.map(() => over),
        )
      : { points: roof.points, edges: roof.points.map((_, i) => i) };
  const tiny = 1e-6;
  const out: GableWall[] = [];
  for (const f of shape.faces) {
    if (!f.vertical) continue;
    const a = roof.points[f.edge % n];
    const b = roof.points[(f.edge + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = line.edges.indexOf(f.edge);
    if (len < 1e-9 || k < 0) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const nIn = { x: -dir.y * inward, y: dir.x * inward };
    const at = { x: a.x + nIn.x * inset, y: a.y + nIn.y * inset };
    const along = (p: Point) => (p.x - a.x) * dir.x + (p.y - a.y) * dir.y;
    const [s0, s1] = [along(line.points[k]), along(line.points[(k + 1) % line.points.length])].sort((x, y) => x - y);
    if (s1 - s0 < tiny) continue;
    // The roof's underside over the wall, above the top of the walls, where it bends (over the face's corners).
    const stops = [s0, s1, ...f.points.map(along).filter((s) => s > s0 + tiny && s < s1 - tiny)].sort((x, y) => x - y);
    const top = stops.map((s): [number, number] => [
      s,
      Math.max(0, (shape.heightAt({ x: at.x + dir.x * s, y: at.y + dir.y * s }) ?? 0) - drop),
    ]);
    if (top.every(([, z]) => z < tiny)) continue;
    // Round from the foot, up the far end, back along the roof; a corner where the roof meets the foot once.
    const outline = [[s0, 0] as [number, number], [s1, 0] as [number, number], ...top.reverse()].filter((p, i, all) => {
      const q = all[(i + all.length - 1) % all.length];
      return Math.hypot(p[0] - q[0], p[1] - q[1]) > tiny;
    });
    if (polyArea(outline) < tiny) continue;
    out.push({ edge: f.edge, at, dir, outline });
  }
  return out;
}

/** The area of the gable walls, square plan units. */
export const gableArea = (roof: Roof) => gableWalls(roof).reduce((s, g) => s + polyArea(g.outline), 0);

/**
 * Ear-clipping triangulation of a simple polygon in plan (x, y): triangles as index triples, turning the
 * same way as the polygon.
 */
export function triangulate(pts: { x: number; y: number }[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  const sign = signedArea(pts as Point[]) >= 0 ? 1 : -1;
  const idx = pts.map((_, i) => i);
  const cross = (o: number, a: number, b: number) =>
    (pts[a].x - pts[o].x) * (pts[b].y - pts[o].y) - (pts[a].y - pts[o].y) * (pts[b].x - pts[o].x);
  const inTri = (p: number, a: number, b: number, c: number) =>
    cross(a, b, p) * sign >= 0 && cross(b, c, p) * sign >= 0 && cross(c, a, p) * sign >= 0;
  const out: [number, number, number][] = [];
  let guard = n * n;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length];
      const b = idx[k];
      const c = idx[(k + 1) % idx.length];
      const turn = cross(a, b, c) * sign;
      if (turn < 0) continue;
      if (turn > 0 && idx.some((p) => p !== a && p !== b && p !== c && inTri(p, a, b, c))) continue;
      if (turn > 0) out.push([a, b, c]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/**
 * A pitch typed in: degrees ("30", "30°", "22.5 deg") or a rise in a run ("6 in 12", "6/12", "6:12").
 * Null when it isn't one, or is steeper than a roof takes.
 */
export function readPitch(text: string): number | null {
  const t = text.trim().toLowerCase();
  const ratio = /^(\d+(?:\.\d+)?)\s*(?:in|\/|:)\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (ratio) {
    const run = Number(ratio[2]);
    if (!(run > 0)) return null;
    const deg = (Math.atan(Number(ratio[1]) / run) * 180) / Math.PI;
    return deg <= MAX_PITCH_DEG ? deg : null;
  }
  const deg = /^(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?$/.exec(t);
  if (!deg) return null;
  const v = Number(deg[1]);
  return v <= MAX_PITCH_DEG ? v : null;
}

/** A pitch for showing: "30° (6.9 in 12)". */
export const formatPitch = (deg: number) => `${Math.round(deg * 10) / 10}° (${riseIn12(deg).toFixed(1)} in 12)`;

/**
 * The roof with a new overhang: its eaves moved out (or in) by the difference, gable ends and low side kept
 * on the same edges. Null if the outline can't take it.
 */
export function withOverhang(roof: Roof, overhangMm: number): Roof | null {
  const d = (overhangMm - roof.overhangMm) / MM_PER_UNIT;
  if (Math.abs(d) < 1e-9) return { ...roof, overhangMm };
  const grown = insetPolygon(
    roof.points,
    roof.points.map(() => -d),
  );
  if (grown.points.length < 3) return null;
  const from = grown.edges;
  const next: Roof = { ...roof, points: grown.points, overhangMm };
  if (roof.gables) next.gables = from.flatMap((orig, k) => (roof.gables!.includes(orig) ? [k] : []));
  if (roof.lowEdge !== undefined) {
    const k = from.indexOf(roof.lowEdge);
    if (k >= 0) next.lowEdge = k;
    else delete next.lowEdge;
  }
  return next;
}
