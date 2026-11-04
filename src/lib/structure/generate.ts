/**
 * Generate structure: the RCC frame (or a load-bearing building's bands and strip footings) worked out
 * from the walls, doors, windows, rooms and stairs of every floor. Columns at the wall junctions and
 * along long walls (never in an opening), stacked floor to floor down to their footings; floor and roof
 * beams on every wall line (and under upper walls with nothing below), secondary beams across wide
 * rooms, beams round stair openings, plinth and tie beams, slabs, and pad or strip footings. Lintels
 * are worked out live from each opening (`lintels.ts`). Items edited or locked since the last run are
 * kept, and the new frame is built round them. Pure.
 */
import { pointInPolygon } from '../../geometry';
import { arcOf, paramAlong, partOf, pointAlong, projectOnWall, runLength } from '../arc';
import { newId } from '../ids';
import { buildingLevels, levelWallMm, slabMm } from '../levels';
import { MM_PER_UNIT } from '../scale';
import { roomsSlab } from '../slabOutline';
import { clipToConvex, isConvex, slabVoids } from '../voids';
import { outsideOutline } from '../outline';
import { insideOffset, keepInside } from './fit';
import { isBuildingWall, thicknessOf } from '../../walls';
import {
  GROUND_LEVEL,
  levelOf,
  type Beam,
  type BeamKind,
  type Column,
  type Id,
  type Opening,
  type PlanDoc,
  type PlanElement,
  type Point,
  type Room,
  type Slab,
  type Wall,
} from '../../types';
import { alongRun, distanceOnRun, wallGraph, type Run } from './graph';
import {
  BOUNDARY_STRIP_MM,
  FT,
  IN,
  STRIP_MM,
  beamDepth,
  columnSize,
  frameRules,
  lintelBand,
  makes,
  padSize,
  type FrameRules,
} from './settings';

const u = (mm: number) => mm / MM_PER_UNIT;
const mmOf = (units: number) => units * MM_PER_UNIT;

/** Rooms open to the sky: no slab over them. */
export const UNROOFED = /lawn|garden|drive ?way|court|yard|patio|terrace|open|sky|shaft/i;

type FrameItem = Column | Beam | Slab;

/** What Generate structure adds. */
export const isFrameItem = (el: PlanElement): el is FrameItem =>
  el.type === 'column' || el.type === 'beam' || el.type === 'slab';

/** A short hash of a string (FNV-1a), as hex. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** An item's shape and settings, for telling whether it has been edited since it was generated. */
export function frameSig(el: FrameItem): string {
  const rest: Record<string, unknown> = { ...el };
  for (const k of ['id', 'auto', 'autoKey', 'autoSig', 'mark', 'locked', 'groupId', 'defKey']) delete rest[k];
  const round = (v: unknown): unknown =>
    typeof v === 'number'
      ? Math.round(v * 10) / 10
      : Array.isArray(v)
        ? v.map(round)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]))
          : v;
  return hash(JSON.stringify(round(rest)));
}

/** Generated and untouched since: Regenerate replaces it. */
export const isUntouched = (el: PlanElement): boolean =>
  isFrameItem(el) && !!el.auto && !el.locked && el.autoSig === frameSig(el);

/**
 * What the structure depends on: the building's walls, openings, floors, rooms, stairs and plot,
 * and the settings. When it changes, the structure is out of date.
 */
export function frameFingerprint(doc: PlanDoc): string {
  const r = (n: number) => Math.round(n);
  const parts: unknown[] = [doc.plinthMm, doc.project?.slabMm, doc.project?.wallHeightMm, doc.frame?.settings];
  parts.push(doc.levels.map((l) => [l.id, l.heightMm, l.basement, l.site]));
  for (const el of doc.elements) {
    if (el.type === 'wall')
      parts.push([
        el.id,
        r(el.x1),
        r(el.y1),
        r(el.x2),
        r(el.y2),
        el.bow && r(el.bow),
        el.thickness,
        el.kind,
        el.levelId,
      ]);
    else if (el.type === 'door' || el.type === 'window')
      parts.push([el.wallId, r(el.x), r(el.y), r(el.width), el.type, el.sillMm, el.heightMm, el.gate, el.flat]);
    else if (el.type === 'stair') parts.push(['s', r(el.x), r(el.y), el.rotation, el.levelId, el.riseMm]);
    else if (el.type === 'plot') parts.push(['p', el.points.map((p) => [r(p.x), r(p.y)])]);
    else if (el.type === 'roof') parts.push(['r', el.levelId, el.shape]);
  }
  for (const room of doc.rooms) parts.push([room.levelId, room.openAbove, room.points.map((p) => [r(p.x), r(p.y)])]);
  return hash(JSON.stringify(parts));
}

interface Candidate {
  p: Point;
  dir: Point;
  /** Half the gaps to the next columns along each wall meeting it, added up (plan units). */
  reach: number;
  wallMm: number;
}

