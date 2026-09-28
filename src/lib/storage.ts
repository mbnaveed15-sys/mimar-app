import { cleanText } from './text';
import { MAX_RISE_MM } from './site';
import {
  GROUND_LEVEL,
  type ComponentDef,
  type Group,
  type Level,
  type Mask,
  type Material,
  type Pattern,
  type PlanDoc,
  type Plot,
  type BuildingUse,
  type ProjectPanel,
  type ProjectSettings,
  type ProjectType,
  type PlotSide,
  type PlotSideKind,
  type PlanElement,
  type Point,
  type Room,
  type ShapeKind,
  type DoorKind,
  type WindowKind,
  type WallKind,
  type DrawingRef,
  type ElevationSide,
  type PaperSize,
  type Sheet,
  type SheetItem,
  type SheetScale,
  type GroundSettings,
} from '../types';
import { isFurnitureKind } from '../furniture/catalog';
import { authorityById, type AuthorityId } from './bylaws';
import { LAYERS, type LayerState } from './layers';
import { defaultMaterials, PATTERNS } from './materials';
import { DOOR_KINDS, WINDOW_KINDS } from './openingKinds';

export const STORAGE_KEY = 'mimar.plan';
/**
 * 4 added groups and components; 5 added levels, columns, beams and slabs; 9 section lines and sheets;
 * 10 the ground; 11 curved and glass walls, pitched roofs and double-height rooms.
 */
export const CURRENT_VERSION = 11;
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

/** Ground levels beyond a kilometre above or below the datum are damage, not a survey. */
const MAX_LEVEL_MM = 1_000_000;

/** Plan coordinates and sizes beyond this (100 km, in plan units) are damage, not a drawing. */
const MAX_UNITS = 10_000_000;
const sane = (v: number) => Number.isFinite(v) && Math.abs(v) <= MAX_UNITS;
const nameOf = (v: unknown, fallback: string) => (typeof v === 'string' ? cleanText(v) : fallback);

