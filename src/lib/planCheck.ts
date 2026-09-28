/**
 * The plan check: the plan measured against the plot's bylaws, as rows of ✓ / ✗ / "check". Pure:
 * plan in, rows out. It is indicative only; the authority's own check is what counts.
 */
import { elementOutline, pointInPolygon, pointToSegmentDistance } from '../geometry';
import { plotRule, plotSetbacks, roomRuleFor, type Authority, type PlotRule } from './bylaws';
import { MM_PER_UNIT } from './scale';
import { isCornerPlot, outlinePoints, plotSides, sideSetbacks, SIDE_KIND_NAMES } from './plot';
import { buildableArea } from './site';
import { basementOf, groundIndex, levelWallMm, slabMm } from './levels';
import { outsideOutline } from './outline';
import { shows } from './project';
import { formatLength, MM_PER_FOOT } from './units';
import { boxOf, cellFor, GridIndex } from './spatial';
import { labelPoint, polygonArea, roomAreaSqMm, wallFaces } from '../rooms';
import { levelBaseM } from '../three/model';
import {
  BASEMENT_HEIGHT_MM,
  GROUND_LEVEL,
  levelOf,
  type Id,
  type PlanDoc,
  type PlanElement,
  type Plot,
  type Point,
  type Room,
  type Units,
  type Wall,
} from '../types';
import { isBuildingWall, thicknessOf } from '../walls';

export type CheckStatus = 'ok' | 'fail' | 'check';

export interface CheckRow {
  id: string;
  label: string;
  /** What the bylaws ask for, and what the plan has. */
  required: string;
  actual: string;
  status: CheckStatus;
  clause: string;
  /** Items to select to see the problem. */
  ids?: Id[];
  /** A detail of the row above it (each side's setback under Setbacks): shown, not counted. */
  detail?: boolean;
}

export interface PlanCheck {
  authority: Authority;
  rule: PlotRule | null;
  plot: Plot;
  rows: CheckRow[];
}

const SQ_MM_PER_SQ_FT = 92903.04;
const TOLERANCE = 1; // plan units (10 mm)
const BUILT_KINDS = (w: Wall) => isBuildingWall(w) || w.kind === 'retaining';

/** A wall's four corners, thickness included. */
function wallCorners(w: Wall): Point[] {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const h = thicknessOf(w) / 2;
  const n = { x: (-(w.y2 - w.y1) / len) * h, y: ((w.x2 - w.x1) / len) * h };
  return [
    { x: w.x1 + n.x, y: w.y1 + n.y },
    { x: w.x2 + n.x, y: w.y2 + n.y },
    { x: w.x2 - n.x, y: w.y2 - n.y },
    { x: w.x1 - n.x, y: w.y1 - n.y },
  ];
}

function inside(p: Point, poly: Point[]): boolean {
  if (pointInPolygon(p, poly)) return true;
  return poly.some((a, i) => pointToSegmentDistance(p, a, poly[(i + 1) % poly.length]) <= TOLERANCE);
}

/** Rooms open to the sky, which don't count as covered area. */
export const OPEN_AIR = /lawn|garden|court|yard|drive|patio|terrace/i;

/**
 * The covered area of a floor (sq ft), to the outer faces of its walls: the areas its walls enclose
 * (to their centre lines), plus the outer half of outside walls, plus rooms drawn without walls
 * round them. Areas and rooms open to the sky (lawns, courtyards, driveways) are left out.
 */