/** Where the columns go along one run of wall between junctions: off the openings, at most `maxSpan` apart. */
function runColumns(run: Run, openings: Opening[], rules: FrameRules): number[] {
  const L = run.length;
  const hl = u(6 * IN);
  const gap = u(50);
  const spans: [number, number][] = [];
  for (const o of openings) {
    const piece = run.pieces.find((pc) => pc.wall.id === o.wallId);
    if (!piece || o.flat) continue;
    const d = distanceOnRun(run, o.wallId, paramAlong(piece.wall, o));
    if (d === null) continue;
    spans.push([d - o.width / 2, d + o.width / 2]);
  }
  const fixed = [0, L];
  // Wide openings get a column at each side.
  for (const [a, b] of spans)
    if (mmOf(b - a) >= rules.wideOpeningMm - 1)
      for (const d of [a - hl - gap, b + hl + gap])
        if (d > 2 * hl && d < L - 2 * hl && fixed.every((f) => Math.abs(f - d) > 4 * hl)) fixed.push(d);
  fixed.sort((a, b) => a - b);
  const out = fixed.slice(1, -1);
  const max = u(rules.maxSpanMm);
  for (let i = 0; i + 1 < fixed.length; i++) {
    const [a, b] = [fixed[i], fixed[i + 1]];
    const n = Math.ceil((b - a) / max - 1e-6) - 1;
    for (let k = 1; k <= n; k++) {
      let d = a + (k * (b - a)) / (n + 1);
      const hit = spans.find(([s0, s1]) => d > s0 - hl - gap && d < s1 + hl + gap);
      if (hit) {
        // Slide to the nearer side of the opening, if there is room there.
        const options = [hit[0] - hl - gap, hit[1] + hl + gap].filter(
          (x) => x > a + 2 * hl && x < b - 2 * hl && !spans.some(([s0, s1]) => x > s0 - hl && x < s1 + hl),
        );
        if (options.length) d = options.reduce((best, x) => (Math.abs(x - d) < Math.abs(best - d) ? x : best));
      }
      out.push(d);
    }
  }
  return out.sort((a, b) => a - b);
}

/** A floor's column positions: wall junctions and the columns along each run. */
function levelCandidates(walls: Wall[], openings: Opening[], rules: FrameRules): Candidate[] {
  const graph = wallGraph(walls);
  const atJunction = new Map<number, Candidate>();
  const out: Candidate[] = [];
  const wallMmAt = (w: Wall) => mmOf(thicknessOf(w));
  graph.junctions.forEach((j, i) => {
    if (!j.column) return;
    const runs = graph.runs.filter((r) => r.from === i || r.to === i);
    const longest = runs.reduce<Run | null>((best, r) => (!best || r.length > best.length ? r : best), null);
    const dir = longest
      ? alongRun(longest, longest.from === i ? 0 : longest.length).dir
      : (j.dirs[0] ?? { x: 1, y: 0 });
    const wallMm = Math.max(...runs.map((r) => wallMmAt(r.pieces[0].wall)), 0) || 228.6;
    const c: Candidate = { p: j.p, dir, reach: 0, wallMm };
    atJunction.set(i, c);
    out.push(c);
  });
  for (const run of graph.runs) {
    const on = openings.filter((o) => run.pieces.some((pc) => pc.wall.id === o.wallId));
    const ds = runColumns(run, on, rules);
    const stops: (Candidate | undefined)[] = [atJunction.get(run.from)];
    for (const d of ds) {
      const at = alongRun(run, d);
      const c: Candidate = { p: at.p, dir: at.dir, reach: 0, wallMm: wallMmAt(at.piece.wall) };
      out.push(c);
      stops.push(c);
    }
    stops.push(atJunction.get(run.to));
    const dist = [0, ...ds, run.length];
    for (let k = 0; k + 1 < dist.length; k++) {
      const half = (dist[k + 1] - dist[k]) / 2;
      if (stops[k]) stops[k]!.reach += half;
      if (stops[k + 1]) stops[k + 1]!.reach += half;
    }
  }
  return out;
}

/** A rectangle round a centre, turned by `deg`, `w` along and `h` across (plan units). */
function rect(c: Point, w: number, h: number, deg: number): Point[] {
  const a = (deg * Math.PI) / 180;
  const [cx, sx] = [Math.cos(a), Math.sin(a)];
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => ({ x: c.x + x * cx - y * sx, y: c.y + x * sx + y * cx }));
}

/** A rectangle along a line from a to b, `width` wide (plan units). */
function band(a: Point, b: Point, width: number): Point[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (-(b.y - a.y) / len) * (width / 2), y: ((b.x - a.x) / len) * (width / 2) };
  return [
    { x: a.x + n.x, y: a.y + n.y },
    { x: b.x + n.x, y: b.y + n.y },
    { x: b.x - n.x, y: b.y - n.y },
    { x: a.x - n.x, y: a.y - n.y },
  ];
}

const keyOf = (p: Point) => `${Math.round(p.x / 5)},${Math.round(p.y / 5)}`;

