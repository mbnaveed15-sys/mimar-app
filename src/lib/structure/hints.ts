/**
 * Structure checks for the Checks panel: the structure out of date, spans too long, slabs too thin,
 * floating columns, columns in doorways, rooms or stairs, and off-centre footings. Pure.
 */
import { centroid, elementOutline, pointInPolygon } from '../../geometry';
import { paramAlong, projectOnWall, runLength } from '../arc';
import { buildingLevels, slabMm } from '../levels';
import { MM_PER_UNIT } from '../scale';
import { formatLength } from '../units';
import { isBuildingWall, thicknessOf } from '../../walls';
import { levelOf, type Column, type PlanDoc, type Units, type Wall } from '../../types';
import type { Hint } from '../planHints';
import { frameCount, frameFingerprint, roomFrame, UNROOFED } from './generate';
import { frameRules, slabNeedMm } from './settings';

const mm = (units: number) => units * MM_PER_UNIT;

export function structureHints(doc: PlanDoc, units: Units): Hint[] {
  if (!doc.frame?.madeFrom) return [];
  const hints: Hint[] = [];
  const len = (v: number) => formatLength(v, units);
  const rules = frameRules(doc);
  const levels = buildingLevels(doc);
  const name = (id: string) => {
    const i = levels.findIndex((l) => l.id === id);
    return i > 0 || levels.length > 1 ? `${levels[i]?.name ?? ''}: ` : '';
  };
  if (frameCount(doc) && frameFingerprint(doc) !== doc.frame.madeFrom)
    hints.push({
      id: 'frame-stale',
      kind: 'structure',
      text: 'Structure is out of date: walls, openings or floors have changed since it was generated. Regenerate it in Structure.',
      ids: [],
    });
  const els = doc.elements.filter((el) => !el.hidden);
  const walls = els.filter((el): el is Wall => el.type === 'wall' && isBuildingWall(el));
  const columns = els.filter((el): el is Column => el.type === 'column');
  // Beams spanning further than the column spacing allows.
  for (const b of els) {
    if (b.type !== 'beam' || b.kind === 'band' || b.kind === 'plinth' || b.kind === 'tie') continue;
    const span = mm(Math.hypot(b.x2 - b.x1, b.y2 - b.y1));
    const limit = b.kind === 'secondary' ? rules.maxSpanMm * 1.6 : rules.maxSpanMm + 300;
    if (span > limit)
      hints.push({
        id: `frame-span-${b.id}`,
        kind: 'structure',
        text: `${name(levelOf(b))}Beam ${b.mark ?? ''} spans ${len(span)}, more than ${len(limit)}: add a column or check its depth.`,
        ids: [b.id],
      });
  }
  // Slabs too thin for the rooms under them (with any secondary beams splitting them).
  const slab = slabMm(doc);
  for (const r of doc.rooms) {
    if (r.openAbove || UNROOFED.test(r.name)) continue;
    const f = roomFrame(r.points);
    const short = Math.min(f.along, f.across);
    const long = Math.max(f.along, f.across);
    const n = Math.max(1, Math.ceil(mm(short) / rules.slabSpanMm - 1e-6));
    const need = slabNeedMm(mm(short) / n, mm(long));
    if (need > slab + 1)
      hints.push({
        id: `frame-slab-${r.id}`,
        kind: 'structure',
        text: `${name(levelOf(r))}${r.name} needs a slab about ${len(need)} thick; the floors are ${len(slab)} (Project › Slab).`,
        ids: [r.id],
      });
  }
  for (const c of columns) {
    const level = levelOf(c);
    const i = levels.findIndex((l) => l.id === level);
    // A column with none under it (it needs a beam strong enough to carry it).
    if (i > 0) {
      const below = levels[i - 1].id;
      if (!columns.some((d) => levelOf(d) === below && Math.hypot(d.x - c.x, d.y - c.y) < 30))
        hints.push({
          id: `frame-float-${c.id}`,
          kind: 'structure',
          text: `${name(level)}Column ${c.mark ?? ''} has no column under it (a floating column): add one below or check the beam carrying it.`,
          ids: [c.id],
        });
    }
    const own = walls.filter((w) => levelOf(w) === level);
    const host = own.find((w) => projectOnWall(w, c).dist < thicknessOf(w) / 2 + 2);
    if (host) {
      const at = paramAlong(host, c) * runLength(host);
      const hit = els.find(
        (o) =>
          (o.type === 'door' || o.type === 'window') &&
          o.wallId === host.id &&
          !o.flat &&
          Math.abs(paramAlong(host, o) * runLength(host) - at) < o.width / 2 + Math.max(c.w, c.h) / 2 - 1,
      );
      if (hit)
        hints.push({
          id: `frame-door-${c.id}`,
          kind: 'structure',
          text: `${name(level)}Column ${c.mark ?? ''} stands in a ${hit.type === 'door' ? 'doorway' : 'window'}: move it to the solid wall beside it.`,
          ids: [c.id, hit.id],
        });
    } else {
      const room = doc.rooms.find((r) => levelOf(r) === level && pointInPolygon(c, r.points));
      if (room && !/porch|veranda|garage|drive/i.test(room.name))
        hints.push({
          id: `frame-room-${c.id}`,
          kind: 'structure',
          text: `${name(level)}Column ${c.mark ?? ''} stands in the middle of ${room.name}, not in a wall.`,
          ids: [c.id, room.id],
        });
    }
    const stair = els.find((s) => s.type === 'stair' && levelOf(s) === level && pointInPolygon(c, elementOutline(s)));
    if (stair)
      hints.push({
        id: `frame-stair-${c.id}`,
        kind: 'structure',
        text: `${name(level)}Column ${c.mark ?? ''} stands in a stair.`,
        ids: [c.id, stair.id],
      });
  }
  // Footings moved in from the plot line: off-centre under their column.
  for (const f of els) {
    if (f.type !== 'slab' || f.footing !== 'pad') continue;
    const c = centroid(f.points);
    const col = columns.find((k) => levelOf(k) === levelOf(f) && pointInPolygon(k, f.points));
    if (col && mm(Math.hypot(col.x - c.x, col.y - c.y)) > 150)
      hints.push({
        id: `frame-ecc-${f.id}`,
        kind: 'structure',
        text: `Footing ${f.mark ?? ''} at the plot line is off-centre under its column (eccentric): it needs a strap beam to an inner footing.`,
        ids: [f.id, col.id],
      });
  }
  return hints;
}
