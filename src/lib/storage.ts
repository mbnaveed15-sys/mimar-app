import {
  GROUND_LEVEL,
  type ComponentDef,
  type Group,
  type Level,
  type Mask,
  type Material,
  type Pattern,
  type PlanDoc,
  type PlanElement,
  type Point,
  type Room,
} from '../types';
import { isFurnitureKind } from '../furniture/catalog';
import { LAYERS, type LayerState } from './layers';
import { defaultMaterials, PATTERNS } from './materials';

export const STORAGE_KEY = 'mimar.plan';
/** 4 added groups and components; 5 added levels, columns, beams and slabs. */
export const CURRENT_VERSION = 5;
const CORRUPT_BACKUP_KEY = 'mimar.plan.corrupt';

// Version 1 (Mimar 1.1–1.3) stored each part under its own key with numeric ids.
const LEGACY_KEYS = {
  elements: 'planner.elements',
  materials: 'planner.materials',
  masks: 'planner.masks',
} as const;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export interface LoadResult {
  doc: PlanDoc;
  warning?: string;
}

export function emptyDoc(): PlanDoc {
  return {
    elements: [],
    rooms: [],
    masks: [],
    materials: defaultMaterials(),
    groups: [],
    components: [],
    levels: defaultLevels(),
    plinthMm: DEFAULT_PLINTH_MM,
  };
}

/** 1' 6" above natural ground, common for Pakistani houses. */
export const DEFAULT_PLINTH_MM = 457.2;

export function defaultLevels(): Level[] {
  return [{ id: GROUND_LEVEL, name: 'Ground floor' }];
}

/** localStorage when it is usable, otherwise null (private mode, tests, blocked storage). */
export function browserStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
/** Hidden and locked, kept only when set. */
const flagsOf = (raw: Record<string, unknown>) => ({
  ...(raw.hidden === true ? { hidden: true } : {}),
  ...(raw.locked === true ? { locked: true } : {}),
});

/** Layer settings, keeping only known layers and true flags. */
function normaliseLayers(raw: unknown): LayerState | undefined {
  if (!isObject(raw)) return undefined;
  const out: LayerState = {};
  for (const { id } of LAYERS) {
    const v = raw[id];
    if (isObject(v) && (v.hidden === true || v.locked === true)) out[id] = flagsOf(v);
  }
  return Object.keys(out).length ? out : undefined;
}

const idOf = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));

