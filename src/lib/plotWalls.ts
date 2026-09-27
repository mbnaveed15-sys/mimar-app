/**
 * A plot's boundary walls, linked to its sides: built from the sides, moved when the plot is
 * reshaped (their doors and gates slide along with them), and kept linked through copies. Pure.
 *
 * A link goes both ways: the side keeps the wall's id (`PlotSide.wallId`, `Plot.splay.wallId`) and
 * the wall keeps the plot's (`Wall.plotId`, `Wall.plotSide`). It only counts when both agree.
 */
import { reattachOpening } from '../geometry';
import { plotSides, sideWallLines, type SideWallLine } from './plot';
import { MM_PER_UNIT } from './scale';
import type { Id, Opening, PlanDoc, PlanElement, Plot, Wall } from '../types';

type SideKey = number | 'splay';

/** The wall id a side (or the cut corner) links to. */
function linkOf(plot: Plot, key: SideKey): Id | undefined {
  return key === 'splay' ? plot.splay?.wallId : plot.sideList?.[key]?.wallId;
}

/** Every link the plot has. */
function linksOf(plot: Plot): { key: SideKey; id: Id }[] {
  const out: { key: SideKey; id: Id }[] = [];
  plot.sideList?.forEach((s, i) => s.wallId && out.push({ key: i, id: s.wallId }));
  if (plot.splay?.wallId) out.push({ key: 'splay', id: plot.splay.wallId });
  return out;
}

/** The plot with a side's link set (or, with no id, dropped along with that side's wall). */
function withLink(plot: Plot, key: SideKey, id: Id | undefined): Plot {
  if (key === 'splay') {
    if (!plot.splay) return plot;
    const splay = { ...plot.splay };
    delete splay.wallId;
    return { ...plot, splay: id ? { ...splay, wallId: id } : splay };
  }
  const list = [...plotSides(plot)];
  const side = { ...list[key] };
  delete side.wallId;
  if (!id) delete side.wall;
  list[key] = id ? { ...side, wallId: id } : side;
  return { ...plot, sideList: list };
}

const isLinked = (wall: PlanElement | undefined, plot: Plot): wall is Wall =>
  wall?.type === 'wall' && wall.plotId === plot.id;

/** A wall along a line, as the side's wall spec gives it. */
function wallFor(line: SideWallLine, plot: Plot, wall: Partial<Wall> & { id: Id }): Wall {
  return {
    ...wall,
    type: 'wall',
    x1: line.a.x,
    y1: line.a.y,
    x2: line.b.x,
    y2: line.b.y,
    thickness: line.thickness,
    kind: 'boundary',
    heightMm: line.heightMm,
    plotId: plot.id,
    plotSide: line.side,
    ...(plot.levelId ? { levelId: plot.levelId } : {}),
  };
}

/** Put each linked wall where the plot's sides put it now; doors and gates on it slide with it. */
export function placePlotWalls(doc: PlanDoc, plot: Plot): PlanDoc {
  const lines = sideWallLines(plot);
  const byKey = new Map(lines.map((l) => [l.side, l]));
  const moved = new Map<Id, { from: Wall; to: Wall }>();
  const byId = new Map(doc.elements.map((el) => [el.id, el]));
  for (const { key, id } of linksOf(plot)) {
    const line = byKey.get(key);
    const old = byId.get(id);
    if (!line || !isLinked(old, plot)) continue;
    const next = wallFor(line, plot, old);
    const same =
      old.x1 === next.x1 &&
      old.y1 === next.y1 &&
      old.x2 === next.x2 &&
      old.y2 === next.y2 &&
      old.thickness === next.thickness &&
      old.heightMm === next.heightMm &&
      old.kind === 'boundary' &&
      old.plotSide === key &&
      old.levelId === next.levelId;
    if (!same) moved.set(id, { from: old, to: next });
  }
  if (!moved.size) return doc;
  return {
    ...doc,
    elements: doc.elements.map((el) => {
      const m = moved.get(el.id);
      if (m) return m.to;
      if ((el.type === 'door' || el.type === 'window') && moved.has(el.wallId)) {
        const { from, to } = moved.get(el.wallId)!;
        return reattachOpening(el, from, to);
      }
      return el;
    }),
  };
}