const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
/** Height above the floor and window sill, kept only when set and sensible. */
const heightsOf = (raw: Record<string, unknown>) => ({
  ...(inRange(raw.elevMm, -5000, 30000) && raw.elevMm !== 0 ? { elevMm: raw.elevMm } : {}),
  ...(inRange(raw.sillMm, 0, 3000) ? { sillMm: raw.sillMm } : {}),
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

const SIDE_KINDS: PlotSideKind[] = ['road', 'neighbour', 'back', 'open'];

/** A plot's sides (one per edge, at least one road) and cut corner, when they are sound. */
function plotExtras(raw: Record<string, unknown>, corners: number): Pick<Plot, 'sideList' | 'splay'> {
  const out: Pick<Plot, 'sideList' | 'splay'> = {};
  const list = raw.sideList;
  if (Array.isArray(list) && list.length === corners && list.every(isObject)) {
    const sides = list.map((side): PlotSide => {
      const kind = SIDE_KINDS.includes(side.kind as PlotSideKind) ? (side.kind as PlotSideKind) : 'neighbour';
      const wall = isObject(side.wall) ? side.wall : null;
      return {
        kind,
        ...(inRange(side.setbackMm, 0, 100000) ? { setbackMm: side.setbackMm } : {}),
        ...(wall && inRange(wall.heightMm, 1, 30000) && inRange(wall.thicknessMm, 10, 2000)
          ? { wall: { heightMm: wall.heightMm, thicknessMm: wall.thicknessMm } }
          : {}),
        ...(wall && side.wallId !== undefined ? { wallId: idOf(side.wallId) } : {}),
      };
    });
    if (sides.some((s) => s.kind === 'road')) out.sideList = sides;
  }
  const splay = isObject(raw.splay) ? raw.splay : null;
  if (splay && inRange(splay.sizeMm, 1, 100000))
    out.splay = { sizeMm: splay.sizeMm, ...(splay.wallId !== undefined ? { wallId: idOf(splay.wallId) } : {}) };
  return out;
}

function normaliseElement(raw: unknown): PlanElement | null {
  if (!isObject(raw)) return null;
  const base = {
    id: idOf(raw.id) ?? '',
    material: idOf(raw.material),
    groupId: idOf(raw.groupId),
    defKey: idOf(raw.defKey),
    levelId: idOf(raw.levelId),
    ...flagsOf(raw),
    ...heightsOf(raw),
  };
  if (!base.id) return null;
  const num = (k: string) => (typeof raw[k] === 'number' && sane(raw[k] as number) ? (raw[k] as number) : NaN);
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
        ...(Math.abs(num('bow')) > 0.05 && { bow: num('bow') }),
        kind: ['boundary', 'parapet', 'retaining', 'curtain'].includes(raw.kind as string)
          ? (raw.kind as WallKind)
          : undefined,
        heightMm: num('heightMm') > 0 ? num('heightMm') : undefined,
        ...(num('mullionMm') >= 100 && { mullionMm: num('mullionMm') }),
        ...(num('transomMm') >= 0 && { transomMm: num('transomMm') }),
        materialA: idOf(raw.materialA),
        materialB: idOf(raw.materialB),
        ...(raw.plotId !== undefined &&
        (raw.plotSide === 'splay' || (Number.isInteger(raw.plotSide) && (raw.plotSide as number) >= 0))
          ? { plotId: idOf(raw.plotId), plotSide: raw.plotSide as number | 'splay' }
          : {}),
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
        doorKind:
          raw.type === 'door' && DOOR_KINDS.includes(raw.doorKind as DoorKind) && raw.doorKind !== 'single'
            ? (raw.doorKind as DoorKind)
            : undefined,
        windowKind:
          raw.type === 'window' && WINDOW_KINDS.includes(raw.windowKind as WindowKind)
            ? (raw.windowKind as WindowKind)
            : undefined,
        ...(raw.type === 'window' ? windowShapeOf(raw) : {}),
      };
      return el.wallId && [el.x, el.y, el.angle, el.width].every(Number.isFinite) && el.width > 0 ? el : null;
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
        label: typeof raw.label === 'string' ? cleanText(raw.label) : undefined,
      };
      return [el.x, el.y, el.w, el.h].every(Number.isFinite) && el.w > 0 && el.h > 0 ? el : null;
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
        ...(inRange(raw.heightMm, 50, 30000) ? { heightMm: raw.heightMm } : {}),
      };
      return [el.x, el.y, el.w, el.h].every(Number.isFinite) && el.w > 0 && el.h > 0 ? el : null;
    }
    case 'line': {
      const el = { ...base, type: 'line' as const, x1: num('x1'), y1: num('y1'), x2: num('x2'), y2: num('y2') };
      return [el.x1, el.y1, el.x2, el.y2].every(Number.isFinite) ? el : null;
    }
    case 'section': {
      const el = {
        ...base,
        type: 'section' as const,
        x1: num('x1'),
        y1: num('y1'),
        x2: num('x2'),
        y2: num('y2'),
        label: (typeof raw.label === 'string' && cleanText(raw.label).trim().slice(0, 3)) || 'A',
        ...(raw.flip === true ? { flip: true } : {}),
      };
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
      const holes = (Array.isArray(raw.holes) ? raw.holes : []).map(readPoints).filter((h) => h.length >= 3);
      return points.length >= 3 && thickness > 0
        ? { ...base, type: 'slab' as const, points, thickness, ...(holes.length ? { holes } : {}) }
        : null;
    }
    case 'level': {
      const el = {
        ...base,
        levelId: undefined,
        type: 'level' as const,
        x: num('x'),
        y: num('y'),
        zMm: inRange(raw.zMm, -MAX_LEVEL_MM, MAX_LEVEL_MM) ? raw.zMm : NaN,
        ...(raw.approx === true ? { approx: true } : {}),
      };
      return [el.x, el.y, el.zMm].every(Number.isFinite) ? el : null;
    }
    case 'contour':
    case 'pad': {
      const points = readPoints(raw.points);
      if (points.length < (raw.type === 'pad' ? 3 : 2) || !inRange(raw.zMm, -MAX_LEVEL_MM, MAX_LEVEL_MM)) return null;
      return { ...base, levelId: undefined, type: raw.type, points, zMm: raw.zMm };
    }
    case 'context': {
      const points = readPoints(raw.points);
      const kind = raw.kind === 'road' ? ('road' as const) : ('building' as const);
      if (points.length < (kind === 'road' ? 2 : 3)) return null;
      return {
        ...base,
        levelId: undefined,
        type: 'context' as const,
        kind,
        points,
        ...(kind === 'building' && inRange(raw.heightMm, 100, 1_000_000) ? { heightMm: raw.heightMm } : {}),
        ...(kind === 'road' && inRange(raw.widthMm, 100, 200_000) ? { widthMm: raw.widthMm } : {}),
        ...(typeof raw.name === 'string' && cleanText(raw.name).trim() ? { name: cleanText(raw.name).trim() } : {}),
      };
    }
    case 'block': {
      const points = readPoints(raw.points);
      const shape = SHAPE_KINDS.includes(raw.shape as ShapeKind) ? (raw.shape as ShapeKind) : 'polygon';
      if (points.length < 3) return null;
      return {
        ...base,
        type: 'block' as const,
        points,
        heightMm: inRange(raw.heightMm, 0, 30000) ? raw.heightMm : 0,
        shape,
        slabId: idOf(raw.slabId),
      };
    }
    case 'plot': {
      const points = readPoints(raw.points);
      const sb = isObject(raw.setbacks) ? raw.setbacks : {};
      const mm = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : 0);
      if (points.length < 3) return null;
      const extras = plotExtras(raw, points.length);
      let front = Number.isInteger(raw.front) && (raw.front as number) < points.length ? (raw.front as number) : 0;
      // The main road is a road side.
      if (extras.sideList && extras.sideList[front].kind !== 'road')
        front = extras.sideList.findIndex((s) => s.kind === 'road');
      return {
        ...base,
        type: 'plot' as const,
        points,
        front,
        setbacks: {
          front: mm(sb.front),
          rear: mm(sb.rear),
          sides: mm(sb.sides),
          ...(typeof sb.side2 === 'number' && sb.side2 >= 0 ? { side2: sb.side2 } : {}),
        },
        ...extras,
        ...(authorityById(raw.authority as string) ? { authority: raw.authority as AuthorityId } : {}),
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
      const ok =
        [el.x, el.y, el.width, el.riseMm, el.riserMm, el.treadMm, el.w, el.h].every(
          (v) => Number.isFinite(v) && v >= 0,
        ) && el.riseMm <= MAX_RISE_MM;
      return ok && el.width > 0 ? el : null;
    }
    default:
      return null;
  }
}

