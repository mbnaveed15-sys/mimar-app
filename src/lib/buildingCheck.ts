/**
 * The plan check rows for a non-residential building (or apartments) under CDA, DHA Islamabad or
 * LDA: the area's limits from `buildingBylaws.ts` (plot, road, coverage, FAR, storeys, height,
 * parking, veranda, mumty) and the authority's facilities (lift, emergency stairs, ramp, storey
 * heights, shops, stairs). The setback rows come from `planCheck.ts`. Pure.
 */
import { plotRule, plotSetbacks, withTyped, type MumtyRule, type PlotRule } from './bylaws';
import { buildingPlotRule, buildingRuleFor, type BuildingRule, type ParkingMeasures } from './buildingBylaws';
import {
  builtAreaSqFt,
  builtElements,
  buildingTopMm,
  floorAreaSqFt,
  mumtyLevelIds,
  mumtyRows,
  boxSides,
  NOT_FLOOR_AREA,
  PARKING_ROOM,
  pct,
  sqft,
  SQ_MM_PER_SQ_FT,
  plotAreaSqFt,
  storeyLevelIds,
  type CheckRow,
  type PlanCheck,
} from './planCheck';
import { LIFT } from './buildingUse';
import { basementOf, levelWallMm } from './levels';
import { projectOf } from './project';
import { MM_PER_UNIT } from './scale';
import { formatLength } from './units';
import { roomAreaSqMm } from '../rooms';
import {
  BASEMENT_HEIGHT_MM,
  GROUND_LEVEL,
  levelOf,
  type PlanDoc,
  type Plot,
  type Room,
  type Units,
  type Wall,
} from '../types';

/** A building's rule on this plot, where its authority has building bylaws in Mimar. */
export function buildingRuleOf(doc: PlanDoc, plot: Plot): BuildingRule | null {
  const project = projectOf(doc);
  return project.type === 'building' ? buildingRuleFor(plot, project.use ?? 'other', storeyLevelIds(doc).length) : null;
}

/** The rule whose setbacks apply to a plot: a building's area, else the house table (as the check uses). */
export function appliedRule(doc: PlanDoc, plot: Plot): PlotRule | null {
  if (projectOf(doc).type === 'building') {
    const br = buildingRuleOf(doc, plot);
    return br ? buildingPlotRule(br) : null;
  }
  return plotRule(plot)?.rule ?? null;
}

/** A rule's setbacks for this plot, keeping the front typed where the authority sets it case by case. */
export function appliedSetbacks(rule: PlotRule, plot: Plot, swap = false): Plot['setbacks'] {
  return withTyped(plotSetbacks(rule, swap), rule, plot);
}

const TOLERANCE_MM = 10;

/** Rooms counted as parking, lifts, shops, verandas, hotel rooms, flats (by their kitchens), classrooms, wards. */
const SHOP = /\bshops?\b/i;
const VERANDA = /veranda|verandah|arcade/i;
const HOTEL_ROOM = /bed ?room|guest|suite|hotel room/i;
const KITCHEN = /kitchen/i;
const CLASSROOM = /class ?room|\bclass\b/i;
const WARD = /\bward/i;
const EMERGENCY_STAIR = /emergency|fire ?(stair|escape|exit)/i;