/** A wall's pieces between the given stops (fractions along it), as straight lines (an arc in short chords). */
function wallLines(w: Wall, stops: number[]): { a: Point; b: Point; span: number }[] {
  const ts = [...new Set([0, 1, ...stops.filter((t) => t > 1e-3 && t < 1 - 1e-3)])].sort((a, b) => a - b);
  const out: { a: Point; b: Point; span: number }[] = [];
  const arc = arcOf(w);
  for (let i = 0; i + 1 < ts.length; i++) {
    const [t0, t1] = [ts[i], ts[i + 1]];
    const span = runLength(partOf(w, t0, t1));
    if (span < u(150)) continue;
    const n = arc ? Math.max(1, Math.ceil((Math.abs(arc.sweep) * (t1 - t0)) / ((8 * Math.PI) / 180))) : 1;
    for (let k = 0; k < n; k++)
      out.push({ a: pointAlong(w, t0 + ((t1 - t0) * k) / n), b: pointAlong(w, t0 + ((t1 - t0) * (k + 1)) / n), span });
  }
  return out;
}

/** Join straight beams that meet end to end in line, where no column stands at the joint. */
function joinBeams(beams: Beam[], columns: Point[]): Beam[] {
  const out = [...beams];
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 2;
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < out.length && !joined; i++)
      for (let j = 0; j < out.length && !joined; j++) {
        if (i === j) continue;
        const [a, b] = [out[i], out[j]];
        if (a.kind !== b.kind || a.topMm !== b.topMm || Math.abs(a.width - b.width) > 0.5) continue;
        const end = { x: a.x2, y: a.y2 };
        const ends = [
          { x: b.x1, y: b.y1 },
          { x: b.x2, y: b.y2 },
        ];
        const k = ends.findIndex((e) => near(e, end));
        if (k < 0 || columns.some((c) => Math.hypot(c.x - end.x, c.y - end.y) < u(150))) continue;
        const far = ends[1 - k];
        const [dx1, dy1] = [a.x2 - a.x1, a.y2 - a.y1];
        const [dx2, dy2] = [far.x - end.x, far.y - end.y];
        const l1 = Math.hypot(dx1, dy1);
        const l2 = Math.hypot(dx2, dy2);
        if (!l1 || !l2 || (dx1 * dx2 + dy1 * dy2) / (l1 * l2) < Math.cos((2 * Math.PI) / 180)) continue;
        out[i] = { ...a, x2: far.x, y2: far.y, autoKey: a.autoKey };
        out.splice(j, 1);
        joined = true;
      }
  }
  return out;
}

/** The longest stretch of a line (through `p` along `d`) inside a polygon. */
function clipLine(poly: Point[], p: Point, d: Point): [Point, Point] | null {
  const ts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const s = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
    if (s >= 0 && s <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < ts.length; i++) {
    const mid = (ts[i] + ts[i + 1]) / 2;
    if (!pointInPolygon({ x: p.x + d.x * mid, y: p.y + d.y * mid }, poly)) continue;
    if (!best || ts[i + 1] - ts[i] > best[1] - best[0]) best = [ts[i], ts[i + 1]];
  }
  return best && best[1] - best[0] > 1
    ? [
        { x: p.x + d.x * best[0], y: p.y + d.y * best[0] },
        { x: p.x + d.x * best[1], y: p.y + d.y * best[1] },
      ]
    : null;
}

/** A room's main direction (its longest side) and its size along and across it (plan units). */
export function roomFrame(points: Point[]): { dir: Point; along: number; across: number; c: Point } {
  let dir = { x: 1, y: 0 };
  let longest = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > longest) [longest, dir] = [l, { x: (b.x - a.x) / l, y: (b.y - a.y) / l }];
  });
  const n = { x: -dir.y, y: dir.x };
  const xs = points.map((p) => p.x * dir.x + p.y * dir.y);
  const ys = points.map((p) => p.x * n.x + p.y * n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  return { dir, along: x1 - x0, across: y1 - y0, c: { x: cx * dir.x + cy * n.x, y: cx * dir.y + cy * n.y } };
}

export interface FrameCounts {
  columns: number;
  beams: number;
  slabs: number;
  footings: number;
}

export interface FrameResult {
  elements: PlanElement[];
  madeFrom: string;
  counts: FrameCounts;
  /** Items edited or locked since the last run, kept as they are. */
  kept: number;
  /** Why nothing could be made (no walls), or null. */
  problem: string | null;
}

/** The plan's structure, generated afresh round anything edited or locked since the last run. */
/**
 * The structure for the plan. With `keepIn` (the building line), every generated item sits inside it
 * so the setbacks check passes; columns on outer walls also sit flush with the walls' outer faces.
 */