const SHAPE_KINDS: ShapeKind[] = ['rect', 'circle', 'polygon', 'arch'];

/** A window's shape, height, and whether it is open or still flat on the wall; kept only when set. */
function windowShapeOf(raw: Record<string, unknown>) {
  const shape = (['circle', 'arch', 'polygon'] as const).find((k) => k === raw.shape);
  const profile = readPoints(raw.profile);
  return {
    ...(inRange(raw.heightMm, 50, 10000) ? { heightMm: raw.heightMm } : {}),
    ...(shape && (shape !== 'polygon' || profile.length >= 3) ? { shape } : {}),
    ...(shape === 'polygon' && profile.length >= 3 ? { profile } : {}),
    ...(raw.open === true ? { open: true } : {}),
    ...(raw.flat === true ? { flat: true, face: raw.face === -1 ? (-1 as const) : (1 as const) } : {}),
    ...(raw.flat === true && inRange(raw.depthMm, -3000, 3000) && raw.depthMm !== 0 ? { depthMm: raw.depthMm } : {}),
  };
}

function readPoints(raw: unknown): Point[] {
  return (Array.isArray(raw) ? raw : [])
    .filter(
      (p): p is Point => isObject(p) && typeof p.x === 'number' && typeof p.y === 'number' && sane(p.x) && sane(p.y),
    )
    .map(({ x, y }) => ({ x, y }));
}

