/**
 * Skylights and dormers on a roof: which face each sits on, the hole it cuts in that face, and its parts (a
 * skylight's frame and glass; a dormer's walls, window and little roof). Heights are in plan units above the
 * roof's eaves, on the underside of the roof, as in roofShape. Pure.
 */
import { pointInPolygon } from '../../geometry';
import { MM_PER_UNIT } from '../scale';
import type { Dormer, DormerKind, Point, Roof, Skylight } from '../../types';
import { slopedFaces, slopeOf, thicknessUpMm } from './roof';
import type { Point3, RoofFace } from './skeleton';

/** A common roof window: 780 × 980 mm. */
export const SKYLIGHT_W_MM = 780;
export const SKYLIGHT_L_MM = 980;
/** Its frame's width round the glass, and how far it stands above the roof's top. */
export const SKYLIGHT_FRAME_MM = 60;
export const SKYLIGHT_UPSTAND_MM = 100;
/** On a flat roof it sits on a kerb this high. */
export const FLAT_KERB_MM = 150;

export const DORMER_W_MM = 1500;
/** The front stands this far in from the eaves (in plan). */
export const DORMER_IN_MM = 600;
export const DORMER_WALL_MM = 1000;
/** Its walls: 4½" brick. */
export const DORMER_WALL_THICK_MM = 114.3;
/** A shed dormer's roof slope. */
export const DORMER_SHED_DEG = 15;
/** Dormers need a slope at least this steep (they would run a long way back on a gentler one). */
export const DORMER_MIN_DEG = 15;
export const DORMER_KINDS: { id: DormerKind; label: string }[] = [
  { id: 'gable', label: 'Gable' },
  { id: 'shed', label: 'Shed' },
];

/**
 * A face's own frame: from the start of its eave edge `a`, `u` runs along the eaves and `v` (in plan) up the
 * slope; the underside is at z = za + s·r, r being the distance in from the eaves.
 */
export interface FaceFrame {
  face: RoofFace;
  a: Point;
  u: Point;
  v: Point;
  za: number;
  s: number;
}

const tiny = 1e-9;

export function faceFrame(face: RoofFace): FaceFrame | null {
  const [a, b] = face.points;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < tiny) return null;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  let v = { x: -u.y, y: u.x };
  const n = face.points.length;
  const c = face.points.reduce((m, p) => ({ x: m.x + p.x / n, y: m.y + p.y / n }), { x: 0, y: 0 });
  if ((c.x - a.x) * v.x + (c.y - a.y) * v.y < 0) v = { x: -v.x, y: -v.y };
  // The slope from the corner furthest in from the eaves.
  let best = 0;
  let s = 0;
  for (const p of face.points) {
    const r = (p.x - a.x) * v.x + (p.y - a.y) * v.y;
    if (r > best + tiny) [best, s] = [r, (p.z - a.z) / r];
  }
  return { face, a: { x: a.x, y: a.y }, u, v, za: a.z, s };
}

/** Plan point at t along the eaves and r in from them. */
const at = (f: FaceFrame, t: number, r: number): Point => ({
  x: f.a.x + f.u.x * t + f.v.x * r,
  y: f.a.y + f.u.y * t + f.v.y * r,
});
const on = (f: FaceFrame, t: number, r: number, up = 0): Point3 => ({ ...at(f, t, r), z: f.za + f.s * r + up });
const local = (f: FaceFrame, p: Point) => ({
  t: (p.x - f.a.x) * f.u.x + (p.y - f.a.y) * f.u.y,
  r: (p.x - f.a.x) * f.v.x + (p.y - f.a.y) * f.v.y,
});

/** The roof face a plan point is over, with its frame. */
export function faceUnder(roof: Roof, p: Point): FaceFrame | null {
  for (const face of slopedFaces(roof)) if (pointInPolygon(p, face.points)) return faceFrame(face);
  return null;
}

function segCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const [d1, d2, d3, d4] = [o(a, b, c), o(a, b, d), o(c, d, a), o(c, d, b)];
  return d1 * d2 < -tiny && d3 * d4 < -tiny;
}

