/**
 * Lintels, worked out live from each door, window and opening once the structure has been generated
 * (like the plinth, they are never stored): over the opening's head, sitting on the wall past each
 * side, joined where two would nearly meet. Left off where the beam over the wall comes down to the
 * head anyway, under a load-bearing building's lintel band, over gates, curtain walls and shapes
 * drawn only on a wall's face. Pure.
 */
import { arcOf, paramAlong, pointAlong, runLength } from '../arc';
import { buildingLevels, levelWallMm } from '../levels';
import { MM_PER_UNIT } from '../scale';
import { isCurtain } from '../curtain';
import { isBuildingWall, thicknessOf } from '../../walls';
import { levelOf, type Id, type Opening, type PlanDoc, type Point, type Wall } from '../../types';
import { openingHeadMm } from './generate';
import { frameRules, lintelBand, lintelDepth, makes, up3, IN } from './settings';

export interface Lintel {
  /** `lintel:<first opening's id>`, the id its 3D parts and the schedule use. */
  id: string;
  openingIds: Id[];
  wallId: Id;
  levelId: Id;
  /** Its ends on the wall's centre line (plan units). */
  a: Point;
  b: Point;
  /** Width (the wall's thickness), plan units. */
  width: number;
  lengthMm: number;
  depthMm: number;
  /** Height of its underside above the floor, mm. */
  bottomMm: number;
  curved: boolean;
  mark: string;
}

export const LINTEL_PREFIX = 'lintel:';
export const lintelOpening = (id: string | null | undefined) =>
  id?.startsWith(LINTEL_PREFIX) ? id.slice(LINTEL_PREFIX.length) : null;

/** Whether the plan has generated lintels: a structure has been generated and lintels are on. */
export const hasLintels = (doc: Pick<PlanDoc, 'frame'>) => !!doc.frame?.madeFrom && makes(frameRules(doc), 'lintels');

/** Every lintel on the plan (none until a structure has been generated). */
export function lintelsOf(doc: PlanDoc, wallHeightMm: number): Lintel[] {
  if (!hasLintels(doc)) return [];
  const rules = frameRules(doc);
  const banded = lintelBand(rules);
  const walls = new Map<Id, Wall>();
  for (const el of doc.elements) if (el.type === 'wall') walls.set(el.id, el);
  const byWall = new Map<Id, Opening[]>();
  for (const el of doc.elements) {
    if ((el.type !== 'door' && el.type !== 'window') || el.flat || el.gate || el.lintel?.off) continue;
    const w = walls.get(el.wallId);
    if (!w || !isBuildingWall(w) || isCurtain(w)) continue;
    byWall.set(w.id, [...(byWall.get(w.id) ?? []), el]);
  }
  const levels = new Set(buildingLevels(doc).map((l) => l.id));
  const out: Omit<Lintel, 'mark'>[] = [];
  for (const [wallId, openings] of byWall) {
    const w = walls.get(wallId)!;
    const level = levelOf(w);
    if (!levels.has(level) || banded) continue;
    const top = w.heightMm ?? levelWallMm(doc, level, wallHeightMm);
    const len = runLength(w) * MM_PER_UNIT;
    const pieces = openings
      .map((o) => {
        const at = paramAlong(w, o) * len;
        const bearing = o.lintel?.bearingMm ?? rules.bearingMm;
        const depth = o.lintel?.depthMm ?? lintelDepth(o.width * MM_PER_UNIT);
        return {
          ids: [o.id],
          s0: Math.max(0, at - (o.width * MM_PER_UNIT) / 2 - bearing),
          s1: Math.min(len, at + (o.width * MM_PER_UNIT) / 2 + bearing),
          head: openingHeadMm(o, top),
          depth,
          own: !!o.lintel?.depthMm,
        };
      })
      .sort((a, b) => a.s0 - b.s0);
    // Two lintels less than 9" apart become one.
    const joined: typeof pieces = [];
    for (const p of pieces) {
      const last = joined[joined.length - 1];
      if (last && p.s0 - last.s1 < 9 * IN) {
        last.ids.push(...p.ids);
        last.s1 = Math.max(last.s1, p.s1);
        last.head = Math.max(last.head, p.head);
        last.depth = Math.max(last.depth, p.depth, last.own ? 0 : lintelDepth(last.s1 - last.s0 - 2 * rules.bearingMm));
      } else joined.push({ ...p, ids: [...p.ids] });
    }
    for (const p of joined) {
      // Where the floor beam comes down to the head, the beam is the lintel.
      if (!makes(rules, 'beams') || p.head + p.depth <= top - 12 * IN)
        out.push({
          id: `${LINTEL_PREFIX}${p.ids[0]}`,
          openingIds: p.ids,
          wallId,
          levelId: level,
          a: pointAlong(w, p.s0 / len),
          b: pointAlong(w, p.s1 / len),
          width: thicknessOf(w),
          lengthMm: p.s1 - p.s0,
          depthMm: p.depth,
          bottomMm: p.head,
          curved: !!arcOf(w),
        });
    }
  }
  // Marks by size: L1, L2 ... shortest first.
  const sizes = [...new Set(out.map((l) => `${up3(l.lengthMm)}x${Math.round(l.depthMm)}x${Math.round(l.width)}`))].sort(
    (a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b),
  );
  return out.map((l) => ({
    ...l,
    mark: `L${sizes.indexOf(`${up3(l.lengthMm)}x${Math.round(l.depthMm)}x${Math.round(l.width)}`) + 1}`,
  }));
}
