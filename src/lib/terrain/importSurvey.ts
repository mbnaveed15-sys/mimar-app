/**
 * Reading a land survey (a CSV of points or a DXF of points and contour lines) and placing it on the
 * plan: north along the plan's north, levels in mm above the datum. Pure.
 */
import type { Point } from '../../types';
import { MM_PER_UNIT } from '../scale';

/** A surveyed point as written in the file: first and second coordinate as they come (easting/northing in either order), and its level. */
export interface SurveyRow {
  a: number;
  b: number;
  z: number;
  code?: string;
}

/** A plain number as written in a survey file (no units, no thousands separators). */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

const isNumber = (s: string) => NUMBER.test(s);

/** A line of a CSV split into its parts: an optional label, the numbers, and any text after them. */
interface CsvLine {
  label?: string;
  nums: number[];
  code?: string;
}

/** Split a line into a label, a run of numbers and a trailing text, or null when it does not fit that shape. */
function splitLine(line: string): CsvLine | 'header' | null {
  const parts = line
    .trim()
    .split(/[\s,;]+/)
    .filter((s) => s !== '');
  if (!parts.some(isNumber)) return 'header';
  let i = 0;
  let label: string | undefined;
  if (!isNumber(parts[0])) label = parts[i++];
  const nums: number[] = [];
  while (i < parts.length && isNumber(parts[i])) nums.push(Number(parts[i++]));
  const rest = parts.slice(i);
  if (nums.length < 3 || rest.some(isNumber)) return null;
  return { label, nums, code: rest.length ? rest.join(' ') : undefined };
}

/** Whether the first numbers of these lines read as point numbers: whole, and counting up or all different. */
function looksLikePointNumbers(firsts: number[]): boolean {
  if (!firsts.length || !firsts.every(Number.isInteger)) return false;
  const countsUp = firsts.every((v, i) => i === 0 || v > firsts[i - 1]);
  return countsUp || new Set(firsts).size === firsts.length;
}

/** Read a survey CSV (comma, tab, semicolon or spaces; header lines and blank lines skipped). A leading point-number column is dropped when a row has 4+ numbers and the first looks like a point number (a whole number, and the column counts up or is unique); a trailing text column becomes `code` (PENZD style). Returns the rows and how many lines could not be read. */
export function parseSurveyCsv(text: string): { rows: SurveyRow[]; skipped: number } {
  const lines: CsvLine[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n|\r/)) {
    if (!raw.trim()) continue;
    const line = splitLine(raw);
    if (line === 'header') continue;
    if (line) lines.push(line);
    else if (lines.length) skipped++; // before the first point it is a title or header
  }
  const long = lines.filter((l) => l.nums.length >= 4 && l.label === undefined);
  const dropFirst = looksLikePointNumbers(long.map((l) => l.nums[0]));
  const rows: SurveyRow[] = [];
  for (const l of lines) {
    let nums = l.nums;
    if (dropFirst && l.label === undefined) {
      // In a file of numbered points, a row of three numbers is a numbered point short of a column.
      if (nums.length < 4) {
        skipped++;
        continue;
      }
      nums = nums.slice(1);
    }
    const row: SurveyRow = { a: nums[0], b: nums[1], z: nums[2] };
    if (l.code !== undefined) row.code = l.code;
    rows.push(row);
  }
  return { rows, skipped };
}

/** One DXF entity: its type and its group codes in order. */
interface DxfEntity {
  type: string;
  groups: [number, string][];
}