export function builtAreaSqFt(doc: PlanDoc, levelId: string): number {
  const walls = doc.elements.filter(
    (el): el is Wall => el.type === 'wall' && BUILT_KINDS(el) && !el.hidden && levelOf(el) === levelId,
  );
  const rooms = doc.rooms.filter((r) => !r.hidden && levelOf(r) === levelId);
  const bySize = [...rooms].sort((a, b) => polygonArea(a.points) - polygonArea(b.points));
  const roomIndex = new GridIndex<Room>(cellFor(bySize.map((r) => boxOf(r.points))));
  for (const r of bySize) roomIndex.add(r, boxOf(r.points));
  const roomAt = (p: Point) => roomIndex.at(p).find((r) => pointInPolygon(p, r.points)) ?? null;
  const covered = wallFaces(walls).filter((f) => !OPEN_AIR.test(roomAt(labelPoint(f))?.name ?? ''));
  const faceIndex = new GridIndex<Point[]>(cellFor(covered.map(boxOf)));
  for (const f of covered) faceIndex.add(f, boxOf(f));
  const inCovered = (p: Point) => faceIndex.at(p).some((f) => pointInPolygon(p, f));
  let units2 = covered.reduce((sum, f) => sum + polygonArea(f), 0);
  // Walls: the half outside the enclosed areas counts too (both halves of a free-standing wall),
  // piece by piece, as a long wall can run past several areas.
  for (const w of walls) {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (!L) continue;
    const d = thicknessOf(w) / 2 + 1;
    const n = { x: (-(w.y2 - w.y1) / L) * d, y: ((w.x2 - w.x1) / L) * d };
    const steps = Math.min(64, Math.max(1, Math.ceil(L / 30)));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const mid = { x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t };
      const open = [
        { x: mid.x + n.x, y: mid.y + n.y },
        { x: mid.x - n.x, y: mid.y - n.y },
      ].filter((p) => !inCovered(p)).length;
      units2 += ((L / steps) * thicknessOf(w) * open) / 2;
    }
  }
  // Rooms not enclosed by walls (a porch drawn on its own, say).
  for (const r of rooms)
    if (!OPEN_AIR.test(r.name) && !inCovered(labelPoint(r.points))) units2 += polygonArea(r.points);
  return (units2 * MM_PER_UNIT * MM_PER_UNIT) / SQ_MM_PER_SQ_FT;
}

/** Rooms named as a mumty (stair tower), and floor names that mean the roof. */
const MUMTY_ROOM = /mumty|mumtee|stair ?tower/i;
const MUMTY_LEVEL = /mumty|mumtee|stair ?tower|roof/i;
/** Rooms that are car porches (or garages). */
export const PORCH_ROOM = /porch|garage/i;

/** Floors above the ground that hold only the mumty: named so, or with a room named so. */
export function mumtyLevelIds(doc: PlanDoc): Set<string> {
  return new Set(
    doc.levels
      .slice(groundIndex(doc) + 1)
      .filter((l) => MUMTY_LEVEL.test(l.name) || doc.rooms.some((r) => levelOf(r) === l.id && MUMTY_ROOM.test(r.name)))
      .map((l) => l.id),
  );
}

/** A box's two sides (plan units): the shorter first. */
function boxSides(pts: Point[]): [number, number] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w < h ? [w, h] : [h, w];
}

const pct = (v: number) => `${Math.round(v)}%`;
const sqft = (v: number) => `${Math.round(v).toLocaleString('en-US')} sq ft`;

/**
 * Check the plan against the first plot that has bylaws, or null when no plot has any.
 * `wallHeightMm` is the usual wall height (for floors and the total height).
 */
