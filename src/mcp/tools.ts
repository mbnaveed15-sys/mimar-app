/**
 * The MIMAR connector's tools: what an AI agent (Claude Desktop, Claude Code, any MCP client) can do
 * with a `.mimar` plan file on this computer. Each call opens the file, works on it with the app's own
 * code (the same store, checks and exports the app uses), and saves it back when it changed.
 * Lengths and points in tool arguments are in millimetres.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { FURNITURE_CATALOG, isFurnitureKind } from '../furniture/catalog';
import { AUTHORITIES, type AuthorityId } from '../lib/bylaws';
import { planToDxf } from '../lib/exportDxf';
import { planToIfc } from '../lib/exportIfc';
import { parsePlanFile, serialisePlan } from '../lib/files';
import { fullCheck } from '../lib/fullCheck';
import { newId } from '../lib/ids';
import { withoutHidden } from '../lib/layers';
import { buildLayout, layoutSite } from '../lib/layoutBuild';
import { DEFAULT_PROGRAM, generateLayouts, type Program } from '../lib/layoutGen';
import { slabMm } from '../lib/levels';
import { DEFAULT_PREFS } from '../lib/prefs';
import { BUILDING_USES, PROJECT_TYPES, projectOf } from '../lib/project';
import { quantities } from '../lib/quantities';
import { MM_PER_UNIT } from '../lib/scale';
import { plotRect } from '../lib/site';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { structureCsv } from '../lib/structure/schedule';
import { groundOnPlan } from '../lib/terrain/groundView';
import { floorVoids } from '../lib/voids';
import { polygonArea } from '../rooms';
import { createPlannerStore } from '../store/plannerStore';
import { GROUND_LEVEL, levelOf, type PlanDoc, type PlanElement, type Plot, type Point } from '../types';

const SQ_MM_PER_SQ_FT = 92903.04;

/** A tool's description for `tools/list`, and what it does. */
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => unknown;
}

/** A mistake in what the agent asked: told back to it as a tool error, in plain words. */
export class ToolError extends Error {}

// ---------- arguments ----------