export function generateFrame(
  doc: PlanDoc,
  wallHeightMm: number,
  rules: FrameRules = frameRules(doc),
  keepIn: Point[] | null = null,
): FrameResult {
  // Untouched generated items go; edited ones stay as the owner's own.
  let kept = 0;
  const elements: PlanElement[] = [];
  for (const el of doc.elements) {
    if (isUntouched(el)) continue;
    if (isFrameItem(el) && el.auto) {
      kept++;
      const own = { ...el };
      delete own.auto;
      delete own.autoSig;
      elements.push(own);
    } else elements.push(el);
  }
  const counts: FrameCounts = { columns: 0, beams: 0, slabs: 0, footings: 0 };
  const levels = buildingLevels(doc);
  const shown = elements.filter((el) => !el.hidden);
  const wallsOn = (id: Id) =>
    shown.filter((el): el is Wall => el.type === 'wall' && isBuildingWall(el) && levelOf(el) === id);
  const openingsOn = (id: Id) =>
    shown.filter((el): el is Opening => (el.type === 'door' || el.type === 'window') && levelOf(el) === id);
  const own = <T extends PlanElement['type']>(type: T, id: Id) =>
    shown.filter((el) => el.type === type && levelOf(el) === id) as Extract<PlanElement, { type: T }>[];
  const onLevel = (id: Id) => (id === GROUND_LEVEL ? {} : { levelId: id });
  if (!levels.some((l) => wallsOn(l.id).length))
    return {
      elements: doc.elements,
      madeFrom: frameFingerprint(doc),
      counts,
      kept: 0,
      problem: 'There are no walls to build a structure from.',
    };

  const added: FrameItem[] = [];
  const auto = { auto: true as const };
  const lowest = levels[0];
  const ground = levels.find((l) => l.id === GROUND_LEVEL) ?? lowest;
  const framed = rules.system === 'framed';
  const slabU = u(slabMm(doc));

  // Footing depth: their top this far under the lowest floor.
  const plinth = doc.plinthMm;
  const padTop = (thick: number) => (lowest.basement ? 150 : plinth + rules.footingDepthMm - thick);

  // Columns, stacked from the top floor down.
  interface Cluster {
    p: Point;
    dir: Point;
    top: number;
    reach: number;
    wallMm: number;
    on: Map<number, Candidate>;
  }
  const clusters: Cluster[] = [];
  if (framed) {
    for (let i = levels.length - 1; i >= 0; i--) {
      for (const c of levelCandidates(wallsOn(levels[i].id), openingsOn(levels[i].id), rules)) {
        const hit = clusters.find((k) => !k.on.has(i) && Math.hypot(k.p.x - c.p.x, k.p.y - c.p.y) < u(250));
        if (hit) {
          hit.on.set(i, c);
          hit.p = c.p;
          hit.dir = c.dir;
          hit.reach = Math.max(hit.reach, c.reach);
          hit.wallMm = c.wallMm;
        } else clusters.push({ p: c.p, dir: c.dir, top: i, reach: c.reach, wallMm: c.wallMm, on: new Map([[i, c]]) });
      }
    }
  }
  const tribSqFt = (reach: number) => (mmOf(reach) / FT) ** 2 / 4;
  const columnsOn = new Map<number, Column[]>();
  const clusterOf = new Map<Column, Cluster>();
  // The outer faces of each floor's walls: columns there are moved in to sit flush with them.
  const faces = levels.map((l) => {
    const outline = outsideOutline(wallsOn(l.id));
    return outline ? [outline] : [];
  });
  const angleOf = (dir: Point) => (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  const padThick = (storeys: number) => padSize(1, storeys, rules.soilTsf).thick;
  if (framed && makes(rules, 'columns'))
    for (const k of clusters) {
      // One move for the whole stack (sized as its lowest, biggest column), so it stays plumb.
      const big = columnSize(k.top + 1, k.wallMm, tribSqFt(k.reach));
      const shape = rect(k.p, u(big.along), u(big.across), angleOf(k.on.get(0)?.dir ?? k.dir));
      const off = insideOffset(shape, [...[...k.on.keys()].flatMap((i) => faces[i]), keepIn]);
      for (let i = 0; i <= k.top; i++) {
        const level = levels[i];
        if (own('column', level.id).some((c) => Math.hypot(c.x - k.p.x, c.y - k.p.y) < u(300))) continue;
        const c = k.on.get(i);
        const dir = c?.dir ?? k.dir;
        const size = columnSize(k.top - i + 1, c?.wallMm ?? k.wallMm, tribSqFt(k.reach));
        const below =
          i === 0 ? (makes(rules, 'footings') ? padTop(padThick(k.top + 1)) : lowest.basement ? 0 : plinth) : 0;
        const col: Column = {
          id: newId(),
          type: 'column',
          x: k.p.x + off.x,
          y: k.p.y + off.y,
          w: u(size.along),
          h: u(size.across),
          shape: 'rect',
          ...(Math.abs(Math.atan2(dir.y, dir.x)) > 1e-6
            ? { rotation: Math.round(((Math.atan2(dir.y, dir.x) * 180) / Math.PI) * 100) / 100 }
            : {}),
          ...(below > 0 ? { belowMm: Math.round(below) } : {}),
          ...onLevel(level.id),
          ...auto,
          autoKey: `col:${level.id}:${keyOf(k.p)}`,
        };
        added.push(col);
        clusterOf.set(col, k);
        columnsOn.set(i, [...(columnsOn.get(i) ?? []), col]);
      }
    }
  // Beams stop at the columns' places on the wall lines (a column moved in to the outer face still ends them there).
  const stopsOn = (i: number): Point[] => [
    ...(columnsOn.get(i) ?? []).map((c) => clusterOf.get(c)?.p ?? c),
    ...own('column', levels[i].id),
  ];

  /** Beams along walls, between the columns on them. */
  const beamsAlong = (
    walls: Wall[],
    stops: Point[],
    kind: BeamKind,
    level: Id,
    make: (w: Wall, span: number) => { width: number; depth: number; topMm?: number },
    key: string,
  ): Beam[] => {
    const out: Beam[] = [];
    for (const w of walls) {
      const ts = stops
        .map((p) => projectOnWall(w, p))
        .filter((pr) => pr.dist < thicknessOf(w) / 2 + u(50))
        .map((pr) => pr.t);
      for (const { a, b, span } of wallLines(w, ts)) {
        const size = make(w, span);
        out.push({
          id: newId(),
          type: 'beam',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          width: size.width,
          depth: size.depth,
          ...(kind !== 'floor' ? { kind } : {}),
          ...(size.topMm !== undefined ? { topMm: Math.round(size.topMm) } : {}),
          ...onLevel(level),
          ...auto,
          autoKey: `${key}:${level}:${keyOf(a)}`,
        });
      }
    }
    return joinBeams(out, stops);
  };
  /** A beam a kept beam already covers. */
  const covered = (b: Beam, level: Id) =>
    own('beam', level).some((k) => {
      const mid = { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
      const kw: Wall = { id: '', type: 'wall', x1: k.x1, y1: k.y1, x2: k.x2, y2: k.y2 };
      return (
        projectOnWall(kw, mid).dist < Math.max(k.width, b.width) / 2 && (k.kind ?? 'floor') === (b.kind ?? 'floor')
      );
    });
  const widthOf = (w: Wall) => Math.max(thicknessOf(w), u(9 * IN));
  const roofed = (r: Room) => !UNROOFED.test(r.name);

  levels.forEach((level, i) => {
    const walls = wallsOn(level.id);
    const above = levels[i + 1];
    const top = !above;
    const wallTopMm = levelWallMm(doc, level.id, wallHeightMm);
    if (makes(rules, 'beams')) {
      if (framed) {
        // Under the walls of the floor above too, where this floor has no wall under them.
        const upper = above
          ? wallsOn(above.id).filter(
              (w) =>
                !walls.some((v) => {
                  const mid = pointAlong(w, 0.5);
                  const d = projectOnWall(v, mid);
                  return d.dist < thicknessOf(v) / 2 + u(25) && d.t > 0 && d.t < 1;
                }),
            )
          : [];
        const beams = beamsAlong(
          [...walls, ...upper],
          stopsOn(i),
          top ? 'roof' : 'floor',
          level.id,
          (w, span) => ({ width: widthOf(w), depth: u(beamDepth(mmOf(span), doc)) }),
          'b',
        );
        added.push(...beams.filter((b) => !covered(b, level.id)));
      } else {
        // A load-bearing building's roof band, and its lintel band in seismic zones.
        const bands = beamsAlong(
          walls,
          [],
          'band',
          level.id,
          (w) => ({ width: thicknessOf(w), depth: u(6 * IN) }),
          'rb',
        );
        added.push(...bands.filter((b) => !covered(b, level.id)));
        if (lintelBand(rules)) {
          const heads = openingsOn(level.id).map((o) => openingHeadMm(o, wallTopMm));
          const head = Math.max(...heads, 2134);
          if (head + 6 * IN < wallTopMm - 6 * IN)
            added.push(
              ...beamsAlong(
                walls,
                [],
                'band',
                level.id,
                (w) => ({ width: thicknessOf(w), depth: u(6 * IN), topMm: head + 6 * IN }),
                'lb',
              ),
            );
        }
      }
      // Secondary beams across wide rooms.
      for (const room of doc.rooms.filter((r) => levelOf(r) === level.id && !r.openAbove && roofed(r))) {
        const f = roomFrame(room.points);
        const short = Math.min(f.along, f.across);
        const n = Math.ceil(mmOf(short) / rules.slabSpanMm - 1e-6) - 1;
        if (n < 1) continue;
        // Parallel to the long side, splitting the short one.
        const longDir = f.along >= f.across ? f.dir : { x: -f.dir.y, y: f.dir.x };
        const across = { x: -longDir.y, y: longDir.x };
        for (let k = 1; k <= n; k++) {
          const off = -short / 2 + (k * short) / (n + 1);
          const p = { x: f.c.x + across.x * off, y: f.c.y + across.y * off };
          const seg = clipLine(room.points, p, longDir);
          if (!seg) continue;
          const ext = u(4.5 * IN);
          const [a, b] = [
            { x: seg[0].x - longDir.x * ext, y: seg[0].y - longDir.y * ext },
            { x: seg[1].x + longDir.x * ext, y: seg[1].y + longDir.y * ext },
          ];
          const beam: Beam = {
            id: newId(),
            type: 'beam',
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            width: u(9 * IN),
            depth: u(beamDepth(mmOf(Math.hypot(b.x - a.x, b.y - a.y)), doc)),
            kind: 'secondary',
            ...onLevel(level.id),
            ...auto,
            autoKey: `sb:${room.id}:${k}`,
          };
          if (!covered(beam, level.id)) added.push(beam);
        }
      }
      // Beams round the stair openings in the slab over this floor, where no wall runs.
      for (const hole of slabVoids({ ...doc, elements: shown }, level.id).filter((v) => v.id.startsWith('stair-'))) {
        hole.points.forEach((a, k) => {
          const b = hole.points[(k + 1) % hole.points.length];
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (Math.hypot(b.x - a.x, b.y - a.y) < u(300)) return;
          if (walls.some((w) => projectOnWall(w, mid).dist < thicknessOf(w) / 2 + u(50))) return;
          const beam: Beam = {
            id: newId(),
            type: 'beam',
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            width: u(9 * IN),
            depth: u(12 * IN),
            kind: 'landing',
            ...onLevel(level.id),
            ...auto,
            autoKey: `lb:${hole.id}:${k}`,
          };
          if (!covered(beam, level.id)) added.push(beam);
        });
      }
    }
    // The slab over this floor, over its rooms out to the walls' outer faces.
    if (makes(rules, 'slabs')) {
      const hasOwn = own('slab', level.id).some((s) => !s.footing);
      const pitched = top && own('roof', level.id).some((r) => r.shape !== 'flat');
      const rooms = doc.rooms.filter((r) => levelOf(r) === level.id && roofed(r));
      if (!hasOwn && !pitched && rooms.length && walls.length)
        roomsSlab(
          rooms.map((r) => r.points),
          walls,
        ).forEach(({ outline, holes }, k) => {
          if (outline.length < 3) return;
          added.push({
            id: newId(),
            type: 'slab',
            points: outline,
            thickness: slabU,
            ...(holes.length ? { holes } : {}),
            ...onLevel(level.id),
            ...auto,
            autoKey: `slab:${level.id}:${k}`,
          });
        });
    }
  });

  // Plinth beams under the ground floor's walls, and tie beams joining the footings at the natural ground.
  const gi = levels.indexOf(ground);
  const groundWalls = wallsOn(ground.id);
  const storeys = levels.length;
  if (makes(rules, 'plinth') && plinth > 150)
    added.push(
      ...beamsAlong(
        groundWalls,
        framed ? stopsOn(gi) : [],
        'plinth',
        ground.id,
        (w) => ({ width: thicknessOf(w), depth: u(12 * IN), topMm: 0 }),
        'pb',
      ).filter((b) => !covered(b, ground.id)),
    );
  if (framed && makes(rules, 'tie') && !lowest.basement && plinth >= 600)
    added.push(
      ...beamsAlong(
        groundWalls,
        stopsOn(gi),
        'tie',
        ground.id,
        (w) => ({ width: widthOf(w), depth: u((storeys >= 3 ? 15 : 12) * IN), topMm: -plinth }),
        'tb',
      ).filter((b) => !covered(b, ground.id)),
    );

  // Footings: a pad under each column (joined where they would overlap), or strips under the walls.
  if (makes(rules, 'footings')) {
    const footings: Slab[] = [];
    const keptFootings = own('slab', lowest.id).filter((s) => s.footing);
    const freeOf = (p: Point) => !keptFootings.some((f) => pointInPolygon(p, f.points));
    if (framed) {
      type Pad = { c: Point; side: number; thick: number; deg: number; keys: string[] };
      let pads: Pad[] = [];
      const bottom = [
        ...(columnsOn.get(0) ?? []).map((c) => {
          const k = clusterOf.get(c)!;
          return { c: { x: c.x, y: c.y }, storeys: k.top + 1, reach: k.reach, deg: c.rotation ?? 0 };
        }),
        ...own('column', lowest.id).map((c) => ({
          c: { x: c.x, y: c.y },
          storeys,
          reach: u(rules.maxSpanMm) * 2,
          deg: c.rotation ?? 0,
        })),
      ];
      for (const b of bottom) {
        if (!freeOf(b.c)) continue;
        const size = padSize(tribSqFt(b.reach), b.storeys, rules.soilTsf);
        pads.push({ c: b.c, side: u(size.side), thick: u(size.thick), deg: b.deg, keys: [keyOf(b.c)] });
      }
      // Pads that would overlap become one combined footing round both.
      type Box = { x0: number; y0: number; x1: number; y1: number };
      const boxOf = (p: Pad): Box => {
        const pts = rect(p.c, p.side, p.side, p.deg);
        return {
          x0: Math.min(...pts.map((q) => q.x)),
          y0: Math.min(...pts.map((q) => q.y)),
          x1: Math.max(...pts.map((q) => q.x)),
          y1: Math.max(...pts.map((q) => q.y)),
        };
      };
      const combined: { box: Box; thick: number; keys: string[] }[] = [];
      let merging = true;
      const boxes = pads.map((p) => ({ box: boxOf(p), thick: p.thick, keys: p.keys, pad: p as Pad | null }));
      while (merging) {
        merging = false;
        for (let i = 0; i < boxes.length && !merging; i++)
          for (let j = i + 1; j < boxes.length && !merging; j++) {
            const [a, b] = [boxes[i].box, boxes[j].box];
            if (a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1) {
              boxes[i] = {
                box: {
                  x0: Math.min(a.x0, b.x0),
                  y0: Math.min(a.y0, b.y0),
                  x1: Math.max(a.x1, b.x1),
                  y1: Math.max(a.y1, b.y1),
                },
                thick: Math.max(boxes[i].thick, boxes[j].thick),
                keys: [...boxes[i].keys, ...boxes[j].keys],
                pad: null,
              };
              boxes.splice(j, 1);
              merging = true;
            }
          }
      }
      pads = boxes.filter((b) => b.pad).map((b) => b.pad!);
      combined.push(...boxes.filter((b) => !b.pad));
      // Kept inside the plot: a pad at the plot line is moved in (an eccentric footing).
      const plot = shown.find((el) => el.type === 'plot' && levelOf(el) === GROUND_LEVEL);
      const inside = (pts: Point[]) =>
        !plot || plot.type !== 'plot' || pts.every((q) => pointInPolygon(q, plot.points));
      const shifted = (shape: Point[]): Point[] => {
        // Inside the building line first (an eccentric footing at the line).
        const pts = keepInside(shape, keepIn);
        if (inside(pts) || !plot || plot.type !== 'plot') return pts;
        const c = {
          x: pts.reduce((t, q) => t + q.x, 0) / pts.length,
          y: pts.reduce((t, q) => t + q.y, 0) / pts.length,
        };
        const pc = plot.points.reduce(
          (t, q) => ({ x: t.x + q.x / plot.points.length, y: t.y + q.y / plot.points.length }),
          {
            x: 0,
            y: 0,
          },
        );
        const len = Math.hypot(pc.x - c.x, pc.y - c.y) || 1;
        const step = { x: ((pc.x - c.x) / len) * u(25), y: ((pc.y - c.y) / len) * u(25) };
        let out = pts;
        for (let n = 0; n < 200 && !inside(out); n++) out = out.map((q) => ({ x: q.x + step.x, y: q.y + step.y }));
        return out;
      };
      for (const p of pads)
        footings.push({
          id: newId(),
          type: 'slab',
          footing: 'pad',
          points: shifted(rect(p.c, p.side, p.side, p.deg)),
          thickness: p.thick,
          belowMm: Math.round(padTop(mmOf(p.thick))),
          ...onLevel(lowest.id),
          ...auto,
          autoKey: `f:${p.keys[0]}`,
        });
      for (const b of combined) {
        const { x0, y0, x1, y1 } = b.box;
        footings.push({
          id: newId(),
          type: 'slab',
          footing: 'combined',
          points: shifted([
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ]),
          thickness: b.thick,
          belowMm: Math.round(padTop(mmOf(b.thick))),
          ...onLevel(lowest.id),
          ...auto,
          autoKey: `f:${b.keys.sort()[0]}`,
        });
      }
    } else
      footings.push(
        ...stripFootings(
          wallsOn(lowest.id),
          STRIP_MM.width,
          STRIP_MM.thick,
          padTop(STRIP_MM.thick),
          lowest.id,
          'sf',
        ).map((f) => ({ ...f, points: clipInside(f.points, keepIn) })),
      );
    // Boundary walls stand on their own strip footings.
    const boundary = shown.filter(
      (el): el is Wall => el.type === 'wall' && el.kind === 'boundary' && levelOf(el) === GROUND_LEVEL,
    );
    if (boundary.length)
      footings.push(
        ...stripFootings(
          boundary,
          BOUNDARY_STRIP_MM.width,
          BOUNDARY_STRIP_MM.thick,
          plinth + BOUNDARY_STRIP_MM.depth - BOUNDARY_STRIP_MM.thick,
          GROUND_LEVEL,
          'bf',
        ),
      );
    added.push(...footings.filter((f) => freeOf(f.points[0]) || f.footing === 'strip'));
  }

  // Beams wider than their wall (tie beams) keep inside the outer faces and the building line.
  for (const [n, el] of added.entries()) {
    if (el.type !== 'beam') continue;
    const i = Math.max(
      0,
      levels.findIndex((l) => l.id === levelOf(el)),
    );
    const along = { x: el.x2 - el.x1, y: el.y2 - el.y1 };
    const mid = { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 };
    const off = insideOffset(rect(mid, Math.hypot(along.x, along.y), el.width, angleOf(along)), [...faces[i], keepIn]);
    if (off.x || off.y)
      added[n] = { ...el, x1: el.x1 + off.x, y1: el.y1 + off.y, x2: el.x2 + off.x, y2: el.y2 + off.y };
  }
  for (const el of added) {
    if (el.type === 'column') counts.columns++;
    else if (el.type === 'beam') counts.beams++;
    else if (el.footing) counts.footings++;
    else counts.slabs++;
  }
  const all = markFrame([...elements, ...added]);
  const result = all.map((el) => (isFrameItem(el) && el.auto ? { ...el, autoSig: frameSig(el) } : el));
  const madeFrom = frameFingerprint({ ...doc, elements: result });
  return { elements: result, madeFrom, counts, kept, problem: null };
}

/** A footing's outline cut back to the building line (moved in when the line isn't convex). */
function clipInside(pts: Point[], line: Point[] | null): Point[] {
  if (!line) return pts;
  if (isConvex(line)) return clipToConvex(pts, line) ?? pts;
  return keepInside(pts, line);
}

/** An opening's head height above its floor, mm. */
export function openingHeadMm(o: Opening, wallTopMm: number): number {
  if (o.type === 'door') return Math.min(2134, wallTopMm);
  return (o.sillMm ?? 914) + (o.heightMm ?? 1220);
}

/** Strip footings under walls: along each piece between junctions, with a square where walls meet. */
function stripFootings(
  walls: Wall[],
  widthMm: number,
  thickMm: number,
  belowMm: number,
  level: Id,
  key: string,
): Slab[] {
  const graph = wallGraph(walls);
  const W = u(widthMm);
  const out: Slab[] = [];
  const base = {
    type: 'slab' as const,
    footing: 'strip' as const,
    thickness: u(thickMm),
    belowMm: Math.round(belowMm),
    ...(level === GROUND_LEVEL ? {} : { levelId: level }),
    auto: true as const,
  };
  const joint = graph.junctions.map((j) => j.dirs.length >= 2);
  graph.junctions.forEach((j, i) => {
    if (joint[i]) out.push({ ...base, id: newId(), points: rect(j.p, W, W, 0), autoKey: `${key}:j:${keyOf(j.p)}` });
  });
  for (const run of graph.runs)
    for (const piece of run.pieces) {
      const lines = wallLines(partOf(piece.wall, Math.min(piece.t0, piece.t1), Math.max(piece.t0, piece.t1)), []);
      lines.forEach(({ a, b }, k) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) return;
        const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
        const ja = k === 0 && graph.junctions.some((j, i) => joint[i] && Math.hypot(j.p.x - a.x, j.p.y - a.y) < 8);
        const jb =
          k === lines.length - 1 &&
          graph.junctions.some((j, i) => joint[i] && Math.hypot(j.p.x - b.x, j.p.y - b.y) < 8);
        const a2 = ja ? { x: a.x + (d.x * W) / 2, y: a.y + (d.y * W) / 2 } : a;
        const b2 = jb ? { x: b.x - (d.x * W) / 2, y: b.y - (d.y * W) / 2 } : b;
        if (Math.hypot(b2.x - a2.x, b2.y - a2.y) < 1) return;
        out.push({ ...base, id: newId(), points: band(a2, b2, W), autoKey: `${key}:${keyOf(a)}:${keyOf(b)}` });
      });
    }
  return out;
}