function normaliseElement(raw: unknown): PlanElement | null {
  if (!isObject(raw)) return null;
  const base = {
    id: idOf(raw.id) ?? '',
    material: idOf(raw.material),
    groupId: idOf(raw.groupId),
    defKey: idOf(raw.defKey),
    levelId: idOf(raw.levelId),
    ...flagsOf(raw),
  };
  if (!base.id) return null;
  const num = (k: string) => (typeof raw[k] === 'number' ? (raw[k] as number) : NaN);
  switch (raw.type) {
    case 'wall': {
      const thickness = num('thickness');
      const el = {
        ...base,
        type: 'wall' as const,
        x1: num('x1'),
        y1: num('y1'),
        x2: num('x2'),
        y2: num('y2'),
        thickness: thickness > 0 ? thickness : undefined,
        kind: raw.kind === 'boundary' || raw.kind === 'parapet' ? (raw.kind as 'boundary' | 'parapet') : undefined,
        heightMm: num('heightMm') > 0 ? num('heightMm') : undefined,
      };
      return [el.x1, el.y1, el.x2, el.y2].every(Number.isFinite) ? el : null;
    }
    case 'door':
    case 'window': {
      const el = {
        ...base,
        type: raw.type,
        wallId: idOf(raw.wallId) ?? '',
        x: num('x'),
        y: num('y'),
        angle: num('angle'),
        width: num('width'),
        flipSide: raw.flipSide === true || undefined,
        flipHinge: raw.flipHinge === true || undefined,
        gate: raw.gate === true || undefined,
      };
      return el.wallId && [el.x, el.y, el.angle, el.width].every(Number.isFinite) ? el : null;
    }
    case 'furniture': {
      const el = {
        ...base,
        type: 'furniture' as const,
        x: num('x'),
        y: num('y'),
        w: num('w'),
        h: num('h'),
        rotation: typeof raw.rotation === 'number' && Number.isFinite(raw.rotation) ? raw.rotation : undefined,
        kind: isFurnitureKind(raw.kind) ? raw.kind : undefined,
        label: typeof raw.label === 'string' ? raw.label : undefined,
      };
      return [el.x, el.y, el.w, el.h].every(Number.isFinite) ? el : null;
    }
    case 'column': {
      const el = {
        ...base,
        type: 'column' as const,
        x: num('x'),
        y: num('y'),
        w: num('w'),
        h: num('h'),
        rotation: typeof raw.rotation === 'number' && Number.isFinite(raw.rotation) ? raw.rotation : undefined,
        shape: raw.shape === 'round' ? ('round' as const) : ('rect' as const),
      };
      return [el.x, el.y, el.w, el.h].every(Number.isFinite) && el.w > 0 && el.h > 0 ? el : null;
    }
    case 'line': {
      const el = { ...base, type: 'line' as const, x1: num('x1'), y1: num('y1'), x2: num('x2'), y2: num('y2') };
      return [el.x1, el.y1, el.x2, el.y2].every(Number.isFinite) ? el : null;
    }
    case 'beam': {
      const el = {
        ...base,
        type: 'beam' as const,
        x1: num('x1'),
        y1: num('y1'),
        x2: num('x2'),
        y2: num('y2'),
        width: num('width'),
        depth: num('depth'),
      };
      return [el.x1, el.y1, el.x2, el.y2, el.width, el.depth].every(Number.isFinite) ? el : null;
    }
    case 'slab': {
      const points = readPoints(raw.points);
      const thickness = num('thickness');
      return points.length >= 3 && thickness > 0 ? { ...base, type: 'slab' as const, points, thickness } : null;
    }
    case 'plot': {
      const points = readPoints(raw.points);
      const sb = isObject(raw.setbacks) ? raw.setbacks : {};
      const mm = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : 0);
      if (points.length < 3) return null;
      const front = Number.isInteger(raw.front) && (raw.front as number) < points.length ? (raw.front as number) : 0;
      return {
        ...base,
        type: 'plot' as const,
        points,
        front,
        setbacks: { front: mm(sb.front), rear: mm(sb.rear), sides: mm(sb.sides) },
      };
    }
    case 'stair': {
      const shape = ['straight', 'L', 'U', 'ramp'].includes(raw.shape as string)
        ? (raw.shape as 'straight')
        : 'straight';
      const el = {
        ...base,
        type: 'stair' as const,
        x: num('x'),
        y: num('y'),
        rotation: typeof raw.rotation === 'number' && Number.isFinite(raw.rotation) ? raw.rotation : undefined,
        shape,
        width: num('width'),
        riseMm: num('riseMm'),
        riserMm: num('riserMm'),
        treadMm: num('treadMm'),
        w: num('w'),
        h: num('h'),
      };
      const ok = [el.x, el.y, el.width, el.riseMm, el.riserMm, el.treadMm, el.w, el.h].every(
        (v) => Number.isFinite(v) && v >= 0,
      );
      return ok && el.width > 0 ? el : null;
    }
    default:
      return null;
  }
}

function readPoints(raw: unknown): Point[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((p): p is Point => isObject(p) && typeof p.x === 'number' && typeof p.y === 'number')
    .map(({ x, y }) => ({ x, y }));
}

function normaliseLevels(raw: unknown): Level[] {
  const levels = (Array.isArray(raw) ? raw : [])
    .filter((l): l is Record<string, unknown> => isObject(l) && l.id !== undefined)
    .map((l) => ({ id: String(l.id), name: typeof l.name === 'string' ? l.name : 'Floor' }));
  // The ground floor always exists and comes first.
  const ground = levels.find((l) => l.id === GROUND_LEVEL) ?? defaultLevels()[0];
  return [ground, ...levels.filter((l) => l.id !== GROUND_LEVEL)];
}

function normaliseMask(raw: unknown, index: number): Mask | null {
  if (!isObject(raw) || !Array.isArray(raw.points)) return null;
  const points = raw.points.filter(
    (p): p is { x: number; y: number } => isObject(p) && typeof p.x === 'number' && typeof p.y === 'number',
  );
  if (points.length < 3) return null;
  return {
    id: idOf(raw.id) ?? `mask-${index}`,
    name: typeof raw.name === 'string' ? raw.name : `Mask-${index + 1}`,
    points: points.map(({ x, y }) => ({ x, y })),
    material: idOf(raw.material),
  };
}

function normaliseRoom(raw: unknown, index: number): Room | null {
  const mask = normaliseMask(raw, index);
  if (!mask) return null;
  const obj = raw as Record<string, unknown>;
  return {
    id: idOf(obj.id) ?? `room-${index}`,
    name: typeof obj.name === 'string' ? obj.name : `Room ${index + 1}`,
    points: mask.points,
    material: mask.material,
    groupId: idOf(obj.groupId),
    defKey: idOf(obj.defKey),
    levelId: idOf(obj.levelId),
    ...flagsOf(obj),
  };
}