/**
 * Make a plot's walls match its sides: build a wall for each side (and cut corner) that should have
 * one and has none, take away the walls (with their doors and gates) of sides that no longer have
 * one, and put them all in place.
 */
export function buildPlotWalls(doc: PlanDoc, plotId: Id, newId: () => Id): PlanDoc {
  let plot = doc.elements.find((el): el is Plot => el.type === 'plot' && el.id === plotId);
  if (!plot) return doc;
  const byId = new Map(doc.elements.map((el) => [el.id, el]));
  const lines = sideWallLines(plot);
  const wanted = new Set<SideKey>(lines.map((l) => l.side));
  const added: Wall[] = [];
  for (const line of lines) {
    const id = linkOf(plot, line.side);
    if (id && isLinked(byId.get(id), plot)) continue;
    const wall = wallFor(line, plot, { id: newId() });
    added.push(wall);
    plot = withLink(plot, line.side, wall.id);
  }
  // Walls that stand on this plot but that no side wants any more.
  const kept = new Set(linksOf(plot).map((l) => l.id));
  const gone = new Set<Id>();
  for (const el of doc.elements)
    if (el.type === 'wall' && el.plotId === plot.id) {
      const key = el.plotSide ?? -1;
      if (!kept.has(el.id) || !wanted.has(key === -1 ? 'splay' : key)) gone.add(el.id);
    }
  for (const { key, id } of linksOf(plot)) if (gone.has(id)) plot = withLink(plot, key, undefined);
  // A side the user took the wall off keeps no link.
  plot.sideList?.forEach((s, i) => {
    if (!s.wall && s.wallId) {
      gone.add(s.wallId);
      plot = withLink(plot!, i, undefined);
    }
  });
  const final = plot;
  const elements = doc.elements
    .filter((el) => !gone.has(el.id) && !((el.type === 'door' || el.type === 'window') && gone.has(el.wallId)))
    .map((el) => (el.id === final.id ? final : el));
  return placePlotWalls({ ...doc, elements: [...elements, ...added] }, final);
}

/**
 * After any change: keep every plot's boundary walls with it. A plot that changed (reshaped, moved,
 * turned, its sides edited) puts its walls in place; a linked wall that was deleted is no longer
 * wanted on its side; a wall's own height or thickness changed in its panel goes back to its side;
 * a copied plot takes over the walls copied with it; and walls whose plot is gone become ordinary.
 */
