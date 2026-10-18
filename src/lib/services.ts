/**
 * Services (MEP): electrical, plumbing, drainage, gas, AC, data and fire-safety points from the library's
 * Services group, and the wire and pipe runs between them. Pure.
 */
import { FURNITURE_CATALOG, FURNITURE_KINDS, type FurnitureKind } from '../furniture/catalog';
import type { Furniture, PlanDoc, PlanElement, Point, RunSystem, ServiceRun, ServiceTrade } from '../types';

export type { ServiceTrade };

/** The trades in drawing order, each one layer (its items and its wires or pipes) and one sheet. */
export const SERVICE_TRADES: ServiceTrade[] = ['electrical', 'hvac', 'plumbing', 'drainage', 'gas', 'data', 'fire'];

/** Each trade's colour on the plan and in the DXF's layers' own colours. */
export const TRADE_COLORS: Record<ServiceTrade, string> = {
  electrical: '#c2410c',
  hvac: '#7c3aed',
  plumbing: '#1d4ed8',
  drainage: '#78350f',
  gas: '#a16207',
  data: '#0e7490',
  fire: '#be123c',
};

export interface ServiceInfo {
  trade: ServiceTrade;
  /** Fixed to the ceiling, on a wall (its back against it), or standing on the floor or the ground. */
  mount: 'ceiling' | 'wall' | 'floor';
  /** Height of its centre above the floor, mm (ceiling items hang just under the ceiling). */
  heightMm: number;
  /** Its size in 3D, mm: across, deep (from the wall), tall. */
  size3d: [number, number, number];
  /** Runs that join it. */
  runs: RunSystem[];
}

const E = 'electrical';
const L: RunSystem[] = ['lighting'];
const P: RunSystem[] = ['power'];
const LP: RunSystem[] = ['lighting', 'power'];
const COLD: RunSystem[] = ['cold'];
const WATER: RunSystem[] = ['cold', 'hot'];
const DRAIN: RunSystem[] = ['drain'];
const ci = (h: number, size3d: [number, number, number], runs = L, trade: ServiceTrade = E): ServiceInfo => ({
  trade,
  mount: 'ceiling',
  heightMm: h,
  size3d,
  runs,
});
const wall = (trade: ServiceTrade, h: number, size3d: [number, number, number], runs: RunSystem[]): ServiceInfo => ({
  trade,
  mount: 'wall',
  heightMm: h,
  size3d,
  runs,
});
const floor = (trade: ServiceTrade, h: number, size3d: [number, number, number], runs: RunSystem[]): ServiceInfo => ({
  trade,
  mount: 'floor',
  heightMm: h,
  size3d,
  runs,
});

