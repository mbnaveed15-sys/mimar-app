/**
 * The structure schedule: each mark (C1, B2, F1, L1 ...) with its size, how many there are, their
 * length and their concrete. Pure.
 */
import { polygonArea } from '../../rooms';
import { MM_PER_UNIT } from '../scale';
import { formatLength } from '../units';
import { levelWallMm } from '../levels';
import type { PlanDoc, Units } from '../../types';
import { isFrameItem, markPrefix } from './generate';
import { lintelsOf } from './lintels';

export interface ScheduleRow {
  mark: string;
  item: string;
  /** Section (or plan size) in mm: a × b; a slab or footing's thickness as b. */
  aMm: number;
  bMm: number;
  count: number;
  /** Total length (beams, lintels, columns' height), mm; 0 for slabs and footings. */
  lengthMm: number;
  /** Concrete, cubic metres. */
  m3: number;
}

const ITEM: Record<string, string> = {
  C: 'Column',
  B: 'Floor beam',
  RB: 'Roof beam',
  SB: 'Secondary beam',
  LB: 'Stair opening beam',
  PB: 'Plinth beam',
  TB: 'Tie beam',
  BD: 'Band',
  F: 'Footing',
  S: 'Slab',
  L: 'Lintel',
};

const ORDER = ['F', 'TB', 'PB', 'C', 'B', 'RB', 'SB', 'LB', 'BD', 'L', 'S'];

export function structureSchedule(doc: PlanDoc, wallHeightMm: number): ScheduleRow[] {
  const u = MM_PER_UNIT;
  const rows = new Map<string, ScheduleRow>();
  const add = (mark: string, prefix: string, a: number, b: number, length: number, m3: number) => {
    const row = rows.get(mark) ?? { mark, item: ITEM[prefix] ?? 'Item', aMm: a, bMm: b, count: 0, lengthMm: 0, m3: 0 };
    row.count++;
    row.lengthMm += length;
    row.m3 += m3;
    rows.set(mark, row);
  };
  for (const el of doc.elements) {
    if (!isFrameItem(el) || el.hidden) continue;
    const prefix = markPrefix(el);
    const mark = el.mark ?? `${prefix}?`;
    if (el.type === 'column') {
      const h = (el.heightMm ?? levelWallMm(doc, el.levelId ?? 'ground', wallHeightMm)) + (el.belowMm ?? 0);
      const [a, b] = [Math.min(el.w, el.h) * u, Math.max(el.w, el.h) * u];
      add(mark, prefix, a, b, h, (a * b * h) / 1e9);
    } else if (el.type === 'beam') {
      const l = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * u;
      add(mark, prefix, el.width * u, el.depth * u, l, (el.width * u * el.depth * u * l) / 1e9);
    } else {
      const area =
        Math.abs(polygonArea(el.points)) * u * u -
        (el.holes ?? []).reduce((t, h) => t + Math.abs(polygonArea(h)) * u * u, 0);
      add(mark, prefix, 0, el.thickness * u, 0, (area * el.thickness * u) / 1e9);
    }
  }
  for (const l of lintelsOf(doc, wallHeightMm))
    add(l.mark, 'L', l.width * u, l.depthMm, l.lengthMm, (l.width * u * l.depthMm * l.lengthMm) / 1e9);
  const prefixOf = (m: string) => m.replace(/[\d?]+$/, '');
  return [...rows.values()].sort(
    (a, b) =>
      ORDER.indexOf(prefixOf(a.mark)) - ORDER.indexOf(prefixOf(b.mark)) ||
      a.mark.localeCompare(b.mark, undefined, { numeric: true }),
  );
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The schedule as CSV, with sizes in the plan's units and concrete in cft and m³. */
export function structureCsv(doc: PlanDoc, title: string, units: Units, wallHeightMm: number): string {
  const rows: (string | number)[][] = [
    [title],
    [],
    ['Mark', 'Item', 'Size', 'Number', 'Total length', 'Concrete (cft)', 'Concrete (m³)'],
  ];
  for (const r of structureSchedule(doc, wallHeightMm))
    rows.push([
      r.mark,
      r.item,
      r.aMm ? `${formatLength(r.aMm, units)} × ${formatLength(r.bMm, units)}` : `${formatLength(r.bMm, units)} thick`,
      r.count,
      r.lengthMm ? formatLength(r.lengthMm, units) : '',
      (r.m3 * 35.3147).toFixed(1),
      r.m3.toFixed(2),
    ]);
  rows.push(
    [],
    [
      'A preliminary layout from rules of thumb, for drawing and costing: sizes must be checked by a structural engineer.',
    ],
  );
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