function normaliseGroup(raw: unknown): Group | null {
  if (!isObject(raw) || raw.id === undefined) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : 'Group',
    componentId: idOf(raw.componentId),
    x: num(raw.x),
    y: num(raw.y),
    rotation: num(raw.rotation),
  };
}

function normaliseComponent(raw: unknown): ComponentDef | null {
  if (!isObject(raw) || raw.id === undefined) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : 'Component',
    elements: list(raw.elements)
      .map(normaliseElement)
      .filter((e): e is PlanElement => e !== null),
    rooms: list(raw.rooms)
      .map(normaliseRoom)
      .filter((r): r is Room => r !== null),
  };
}

function normaliseMaterial(raw: unknown): Material | null {
  if (!isObject(raw) || raw.id === undefined) return null;
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : 'Material',
    color: typeof raw.color === 'string' ? raw.color : '#ffffff',
    texture: typeof raw.texture === 'string' ? raw.texture : '',
    type: typeof raw.type === 'string' ? raw.type : undefined,
    ...(typeof raw.pattern === 'string' && PATTERNS.includes(raw.pattern as Pattern)
      ? { pattern: raw.pattern as Pattern }
      : {}),
    ...(typeof raw.sizeMm === 'number' && raw.sizeMm > 0 ? { sizeMm: raw.sizeMm } : {}),
  };
}

/** Coerce any stored shape into a valid PlanDoc, dropping entries that can't be read. */
export function normaliseDoc(raw: unknown): PlanDoc {
  const obj = isObject(raw) ? raw : {};
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const materials = list(obj.materials)
    .map(normaliseMaterial)
    .filter((m): m is Material => m !== null);
  return {
    elements: list(obj.elements)
      .map(normaliseElement)
      .filter((e): e is PlanElement => e !== null),
    rooms: list(obj.rooms)
      .map(normaliseRoom)
      .filter((r): r is Room => r !== null),
    masks: list(obj.masks)
      .map(normaliseMask)
      .filter((m): m is Mask => m !== null),
    materials: materials.length ? materials : defaultMaterials(),
    groups: list(obj.groups)
      .map(normaliseGroup)
      .filter((g): g is Group => g !== null),
    components: list(obj.components)
      .map(normaliseComponent)
      .filter((c): c is ComponentDef => c !== null),
    levels: normaliseLevels(obj.levels),
    plinthMm:
      typeof obj.plinthMm === 'number' && obj.plinthMm >= 0 && obj.plinthMm <= 3000 ? obj.plinthMm : DEFAULT_PLINTH_MM,
    ...(normaliseLayers(obj.layers) ? { layers: normaliseLayers(obj.layers) } : {}),
  };
}

function readLegacy(storage: KeyValueStore): PlanDoc | null {
  const parts = Object.fromEntries(Object.entries(LEGACY_KEYS).map(([k, key]) => [k, storage.getItem(key)])) as Record<
    keyof typeof LEGACY_KEYS,
    string | null
  >;
  if (!parts.elements && !parts.materials && !parts.masks) return null;
  const parse = (s: string | null) => {
    if (!s) return undefined;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return undefined;
    }
  };
  return normaliseDoc({
    elements: parse(parts.elements),
    materials: parse(parts.materials),
    masks: parse(parts.masks),
  });
}

export function loadPlan(storage: KeyValueStore | null = browserStorage()): LoadResult {
  if (!storage) return { doc: emptyDoc() };
  let stored: string | null;
  try {
    stored = storage.getItem(STORAGE_KEY);
  } catch {
    return { doc: emptyDoc(), warning: 'Saved plans could not be accessed.' };
  }

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (isObject(parsed) && isObject(parsed.doc)) return { doc: normaliseDoc(parsed.doc) };
      throw new Error('unexpected format');
    } catch {
      try {
        storage.setItem(CORRUPT_BACKUP_KEY, stored);
      } catch {
        // backup is best-effort
      }
      return {
        doc: emptyDoc(),
        warning: 'Your saved plan could not be read, so a new plan was started. A backup of the old data was kept.',
      };
    }
  }

  // First launch after upgrading: carry over the plan saved by the old version.
  // The legacy keys are left in place so nothing is lost if the user goes back.
  const legacy = readLegacy(storage);
  if (legacy) {
    savePlan(legacy, storage);
    return { doc: legacy };
  }
  return { doc: emptyDoc() };
}

export function savePlan(doc: PlanDoc, storage: KeyValueStore | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: CURRENT_VERSION, doc }));
  } catch {
    // Quota exceeded or storage blocked: keep working in memory.
  }
}