export function planCheck(doc: PlanDoc, ctx: { wallHeightMm: number; units: Units }): PlanCheck | null {
  // A project that doesn't use bylaws (a free project, unless switched on) has no check.
  if (!shows(doc, 'bylaws')) return null;
  const plot = doc.elements.find((el): el is Plot => el.type === 'plot' && !!plotRule(el));
  const found = plot && plotRule(plot);
  if (!plot || !found) return null;
  const { authority, rule } = found;
  const len = (mm: number) => formatLength(mm, ctx.units);
  const rows: CheckRow[] = [];
  const clause = (c: string) => (c === 'summary' ? 'Summary (provisional)' : c);

  if (rule) {
    // Setbacks: the plan's own, if they are the bylaws' either way round; otherwise the bylaws'.
    const fromRule = plotSetbacks(rule);
    const swapped = plotSetbacks(rule, true);
    const matches = (a: Plot['setbacks']) =>
      Math.abs(a.sides - plot.setbacks.sides) < 1 &&
      Math.abs((a.side2 ?? 0) - (plot.setbacks.side2 ?? plot.setbacks.sides)) < 1;
    const setbacks = matches(swapped) && !matches(fromRule) ? swapped : fromRule;
    // The bylaws' setbacks on every side, whatever was typed for a side.
    const ruled: Plot = {
      ...plot,
      setbacks,
      sideList: plotSides(plot).map((side) => {
        const copy = { ...side };
        delete copy.setbackMm;
        return copy;
      }),
    };
    const line = buildableArea(ruled);
    const outside = (pts: Point[]) => pts.some((p) => !inside(p, line));
    const hard: Id[] = [];
    const soft: Id[] = [];
    for (const el of doc.elements) {
      if (el.hidden) continue;
      const pts = itemOutline(el);
      if (!pts || !outside(pts)) continue;
      if (el.type === 'wall' || (el.type === 'block' && el.heightMm > 0)) hard.push(el.id);
      else soft.push(el.id);
    }
    const { front, rear, side1, side2 } = rule.setbacks;
    rows.push({
      id: 'setbacks',
      label: 'Setbacks',
      required: `Front ${len(front)}, rear ${len(rear)}, sides ${side1 ? len(side1) : '–'} / ${side2 ? len(side2) : '–'}`,
      actual: hard.length
        ? `${hard.length} ${hard.length === 1 ? 'item crosses' : 'items cross'} the building line`
        : 'Inside the building line',
      status: hard.length ? 'fail' : 'ok',
      clause: clause(authority.setbackClause),
      ids: hard,
    });
    rows.push(...sideRows(doc, ruled, len, clause(authority.setbackClause)));
    if (soft.length)
      rows.push({
        id: 'setback-items',
        label: 'Items in the setbacks',
        required: 'Only porches, open stairs, projections and the like',
        actual: `${soft.length} ${soft.length === 1 ? 'item' : 'items'} (columns, slabs, stairs…)`,
        status: 'check',
        clause: clause(authority.setbackClause),
        ids: soft,
      });

    // Projections (chajjas, ledges) that reach into the setbacks.
    if (authority.projection) {
      const max = authority.projection.maxMm;
      const deep = doc.elements.filter((el) => el.type === 'window' && el.flat && (el.depthMm ?? 0) > max);
      if (doc.elements.some((el) => el.type === 'window' && el.flat && (el.depthMm ?? 0) > 0))
        rows.push({
          id: 'projections',
          label: 'Projections (chajjas, ledges)',
          required: `At most ${len(max)} into a setback`,
          actual: deep.length ? `${deep.length} deeper than that` : 'Within the limit',
          status: deep.length ? 'fail' : 'ok',
          clause: authority.projection.clause,
          ids: deep.map((el) => el.id),
        });
    }

    if (isCornerPlot(plot))
      rows.push({
        id: 'corner-plot',
        label: 'Corner plot',
        required: 'Both roads kept clear. The second road uses the side setback until corner-plot figures are added',
        actual: plot.splay ? `Corner cut ${len(plot.splay.sizeMm)}` : 'Corner not cut',
        status: 'check',
        clause: clause(authority.setbackClause),
      });

    const plotSqFt = plotAreaSqFt(plot);
    const ground = GROUND_LEVEL;
    const groundSqFt = builtAreaSqFt(doc, ground);
    if (rule.coveragePct !== undefined && groundSqFt > 0) {
      const cover = (groundSqFt / plotSqFt) * 100;
      rows.push({
        id: 'coverage',
        label: 'Ground floor coverage',
        required: `At most ${pct(rule.coveragePct)} of the plot (with the porch)`,
        actual: `About ${pct(cover)} (${sqft(groundSqFt)})`,
        status: cover <= rule.coveragePct + 0.5 ? 'ok' : 'fail',
        clause: clause(authority.setbackClause),
      });
    }
    const first = doc.levels.slice(groundIndex(doc) + 1).find((l) => !mumtyLevelIds(doc).has(l.id))?.id;
    const firstSqFt = first ? builtAreaSqFt(doc, first) : 0;
    if (rule.firstFloorPct !== undefined && firstSqFt > 0 && groundSqFt > 0) {
      const share = (firstSqFt / groundSqFt) * 100;
      rows.push({
        id: 'first-floor',
        label: 'First floor',
        required: `At most ${pct(rule.firstFloorPct)} of the ground floor`,
        actual: `About ${pct(share)} (${sqft(firstSqFt)})`,
        status: share <= rule.firstFloorPct + 0.5 ? 'ok' : 'fail',
        clause: clause(authority.setbackClause),
      });
    }
    if (rule.plinthMm !== undefined)
      rows.push({
        id: 'plinth',
        label: 'Plinth',
        required: `At most ${len(rule.plinthMm)}`,
        actual: len(doc.plinthMm),
        status: doc.plinthMm <= rule.plinthMm + 1 ? 'ok' : 'fail',
        clause: clause(authority.plinth?.clause ?? authority.setbackClause),
      });
  }

  // Storeys and height: floors that have ordinary walls, and the top of everything built.
  const built = doc.elements.filter((el) => !el.hidden && el.type !== 'plot' && el.type !== 'line');
  const mumtys = mumtyLevelIds(doc);
  // A basement isn't a storey.
  const storeyLevels = doc.levels.filter(
    (l) =>
      !l.basement &&
      !mumtys.has(l.id) &&
      built.some((el) => el.type === 'wall' && BUILT_KINDS(el) && levelOf(el) === l.id),
  );
  if (authority.storeys && storeyLevels.length)
    rows.push({
      id: 'storeys',
      label: 'Storeys',
      required: `At most ${authority.storeys.max}`,
      actual: String(storeyLevels.length),
      status: storeyLevels.length <= authority.storeys.max ? 'ok' : 'fail',
      clause: clause(authority.storeys.clause),
    });
  // A basement: where it may go (under the house, or inside the building line) and its clear height.
  const basement = basementOf(doc);
  const basementWalls = basement
    ? doc.elements.filter((el): el is Wall => el.type === 'wall' && !el.hidden && levelOf(el) === basement.id)
    : [];
  if (basement && basementWalls.length) {
    const br = authority.basement;
    if (!br)
      rows.push({
        id: 'basement',
        label: 'Basement',
        required: 'Not in Mimar’s tables for this authority yet',
        actual: 'Drawn',
        status: 'check',
        clause: clause(authority.setbackClause),
      });
    else {
      const groundWalls = doc.elements.filter(
        (el): el is Wall => el.type === 'wall' && !el.hidden && isBuildingWall(el) && levelOf(el) === GROUND_LEVEL,
      );
      const area =
        br.extent === 'house'
          ? outsideOutline(groundWalls)
          : buildableArea(rule ? { ...plot, setbacks: plotSetbacks(rule) } : plot);
      const out = area ? basementWalls.filter((w) => wallCorners(w).some((p) => !inside(p, area))) : [];
      rows.push({
        id: 'basement-extent',
        label: 'Basement extent',
        required: br.extent === 'house' ? 'Under the ground floor only' : 'Inside the building line',
        actual: !area
          ? 'Draw the ground floor to check'
          : out.length
            ? `${out.length} ${out.length === 1 ? 'wall reaches' : 'walls reach'} beyond it`
            : br.extent === 'house'
              ? 'Under the ground floor'
              : 'Inside the building line',
        status: !area ? 'check' : out.length ? 'fail' : 'ok',
        clause: clause(br.clause),
        ids: out.map((w) => w.id),
      });
      if (br.clearMm) {
        const h = basement.heightMm ?? BASEMENT_HEIGHT_MM;
        const [lo, hi] = br.clearMm;
        rows.push({
          id: 'basement-height',
          label: 'Basement clear height',
          required: `${len(lo)} to ${len(hi)}`,
          actual: len(h),
          status: h >= lo - 1 && h <= hi + 1 ? 'ok' : 'fail',
          clause: clause(br.clause),
        });
      }
    }
  }

  const withMumty = authority.height?.withMumty !== false;
  const topMm = buildingTopMm(
    doc,
    withMumty ? built : built.filter((el) => !mumtys.has(levelOf(el))),
    ctx.wallHeightMm,
  );
  if (authority.height && topMm > 0)
    rows.push({
      id: 'height',
      label: 'Height',
      required: `At most ${len(authority.height.maxMm)}${authority.height.note ? ` (${authority.height.note.replace(/\.$/, '').toLowerCase()})` : ''}`,
      actual: `About ${len(topMm)} from the ground${mumtys.size && !withMumty ? ', without the mumty' : ''}`,
      status: topMm <= authority.height.maxMm + 1 ? 'ok' : 'fail',
      clause: clause(authority.height.clause),
    });

  // Boundary walls.
  const boundary = built.filter((el): el is Wall => el.type === 'wall' && el.kind === 'boundary');
  if (authority.boundaryWall && boundary.length) {
    const { minMm, maxMm } = authority.boundaryWall;
    const bad = boundary.filter((w) => {
      const h = w.heightMm ?? 2133.6;
      return h > maxMm + 1 || (minMm !== undefined && h < minMm - 1);
    });
    rows.push({
      id: 'boundary',
      label: 'Boundary wall',
      required: minMm ? `${len(minMm)} to ${len(maxMm)} high` : `At most ${len(maxMm)} high`,
      actual: bad.length
        ? `${bad.length} ${bad.length === 1 ? 'wall is' : 'walls are'} outside that`
        : 'Within the limit',
      status: bad.length ? 'fail' : 'ok',
      clause: clause(authority.boundaryWall.clause),
      ids: bad.map((w) => w.id),
    });
  }

  // Rooms by name: area and (roughly) width.
  if (authority.rooms) {
    const small: { id: Id; name: string }[] = [];
    let checked = 0;
    for (const r of doc.rooms) {
      if (r.hidden) continue;
      const rr = roomRuleFor(authority.rooms.rules, r.name);
      if (!rr) continue;
      checked++;
      const area = roomAreaSqMm(r) / SQ_MM_PER_SQ_FT;
      const xs = r.points.map((p) => p.x);
      const ys = r.points.map((p) => p.y);
      const width = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * MM_PER_UNIT;
      if (area < rr.minSqFt - 0.5 || (rr.minWidthMm && width < rr.minWidthMm - 5))
        small.push({ id: r.id, name: r.name });
    }
    if (checked)
      rows.push({
        id: 'rooms',
        label: 'Room sizes',
        required: authority.rooms.rules
          .map((x) => `${x.label} ${x.minSqFt} sq ft${x.minWidthMm ? `, ${len(x.minWidthMm)} wide` : ''}`)
          .join('; '),
        actual: small.length
          ? `Too small: ${small.map((s) => s.name).join(', ')}`
          : `All ${checked} named rooms are big enough`,
        status: small.length ? 'fail' : 'ok',
        clause: clause(authority.rooms.clause),
        ids: small.map((s) => s.id),
      });
  }

  // The mumty (stair tower) on the roof.
  const mumtyWalls = built.filter((el): el is Wall => el.type === 'wall' && BUILT_KINDS(el) && mumtys.has(levelOf(el)));
  if (authority.mumty && mumtyWalls.length) {
    const { area, height, widthShare } = authority.mumty;
    const ids = mumtyWalls.map((w) => w.id);
    if (area) {
      const plotSqFt = plotAreaSqFt(plot);
      const buildableSqFt = rule ? polygonSqFt(buildableArea({ ...plot, setbacks: plotSetbacks(rule) })) : plotSqFt;
      const max = area.maxSqFt({ plotSqFt, buildableSqFt });
      // Its covered area, out to the outer faces of its walls.
      const has = [...mumtys].reduce((sum, id) => sum + builtAreaSqFt(doc, id), 0);
      rows.push({
        id: 'mumty-area',
        label: 'Mumty area',
        required: `At most ${sqft(max)} (${area.rule})`,
        actual: `About ${sqft(has)}`,
        status: has <= max + 0.5 ? 'ok' : 'fail',
        clause: clause(area.clause),
        ids: has <= max + 0.5 ? [] : ids,
      });
    }
    if (height) {
      const wallOf = (w: Wall) => w.heightMm ?? levelWallMm(doc, levelOf(w), ctx.wallHeightMm);
      const tall = mumtyWalls.filter((w) => wallOf(w) + slabMm(doc) > height.maxMm + 1);
      const top = Math.max(...mumtyWalls.map((w) => wallOf(w) + slabMm(doc)));
      rows.push({
        id: 'mumty-height',
        label: 'Mumty height',
        required: `At most ${len(height.maxMm)} above the roof`,
        actual: `About ${len(top)} with its roof slab`,
        status: tall.length ? 'fail' : 'ok',
        clause: clause(height.clause),
        ids: tall.map((w) => w.id),
      });
    }
    if (widthShare) {
      const a = plot.points[plot.front % plot.points.length];
      const b = plot.points[(plot.front + 1) % plot.points.length];
      const along = { x: b.x - a.x, y: b.y - a.y };
      const l = Math.hypot(along.x, along.y) || 1;
      const u = { x: along.x / l, y: along.y / l };
      // The plot's average width along the road: its area over its depth from the road.
      const depths = plot.points.map((p) => (p.x - a.x) * u.y - (p.y - a.y) * u.x);
      const depth = Math.max(...depths) - Math.min(...depths) || 1;
      const avg = polygonArea(plot.points) / depth;
      const proj = mumtyWalls.flatMap((w) => wallCorners(w)).map((p) => p.x * u.x + p.y * u.y);
      const width = Math.max(...proj) - Math.min(...proj);
      const max = avg * widthShare.share;
      rows.push({
        id: 'mumty-width',
        label: 'Mumty width',
        required: `At most ${len(max * MM_PER_UNIT)} (half the plot's width)`,
        actual: `About ${len(width * MM_PER_UNIT)} along the road`,
        status: width <= max + TOLERANCE ? 'ok' : 'fail',
        clause: clause(widthShare.clause),
        ids: width <= max + TOLERANCE ? [] : ids,
      });
    }
  }

  // Car porches, by the rooms named so on the ground floor.
  if (authority.carPorch) {
    const ground = GROUND_LEVEL;
    const porches = doc.rooms.filter((r) => !r.hidden && levelOf(r) === ground && PORCH_ROOM.test(r.name));
    const sqyd = plotAreaSqFt(plot) / 9;
    const size = authority.carPorch.sizes.find(
      (z) => sqyd >= z.sqyd[0] - 0.5 && (z.sqyd[1] === undefined || sqyd <= z.sqyd[1] + 0.5),
    );
    if (porches.length && size) {
      const lim = [size.w, size.d].sort((x, y) => x - y).map((f) => (f * MM_PER_FOOT) / MM_PER_UNIT);
      const big = porches.filter((r) => {
        const [short, long] = boxSides(r.points);
        return short > lim[0] + TOLERANCE || long > lim[1] + TOLERANCE;
      });
      const main = porches.reduce((m, r) => (roomAreaSqMm(r) > roomAreaSqMm(m) ? r : m));
      const [short, long] = boxSides(main.points);
      rows.push({
        id: 'car-porch',
        label: porches.length > 1 ? 'Car porches' : 'Car porch',
        required: `At most ${size.w}' × ${size.d}' (with the side setback)${porches.length > 1 && authority.carPorch.note ? `. ${authority.carPorch.note}` : ''}`,
        actual: big.length
          ? `Too big: ${big.map((r) => r.name).join(', ')}`
          : `${len(short * MM_PER_UNIT)} × ${len(long * MM_PER_UNIT)}${porches.length > 1 ? ` (and ${porches.length - 1} more)` : ''}`,
        status: big.length ? 'fail' : porches.length > 1 ? 'check' : 'ok',
        clause: clause(authority.carPorch.clause),
        ids: big.length ? big.map((r) => r.id) : porches.length > 1 ? porches.map((r) => r.id) : [],
      });
    }
  }

  // The whole house's covered area.
  if (authority.minTotalSqFt) {
    const total = doc.levels.reduce((s, l) => s + builtAreaSqFt(doc, l.id), 0);
    if (total > 0)
      rows.push({
        id: 'total',
        label: 'Total covered area',
        required: `At least ${sqft(authority.minTotalSqFt.value)}`,
        actual: `About ${sqft(total)}`,
        status: total >= authority.minTotalSqFt.value ? 'ok' : 'fail',
        clause: clause(authority.minTotalSqFt.clause),
      });
  }

  return { authority, rule, plot, rows };
}

