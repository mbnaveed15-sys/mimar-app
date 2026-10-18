/**
 * Services hints: what a services layout usually has and this one may have missed. They only appear on
 * floors where Services items or runs have been drawn, so a plan without services stays quiet. Pure.
 */
import { pointInPolygon } from '../geometry';
import { WET_ROOM } from './bylaws';
import { FIXTURE_RUNS, RUN_SYSTEMS, runsOf, serviceName, serviceOf } from './services';
import { FURNITURE_CATALOG, type FurnitureKind } from '../furniture/catalog';
import { levelOf, type Furniture, type Id, type PlanDoc, type Room, type ServiceRun } from '../types';
import type { Hint } from './planHints';

const LIGHTS = new Set<FurnitureKind>([
  'light-ceiling',
  'downlight',
  'pendant',
  'tube-light',
  'wall-light',
  'fan-ceiling',
]);
const SWITCHES = new Set<FurnitureKind>(['switch-1', 'switch-2', 'switch-board', 'regulator']);
const TRAPS = new Set<FurnitureKind>(['floor-trap', 'gully-trap']);
const DRAINED = /bath|toilet|washroom|wc|shower|ensuite|en-suite|laundry|wash area|kitchen/i;

const nameOf = (f: Furniture) => f.label ?? (f.kind ? FURNITURE_CATALOG[f.kind].name : 'Item');

export function servicesHints(doc: PlanDoc, levelName: (id: Id) => string): Hint[] {
  const hints: Hint[] = [];
  const runs = doc.elements.filter((el): el is ServiceRun => el.type === 'run' && !el.hidden);
  const items = doc.elements.filter(
    (el): el is Furniture => el.type === 'furniture' && !el.hidden && !!el.kind && runsOf(el).length > 0,
  );
  const services = items.filter((f) => serviceOf(f));
  const floors = new Set([...runs, ...services].map((el) => levelOf(el)));
  if (!floors.size) return hints;

  // Which runs join each item.
  const joined = new Map<Id, Set<string>>();
  for (const r of runs)
    for (const id of [r.from, r.to]) if (id) joined.set(id, new Set([...(joined.get(id) ?? []), r.system]));

  const roomsOn = (levelId: Id) => doc.rooms.filter((r) => !r.hidden && levelOf(r) === levelId);
  const inRoom = (r: Room, f: Furniture) => pointInPolygon({ x: f.x, y: f.y }, r.points);

  for (const levelId of floors) {
    const on = (text: string) => `${levelName(levelId)}${text}`;
    const here = items.filter((f) => levelOf(f) === levelId);
    const kinds = (r: Room) => new Set(here.filter((f) => inRoom(r, f)).map((f) => f.kind!));
    // Water and drains on this floor at all (else the trap hints would nag a lights-only layout).
    const plumbed =
      runs.some((r) => levelOf(r) === levelId && !RUN_SYSTEMS[r.system].wire) ||
      services.some((f) => levelOf(f) === levelId && ['plumbing', 'drainage'].includes(serviceOf(f)!.trade));
    for (const room of roomsOn(levelId)) {
      const k = kinds(room);
      // A bath, WC, kitchen or laundry with no floor trap to drain it.
      if (plumbed && (WET_ROOM.test(room.name) || DRAINED.test(room.name)) && ![...k].some((x) => TRAPS.has(x)))
        hints.push({
          id: `trap-${room.id}`,
          kind: 'services',
          text: on(`${room.name} has no floor trap: wet areas need one to drain the floor.`),
          ids: [room.id],
        });
      // Lights (or a ceiling fan) with nothing to switch them on.
      if ([...k].some((x) => LIGHTS.has(x)) && ![...k].some((x) => SWITCHES.has(x)))
        hints.push({
          id: `switch-${room.id}`,
          kind: 'services',
          text: on(`${room.name} has lights but no switch: put a switch by the door.`),
          ids: [room.id],
        });
    }

    // Once some pipes are drawn on a floor: fixtures and geysers left without their water.
    const piped = runs.some((r) => levelOf(r) === levelId && !RUN_SYSTEMS[r.system].wire);
    if (piped)
      for (const f of here) {
        const takes = runsOf(f);
        const has = joined.get(f.id) ?? new Set();
        const isFixture = !!FIXTURE_RUNS[f.kind!];
        if (
          (isFixture || f.kind === 'tap' || f.kind === 'mixer') &&
          takes.includes('cold') &&
          !has.has('cold') &&
          !has.has('hot')
        )
          hints.push({
            id: `water-${f.id}`,
            kind: 'services',
            text: on(`${nameOf(f)} has no water pipe joined to it.`),
            ids: [f.id],
          });
        if (isFixture && takes.includes('drain') && !has.has('drain'))
          hints.push({
            id: `drain-${f.id}`,
            kind: 'services',
            text: on(`${nameOf(f)} has no drain pipe joined to it.`),
            ids: [f.id],
          });
        if ((f.kind === 'geyser' || f.kind === 'geyser-gas') && !has.has('hot'))
          hints.push({
            id: `hot-${f.id}`,
            kind: 'services',
            text: on(`${nameOf(f)} has no hot water pipe going out from it.`),
            ids: [f.id],
          });
      }

    // Once a floor has some of a point's wires or pipes: points left joined to none of them.
    const drawn = new Set(runs.filter((r) => levelOf(r) === levelId).map((r) => r.system));
    const loose = here.filter((f) => {
      const takes = serviceOf(f)?.runs ?? [];
      const has = joined.get(f.id);
      return takes.some((r) => drawn.has(r)) && !takes.some((r) => has?.has(r));
    });
    if (loose.length)
      hints.push({
        id: `unwired-${levelId}`,
        kind: 'services',
        text: on(
          loose.length === 1
            ? `${nameOf(loose[0])} isn't joined to any wire or pipe.`
            : `${loose.length} service points aren't joined to any wire or pipe.`,
        ),
        ids: loose.map((f) => f.id),
      });
  }

  // Runs joined to an item that doesn't take them (a gas pipe to a light).
  const byId = new Map(items.map((f) => [f.id, f] as const));
  for (const r of runs)
    for (const id of new Set([r.from, r.to])) {
      const f = id ? byId.get(id) : undefined;
      if (f && !runsOf(f).includes(r.system))
        hints.push({
          id: `wrong-${r.id}-${f.id}`,
          kind: 'services',
          text: `${levelName(levelOf(r))}A ${RUN_SYSTEMS[r.system].label.toLowerCase()} run is joined to ${nameOf(f)}, which doesn't take it.`,
          ids: [r.id, f.id],
        });
    }

  // Wiring with nowhere to come from.
  const electrical = services.some((f) => serviceOf(f)!.trade === 'electrical' || serviceOf(f)!.trade === 'hvac');
  if (electrical && !services.some((f) => f.kind === 'db'))
    hints.push({
      id: 'no-db',
      kind: 'services',
      text: `There is no ${serviceName('db').toLowerCase()}: every circuit starts at one.`,
      ids: [],
    });
  return hints;
}