const PREFIX: Record<BeamKind, string> = {
  floor: 'B',
  roof: 'RB',
  secondary: 'SB',
  landing: 'LB',
  plinth: 'PB',
  tie: 'TB',
  band: 'BD',
};

/** The mark prefix of a structure item. */
export const markPrefix = (el: FrameItem): string =>
  el.type === 'column' ? 'C' : el.type === 'beam' ? PREFIX[el.kind ?? 'floor'] : el.footing ? 'F' : 'S';

/** Its size, as marks group them (same size, same mark). */
function sizeKey(el: FrameItem): string {
  const r = (n: number) => Math.round(n * MM_PER_UNIT);
  if (el.type === 'column') return `${r(Math.min(el.w, el.h))}x${r(Math.max(el.w, el.h))}`;
  if (el.type === 'beam') return `${r(el.width)}x${r(el.depth)}`;
  if (el.footing === 'strip') return `strip:${r(el.thickness)}`;
  if (el.footing) {
    const xs = el.points.map((p) => Math.hypot(p.x - el.points[0].x, p.y - el.points[0].y));
    return `${el.footing}:${r(Math.max(...xs))}:${r(el.thickness)}`;
  }
  return `${el.levelId ?? GROUND_LEVEL}:${r(el.thickness)}`;
}