const roomSqFt = (r: Room) => roomAreaSqMm(r) / SQ_MM_PER_SQ_FT;
/** A room's shorter side, mm (by its bounding box). */
const shortSideMm = (r: Room) => boxSides(r.points)[0] * MM_PER_UNIT;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The rows for a building whose plan check found a building rule (none otherwise). */
export function buildingCheckRows(
  doc: PlanDoc,
  check: PlanCheck,
  ctx: { wallHeightMm: number; units: Units },
): CheckRow[] {
  const br = check.building;
  const plot = check.plot;
  if (!br || !plot) return [];
  const { bylaws, area, limits, measures: m } = br;
  const { facilities } = bylaws;
  const len = (mm: number) => formatLength(mm, ctx.units);
  const rows: CheckRow[] = [];
  const rooms = doc.rooms.filter((r) => !r.hidden);
  const built = builtElements(doc);
  const stairs = built.filter((el) => el.type === 'stair');
  const storeyIds = storeyLevelIds(doc);
  const plotSqFt = plotAreaSqFt(plot);

  // The area and its row of the table are the line under the authority's name; until the area is
  // picked, a row asks for it.
  if (!br.picked)
    rows.push({
      id: 'bylaw-area',
      label: 'Area',
      required: `Pick the plot’s area under the plot if it isn’t ${area.label} (the usual one for this use)`,
      actual: `${area.label}, as usual`,
      status: 'check',
      clause: area.clause,
    });

  // The plot and its road.
  const sizes: string[] = [];
  let small = false;
  if (limits.minSqFt !== undefined) {
    sizes.push(`at least ${sqft(limits.minSqFt)}`);
    small ||= m.sqft < limits.minSqFt - 1;
  }
  if (limits.maxSqFt !== undefined) {
    sizes.push(`at most ${sqft(limits.maxSqFt)}`);
    small ||= m.sqft > limits.maxSqFt + 1;
  }
  if (limits.minFrontageFt !== undefined) {
    sizes.push(`${limits.minFrontageFt}' frontage or more`);
    small ||= m.frontageFt < limits.minFrontageFt - 0.5;
  }
  if (sizes.length)
    rows.push({
      id: 'bylaw-plot',
      label: 'Plot size',
      required: sizes.join(', ').replace(/^./, (c) => c.toUpperCase()),
      actual: `${sqft(m.sqft)}, ${Math.round(m.frontageFt)}' frontage`,
      status: small ? 'fail' : 'ok',
      clause: limits.plotClause ?? limits.clause,
    });
  if (limits.minRoadFt)
    rows.push({
      id: 'bylaw-road',
      label: 'Road width',
      required: `At least ${limits.minRoadFt}' wide`,
      actual: m.roadFt === undefined ? 'Not typed: type it under the plot' : `${Math.round(m.roadFt)}'`,
      status: m.roadFt === undefined ? 'check' : m.roadFt >= limits.minRoadFt - 0.5 ? 'ok' : 'fail',
      clause: limits.plotClause ?? limits.clause,
    });

  // Coverage: the ground floor, and the floors above where they have their own limit.
  const groundSqFt = builtAreaSqFt(doc, GROUND_LEVEL);
  if (limits.coveragePct !== undefined && groundSqFt > 0) {
    const cover = (groundSqFt / plotSqFt) * 100;
    rows.push({
      id: 'bylaw-coverage',
      label: 'Ground floor coverage',
      required: `At most ${pct(limits.coveragePct)} of the plot${limits.coverageNote ? ` (${limits.coverageNote})` : ''}`,
      actual: `About ${pct(cover)} (${sqft(groundSqFt)})`,
      status: cover <= limits.coveragePct + 0.5 ? 'ok' : 'fail',
      clause: limits.coverageClause ?? limits.clause,
    });
  }
  if (limits.upperCoveragePct !== undefined) {
    const upper = storeyIds.filter((id) => id !== GROUND_LEVEL).map((id) => builtAreaSqFt(doc, id));
    const most = Math.max(0, ...upper);
    if (most > 0) {
      const cover = (most / plotSqFt) * 100;
      rows.push({
        id: 'bylaw-upper-coverage',
        label: 'Upper floor coverage',
        required: `At most ${pct(limits.upperCoveragePct)} of the plot`,
        actual: `About ${pct(cover)} on the largest (${sqft(most)})`,
        status: cover <= limits.upperCoveragePct + 0.5 ? 'ok' : 'fail',
        clause: limits.coverageClause ?? limits.clause,
      });
    }
  }

  // FAR: every floor, without the mumty, parking and lift wells (and basements, unless they count).
  const floorSqFt = floorAreaSqFt(doc, !!limits.farWithBasement, NOT_FLOOR_AREA);
  if (limits.far !== undefined && floorSqFt > 0)
    rows.push({
      id: 'bylaw-far',
      label: 'Floor area ratio (FAR)',
      required: `At most 1:${limits.far} (${sqft(plotSqFt * limits.far)} of floors${limits.farNote ? `; ${limits.farNote}` : ''})`,
      actual: `About 1:${(floorSqFt / plotSqFt).toFixed(2)} (${sqft(floorSqFt)}, without parking, lifts and the mumty)`,
      status: floorSqFt <= plotSqFt * limits.far + 0.5 ? 'ok' : 'fail',
      clause: limits.farClause ?? limits.clause,
    });
  else if (limits.far === undefined && limits.farNote)
    rows.push({
      id: 'bylaw-far',
      label: 'Floor area ratio (FAR)',
      required: limits.farNote.replace(/^./, (c) => c.toUpperCase()),
      actual: floorSqFt > 0 ? `About 1:${(floorSqFt / plotSqFt).toFixed(2)}` : 'No floors drawn yet',
      status: 'check',
      clause: limits.farClause ?? limits.clause,
    });

  // Storeys and height.
  const storeys = storeyIds.length;
  if (storeys && limits.maxStoreys !== undefined)
    rows.push({
      id: 'bylaw-storeys',
      label: 'Storeys',
      required: `At most ${limits.maxStoreys}${limits.storeysLabel ? ` (${limits.storeysLabel})` : ''}`,
      actual: String(storeys),
      status: storeys <= limits.maxStoreys ? 'ok' : 'fail',
      clause: limits.storeysClause ?? limits.clause,
    });
  else if (storeys && limits.storeysLabel)
    rows.push({
      id: 'bylaw-storeys',
      label: 'Storeys',
      required: limits.storeysLabel,
      actual: String(storeys),
      status: 'check',
      clause: limits.storeysClause ?? limits.clause,
    });
  const mumtys = mumtyLevelIds(doc);
  const topMm = buildingTopMm(
    doc,
    bylaws.heightWithMumty ? built : built.filter((el) => !mumtys.has(levelOf(el))),
    ctx.wallHeightMm,
  );
  if (topMm > 0 && (limits.heightMm !== undefined || limits.minHeightMm !== undefined)) {
    const { heightMm: max, minHeightMm: min } = limits;
    const over = max !== undefined && topMm > max + 1;
    const under = min !== undefined && topMm < min - 1;
    rows.push({
      id: 'bylaw-height',
      label: 'Height',
      required: `${
        max !== undefined && min !== undefined
          ? `${len(min)} to ${len(max)}`
          : max !== undefined
            ? `At most ${len(max)}`
            : `At least ${len(min!)}`
      }${limits.heightNote ? ` (${limits.heightNote})` : ''}`,
      actual: `About ${len(topMm)} from the ground${mumtys.size && !bylaws.heightWithMumty ? ', without the mumty' : ''}`,
      // Lower than the zone's least height is allowed by building to a lower zone: to check.
      status: over ? 'fail' : under ? 'check' : 'ok',
      clause: limits.heightClause ?? limits.clause,
    });
  }

  // A veranda (arcade) along the road.
  if (limits.verandaMm) {
    const verandas = rooms.filter((r) => levelOf(r) === GROUND_LEVEL && VERANDA.test(r.name));
    const narrow = verandas.filter((r) => shortSideMm(r) < limits.verandaMm! - TOLERANCE_MM);
    rows.push({
      id: 'bylaw-veranda',
      label: 'Veranda',
      required: `At least ${len(limits.verandaMm)} deep along the road`,
      actual: !verandas.length
        ? 'Name the room along the road Veranda to check it'
        : narrow.length
          ? `Too narrow: ${narrow.map((r) => r.name).join(', ')}`
          : `${len(Math.min(...verandas.map(shortSideMm)))} deep`,
      status: !verandas.length ? 'check' : narrow.length ? 'fail' : 'ok',
      clause: limits.verandaClause ?? limits.clause,
      ids: narrow.map((r) => r.id),
    });
  }

  // The mumty.
  if (limits.mumty) {
    const { sharePct, widthShare, heightMm, clause } = limits.mumty;
    const rule: MumtyRule = {
      area: sharePct
        ? { maxSqFt: ({ plotSqFt: p }) => (p * sharePct) / 100, rule: `${sharePct}% of the plot`, clause }
        : undefined,
      widthShare: widthShare ? { share: widthShare, clause } : undefined,
      height: heightMm ? { maxMm: heightMm, clause } : undefined,
    };
    rows.push(...mumtyRows(doc, plot, null, rule, ctx.wallHeightMm, len));
  }

  // Parking.
  const parkingSqFt = rooms.filter((r) => PARKING_ROOM.test(r.name)).reduce((s, r) => s + roomSqFt(r), 0);
  const from = bylaws.parkingFromSqFt;
  const needed = limits.parkingNeeded ?? (from ? m.sqft >= from.sqft - 1 : true);
  if (!needed)
    rows.push({
      id: 'bylaw-parking',
      label: 'Parking',
      required: `Not needed${limits.parkingNote ? `: ${limits.parkingNote}` : from ? ` on plots under ${sqft(from.sqft)}` : ''}`,
      actual: parkingSqFt > 0 ? `${sqft(parkingSqFt)} drawn` : 'None drawn',
      status: 'ok',
      clause: from?.clause ?? limits.clause,
    });
  else {
    const measures: ParkingMeasures = {
      coveredSqFt: floorAreaSqFt(doc, true, NOT_FLOOR_AREA),
      rooms: rooms.filter((r) => HOTEL_ROOM.test(r.name)).length,
      flats: rooms.filter((r) => KITCHEN.test(r.name)).length,
      beds: built.filter((el) => el.type === 'furniture' && el.kind === 'hospital-bed').length,
      classrooms: rooms.filter((r) => CLASSROOM.test(r.name)).length,
      clinicalSqFt: Math.max(
        0,
        floorAreaSqFt(doc, true, NOT_FLOOR_AREA) -
          rooms.filter((r) => WARD.test(r.name)).reduce((s, r) => s + roomSqFt(r), 0),
      ),
    };
    const need = bylaws.parking(m.use, measures, limits);
    if (need) {
      const cars = Math.floor(parkingSqFt / bylaws.sqFtPerCar + 1e-9);
      rows.push({
        id: 'bylaw-parking',
        label: 'Parking',
        required: `${plural(need.cars, 'car')}: ${need.rule}${limits.parkingNote ? ` (${limits.parkingNote})` : ''}`,
        actual: parkingSqFt
          ? `${plural(cars, 'car')} (${sqft(parkingSqFt)} named Parking, at ${bylaws.sqFtPerCar} sq ft a car)`
          : need.cars
            ? 'None drawn: name the car park rooms Parking'
            : 'None needed yet',
        status: cars >= need.cars ? 'ok' : 'fail',
        clause: need.clause,
      });
    }
  }

  // Facilities.
  const lift = facilities.lift({ storeys, sqft: m.sqft, use: m.use, liftAbove: limits.liftAbove });
  if (lift.needed) {
    const lifts = rooms.filter((r) => LIFT.test(r.name));
    rows.push({
      id: 'bylaw-lift',
      label: 'Lift',
      required: lift.rule,
      actual: lifts.length ? 'Drawn' : 'None: name a room Lift where one goes',
      status: lifts.length ? 'ok' : 'fail',
      clause: limits.liftClause || lift.clause,
    });
  }
  const top = buildingTopMm(
    doc,
    built.filter((el) => !mumtys.has(levelOf(el))),
    ctx.wallHeightMm,
  );
  const emergency = facilities.emergencyStairs({ storeys, sqft: m.sqft, heightMm: top });
  if (emergency.count) {
    const groundStairs = stairs.filter((s) => s.type === 'stair' && s.shape !== 'ramp' && levelOf(s) === GROUND_LEVEL);
    const named = rooms.filter((r) => levelOf(r) === GROUND_LEVEL && EMERGENCY_STAIR.test(r.name)).length;
    const has = Math.max(groundStairs.length - 1, named);
    rows.push({
      id: 'bylaw-emergency-stairs',
      label: 'Emergency stairs',
      required: `${plural(emergency.count, 'stair')} as well as the main one: ${emergency.rule.replace(/^./, (c) => c.toLowerCase())}`,
      actual: has ? `${has} drawn` : 'None drawn',
      status: has >= emergency.count ? 'ok' : 'fail',
      clause: emergency.clause,
    });
  }
  const ramp = facilities.ramp({ coveredSqFt: floorAreaSqFt(doc, true) });
  if (ramp.needed) {
    const ramps = stairs.filter(
      (s): s is Extract<typeof s, { type: 'stair' }> =>
        s.type === 'stair' && s.shape === 'ramp' && levelOf(s) === GROUND_LEVEL,
    );
    const wide = ramp.minWidthMm
      ? ramps.filter((s) => s.width * MM_PER_UNIT >= ramp.minWidthMm! - TOLERANCE_MM)
      : ramps;
    rows.push({
      id: 'bylaw-ramp',
      label: 'Ramp to the entrance',
      required: ramp.rule,
      actual: !ramps.length
        ? 'None: add one (Stairs, Ramp shape)'
        : wide.length
          ? 'Drawn'
          : `Too narrow: ${len(Math.max(...ramps.map((s) => s.width * MM_PER_UNIT)))}`,
      status: wide.length ? 'ok' : 'fail',
      clause: ramp.clause,
      ids: wide.length ? [] : ramps.map((s) => s.id),
    });
  }
  const sh = facilities.storeyHeight;
  if (sh && storeyIds.length) {
    const heights = storeyIds.map((id) => ({ id, mm: levelWallMm(doc, id, ctx.wallHeightMm) }));
    const bad = heights.filter(
      (h) => (sh.minMm !== undefined && h.mm < sh.minMm - 1) || (sh.maxMm !== undefined && h.mm > sh.maxMm + 1),
    );
    const name = (id: string) => doc.levels.find((l) => l.id === id)?.name ?? id;
    rows.push({
      id: 'bylaw-storey-height',
      label: 'Storey heights',
      required:
        sh.minMm !== undefined && sh.maxMm !== undefined
          ? `${len(sh.minMm)} to ${len(sh.maxMm)}`
          : sh.minMm !== undefined
            ? `At least ${len(sh.minMm)}`
            : `At most ${len(sh.maxMm!)}`,
      actual: bad.length
        ? `Outside it: ${bad.map((h) => `${name(h.id)} ${len(h.mm)}`).join(', ')}`
        : `All ${plural(heights.length, 'storey')} within it`,
      status: bad.length ? 'fail' : 'ok',
      clause: sh.clause,
    });
  }
  const basement = basementOf(doc);
  if (
    facilities.basementMinMm &&
    basement &&
    built.some((el): el is Wall => el.type === 'wall' && levelOf(el) === basement.id)
  ) {
    const h = basement.heightMm ?? BASEMENT_HEIGHT_MM;
    rows.push({
      id: 'bylaw-basement-height',
      label: 'Basement clear height',
      required: `At least ${len(facilities.basementMinMm.mm)}`,
      actual: len(h),
      status: h >= facilities.basementMinMm.mm - 1 ? 'ok' : 'fail',
      clause: facilities.basementMinMm.clause,
    });
  }
  if (facilities.plinthMaxMm)
    rows.push({
      id: 'bylaw-plinth',
      label: 'Plinth',
      required: `At most ${len(facilities.plinthMaxMm.mm)}`,
      actual: len(doc.plinthMm),
      status: doc.plinthMm <= facilities.plinthMaxMm.mm + 1 ? 'ok' : 'fail',
      clause: facilities.plinthMaxMm.clause,
    });
  const shopRule = facilities.shops;
  const shops = rooms.filter((r) => SHOP.test(r.name));
  if (shopRule && shops.length) {
    const small = shops.filter(
      (r) =>
        roomSqFt(r) < shopRule.minSqFt - 0.5 ||
        (shopRule.minWidthMm !== undefined && shortSideMm(r) < shopRule.minWidthMm - TOLERANCE_MM),
    );
    rows.push({
      id: 'bylaw-shops',
      label: 'Shop sizes',
      required: `At least ${sqft(shopRule.minSqFt)}${shopRule.minWidthMm ? ` and ${len(shopRule.minWidthMm)} wide` : ''}`,
      actual: small.length
        ? `Too small: ${small.map((r) => r.name).join(', ')}`
        : `All ${plural(shops.length, 'shop')} big enough`,
      status: small.length ? 'fail' : 'ok',
      clause: shopRule.clause,
      ids: small.map((r) => r.id),
    });
  }
  const stairRule = facilities.stairs;
  const flights = stairs.filter(
    (s): s is Extract<typeof s, { type: 'stair' }> => s.type === 'stair' && s.shape !== 'ramp',
  );
  if (stairRule && flights.length) {
    const minWidth = stairRule.minWidthMm({ storeys, use: m.use });
    const bad = flights.filter(
      (s) =>
        s.width * MM_PER_UNIT < minWidth - TOLERANCE_MM ||
        s.riserMm > stairRule.maxRiserMm + 1 ||
        s.treadMm < stairRule.minTreadMm - 1,
    );
    rows.push({
      id: 'bylaw-stairs',
      label: 'Stairs',
      required: `At least ${len(minWidth)} wide, risers at most ${len(stairRule.maxRiserMm)}, treads at least ${len(stairRule.minTreadMm)}`,
      actual: bad.length
        ? `${plural(bad.length, 'stair')} outside that`
        : `All ${plural(flights.length, 'stair')} within it`,
      status: bad.length ? 'fail' : 'ok',
      clause: stairRule.clause,
      ids: bad.map((s) => s.id),
    });
  }

  // What the plan can't show: to check on the drawings.
  for (const n of [...(limits.notes ?? []), ...(facilities.notes ?? [])])
    rows.push({
      id: n.id,
      label: n.label,
      required: n.text,
      actual: 'Check on the drawings',
      status: 'check',
      clause: n.clause,
    });
  // One row for each thing checked.
  return rows.filter((r, i) => rows.findIndex((x) => x.id === r.id) === i);
}