const PROJECT_TYPES: ProjectType[] = ['house', 'free', 'building'];
const USES: BuildingUse[] = ['office', 'school', 'clinic', 'shop', 'mosque', 'other'];
const PANELS: ProjectPanel[] = ['bylaws', 'hints', 'roomList', 'cost'];

/** A project's type and settings, keeping only sound values (none: a house on a plot, as before 1.33). */
function normaliseProject(raw: unknown): ProjectSettings | undefined {
  if (!isObject(raw) || !PROJECT_TYPES.includes(raw.type as ProjectType)) return undefined;
  const given = isObject(raw.panels) ? raw.panels : {};
  const panels = Object.fromEntries(PANELS.filter((k) => typeof given[k] === 'boolean').map((k) => [k, given[k]]));
  return {
    type: raw.type as ProjectType,
    ...(USES.includes(raw.use as BuildingUse) ? { use: raw.use as BuildingUse } : {}),
    ...(raw.units === 'metric' || raw.units === 'imperial' ? { units: raw.units } : {}),
    ...(inRange(raw.wallHeightMm, 2000, 9000) ? { wallHeightMm: raw.wallHeightMm } : {}),
    ...(inRange(raw.slabMm, 50, 600) ? { slabMm: raw.slabMm } : {}),
    ...(Object.keys(panels).length ? { panels } : {}),
  };
}

function normaliseLevels(raw: unknown): Level[] {
  const levels = (Array.isArray(raw) ? raw : [])
    .filter((l): l is Record<string, unknown> => isObject(l) && l.id !== undefined)
    .map((l): Level => ({
      id: String(l.id),
      name: nameOf(l.name, 'Floor'),
      ...(l.basement === true && l.id !== GROUND_LEVEL ? { basement: true } : {}),
      ...(inRange(l.heightMm, 1800, 9000) ? { heightMm: l.heightMm } : {}),
    }));
  // The ground floor always exists; one basement (if any) comes before it, the other floors after.
  const ground = levels.find((l) => l.id === GROUND_LEVEL) ?? defaultLevels()[0];
  const basement = levels.find((l) => l.basement);
  const above = levels
    .filter((l) => l.id !== GROUND_LEVEL && l !== basement)
    .map((l) => {
      const plain = { ...l };
      delete plain.basement;
      return plain;
    });
  return [...(basement ? [basement] : []), ground, ...above];
}

function normaliseMask(raw: unknown, index: number): Mask | null {
  if (!isObject(raw) || !Array.isArray(raw.points)) return null;
  const points = readPoints(raw.points);
  if (points.length < 3) return null;
  return {
    id: idOf(raw.id) ?? `mask-${index}`,
    name: nameOf(raw.name, `Mask-${index + 1}`),
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
    name: nameOf(obj.name, `Room ${index + 1}`),
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
    name: nameOf(raw.name, 'Group'),
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
    name: nameOf(raw.name, 'Component'),
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
    name: nameOf(raw.name, 'Material'),
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
    ...(normaliseProject(obj.project) ? { project: normaliseProject(obj.project) } : {}),
    plinthMm:
      typeof obj.plinthMm === 'number' && obj.plinthMm >= 0 && obj.plinthMm <= 3000 ? obj.plinthMm : DEFAULT_PLINTH_MM,
    ...(normaliseLayers(obj.layers) ? { layers: normaliseLayers(obj.layers) } : {}),
    ...(typeof obj.northDeg === 'number' && Number.isFinite(obj.northDeg) && obj.northDeg % 360 !== 0
      ? { northDeg: ((obj.northDeg % 360) + 360) % 360 }
      : {}),
    ...(Array.isArray(obj.sheets) ? { sheets: normaliseSheets(obj.sheets) } : {}),
    ...(normaliseGround(obj.ground) ? { ground: normaliseGround(obj.ground) } : {}),
    ...(isObject(obj.location) && inRange(obj.location.lat, -90, 90) && inRange(obj.location.lon, -180, 180)
      ? { location: { lat: obj.location.lat, lon: obj.location.lon } }
      : {}),
  };
}