/** Every Services item: heights are the usual ones in Pakistani houses (mm above the finished floor). */
export const SERVICES: Record<string, ServiceInfo> = {
  'light-ceiling': ci(0, [250, 250, 80]),
  downlight: ci(0, [150, 150, 30]),
  pendant: ci(0, [450, 450, 600]),
  'tube-light': ci(0, [1200, 80, 60]),
  'wall-light': wall(E, 2100, [200, 120, 200], L),
  'garden-light': floor(E, 300, [150, 150, 600], L),
  'gate-light': wall(E, 2100, [250, 250, 300], L),
  'emergency-light': wall(E, 2300, [350, 80, 120], LP),
  'switch-1': wall(E, 1200, [86, 30, 86], L),
  'switch-2': wall(E, 1200, [86, 30, 86], L),
  'switch-board': wall(E, 1200, [250, 40, 150], LP),
  regulator: wall(E, 1200, [86, 30, 86], L),
  'bell-push': wall(E, 1300, [86, 30, 86], L),
  socket: wall(E, 300, [86, 30, 86], P),
  'socket-power': wall(E, 300, [86, 30, 86], P),
  'socket-usb': wall(E, 300, [86, 30, 86], P),
  'socket-outdoor': wall(E, 600, [100, 60, 120], P),
  'ac-isolator': wall('hvac', 1800, [100, 50, 100], ['ac']),
  'cooker-point': wall(E, 1100, [150, 40, 150], P),
  db: wall(E, 1500, [400, 120, 500], ['lighting', 'power', 'ac']),
  meter: wall(E, 1600, [300, 150, 400], P),
  ups: floor(E, 0, [450, 350, 400], P),
  'solar-inverter': wall(E, 1500, [450, 150, 550], P),
  changeover: wall(E, 1500, [300, 150, 400], P),
  'earth-pit': floor(E, 0, [400, 400, 50], P),
  chime: wall(E, 2100, [150, 60, 150], L),
  // Fans are wired as lights are (on a lighting or power circuit), so they sit with the electrics.
  'fan-ceiling': ci(0, [1400, 1400, 350], LP),
  'fan-exhaust': wall(E, 2400, [300, 150, 300], LP),
  'fan-wall': wall(E, 2100, [450, 300, 450], LP),
  'ac-split': wall('hvac', 2100, [1000, 250, 320], ['ac', 'drain']),
  'ac-outdoor': floor('hvac', 0, [850, 350, 650], ['ac']),
  'ac-window': wall('hvac', 1500, [650, 700, 450], ['ac']),
  'ac-cassette': ci(0, [840, 840, 300], ['ac', 'drain'], 'hvac'),
  'cooler-point': wall(E, 1800, [86, 30, 86], P),
  'water-meter': floor('plumbing', 0, [250, 150, 150], COLD),
  'tank-overhead': floor('plumbing', 0, [1300, 1300, 1500], COLD),
  'tank-underground': floor('plumbing', -1800, [2400, 1800, 1800], COLD),
  pump: floor('plumbing', 0, [450, 250, 300], [...COLD, 'power']),
  geyser: wall('plumbing', 1800, [450, 450, 700], [...WATER, 'power']),
  'geyser-gas': floor('plumbing', 0, [550, 550, 1500], [...WATER, 'gas']),
  valve: wall('plumbing', 600, [100, 80, 100], WATER),
  tap: wall('plumbing', 800, [60, 150, 60], WATER),
  mixer: wall('plumbing', 1000, [200, 120, 80], WATER),
  'shower-head': wall('plumbing', 2100, [200, 300, 60], WATER),
  'hand-shower': wall('plumbing', 600, [80, 80, 150], COLD),
  'garden-tap': wall('plumbing', 600, [60, 150, 60], COLD),
  'washer-point': wall('plumbing', 900, [100, 60, 100], [...COLD, ...DRAIN]),
  'water-filter': wall('plumbing', 1200, [350, 200, 450], COLD),
  'floor-trap': floor('drainage', 0, [150, 150, 10], DRAIN),
  'gully-trap': floor('drainage', 0, [450, 450, 30], [...DRAIN, 'rain']),
  manhole: floor('drainage', 0, [600, 600, 40], [...DRAIN, 'rain']),
  'septic-tank': floor('drainage', -1500, [2400, 1200, 1500], DRAIN),
  'soakage-pit': floor('drainage', -2000, [1500, 1500, 2000], DRAIN),
  'rain-outlet': floor('drainage', 0, [150, 150, 10], ['rain']),
  downpipe: wall('drainage', 1500, [100, 100, 3000], ['rain']),
  'vent-pipe': wall('drainage', 1500, [75, 75, 3000], DRAIN),
  'clean-out': floor('drainage', 0, [150, 150, 20], DRAIN),
  'gas-meter': wall('gas', 900, [350, 200, 300], ['gas']),
  'gas-valve': wall('gas', 900, [80, 80, 80], ['gas']),
  'tv-point': wall('data', 300, [86, 30, 86], ['data']),
  'data-point': wall('data', 300, [86, 30, 86], ['data']),
  'phone-point': wall('data', 300, [86, 30, 86], ['data']),
  router: wall('data', 1800, [250, 150, 50], ['data', 'power']),
  cctv: wall('data', 2700, [150, 250, 150], ['data']),
  intercom: wall('data', 1400, [120, 40, 200], ['data']),
  'video-phone': wall('data', 1400, [150, 40, 220], ['data']),
  'smoke-detector': ci(0, [120, 120, 50], ['fire'], 'fire'),
  'heat-detector': ci(0, [120, 120, 50], ['fire'], 'fire'),
  extinguisher: wall('fire', 1000, [180, 180, 500], []),
  'call-point': wall('fire', 1400, [90, 50, 90], ['fire']),
  'fire-bell': wall('fire', 2300, [150, 80, 150], ['fire']),
};

/** A library item that is a service point. */
export const isService = (kind?: string): boolean => !!kind && kind in SERVICES;
export const serviceOf = (f: Pick<Furniture, 'kind'>): ServiceInfo | null => (f.kind && SERVICES[f.kind]) || null;