/** The first value of a group code in an entity, as a number, or the fallback. */
function num(e: DxfEntity, code: number, fallback = 0): number {
  const g = e.groups.find(([c]) => c === code);
  const v = g ? Number(g[1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

/** The (x, y) vertices of an LWPOLYLINE, in order. */
function lwVertices(e: DxfEntity): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [c, v] of e.groups) {
    if (c === 10) out.push({ x: Number(v), y: 0 });
    else if (c === 20 && out.length) out[out.length - 1].y = Number(v);
  }
  return out;
}

const DXF_UNITS: Record<number, 'in' | 'ft' | 'mm' | 'cm' | 'm'> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

/** Read the points and contour lines out of a DXF (R12 and later, LF or CRLF): POINT and INSERT give points (x, y, z); LWPOLYLINE (its elevation, group 38) and LINE / 2D or 3D POLYLINE whose vertices are all at one height give contours; a 3D POLYLINE whose heights differ gives its vertices as points. Units from $INSUNITS (1 in, 2 ft, 4 mm, 5 cm, 6 m) when present. Only the ENTITIES section is read (blocks ignored). */
export function parseSurveyDxf(text: string): {
  points: { x: number; y: number; z: number }[];
  contours: { points: { x: number; y: number }[]; z: number; closed: boolean }[];
  units?: 'in' | 'ft' | 'mm' | 'cm' | 'm';
} {
  const lines = text.split(/\r?\n|\r/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);

  let units: 'in' | 'ft' | 'mm' | 'cm' | 'm' | undefined;
  const ins = pairs.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  if (ins >= 0) {
    const g = pairs.slice(ins + 1).find(([c]) => c === 70 || c === 9);
    if (g && g[0] === 70) units = DXF_UNITS[Number(g[1])];
  }

  // The entities, split at each group 0, from the ENTITIES section only.
  const entities: DxfEntity[] = [];
  let inEntities = false;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION' && pairs[i + 1]?.[0] === 2) {
      inEntities = pairs[i + 1][1] === 'ENTITIES';
      i++;
    } else if (c === 0 && v === 'ENDSEC') {
      inEntities = false;
    } else if (inEntities) {
      if (c === 0) entities.push({ type: v, groups: [] });
      else entities[entities.length - 1]?.groups.push([c, v]);
    }
  }

  const points: { x: number; y: number; z: number }[] = [];
  const contours: { points: { x: number; y: number }[]; z: number; closed: boolean }[] = [];
  /** A run of 3D vertices: a contour when all at one height, else points. */
  const addRun = (vs: { x: number; y: number; z: number }[], closed: boolean) => {
    if (!vs.length) return;
    if (vs.length >= 2 && vs.every((v) => Math.abs(v.z - vs[0].z) < 1e-9)) {
      contours.push({ points: vs.map(({ x, y }) => ({ x, y })), z: vs[0].z, closed });
    } else points.push(...vs);
  };

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    switch (e.type) {
      case 'POINT':
      case 'INSERT':
        points.push({ x: num(e, 10), y: num(e, 20), z: num(e, 30) });
        break;
      case 'LINE':
        addRun(
          [
            { x: num(e, 10), y: num(e, 20), z: num(e, 30) },
            { x: num(e, 11), y: num(e, 21), z: num(e, 31) },
          ],
          false,
        );
        break;
      case 'LWPOLYLINE': {
        const vs = lwVertices(e);
        if (vs.length >= 2) contours.push({ points: vs, z: num(e, 38), closed: (num(e, 70) & 1) === 1 });
        break;
      }
      case 'POLYLINE': {
        const flags = num(e, 70);
        const is3d = (flags & 8) !== 0;
        const isMesh = (flags & (16 | 64)) !== 0;
        const elevation = num(e, 30);
        const vs: { x: number; y: number; z: number }[] = [];
        while (entities[i + 1]?.type === 'VERTEX') {
          const v = entities[++i];
          const vFlags = num(v, 70);
          if ((vFlags & 128) !== 0 && (vFlags & 64) === 0) continue; // a polyface face record, not a vertex
          vs.push({ x: num(v, 10), y: num(v, 20), z: is3d || isMesh ? num(v, 30) : elevation });
        }
        if (entities[i + 1]?.type === 'SEQEND') i++;
        if (isMesh) points.push(...vs);
        else addRun(vs, (flags & 1) === 1);
        break;
      }
    }
  }
  return units ? { points, contours, units } : { points, contours };
}

export type SurveyUnits = 'in' | 'ft' | 'mm' | 'cm' | 'm';

/** Millimetres in one of each survey unit. */
const MM_PER: Record<SurveyUnits, number> = { in: 25.4, ft: 304.8, mm: 1, cm: 10, m: 1000 };

/** How to place a survey on the plan. */
export interface Placement {
  units: SurveyUnits;
  /** Which coordinate comes first in the file: easting then northing (x, y), or northing then easting. */
  order: 'EN' | 'NE';
  /** The survey's own level of the datum (±0: the road level), in the survey's units. */
  datum: number;
  /** Where the middle of the survey (the centre of its extent) goes on the plan, plan units. */
  anchor: Point;
  northDeg: number;
}

/** Survey points and contour lines on the plan: north in the survey along the plan's north, the middle at the anchor, levels in mm above the datum. (For a DXF, a = x = easting and b = y = northing, so use order 'EN'.) */
export function placeSurvey(
  points: SurveyRow[],
  contours: { points: { a: number; b: number }[]; z: number; closed?: boolean }[],
  p: Placement,
): { levels: { x: number; y: number; zMm: number }[]; contours: { points: Point[]; zMm: number }[] } {
  const en = (q: { a: number; b: number }) => (p.order === 'EN' ? { e: q.a, n: q.b } : { e: q.b, n: q.a });
  const all = [...points, ...contours.flatMap((c) => c.points)].map(en);
  if (!all.length) return { levels: [], contours: [] };
  const e = levelRange(all.map((q) => q.e))!;
  const n = levelRange(all.map((q) => q.n))!;
  const midE = (e.min + e.max) / 2;
  const midN = (n.min + n.max) / 2;
  const f = MM_PER[p.units];
  const t = (p.northDeg * Math.PI) / 180;
  const east = { x: Math.cos(t), y: Math.sin(t) };
  const north = { x: Math.sin(t), y: -Math.cos(t) };
  const toPlan = (q: { a: number; b: number }): Point => {
    const { e, n } = en(q);
    const de = ((e - midE) * f) / MM_PER_UNIT;
    const dn = ((n - midN) * f) / MM_PER_UNIT;
    return { x: p.anchor.x + de * east.x + dn * north.x, y: p.anchor.y + de * east.y + dn * north.y };
  };
  const zMm = (z: number) => (z - p.datum) * f;
  return {
    levels: points.map((q) => ({ ...toPlan(q), zMm: zMm(q.z) })),
    contours: contours.map((c) => {
      const pts = c.points.map(toPlan);
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (c.closed && pts.length > 1 && (first.x !== last.x || first.y !== last.y)) pts.push({ ...first });
      return { points: pts, zMm: zMm(c.z) };
    }),
  };
}

/** Lowest and highest level in a survey (for the import dialog), or null. */
export function levelRange(zs: number[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const z of zs) {
    if (!Number.isFinite(z)) continue;
    if (z < min) min = z;
    if (z > max) max = z;
  }
  return min <= max ? { min, max } : null;
}
