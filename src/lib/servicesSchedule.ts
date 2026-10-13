/**
 * The services schedule: how many of each Services item there are, and how long each kind of wire and
 * pipe run is, per floor and in all. Pure.
 */
import { MM_PER_UNIT } from './scale';
import { RUN_ORDER, RUN_SYSTEMS, runLength, serviceName, serviceOf, serviceTag, type ServiceTrade } from './services';
import { formatLength } from './units';
import { levelOf, type PlanDoc, type RunSystem, type Units } from '../types';
import type { FurnitureKind } from '../furniture/catalog';

export interface ScheduleItem {
  kind: FurnitureKind;
  name: string;
  tag: string;
  trade: ServiceTrade;
  count: number;
}

export interface ScheduleRun {
  system: RunSystem;
  label: string;
  /** Total length on the plan, mm (rises to sockets and switches are not counted). */
  lengthMm: number;
  count: number;
}

export interface ServicesSchedule {
  items: ScheduleItem[];
  runs: ScheduleRun[];
}

const TRADE_ORDER: ServiceTrade[] = ['electrical', 'hvac', 'plumbing', 'drainage', 'gas', 'data', 'fire'];

/** The schedule for one floor, or every floor when `levelId` is missing. */
export function servicesSchedule(doc: PlanDoc, levelId?: string): ServicesSchedule {
  const items = new Map<FurnitureKind, ScheduleItem>();
  const runs = new Map<RunSystem, ScheduleRun>();
  for (const el of doc.elements) {
    if (levelId && levelOf(el) !== levelId) continue;
    if (el.type === 'furniture' && el.kind) {
      const info = serviceOf(el);
      if (!info) continue;
      const it = items.get(el.kind) ?? {
        kind: el.kind,
        name: serviceName(el.kind),
        tag: serviceTag(el.kind),
        trade: info.trade,
        count: 0,
      };
      it.count++;
      items.set(el.kind, it);
    }
    if (el.type === 'run') {
      const r = runs.get(el.system) ?? {
        system: el.system,
        label: RUN_SYSTEMS[el.system].label,
        lengthMm: 0,
        count: 0,
      };
      r.lengthMm += runLength(el) * MM_PER_UNIT;
      r.count++;
      runs.set(el.system, r);
    }
  }
  return {
    items: [...items.values()].sort(
      (a, b) => TRADE_ORDER.indexOf(a.trade) - TRADE_ORDER.indexOf(b.trade) || a.name.localeCompare(b.name),
    ),
    runs: RUN_ORDER.filter((s) => runs.has(s)).map((s) => runs.get(s)!),
  };
}

const TRADE_NAMES: Record<ServiceTrade, string> = {
  electrical: 'Electrical',
  hvac: 'Fans and AC',
  plumbing: 'Water supply',
  drainage: 'Drainage',
  gas: 'Gas',
  data: 'Data and security',
  fire: 'Fire safety',
};
export const tradeName = (t: ServiceTrade) => TRADE_NAMES[t];

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The schedule as CSV text: items then runs, floor by floor, then the whole building. */
export function servicesCsv(doc: PlanDoc, title: string, units: Units): string {
  const rows: (string | number)[][] = [[title], [], ['Floor', 'Service', 'Item', 'Tag', 'Number']];
  const floors = doc.levels.length ? doc.levels : [{ id: undefined as string | undefined, name: 'Plan' }];
  const blocks: [string, ServicesSchedule][] = [
    ...floors.map((l): [string, ServicesSchedule] => [l.name, servicesSchedule(doc, l.id)]),
    ['All floors', servicesSchedule(doc)],
  ];
  for (const [floor, s] of blocks)
    for (const it of s.items) rows.push([floor, tradeName(it.trade), it.name, it.tag, it.count]);
  rows.push([], ['Floor', 'Run', 'Number of runs', 'Length on plan', 'Length (m)']);
  for (const [floor, s] of blocks)
    for (const r of s.runs)
      rows.push([floor, r.label, r.count, formatLength(r.lengthMm, units), (r.lengthMm / 1000).toFixed(1)]);
  rows.push(
    [],
    ['Lengths are measured along the runs on the plan; add the drops to switches, sockets and taps and some spare.'],
  );
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
