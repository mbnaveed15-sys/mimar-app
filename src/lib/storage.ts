import type { Mask, Material, PlanDoc, PlanElement } from '../types';
import { defaultMaterials } from './materials';

export const STORAGE_KEY = 'mimar.plan';
export const CURRENT_VERSION = 2;
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
  return { elements: [], masks: [], materials: defaultMaterials() };
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
const idOf = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));

function normaliseElement(raw: unknown): PlanElement | null {
  if (!isObject(raw)) return null;
  const base = { id: idOf(raw.id) ?? '', material: idOf(raw.material) };
  if (!base.id) return null;
  const num = (k: string) => (typeof raw[k] === 'number' ? (raw[k] as number) : NaN);
  switch (raw.type) {
    case 'wall': {
      const el = { ...base, type: 'wall' as const, x1: num('x1'), y1: num('y1'), x2: num('x2'), y2: num('y2') };
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
        label: typeof raw.label === 'string' ? raw.label : undefined,
      };
      return [el.x, el.y, el.w, el.h].every(Number.isFinite) ? el : null;
    }
    default:
      return null;
  }
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

function normaliseMaterial(raw: unknown): Material | null {
  if (!isObject(raw) || raw.id === undefined) return null;
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : 'Material',
    color: typeof raw.color === 'string' ? raw.color : '#ffffff',
    texture: typeof raw.texture === 'string' ? raw.texture : '',
    type: typeof raw.type === 'string' ? raw.type : undefined,
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
    masks: list(obj.masks)
      .map(normaliseMask)
      .filter((m): m is Mask => m !== null),
    materials: materials.length ? materials : defaultMaterials(),
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