/**
 * Whether a service point stands in the way on the floor, as furniture does (a tank, a pump, an outdoor
 * AC unit): ceiling and wall points, and traps, manholes and the like flush with the floor, don't.
 */
export function standsOnFloor(f: Pick<Furniture, 'kind' | 'elevMm'>): boolean {
  const info = serviceOf(f);
  return !info || (info.mount === 'floor' && (f.elevMm ?? info.heightMm) >= 0 && info.size3d[2] >= 300);
}

/** The trade of a service point or run (null for anything else). */
export function tradeOf(el: PlanElement): ServiceTrade | null {
  if (el.type === 'run') return RUN_SYSTEMS[el.system]?.trade ?? null;
  return el.type === 'furniture' ? (serviceOf(el)?.trade ?? null) : null;
}
export const SERVICE_KINDS = FURNITURE_KINDS.filter((k) => isService(k));
export const DEFAULT_SERVICE_KIND: FurnitureKind = 'light-ceiling';

/** The kinds of run, with their trade, how they draw, and their usual size (mm). */
export const RUN_SYSTEMS: Record<
  RunSystem,
  { label: string; trade: ServiceTrade; wire: boolean; color: string; dash: number[]; sizeMm: number }
> = {
  lighting: { label: 'Lighting circuit', trade: 'electrical', wire: true, color: '#d97706', dash: [6, 4], sizeMm: 1.5 },
  power: { label: 'Power circuit', trade: 'electrical', wire: true, color: '#dc2626', dash: [6, 4], sizeMm: 4 },
  ac: { label: 'AC circuit', trade: 'hvac', wire: true, color: '#7c3aed', dash: [10, 3, 2, 3], sizeMm: 6 },
  data: { label: 'Data, TV and phone', trade: 'data', wire: true, color: '#0891b2', dash: [2, 3], sizeMm: 0 },
  fire: { label: 'Fire alarm', trade: 'fire', wire: true, color: '#e11d48', dash: [8, 2, 2, 2], sizeMm: 1.5 },
  cold: { label: 'Cold water', trade: 'plumbing', wire: false, color: '#2563eb', dash: [], sizeMm: 19 },
  hot: { label: 'Hot water', trade: 'plumbing', wire: false, color: '#ea580c', dash: [12, 3], sizeMm: 13 },
  drain: {
    label: 'Drainage (soil and waste)',
    trade: 'drainage',
    wire: false,
    color: '#78350f',
    dash: [],
    sizeMm: 100,
  },
  rain: { label: 'Rainwater', trade: 'drainage', wire: false, color: '#0d9488', dash: [14, 4], sizeMm: 75 },
  gas: { label: 'Gas', trade: 'gas', wire: false, color: '#ca8a04', dash: [14, 3, 3, 3], sizeMm: 13 },
};

export const RUN_ORDER = Object.keys(RUN_SYSTEMS) as RunSystem[];
export const isRunSystem = (v: unknown): v is RunSystem => typeof v === 'string' && v in RUN_SYSTEMS;

/** Library fixtures (not Services items) that pipes join: WCs, basins, sinks, showers and the like. */
export const FIXTURE_RUNS: Partial<Record<FurnitureKind, RunSystem[]>> = {
  wc: [...COLD, ...DRAIN],
  'wc-indian': [...COLD, ...DRAIN],
  basin: [...WATER, ...DRAIN],
  'basin-row': [...WATER, ...DRAIN],
  sink: [...WATER, ...DRAIN],
  shower: [...WATER, ...DRAIN],
  bathtub: [...WATER, ...DRAIN],
  urinal: [...COLD, ...DRAIN],
  'washing-machine': [...COLD, ...DRAIN, 'power'],
  stove: ['gas'],
  fridge: ['power'],
  'water-cooler': [...COLD, 'power'],
  'accessible-wc': [...COLD, ...DRAIN],
  'wc-cubicle': [...COLD, ...DRAIN],
};

/** The runs an item takes: a Services item's own, or a fixture's. */
export function runsOf(f: Pick<Furniture, 'kind'>): RunSystem[] {
  if (!f.kind) return [];
  return SERVICES[f.kind]?.runs ?? FIXTURE_RUNS[f.kind] ?? [];
}