export function syncPlotWalls(prev: PlanDoc, next: PlanDoc): PlanDoc {
  if (prev.elements === next.elements) return next;
  const plots = next.elements.filter(
    (el): el is Plot => el.type === 'plot' && (!!el.sideList?.some((s) => s.wallId) || !!el.splay?.wallId),
  );
  const tagged = next.elements.some((el) => el.type === 'wall' && el.plotId !== undefined);
  if (!plots.length && !tagged) return next;

  const prevById = new Map(prev.elements.map((el) => [el.id, el]));
  let doc = next;
  let byId = new Map(doc.elements.map((el) => [el.id, el]));
  const claimed = new Set<Id>();
  const update = (el: PlanElement) => {
    doc = { ...doc, elements: doc.elements.map((e) => (e.id === el.id ? el : e)) };
    byId.set(el.id, el);
  };

  for (const original of plots) {
    let plot = original;
    let relinked = false;
    for (const { key, id } of linksOf(plot)) {
      const wall = byId.get(id);
      if (wall?.type === 'wall' && wall.plotId === plot.id) {
        claimed.add(id);
        continue;
      }
      // A copied plot still names the walls it was copied from: take over the copies of them.
      const source = wall?.type === 'wall' ? wall.plotId : undefined;
      const want = sideWallLines(plot).find((l) => l.side === key);
      let found: Wall | null = null;
      if (source && want) {
        const mid = { x: (want.a.x + want.b.x) / 2, y: (want.a.y + want.b.y) / 2 };
        let best = Infinity;
        for (const el of doc.elements) {
          if (el.type !== 'wall' || el.plotId !== source || prevById.has(el.id) || claimed.has(el.id)) continue;
          const d = Math.hypot((el.x1 + el.x2) / 2 - mid.x, (el.y1 + el.y2) / 2 - mid.y);
          if (d < best && d < Math.max(want.thickness * 4, 1)) [best, found] = [d, el];
        }
      }
      if (found) {
        claimed.add(found.id);
        update({ ...found, plotId: plot.id, plotSide: key });
        plot = withLink(plot, key, found.id);
      } else {
        // Its wall was deleted: the side no longer has one.
        plot = withLink(plot, key, undefined);
      }
      relinked = true;
    }
    if (relinked) update(plot);

    const before = prevById.get(plot.id);
    if (before !== original || relinked) {
      doc = placePlotWalls(doc, plot);
      byId = new Map(doc.elements.map((el) => [el.id, el]));
      continue;
    }
    // The plot didn't change: a linked wall's own height or thickness, changed in its panel, goes to its side.
    let sides = plot.sideList;
    plot.sideList?.forEach((s, i) => {
      if (!s.wallId || !s.wall) return;
      const wall = byId.get(s.wallId);
      if (!isLinked(wall, plot) || wall === prevById.get(wall.id)) return;
      const thicknessMm = wall.thickness !== undefined ? wall.thickness * MM_PER_UNIT : s.wall.thicknessMm;
      const heightMm = wall.heightMm ?? s.wall.heightMm;
      if (Math.abs(thicknessMm - s.wall.thicknessMm) < 1e-6 && Math.abs(heightMm - s.wall.heightMm) < 1e-6) return;
      sides = sides!.map((x, j) => (j === i ? { ...x, wall: { heightMm, thicknessMm } } : x));
    });
    if (sides !== plot.sideList) {
      plot = { ...plot, sideList: sides };
      update(plot);
      doc = placePlotWalls(doc, plot);
      byId = new Map(doc.elements.map((el) => [el.id, el]));
    }
  }

  // Walls that name a plot that doesn't link back to them (their plot was deleted, or they were
  // copied on their own) become ordinary boundary walls.
  const linked = new Set<Id>();
  for (const el of doc.elements) if (el.type === 'plot') for (const { id } of linksOf(el)) linked.add(id);
  if (doc.elements.some((el) => el.type === 'wall' && el.plotId !== undefined && !linked.has(el.id)))
    doc = {
      ...doc,
      elements: doc.elements.map((el) => {
        if (el.type !== 'wall' || el.plotId === undefined || linked.has(el.id)) return el;
        const plain = { ...el };
        delete plain.plotId;
        delete plain.plotSide;
        return plain;
      }),
    };
  return doc;
}

/** Doors and windows on a wall. */
export const openingsOn = (doc: PlanDoc, wallId: Id) =>
  doc.elements.filter((el): el is Opening => (el.type === 'door' || el.type === 'window') && el.wallId === wallId);

/**
 * For each side of a plot, the boundary walls not linked to any plot that run along it: parallel to
 * the side, just inside it (within a wall and a half of it), and mostly beside it.
 */
export function boundaryWallsAlong(plot: Plot, elements: PlanElement[]): Wall[][] {
  const pts = plot.points;
  const n = pts.length;
  const walls = elements.filter((el): el is Wall => el.type === 'wall' && el.kind === 'boundary' && !el.plotId);
  const taken = new Set<Id>();
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    return walls.filter((w) => {
      if (taken.has(w.id)) return false;
      const reach = (w.thickness ?? 22.86) * 1.5;
      const off = (p: { x: number; y: number }) => Math.abs((p.x - a.x) * u.y - (p.y - a.y) * u.x);
      const along = (p: { x: number; y: number }) => (p.x - a.x) * u.x + (p.y - a.y) * u.y;
      const p1 = { x: w.x1, y: w.y1 };
      const p2 = { x: w.x2, y: w.y2 };
      if (off(p1) > reach || off(p2) > reach) return false;
      const lo = Math.max(0, Math.min(along(p1), along(p2)));
      const hi = Math.min(len, Math.max(along(p1), along(p2)));
      const wl = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
      if (hi - lo < wl / 2) return false;
      taken.add(w.id);
      return true;
    });
  });
}