/** The outline an item takes up on the plan, for the setback check (null for things that don't count). */
function itemOutline(el: PlanElement): Point[] | null {
  switch (el.type) {
    case 'wall':
      return el.kind === 'boundary' ? null : wallCorners(el);
    case 'column':
    case 'beam':
    case 'slab':
    case 'stair':
      return elementOutline(el);
    case 'block':
      return el.heightMm > 0 ? el.points : null;
    default:
      return null;
  }
}

const polygonSqFt = (pts: Point[]) => (polygonArea(pts) * MM_PER_UNIT * MM_PER_UNIT) / SQ_MM_PER_SQ_FT;
const plotAreaSqFt = (plot: Plot) => polygonSqFt(outlinePoints(plot));

/**
 * One row per side of the plot, from the road going round: its setback, and how far the nearest
 * building (walls other than boundary walls, and blocks) is from it. A second road's setback is
 * provisional, so that side is marked "check" even when it is kept.
 */
function sideRows(doc: PlanDoc, plot: Plot, len: (mm: number) => string, clause: string): CheckRow[] {
  const sides = plotSides(plot);
  const setbacks = sideSetbacks(plot, sides);
  const n = plot.points.length;
  const items: { id: Id; pts: Point[] }[] = [];
  for (const el of doc.elements) {
    if (el.hidden || !((el.type === 'wall' && el.kind !== 'boundary') || (el.type === 'block' && el.heightMm > 0)))
      continue;
    const pts = itemOutline(el);
    if (pts && pts.some((p) => pointInPolygon(p, plot.points))) items.push({ id: el.id, pts });
  }
  const rows: CheckRow[] = [];
  for (let k = 0; k < n; k++) {
    const i = (plot.front + k) % n;
    const a = plot.points[i];
    const b = plot.points[(i + 1) % n];
    const need = setbacks[i].mm / MM_PER_UNIT;
    let nearest = Infinity;
    const close: Id[] = [];
    for (const it of items) {
      const d = Math.min(...it.pts.map((p) => pointToSegmentDistance(p, a, b)));
      nearest = Math.min(nearest, d);
      if (d < need - TOLERANCE) close.push(it.id);
    }
    const { provisional } = setbacks[i];
    rows.push({
      id: `setback-side-${i}`,
      label: `Setback, side ${k + 1} (${SIDE_KIND_NAMES[sides[i].kind].toLowerCase()})`,
      required: `At least ${len(setbacks[i].mm)}${provisional ? ' (provisional)' : ''}`,
      actual: Number.isFinite(nearest) ? `${len(nearest * MM_PER_UNIT)} to the nearest wall` : 'Nothing built yet',
      status: close.length ? 'fail' : provisional ? 'check' : 'ok',
      clause,
      ids: close,
      detail: true,
    });
  }
  return rows;
}

/** How high the top of the building is above the ground (mm): walls, slabs and blocks. */
function buildingTopMm(doc: PlanDoc, built: PlanElement[], wallHeightMm: number): number {
  let top = 0;
  for (const el of built) {
    const base = levelBaseM(doc, levelOf(el), wallHeightMm) * 1000 + (el.elevMm ?? 0);
    if (el.type === 'wall' && el.kind !== 'boundary') top = Math.max(top, base + (el.heightMm ?? wallHeightMm));
    if (el.type === 'slab') top = Math.max(top, base + wallHeightMm + el.thickness * MM_PER_UNIT);
    if (el.type === 'block' && el.heightMm > 0) top = Math.max(top, base + el.heightMm);
  }
  // A floor with walls carries a slab over it even when none is drawn (a basement's is below the ground).
  for (const l of doc.levels)
    if (!l.basement && built.some((el) => el.type === 'wall' && isBuildingWall(el) && levelOf(el) === l.id))
      top = Math.max(
        top,
        levelBaseM(doc, l.id, wallHeightMm) * 1000 + levelWallMm(doc, l.id, wallHeightMm) + slabMm(doc),
      );
  return top;
}