/** Where runs join an item on the plan: its centre. */
export const joinPoint = (f: Pick<Furniture, 'x' | 'y'>): Point => ({ x: f.x, y: f.y });

/** Items on the plan a run can join (services and fixtures). */
export function joinable(elements: PlanElement[]): Furniture[] {
  return elements.filter((el): el is Furniture => el.type === 'furniture' && runsOf(el).length > 0);
}

export const serviceName = (kind: FurnitureKind) => FURNITURE_CATALOG[kind].name;

/** The tools that place library items. */
export const PLACING_TOOLS: string[] = ['furniture', 'services'];

/** The library item placed next: the Services tool's own pick, or the Furniture tool's. */
export const kindPlaced = (s: { tool: string; serviceKind: FurnitureKind; furnitureKind: FurnitureKind }) =>
  s.tool === 'services' ? s.serviceKind : s.furnitureKind;

/**
 * Runs follow the items their ends are joined to: an end moves with its item, and lets go of one
 * that has gone (or is no longer something a run can join).
 */
export function syncRuns(doc: PlanDoc): PlanDoc {
  if (!doc.elements.some((el) => el.type === 'run' && (el.from || el.to))) return doc;
  const byId = new Map(doc.elements.map((el) => [el.id, el]));
  let changed = false;
  const elements = doc.elements.map((el) => {
    if (el.type !== 'run' || (!el.from && !el.to)) return el;
    let out: ServiceRun = el;
    const end = (key: 'from' | 'to', index: number) => {
      const id = out[key];
      if (!id) return;
      const item = byId.get(id);
      if (!item || item.type !== 'furniture' || !runsOf(item).length) {
        out = { ...out };
        delete out[key];
        return;
      }
      const p = joinPoint(item);
      const i = index < 0 ? out.points.length - 1 : index;
      const at = out.points[i];
      if (Math.abs(at.x - p.x) > 1e-6 || Math.abs(at.y - p.y) > 1e-6)
        out = { ...out, points: out.points.map((q, j) => (j === i ? p : q)) };
    };
    end('from', 0);
    end('to', -1);
    if (out !== el) changed = true;
    return out;
  });
  return changed ? { ...doc, elements } : doc;
}

/** Joins copied with items point at the copies (`idMap`), or let go when the item wasn't copied. */
export function remapJoins<T extends PlanElement>(el: T, idMap: Map<string, string>): T {
  if (el.type !== 'run') return el;
  const out = { ...el, from: el.from && idMap.get(el.from), to: el.to && idMap.get(el.to) };
  if (!out.from) delete out.from;
  if (!out.to) delete out.to;
  return out;
}

/** Whether a run is drawn curved: wires are, as on electrical drawings, unless set straight; pipes never. */
export const runCurved = (r: Pick<ServiceRun, 'system' | 'straight'>) => RUN_SYSTEMS[r.system].wire && !r.straight;

/**
 * The SVG path of a run: straight lines from point to point, or for a curved wire, each leg a gentle
 * arc bowing to one side (the way circuits are drawn between a switch and its lights).
 */