/** Marks for the generated items: C1, C2 ... by size (smallest first), B1 ... and so on. Kept items keep theirs. */
export function markFrame(elements: PlanElement[]): PlanElement[] {
  // Marks already taken by kept items aren't given again to a different size.
  const taken = new Map<string, string>();
  for (const el of elements) if (isFrameItem(el) && !el.auto && el.mark) taken.set(el.mark, sizeKey(el));
  const groups = new Map<string, FrameItem[]>();
  for (const el of elements)
    if (isFrameItem(el) && el.auto) {
      const k = `${markPrefix(el)}|${sizeKey(el)}`;
      groups.set(k, [...(groups.get(k) ?? []), el]);
    }
  const order = [...groups.keys()].sort((a, b) => {
    const [pa, sa] = a.split('|');
    const [pb, sb] = b.split('|');
    if (pa !== pb) return pa.localeCompare(pb);
    const area = (s: string) =>
      s
        .split(/[x:]/)
        .map(Number)
        .filter(Number.isFinite)
        .reduce((t, n) => t * (n || 1), 1);
    return area(sa) - area(sb);
  });
  const next = new Map<string, number>();
  const markOf = new Map<string, string>();
  for (const k of order) {
    const [prefix, size] = k.split('|');
    const reuse = [...taken.entries()].find(([m, s]) => s === size && m.startsWith(prefix) && /\d$/.test(m));
    if (reuse) {
      markOf.set(k, reuse[0]);
      continue;
    }
    let n = next.get(prefix) ?? 1;
    while (taken.has(`${prefix}${n}`)) n++;
    markOf.set(k, `${prefix}${n}`);
    next.set(prefix, n + 1);
  }
  return elements.map((el) => {
    if (!isFrameItem(el) || !el.auto) return el;
    return { ...el, mark: markOf.get(`${markPrefix(el)}|${sizeKey(el)}`) };
  });
}

/** The plan without the generated structure (edited items stay), for Remove structure. */
export function withoutFrame(doc: PlanDoc): PlanElement[] {
  return doc.elements.filter((el) => !(isFrameItem(el) && el.auto));
}

/** How many generated items the plan has. */
export const frameCount = (doc: Pick<PlanDoc, 'elements'>) =>
  doc.elements.filter((el) => isFrameItem(el) && el.auto).length;