/** Whether a ring lies inside a face's outline in plan (no corner outside, no edge crossing). */
function fits(ring: Point[], face: RoofFace): boolean {
  const poly = face.points;
  if (!ring.every((p) => pointInPolygon(p, poly))) return false;
  return ring.every((a, i) =>
    poly.every((c, j) => !segCross(a, ring[(i + 1) % ring.length], c, poly[(j + 1) % poly.length])),
  );
}

/** A skylight's hole in its face, its frame (a ring round the glass) and its glass, all on the face. */
export interface SkylightParts {
  edge: number;
  /** The hole through the roof (on the underside). */
  hole: Point3[];
  /** The glass, as a ring on the underside's plane (the frame fills hole minus glass). */
  glass: Point3[];
  /** How far up from the underside the frame reaches, and where the glass sits (plan units). */
  frameUp: number;
  glassUp: number;
}

export function skylightParts(roof: Roof, sk: Skylight): SkylightParts | null {
  const f = faceUnder(roof, sk);
  if (!f) return null;
  const { t, r } = local(f, sk);
  const cos = 1 / Math.sqrt(1 + f.s * f.s);
  const w = sk.wMm / MM_PER_UNIT / 2;
  const l = ((sk.lMm / MM_PER_UNIT) * cos) / 2;
  const fw = SKYLIGHT_FRAME_MM / MM_PER_UNIT;
  const rect = (dw: number, dl: number) => [
    on(f, t - w + dw, r - l + dl),
    on(f, t + w - dw, r - l + dl),
    on(f, t + w - dw, r + l - dl),
    on(f, t - w + dw, r + l - dl),
  ];
  const hole = rect(0, 0);
  if (w <= fw || l <= fw * cos || !fits(hole, f.face)) return null;
  const thick = thicknessUpMm(roof) / MM_PER_UNIT;
  const kerb = slopeOf(roof) === 0 ? FLAT_KERB_MM / MM_PER_UNIT : 0;
  const up = thick + kerb + SKYLIGHT_UPSTAND_MM / MM_PER_UNIT;
  return { edge: f.face.edge, hole, glass: rect(fw, fw * cos), frameUp: up, glassUp: up - 25 / MM_PER_UNIT };
}

/** An upright wall of a dormer, as the 3D model takes it: start, way it runs, [along, up] outline and holes. */
export interface DormerWall {
  at: Point;
  dir: Point;
  outline: [number, number][];
  holes: [number, number][][];
}

export interface DormerParts {
  edge: number;
  /** The hole it cuts in the main roof, and its footprint on the plan. */
  hole: Point3[];
  footprint: Point[];
  walls: DormerWall[];
  /** Its own roof's faces (undersides). */
  roof: Point3[][];
  /** The ridge of a gable dormer, for the plan. */
  ridge?: [Point, Point];
  /** The window in the front wall: its outline in the front wall's [along, up] terms. */
  window: [number, number][];
  /** The front wall's start and way, for the window's glass. */
  front: { at: Point; dir: Point };
}

/** The dormer's front-middle, `inMm` in from the eaves of the face a point is over, at that point along them. */
export function dormerFrontAt(roof: Roof, p: Point, inMm = DORMER_IN_MM): Point | null {
  const f = faceUnder(roof, p);
  if (!f) return null;
  return at(f, local(f, p).t, inMm / MM_PER_UNIT);
}

/** How far a dormer's front is in from the eaves, mm (for the panel). */
export function dormerInMm(roof: Roof, d: Dormer): number | null {
  const f = faceUnder(roof, d);
  return f ? local(f, d).r * MM_PER_UNIT : null;
}

/** The dormer moved to stand `inMm` in from the eaves. */
export function dormerMovedIn(roof: Roof, d: Dormer, inMm: number): Dormer {
  const f = faceUnder(roof, d);
  if (!f) return d;
  return { ...d, ...at(f, local(f, d).t, inMm / MM_PER_UNIT) };
}