const str = (args: Record<string, unknown>, key: string, required = true): string | undefined => {
  const v = args[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolError(`"${key}" is required.`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ToolError(`"${key}" must be text.`);
  return v;
};

const num = (args: Record<string, unknown>, key: string, required = true): number | undefined => {
  const v = args[key];
  if (v === undefined || v === null) {
    if (required) throw new ToolError(`"${key}" is required.`);
    return undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ToolError(`"${key}" must be a number.`);
  return v;
};

/** A point given in mm, as plan units. */
const pointArg = (v: unknown, key: string): Point => {
  const p = v as { x?: unknown; y?: unknown } | null;
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y))
    throw new ToolError(`"${key}" must be a point like {"x": 0, "y": 0} in millimetres.`);
  return { x: p.x / MM_PER_UNIT, y: p.y / MM_PER_UNIT };
};

const mmPoint = (p: Point) => ({ x: round(p.x * MM_PER_UNIT), y: round(p.y * MM_PER_UNIT) });
const round = (v: number) => Math.round(v * 10) / 10;

// ---------- files ----------

/** A plan file's full path; only `.mimar` files are read or written as plans. */
function planPath(args: Record<string, unknown>): string {
  const path = resolve(str(args, 'path')!);
  if (extname(path).toLowerCase() !== '.mimar') throw new ToolError('"path" must be a .mimar plan file.');
  return path;
}

function readPlan(path: string): PlanDoc {
  if (!existsSync(path)) throw new ToolError(`There is no plan at ${path}.`);
  try {
    return parsePlanFile(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
}

/** Write through a temporary file, so a plan is never left half written. */
function writeText(path: string, text: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

const writePlan = (path: string, doc: PlanDoc) => writeText(path, serialisePlan(doc));

/** The app's own settings a plan doesn't carry, from the project where it has them. */
const wallHeightOf = (doc: PlanDoc) => projectOf(doc).wallHeightMm ?? DEFAULT_PREFS.wallHeightMm;
const unitsOf = (doc: PlanDoc) => projectOf(doc).units ?? DEFAULT_PREFS.units;

/** The app's store on a plan, on the floor asked for (the ground floor when none is). */
function storeOn(doc: PlanDoc, levelId?: string) {
  const store = createPlannerStore(doc, undefined, {
    ...DEFAULT_PREFS,
    wallHeightMm: wallHeightOf(doc),
    units: unitsOf(doc),
  });
  const s = () => store.getState();
  if (levelId) {
    if (!doc.levels.some((l) => l.id === levelId))
      throw new ToolError(`There is no floor "${levelId}". Floors: ${doc.levels.map((l) => l.id).join(', ')}.`);
    s().setActiveLevel(levelId);
  }
  return s;
}

/** Open a plan, change it with the app's store, and save it when it changed. */
function edit<T>(
  args: Record<string, unknown>,
  change: (s: () => ReturnType<ReturnType<typeof createPlannerStore>['getState']>) => T,
): T & { saved: boolean; warnings?: string[] } {
  const path = planPath(args);
  const doc = readPlan(path);
  const s = storeOn(doc, str(args, 'levelId', false));
  const result = change(s);
  const warnings = s().warnings.filter(Boolean);
  const saved = s().doc !== doc;
  if (saved) writePlan(path, s().doc);
  return { ...result, saved, ...(warnings.length ? { warnings } : {}) };
}

// ---------- describing a plan ----------

const sqft = (pts: Point[]) => Math.round((polygonArea(pts) * MM_PER_UNIT * MM_PER_UNIT) / SQ_MM_PER_SQ_FT);

function describe(doc: PlanDoc) {
  const counts: Record<string, Record<string, number>> = {};
  for (const el of doc.elements) {
    const lv = levelOf(el);
    counts[lv] ??= {};
    counts[lv][el.type] = (counts[lv][el.type] ?? 0) + 1;
  }
  const plots = doc.elements.filter((el): el is Plot => el.type === 'plot');
  return {
    project: projectOf(doc),
    wallHeightMm: wallHeightOf(doc),
    units: unitsOf(doc),
    floors: doc.levels.map((l) => ({
      id: l.id,
      name: l.name,
      ...(l.basement ? { basement: true } : {}),
      ...(l.site ? { site: true } : {}),
      items: counts[l.id] ?? {},
      rooms: doc.rooms
        .filter((r) => levelOf(r) === l.id)
        .map((r) => ({ id: r.id, name: r.name, areaSqFt: sqft(r.points) })),
    })),
    plots: plots.map((p) => ({
      id: p.id,
      areaSqFt: sqft(p.points),
      corners: p.points.map(mmPoint),
      authority: p.authority ?? null,
      bylawArea: p.bylawArea ?? null,
    })),
  };
}

// ---------- the tools ----------

const PATH = { type: 'string', description: 'Full path of the .mimar plan file.' };
const LEVEL = {
  type: 'string',
  description: 'Floor id (see mimar_describe_plan). The ground floor when left out.',
};
const POINT = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
  description: 'A point in millimetres; x to the right, y down the plan.',
};
const schema = (properties: Record<string, unknown>, required: string[] = ['path']) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const TOOLS: Tool[] = [
  {
    name: 'mimar_new_plan',
    description:
      'Create a new, empty MIMAR plan file. Optionally with a rectangular plot (its road along the top edge) and the authority whose bylaws apply.',
    inputSchema: schema({
      path: PATH,
      plotWidthMm: { type: 'number', description: 'Plot width along the road, mm (e.g. 35 ft = 10668).' },
      plotDepthMm: { type: 'number', description: 'Plot depth, mm.' },
      authority: { type: 'string', description: 'Bylaw authority id (see mimar_reference topic "authorities").' },
      projectType: {
        type: 'string',
        description: 'Project type id (see mimar_reference "projects"); house when left out.',
      },
      buildingUse: { type: 'string', description: 'For a building: its use id (see mimar_reference "projects").' },
      overwrite: { type: 'boolean', description: 'Replace a plan already at the path.' },
    }),
    run: (args) => {
      const path = planPath(args);
      if (existsSync(path) && args.overwrite !== true)
        throw new ToolError(`A file is already at ${path}. Pass "overwrite": true to replace it.`);
      if (!existsSync(dirname(path))) throw new ToolError(`The folder ${dirname(path)} does not exist.`);
      const s = storeOn(emptyDoc());
      const type = str(args, 'projectType', false);
      if (type) {
        if (!PROJECT_TYPES.some((t) => t.id === type)) throw new ToolError(`Unknown project type "${type}".`);
        const use = str(args, 'buildingUse', false);
        if (use && !BUILDING_USES.some((u) => u.id === use)) throw new ToolError(`Unknown building use "${use}".`);
        s().setProject({ type: type as never, ...(use ? { use: use as never } : {}) });
      }
      const w = num(args, 'plotWidthMm', false);
      const d = num(args, 'plotDepthMm', false);
      if ((w === undefined) !== (d === undefined)) throw new ToolError('Give both plotWidthMm and plotDepthMm.');
      if (w !== undefined && d !== undefined) {
        if (w <= 0 || d <= 0) throw new ToolError('The plot needs a width and depth above 0.');
        if (!s().addPlot(plotRect({ x: 0, y: 0 }, { x: w / MM_PER_UNIT, y: d / MM_PER_UNIT }), 0))
          throw new ToolError(s().warnings.join(' ') || 'The plot could not be added.');
        const authority = str(args, 'authority', false);
        if (authority) {
          if (!AUTHORITIES.some((a) => a.id === authority)) throw new ToolError(`Unknown authority "${authority}".`);
          const plot = s().doc.elements.find((el) => el.type === 'plot')!;
          s().setPlotAuthority(plot.id, authority as AuthorityId);
        }
      }
      writePlan(path, s().doc);
      return { path, ...describe(s().doc) };
    },
  },
  {
    name: 'mimar_describe_plan',
    description:
      'Summarise a plan: project type, floors (with their ids, item counts and rooms with areas in sq ft) and plots.',
    inputSchema: schema({ path: PATH }),
    run: (args) => describe(readPlan(planPath(args))),
  },
  {
    name: 'mimar_get_items',
    description:
      'The raw items of a plan, as stored in the file. Careful: coordinates in this raw form are plan units of 10 mm; fields ending in Mm are millimetres. Filter by type (wall, door, window, furniture, column, beam, slab, plot, stair, roof, …), floor or ids.',
    inputSchema: schema({
      path: PATH,
      type: { type: 'string', description: 'Only items of this type ("room" for rooms).' },
      levelId: LEVEL,
      ids: { type: 'array', items: { type: 'string' } },
      limit: { type: 'number', description: 'At most this many (200 when left out).' },
    }),
    run: (args) => {
      const doc = readPlan(planPath(args));
      const type = str(args, 'type', false);
      const levelId = str(args, 'levelId', false);
      const ids = Array.isArray(args.ids) ? new Set(args.ids as string[]) : null;
      const pool: (PlanElement | PlanDoc['rooms'][number])[] =
        type === 'room'
          ? doc.rooms
          : type
            ? doc.elements.filter((el) => el.type === type)
            : [...doc.elements, ...doc.rooms];
      const found = pool.filter((it) => (!levelId || levelOf(it) === levelId) && (!ids || ids.has(it.id)));
      const limit = num(args, 'limit', false) ?? 200;
      return { unitMm: MM_PER_UNIT, total: found.length, items: found.slice(0, Math.max(0, limit)) };
    },
  },
  {
    name: 'mimar_add_walls',
    description:
      'Draw walls through a list of points (mm), on one floor, the way the Wall tool does: walls join at corners, and a closed loop makes a room.',
    inputSchema: schema(
      {
        path: PATH,
        levelId: LEVEL,
        points: { type: 'array', items: POINT, minItems: 2 },
        closed: { type: 'boolean', description: 'Join the last point back to the first.' },
        thicknessMm: { type: 'number', description: 'Wall thickness, mm (9" = 228.6 when left out).' },
      },
      ['path', 'points'],
    ),
    run: (args) =>
      edit(args, (s) => {
        if (!Array.isArray(args.points) || args.points.length < 2)
          throw new ToolError('"points" needs at least two points.');
        const pts = args.points.map((p, i) => pointArg(p, `points[${i}]`));
        const t = num(args, 'thicknessMm', false);
        if (t !== undefined) {
          if (t < 50 || t > 1000) throw new ToolError('"thicknessMm" must be between 50 and 1000.');
          s().setWallThicknessMm(t);
        }
        const before = new Set(s().doc.elements.map((el) => el.id));
        const rooms = s().doc.rooms.length;
        const n = args.closed === true ? pts.length : pts.length - 1;
        for (let i = 0; i < n; i++) s().addWall(pts[i], pts[(i + 1) % pts.length], undefined, true);
        return {
          wallIds: s()
            .doc.elements.filter((el) => el.type === 'wall' && !before.has(el.id))
            .map((el) => el.id),
          roomsMade: s().doc.rooms.length - rooms,
        };
      }),
  },
  {
    name: 'mimar_add_room',
    description: 'Make a room inside the walls around a point (mm), and name it (e.g. "Bedroom", "Kitchen").',
    inputSchema: schema({ path: PATH, levelId: LEVEL, at: POINT, name: { type: 'string' } }, ['path', 'at']),
    run: (args) =>
      edit(args, (s) => {
        const before = new Set(s().doc.rooms.map((r) => r.id));
        s().addRoomAt(pointArg(args.at, 'at'));
        const room = s().doc.rooms.find((r) => !before.has(r.id));
        if (!room)
          throw new ToolError(s().warnings.join(' ') || 'No room could be made there: is it closed in by walls?');
        const name = str(args, 'name', false);
        if (name) s().updateRoom({ ...room, name });
        return { roomId: room.id, name: name ?? room.name, areaSqFt: sqft(room.points) };
      }),
  },
  {
    name: 'mimar_add_opening',
    description: 'Put a door or window in the wall nearest a point (mm), at its usual size.',
    inputSchema: schema({ path: PATH, levelId: LEVEL, type: { type: 'string', enum: ['door', 'window'] }, at: POINT }, [
      'path',
      'type',
      'at',
    ]),
    run: (args) =>
      edit(args, (s) => {
        const type = str(args, 'type');
        if (type !== 'door' && type !== 'window') throw new ToolError('"type" must be door or window.');
        const before = new Set(s().doc.elements.map((el) => el.id));
        if (!s().placeOpening(type, pointArg(args.at, 'at')))
          throw new ToolError(s().warnings.join(' ') || `The ${type} does not fit there.`);
        return {
          ids: s()
            .doc.elements.filter((el) => !before.has(el.id))
            .map((el) => el.id),
        };
      }),
  },
  {
    name: 'mimar_add_furniture',
    description:
      'Place a library item (furniture, fixture or service point) centred at a point (mm), turned by rotationDeg. Kinds: mimar_reference topic "furniture".',
    inputSchema: schema(
      { path: PATH, levelId: LEVEL, kind: { type: 'string' }, at: POINT, rotationDeg: { type: 'number' } },
      ['path', 'kind', 'at'],
    ),
    run: (args) =>
      edit(args, (s) => {
        const kind = str(args, 'kind');
        if (!isFurnitureKind(kind)) throw new ToolError(`Unknown kind "${kind}". See mimar_reference "furniture".`);
        s().setFurnitureKind(kind);
        const before = new Set(s().doc.elements.map((el) => el.id));
        s().addFurniture(pointArg(args.at, 'at'), num(args, 'rotationDeg', false) ?? 0);
        return {
          ids: s()
            .doc.elements.filter((el) => !before.has(el.id))
            .map((el) => el.id),
        };
      }),
  },
  {
    name: 'mimar_update_item',
    description:
      'Change fields of one item or room by id, in the raw form mimar_get_items shows (plan units of 10 mm for coordinates). The plan is checked and tidied the way the app does when it opens a file.',
    inputSchema: schema({ path: PATH, id: { type: 'string' }, patch: { type: 'object' } }, ['path', 'id', 'patch']),
    run: (args) => {
      const path = planPath(args);
      const doc = readPlan(path);
      const id = str(args, 'id')!;
      const patch = args.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw new ToolError('"patch" must be an object.');
      if ('id' in patch || 'type' in patch) throw new ToolError("The patch cannot change an item's id or type.");
      const inElements = doc.elements.some((el) => el.id === id);
      if (!inElements && !doc.rooms.some((r) => r.id === id)) throw new ToolError(`There is no item "${id}".`);
      const merged = {
        ...doc,
        elements: doc.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
        rooms: doc.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      };
      const next = normaliseDoc(JSON.parse(JSON.stringify(merged)));
      const item = inElements ? next.elements.find((el) => el.id === id) : next.rooms.find((r) => r.id === id);
      if (!item) throw new ToolError('That change makes the item unreadable, so it was not saved.');
      writePlan(path, next);
      return { saved: true, item };
    },
  },
  {
    name: 'mimar_delete_items',
    description: 'Delete items or rooms by id (doors and windows in a deleted wall go with it, as in the app).',
    inputSchema: schema({ path: PATH, ids: { type: 'array', items: { type: 'string' }, minItems: 1 } }, [
      'path',
      'ids',
    ]),
    run: (args) =>
      edit(args, (s) => {
        if (!Array.isArray(args.ids) || !args.ids.length) throw new ToolError('"ids" needs at least one id.');
        const ids = args.ids as string[];
        const known = new Set([...s().doc.elements, ...s().doc.rooms].map((it) => it.id));
        const missing = ids.filter((id) => !known.has(id));
        if (missing.length) throw new ToolError(`No such items: ${missing.join(', ')}.`);
        s().eraseMany(ids);
        const left = new Set([...s().doc.elements, ...s().doc.rooms].map((it) => it.id));
        return { deleted: ids.filter((id) => !left.has(id)) };
      }),
  },
  {
    name: 'mimar_generate_layout',
    description:
      "Plan the ground floor from a room list inside the plot's building line (needs a plot): replaces the floor's walls and rooms, keeps the boundary walls. Returns the options' notes; pick another with option.",
    inputSchema: schema({
      path: PATH,
      program: {
        type: 'object',
        description:
          'Room list (all optional): bedrooms, attachedBaths (numbers); drawing, dining, porch, prayer, store, laundry, servant, stair, powder, gym (true/false).',
      },
      option: { type: 'number', description: 'Which of the best plans to place, from 1 (the best).' },
      seed: { type: 'number' },
    }),
    run: (args) =>
      edit(args, (s) => {
        const plot = s().doc.elements.find((el): el is Plot => el.type === 'plot');
        if (!plot)
          throw new ToolError('The plan has no plot. Make one with mimar_new_plan (plotWidthMm, plotDepthMm).');
        const site = layoutSite(plot);
        if (!site) throw new ToolError('The plot leaves no room to build inside its setbacks.');
        const program: Program = { ...DEFAULT_PROGRAM, ...((args.program as Partial<Program>) ?? {}) };
        const plans = generateLayouts(program, site.W, site.D, { seed: num(args, 'seed', false) ?? 1 });
        if (!plans.length) throw new ToolError('No plan fits that room list on this plot. Try fewer rooms.');
        const pick = Math.round(num(args, 'option', false) ?? 1);
        const plan = plans[pick - 1];
        if (!plan) throw new ToolError(`Only ${plans.length} options were found.`);
        const doc = s().doc;
        s().placeLayout(buildLayout(plan, site.frame, { newId, riseMm: wallHeightOf(doc) + slabMm(doc) }));
        return {
          placed: pick,
          options: plans.map((p, i) => ({ option: i + 1, rooms: p.rooms.map((r) => r.name), notes: p.notes })),
        };
      }),
  },
  {
    name: 'mimar_generate_structure',
    description:
      'Generate the structure (columns, beams, slabs, footings) from the walls, as Frame > Generate structure does. Items edited since the last run are kept.',
    inputSchema: schema({ path: PATH }),
    run: (args) =>
      edit(args, (s) => {
        const r = s().generateStructure();
        if (!r) throw new ToolError(s().warnings.join(' ') || 'There are no walls to build a structure from.');
        return r;
      }),
  },
  {
    name: 'mimar_check',
    description:
      "Run the plan check: the plot's bylaws (setbacks, coverage, FAR, storeys, parking…) and, for a building, its use. Each row says what is required, what the plan has, and ok / fail / check.",
    inputSchema: schema({
      path: PATH,
      plotId: { type: 'string', description: 'With several plots, the one to check.' },
    }),
    run: (args) => {
      const doc = readPlan(planPath(args));
      const check = fullCheck(doc, {
        wallHeightMm: wallHeightOf(doc),
        units: unitsOf(doc),
        plotId: str(args, 'plotId', false),
      });
      if (!check) return { note: 'Nothing to check yet: draw a plot (or walls for a building).', rows: [] };
      const rows = check.rows.map(({ id, label, required, actual, status, clause, ids, detail }) => ({
        id,
        label,
        required,
        actual,
        status,
        clause,
        ...(ids?.length ? { ids } : {}),
        ...(detail ? { detail } : {}),
      }));
      const tally = { ok: 0, fail: 0, check: 0 };
      rows.filter((r) => !r.detail).forEach((r) => tally[r.status]++);
      return { authority: check.authority.name, note: check.note, tally, rows };
    },
  },
  {
    name: 'mimar_quantities',
    description:
      'Quantities for an estimate, as the app works them out: brickwork, concrete, steel, plaster, paint, flooring and so on, per floor and in all.',
    inputSchema: schema({ path: PATH }),
    run: (args) => {
      const doc = readPlan(planPath(args));
      return quantities(doc, wallHeightOf(doc));
    },
  },
  {
    name: 'mimar_export',
    description:
      'Export a plan to a file next to it (or to "out"): "dxf" (one floor\'s plan, mm), "ifc" (the whole building, IFC4) or "structure-csv" (the structure schedule).',
    inputSchema: schema(
      {
        path: PATH,
        format: { type: 'string', enum: ['dxf', 'ifc', 'structure-csv'] },
        levelId: LEVEL,
        out: { type: 'string', description: 'Full path of the file to write; next to the plan when left out.' },
      },
      ['path', 'format'],
    ),
    run: (args) => {
      const path = planPath(args);
      const doc = readPlan(path);
      const format = str(args, 'format');
      const ext = format === 'dxf' ? '.dxf' : format === 'ifc' ? '.ifc' : format === 'structure-csv' ? '.csv' : null;
      if (!ext) throw new ToolError('"format" must be dxf, ifc or structure-csv.');
      const name = path.slice(0, -extname(path).length).split(/[\\/]/).pop()!;
      const levelId = str(args, 'levelId', false) ?? GROUND_LEVEL;
      if (!doc.levels.some((l) => l.id === levelId)) throw new ToolError(`There is no floor "${levelId}".`);
      const level = doc.levels.find((l) => l.id === levelId)!;
      const out = resolve(
        str(args, 'out', false) ??
          `${path.slice(0, -extname(path).length)}${format === 'dxf' ? ` - ${level.name}` : format === 'structure-csv' ? ' structure' : ''}${ext}`,
      );
      if (extname(out).toLowerCase() !== ext) throw new ToolError(`"out" must end in ${ext}.`);
      if (out === path) throw new ToolError('"out" cannot be the plan itself.');
      const shown = withoutHidden(doc, { layers: doc.layers, showFurniture: true });
      const units = unitsOf(doc);
      const wallHeightMm = wallHeightOf(doc);
      let text: string;
      if (format === 'ifc') {
        text = planToIfc(shown, { wallHeightMm, name, app: `MIMAR ${__APP_VERSION__}` });
      } else if (format === 'structure-csv') {
        text = structureCsv(doc, name, units, wallHeightMm);
      } else {
        const on = <T extends { levelId?: string }>(it: T) => levelOf(it) === levelId;
        const floor = {
          ...shown,
          elements: shown.elements.filter((el) => (on(el) || el.type === 'section') && el.type !== 'line'),
          rooms: shown.rooms.filter(on),
        };
        text = planToDxf(floor, {
          units,
          marlaSqFt: DEFAULT_PREFS.marlaSqFt,
          showDimensions: true,
          showFurniture: true,
          showRoomLabels: true,
          wallHeightMm,
          ground: levelId === GROUND_LEVEL ? groundOnPlan(doc, units === 'metric') : null,
          voids: floorVoids(shown, levelId),
        });
      }
      writeText(out, text);
      return { written: out, bytes: Buffer.byteLength(text) };
    },
  },
  {
    name: 'mimar_reference',
    description:
      'Reference lists: "furniture" (library kinds with sizes in mm), "authorities" (bylaw authorities), "projects" (project types and building uses).',
    inputSchema: schema({ topic: { type: 'string', enum: ['furniture', 'authorities', 'projects'] } }, ['topic']),
    run: (args) => {
      const topic = str(args, 'topic');
      if (topic === 'furniture')
        return Object.entries(FURNITURE_CATALOG).map(([kind, f]) => ({
          kind,
          name: f.name,
          group: f.group,
          category: f.category,
          widthMm: f.w,
          depthMm: f.d,
        }));
      if (topic === 'authorities')
        return AUTHORITIES.map((a) => ({ id: a.id, name: a.name, status: a.status, source: a.source }));
      if (topic === 'projects') return { types: PROJECT_TYPES, buildingUses: BUILDING_USES };
      throw new ToolError('"topic" must be furniture, authorities or projects.');
    },
  },
];
