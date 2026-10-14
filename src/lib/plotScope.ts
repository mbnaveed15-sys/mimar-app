/**
 * Several plots in one plan: the plan check looks at one at a time, the plot being worked on, with
 * only what stands on it. Pure.
 */
import { elementOutline, pointInPolygon } from '../geometry';
import { plotRule } from './bylaws';
import { outlinePoints } from './plot';
import { linksOf } from './plotWalls';
import type { Id, PlanDoc, Plot, Point } from '../types';

/** The plots that are shown. */
export const plotsOf = (doc: PlanDoc): Plot[] =>
  doc.elements.filter((el): el is Plot => el.type === 'plot' && !el.hidden);

const middle = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});

/** The plot under a point, if any (the smallest, where plots overlap). */
export function plotAt(doc: PlanDoc, p: Point): Plot | null {
  let best: { plot: Plot; size: number } | null = null;
  for (const plot of plotsOf(doc)) {
    const outline = outlinePoints(plot);
    if (!pointInPolygon(p, outline)) continue;
    const xs = outline.map((q) => q.x);
    const ys = outline.map((q) => q.y);
    const size = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (!best || size < best.size) best = { plot, size };
  }
  return best?.plot ?? null;
}

/** The plot items `ids` are on: a plot picked itself, or the plot under the first item that has one. */
export function plotOfItems(doc: PlanDoc, ids: Id[]): Id | null {
  for (const id of ids) {
    const el = doc.elements.find((e) => e.id === id);
    if (el?.type === 'plot') return el.id;
    const points = el ? elementOutline(el) : (doc.rooms.find((r) => r.id === id)?.points ?? []);
    const plot = points.length ? plotAt(doc, middle(points)) : null;
    if (plot) return plot.id;
  }
  return null;
}

/** The plot checked: `plotId` when it is there, else the first with bylaws, else the first. */
export function checkedPlot(doc: PlanDoc, plotId?: Id | null): Plot | null {
  const plots = plotsOf(doc);
  return plots.find((p) => p.id === plotId) ?? plots.find((p) => !!plotRule(p)) ?? plots[0] ?? null;
}

/**
 * With more than one plot, the plan with only the checked plot and what stands on it (by the middle of
 * each item, and each plot's own boundary walls); with one plot or none, the plan as it is.
 */
export function onPlot(doc: PlanDoc, plotId?: Id | null): PlanDoc {
  const plots = plotsOf(doc);
  const plot = checkedPlot(doc, plotId);
  if (plots.length < 2 || !plot) return doc;
  const outline = outlinePoints(plot);
  const own = new Set(linksOf(plot).map((l) => l.id));
  const others = new Set(plots.filter((p) => p !== plot).flatMap((p) => linksOf(p).map((l) => l.id)));
  const onIt = (points: Point[]) => !points.length || pointInPolygon(middle(points), outline);
  return {
    ...doc,
    elements: doc.elements.filter((el) => {
      if (el.type === 'plot') return el === plot;
      if (own.has(el.id)) return true;
      if (others.has(el.id)) return false;
      return onIt(elementOutline(el));
    }),
    rooms: doc.rooms.filter((r) => onIt(r.points)),
  };
}