export function dormerParts(roof: Roof, d: Dormer): DormerParts | null {
  const f = faceUnder(roof, d);
  if (!f || f.s < Math.tan((DORMER_MIN_DEG * Math.PI) / 180)) return null;
  const { t, r: front } = local(f, d);
  const half = d.wMm / MM_PER_UNIT / 2;
  const wallUp = d.wallMm / MM_PER_UNIT;
  const th = DORMER_WALL_THICK_MM / MM_PER_UNIT;
  if (half * 2 <= th * 3 || wallUp <= 0) return null;
  const z0 = f.za + f.s * front;
  const ze = z0 + wallUp;
  // Where a height meets the main roof, in from the eaves.
  const meets = (z: number) => (z - f.za) / f.s;
  const back = meets(ze);
  const [left, right] = [t - half, t + half];
  let hole: Point3[];
  let roofFaces: Point3[][];
  let ridge: [Point, Point] | undefined;
  let peak: number;
  // How far back the side walls run, and how high they are there.
  let sideBack = back;
  let sideZ = ze;
  if (d.kind === 'gable') {
    const p = f.s; // Its slopes as steep as the roof's.
    const zr = ze + half * p;
    const rr = meets(zr);
    peak = zr;
    hole = [on(f, left, front), on(f, right, front), on(f, right, back), on(f, t, rr), on(f, left, back)];
    const P = (tt: number, rr2: number, z: number): Point3 => ({ ...at(f, tt, rr2), z });
    roofFaces = [
      [P(left, front, ze), P(t, front, zr), P(t, rr, zr), P(left, back, ze)],
      [P(t, front, zr), P(right, front, ze), P(right, back, ze), P(t, rr, zr)],
    ];
    ridge = [at(f, t, front), at(f, t, rr)];
  } else {
    const q = Math.min(Math.tan((DORMER_SHED_DEG * Math.PI) / 180), f.s * 0.6);
    // Its roof rises back from the top of the front wall until it meets the main roof.
    const rm = (ze - f.za - front * q) / (f.s - q);
    const zm = f.za + f.s * rm;
    peak = zm;
    [sideBack, sideZ] = [rm, zm];
    hole = [on(f, left, front), on(f, right, front), on(f, right, rm), on(f, left, rm)];
    const P = (tt: number, rr2: number, z: number): Point3 => ({ ...at(f, tt, rr2), z });
    roofFaces = [[P(left, front, ze), P(right, front, ze), P(right, rm, zm), P(left, rm, zm)]];
  }
  const footprint = hole.map((p) => ({ x: p.x, y: p.y }));
  if (!fits(footprint, f.face)) return null;
  // The front wall, its outer face on the front line; the sides just inside the footprint.
  const frontAt = at(f, left, front + th / 2);
  const frontOutline: [number, number][] =
    d.kind === 'gable'
      ? [
          [0, z0],
          [half * 2, z0],
          [half * 2, ze],
          [half, peak],
          [0, ze],
        ]
      : [
          [0, z0],
          [half * 2, z0],
          [half * 2, ze],
          [0, ze],
        ];
  // A casement: 300 mm in from each side (at least 600 mm wide), its sill 150 mm above the roof's top.
  const ww = Math.max(Math.min(half * 2 - 600 / MM_PER_UNIT, 1200 / MM_PER_UNIT), 600 / MM_PER_UNIT);
  const sill = z0 + thicknessUpMm(roof) / MM_PER_UNIT + 150 / MM_PER_UNIT;
  const head = Math.min(ze - 50 / MM_PER_UNIT, sill + 900 / MM_PER_UNIT);
  const window: [number, number][] =
    head - sill > 200 / MM_PER_UNIT && ww < half * 2 - th
      ? [
          [half - ww / 2, sill],
          [half + ww / 2, sill],
          [half + ww / 2, head],
          [half - ww / 2, head],
        ]
      : [];
  const side = (tt: number): DormerWall => ({
    at: at(f, tt, front),
    dir: f.v,
    outline: [
      [0, z0],
      [sideBack - front, sideZ],
      [0, ze],
    ],
    holes: [],
  });
  const walls: DormerWall[] = [
    { at: frontAt, dir: f.u, outline: frontOutline, holes: window.length ? [window] : [] },
    side(left + th / 2),
    side(right - th / 2),
  ];
  return {
    edge: f.face.edge,
    hole,
    footprint,
    walls,
    roof: roofFaces,
    ...(ridge && { ridge }),
    window,
    front: { at: frontAt, dir: f.u },
  };
}