export function runPath(r: Pick<ServiceRun, 'system' | 'straight' | 'points'>): string {
  const pts = r.points;
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const curved = runCurved(r);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!curved) {
      d += ` L ${b.x} ${b.y}`;
      continue;
    }
    const c = bowControl(a, b);
    d += ` Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  }
  return d;
}

/** The control point of a curved wire's leg from a to b. */
function bowControl(a: Point, b: Point): Point {
  const bow = 0.18;
  return { x: (a.x + b.x) / 2 - (b.y - a.y) * bow, y: (a.y + b.y) / 2 + (b.x - a.x) * bow };
}

/** A curved wire's legs as short straight pieces (for DXF), following the same arcs as on the plan. */
export function curvedRunPoints(pts: Point[], steps = 8): Point[] {
  if (pts.length < 2) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = bowControl(a, b);
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
    }
  }
  return out;
}

/** A short tag for a Services item on a DXF or a legend, as used on Pakistani services drawings. */
const TAGS: Partial<Record<FurnitureKind, string>> = {
  'light-ceiling': 'L',
  downlight: 'DL',
  pendant: 'PL',
  'tube-light': 'TL',
  'wall-light': 'WL',
  'garden-light': 'GL',
  'gate-light': 'GTL',
  'emergency-light': 'EL',
  'switch-1': 'S1',
  'switch-2': 'S2',
  'switch-board': 'SB',
  regulator: 'R',
  'bell-push': 'BP',
  socket: 'SO',
  'socket-power': 'PS',
  'socket-usb': 'USB',
  'socket-outdoor': 'WPS',
  'ac-isolator': 'ACI',
  'cooker-point': 'CP',
  db: 'DB',
  meter: 'KWH',
  ups: 'UPS',
  'solar-inverter': 'INV',
  changeover: 'CO',
  'earth-pit': 'E',
  chime: 'CH',
  'fan-ceiling': 'F',
  'fan-exhaust': 'EF',
  'fan-wall': 'WF',
  'ac-split': 'AC',
  'ac-outdoor': 'ACO',
  'ac-window': 'WAC',
  'ac-cassette': 'CAC',
  'cooler-point': 'CLR',
  'water-meter': 'WM',
  'tank-overhead': 'OHT',
  'tank-underground': 'UGT',
  pump: 'P',
  geyser: 'GY',
  'geyser-gas': 'GGY',
  valve: 'V',
  tap: 'T',
  mixer: 'MX',
  'shower-head': 'SH',
  'hand-shower': 'HS',
  'garden-tap': 'GT',
  'washer-point': 'WP',
  'water-filter': 'FLT',
  'floor-trap': 'FT',
  'gully-trap': 'GTR',
  manhole: 'MH',
  'septic-tank': 'ST',
  'soakage-pit': 'SP',
  'rain-outlet': 'RWO',
  downpipe: 'RWP',
  'vent-pipe': 'VP',
  'clean-out': 'CLO',
  'gas-meter': 'GM',
  'gas-valve': 'GV',
  'tv-point': 'TV',
  'data-point': 'D',
  'phone-point': 'TEL',
  router: 'WIFI',
  cctv: 'CCTV',
  intercom: 'IC',
  'video-phone': 'VDP',
  'smoke-detector': 'SD',
  'heat-detector': 'HD',
  extinguisher: 'FE',
  'call-point': 'MCP',
  'fire-bell': 'FB',
};
export const serviceTag = (kind: FurnitureKind): string => TAGS[kind] ?? serviceName(kind);

/** A run's length on the plan, in plan units (along its legs; a curved leg counts as its chord). */
export function runLength(r: Pick<ServiceRun, 'points'>): number {
  let l = 0;
  for (let i = 1; i < r.points.length; i++)
    l += Math.hypot(r.points[i].x - r.points[i - 1].x, r.points[i].y - r.points[i - 1].y);
  return l;
}

/** A pipe's size label, e.g. "Ø 19" (mm); wires carry none on the plan. */
export function runSizeLabel(r: Pick<ServiceRun, 'system' | 'sizeMm'>): string {
  const sys = RUN_SYSTEMS[r.system];
  if (sys.wire) return '';
  return `Ø ${Math.round(r.sizeMm ?? sys.sizeMm)}`;
}

/** IFC4 classes Services items and pipes become (each takes a PredefinedType after the element's own attributes). */
export type ServiceIfcClass =
  | 'IFCLIGHTFIXTURE'
  | 'IFCSWITCHINGDEVICE'
  | 'IFCOUTLET'
  | 'IFCELECTRICDISTRIBUTIONBOARD'
  | 'IFCELECTRICAPPLIANCE'
  | 'IFCFAN'
  | 'IFCUNITARYEQUIPMENT'
  | 'IFCSANITARYTERMINAL'
  | 'IFCVALVE'
  | 'IFCTANK'
  | 'IFCPUMP'
  | 'IFCFLOWMETER'
  | 'IFCWASTETERMINAL'
  | 'IFCDISTRIBUTIONCHAMBERELEMENT'
  | 'IFCPIPESEGMENT'
  | 'IFCCOMMUNICATIONSAPPLIANCE'
  | 'IFCSENSOR'
  | 'IFCALARM'
  | 'IFCFIRESUPPRESSIONTERMINAL'
  | 'IFCBUILDINGELEMENTPROXY';

const IFC_OF: Partial<Record<FurnitureKind, ServiceIfcClass>> = {
  regulator: 'IFCSWITCHINGDEVICE',
  'bell-push': 'IFCSWITCHINGDEVICE',
  'switch-board': 'IFCSWITCHINGDEVICE',
  changeover: 'IFCSWITCHINGDEVICE',
  'ac-isolator': 'IFCSWITCHINGDEVICE',
  'cooker-point': 'IFCOUTLET',
  'cooler-point': 'IFCOUTLET',
  db: 'IFCELECTRICDISTRIBUTIONBOARD',
  meter: 'IFCFLOWMETER',
  'water-meter': 'IFCFLOWMETER',
  'gas-meter': 'IFCFLOWMETER',
  ups: 'IFCELECTRICAPPLIANCE',
  'solar-inverter': 'IFCELECTRICAPPLIANCE',
  chime: 'IFCALARM',
  'earth-pit': 'IFCBUILDINGELEMENTPROXY',
  'ac-split': 'IFCUNITARYEQUIPMENT',
  'ac-outdoor': 'IFCUNITARYEQUIPMENT',
  'ac-window': 'IFCUNITARYEQUIPMENT',
  'ac-cassette': 'IFCUNITARYEQUIPMENT',
  'tank-overhead': 'IFCTANK',
  'tank-underground': 'IFCTANK',
  'septic-tank': 'IFCTANK',
  pump: 'IFCPUMP',
  geyser: 'IFCTANK',
  'geyser-gas': 'IFCTANK',
  valve: 'IFCVALVE',
  'gas-valve': 'IFCVALVE',
  'water-filter': 'IFCBUILDINGELEMENTPROXY',
  'floor-trap': 'IFCWASTETERMINAL',
  'gully-trap': 'IFCWASTETERMINAL',
  'rain-outlet': 'IFCWASTETERMINAL',
  'clean-out': 'IFCWASTETERMINAL',
  manhole: 'IFCDISTRIBUTIONCHAMBERELEMENT',
  'soakage-pit': 'IFCDISTRIBUTIONCHAMBERELEMENT',
  downpipe: 'IFCPIPESEGMENT',
  'vent-pipe': 'IFCPIPESEGMENT',
  'smoke-detector': 'IFCSENSOR',
  'heat-detector': 'IFCSENSOR',
  'call-point': 'IFCALARM',
  'fire-bell': 'IFCALARM',
  extinguisher: 'IFCFIRESUPPRESSIONTERMINAL',
};

/** The IFC class of a Services item. */
export function serviceIfcClass(kind: FurnitureKind): ServiceIfcClass {
  const own = IFC_OF[kind];
  if (own) return own;
  const info = SERVICES[kind];
  if (!info) return 'IFCBUILDINGELEMENTPROXY';
  if (kind.startsWith('switch')) return 'IFCSWITCHINGDEVICE';
  if (kind.startsWith('socket')) return 'IFCOUTLET';
  if (kind.startsWith('fan')) return 'IFCFAN';
  if (info.trade === 'data') return 'IFCCOMMUNICATIONSAPPLIANCE';
  if (info.trade === 'plumbing') return 'IFCSANITARYTERMINAL';
  if (info.trade === 'electrical' && info.runs.includes('lighting')) return 'IFCLIGHTFIXTURE';
  return 'IFCBUILDINGELEMENTPROXY';
}

/** What each service class is made of, when its item has no material. */
export const SERVICE_IFC_MATERIALS: Record<Exclude<ServiceIfcClass, 'IFCBUILDINGELEMENTPROXY'>, string> = {
  IFCLIGHTFIXTURE: 'Electrical fitting',
  IFCSWITCHINGDEVICE: 'Electrical fitting',
  IFCOUTLET: 'Electrical fitting',
  IFCELECTRICDISTRIBUTIONBOARD: 'Steel',
  IFCELECTRICAPPLIANCE: 'Electrical fitting',
  IFCFAN: 'Electrical fitting',
  IFCUNITARYEQUIPMENT: 'Steel',
  IFCSANITARYTERMINAL: 'Chrome-plated brass',
  IFCVALVE: 'Brass',
  IFCTANK: 'Plastic',
  IFCPUMP: 'Steel',
  IFCFLOWMETER: 'Brass',
  IFCWASTETERMINAL: 'Plastic',
  IFCDISTRIBUTIONCHAMBERELEMENT: 'Concrete',
  IFCPIPESEGMENT: 'Plastic',
  IFCCOMMUNICATIONSAPPLIANCE: 'Electrical fitting',
  IFCSENSOR: 'Electrical fitting',
  IFCALARM: 'Electrical fitting',
  IFCFIRESUPPRESSIONTERMINAL: 'Steel',
};