/** How the ground is finished and drawn, keeping only what differs from the defaults and is sensible. */
function normaliseGround(raw: unknown): GroundSettings | undefined {
  if (!isObject(raw)) return undefined;
  const out: GroundSettings = {
    ...(raw.grade === 'natural' ? { grade: 'natural' as const } : {}),
    ...(inRange(raw.levelMm, -MAX_LEVEL_MM, MAX_LEVEL_MM) && raw.levelMm !== 0 ? { levelMm: raw.levelMm } : {}),
    ...(inRange(raw.contourMm, 10, 100_000) ? { contourMm: raw.contourMm } : {}),
    ...(raw.cutFill === false ? { cutFill: false } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

const PAPERS: PaperSize[] = ['A4', 'A3', 'A1'];
const SCALES: SheetScale[] = [50, 100, 200];
const SIDES: ElevationSide[] = ['front', 'back', 'left', 'right'];

function normaliseDrawingRef(raw: unknown): DrawingRef | null {
  if (!isObject(raw)) return null;
  if (raw.kind === 'plan' && raw.levelId !== undefined) return { kind: 'plan', levelId: String(raw.levelId) };
  if (raw.kind === 'section' && raw.id !== undefined) return { kind: 'section', id: String(raw.id) };
  if (raw.kind === 'elevation' && SIDES.includes(raw.side as ElevationSide))
    return { kind: 'elevation', side: raw.side as ElevationSide };
  return null;
}

/** Drawing sheets, keeping only sound ones (an empty list stays: the owner cleared the sheets). */
function normaliseSheets(raw: unknown[]): Sheet[] {
  return raw
    .filter((s): s is Record<string, unknown> => isObject(s) && s.id !== undefined)
    .map((s, i) => ({
      id: String(s.id),
      name: nameOf(s.name, '').trim() || `Sheet ${i + 1}`,
      paper: PAPERS.includes(s.paper as PaperSize) ? (s.paper as PaperSize) : 'A3',
      items: (Array.isArray(s.items) ? s.items : []).flatMap((item): SheetItem[] => {
        const drawing = isObject(item) ? normaliseDrawingRef(item.drawing) : null;
        if (!drawing) return [];
        const scale = SCALES.includes((item as Record<string, unknown>).scale as SheetScale)
          ? ((item as Record<string, unknown>).scale as SheetScale)
          : 100;
        return [{ drawing, scale }];
      }),
    }));
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

/** Autosave the plan; false when it couldn't be stored (storage full or blocked). */
export function savePlan(doc: PlanDoc, storage: KeyValueStore | null = browserStorage()): boolean {
  if (!storage) return true;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: CURRENT_VERSION, doc }));
    return true;
  } catch {
    // Quota exceeded or storage blocked: keep working in memory, and say so.
    return false;
  }
}

const FILE_KEY = 'mimar.file';

/** The autosaved plan's file name and place, and whether it has changes not saved to that file. */
export interface FileInfo {
  name: string;
  path?: string;
  dirty: boolean;
}

export function saveFileInfo(info: FileInfo, storage: KeyValueStore | null = browserStorage()) {
  try {
    storage?.setItem(FILE_KEY, JSON.stringify(info));
  } catch {
    // best-effort
  }
}

export function loadFileInfo(storage: KeyValueStore | null = browserStorage()): FileInfo | null {
  try {
    const raw = JSON.parse(storage?.getItem(FILE_KEY) ?? 'null') as unknown;
    if (!isObject(raw) || typeof raw.name !== 'string' || !raw.name.trim()) return null;
    return {
      name: cleanText(raw.name),
      ...(typeof raw.path === 'string' && raw.path ? { path: raw.path } : {}),
      dirty: raw.dirty === true,
    };
  } catch {
    return null;
  }
}
