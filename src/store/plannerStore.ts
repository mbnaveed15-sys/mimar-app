import { createStore, useStore } from 'zustand';
import {
  elementCenter,
  findElementNear,
  isNear,
  nearestWall,
  placeOnWall,
  planBounds,
  pointInPolygon,
  reattachOpening,
} from '../geometry';
import { DEFAULT_FILE_NAME } from '../lib/files';
import { newId } from '../lib/ids';
import { GRID_MAX_MM, GRID_MIN_MM, loadPrefs, savePrefs, type GridPrefs, type Prefs } from '../lib/prefs';
import { emptyDoc, loadPlan, savePlan } from '../lib/storage';
import { MM_PER_UNIT } from '../lib/scale';
import { DEFAULT_AREA, fitView, zoomAt, type Size } from '../lib/view';
import { DEFAULT_FURNITURE_KIND, FURNITURE_CATALOG, type FurnitureKind } from '../furniture/catalog';
import { detectRoom } from '../rooms';
import type { Inference } from '../lib/inference';
import {
  boundsCentre,
  copyItems,
  deleteItems,
  expandToGroups,
  groupItems,
  groupMembers,
  itemById,
  makeComponent,
  makeUnique,
  moveItems,
  placeComponent,
  rotateItems,
  selectionBounds,
  syncComponent,
  ungroup,
} from '../lib/selection';
import { boundaryWallLines, stairLayout } from '../lib/site';
import { MATERIAL_LIBRARY, planMaterial } from '../lib/materials';
import { isHidden, isLocked, withoutHidden, type LayerFlags, type LayerId } from '../lib/layers';
import { SLAB_MM } from '../three/model';
import { applyTheme, type ThemeId } from '../theme/themes';
import { GROUND_LEVEL, levelOf, SIMPLE_TOOLS } from '../types';
import type {
  Plot,
  SketchLine,
  Slab,
  Stair,
  Draft,
  Id,
  MarlaSqFt,
  Material,
  Mode,
  PaperSize,
  PlanDoc,
  PlanElement,
  Point,
  Room,
  Tool,
  Units,
  View,
} from '../types';

export const HISTORY_LIMIT = 100;

export interface StructureSpec {
  columnShape: 'rect' | 'round';
  columnW: number;
  columnH: number;
  beamWidth: number;
  beamDepth: number;
  slabThickness: number;
}

export interface SiteSpec {
  setbacks: { front: number; rear: number; sides: number };
  boundaryWall: boolean;
  /** Type of new walls drawn with the Wall and Rectangle tools. */
  wallKind: 'normal' | 'boundary' | 'parapet';
  /** Door tool places a door or a gate. */
  gate: boolean;
  gateWidthMm: number;
  stairShape: Stair['shape'];
  stairWidthMm: number;
  treadMm: number;
  /** A stair climbs a full floor; a ramp or plinth steps climb the plinth. */
  climb: 'floor' | 'plinth';
}

/** Heights of boundary walls (7') and parapets (3'). */
export const KIND_HEIGHT_MM = { boundary: 2133.6, parapet: 914.4 } as const;

export const DEFAULT_SITE: SiteSpec = {
  setbacks: { front: 1524, rear: 609.6, sides: 0 },
  boundaryWall: true,
  wallKind: 'normal',
  gate: false,
  gateWidthMm: 3048,
  stairShape: 'straight',
  stairWidthMm: 914.4,
  treadMm: 254,
  climb: 'floor',
};

const inch = (n: number) => (n * 25.4) / MM_PER_UNIT;
/** 9" × 12" columns, 9" × 18" beams and a 6" slab: common RCC sizes for Pakistani houses. */
export const DEFAULT_STRUCTURE: StructureSpec = {
  columnShape: 'rect',
  columnW: inch(9),
  columnH: inch(12),
  beamWidth: inch(9),
  beamDepth: inch(18),
  slabThickness: inch(6),
};
export { MM_PER_UNIT };

const OPENING_WIDTH_MM = { door: 900, window: 1200 } as const;
const MIN_WALL_PX = 6;

export interface PlannerState {
  doc: PlanDoc;
  past: PlanDoc[];
  future: PlanDoc[];
  /** Document before the current grouped change (e.g. a brush stroke), or null. */
  batchBase: PlanDoc | null;

  tool: Tool;
  selectedMat: Id;
  /** The item last clicked; its properties are shown when it is the only one selected. */
  selectedId: Id | null;
  /** Everything selected (includes selectedId). A group is selected as all of its items. */
  selectedIds: Id[];
  /** The group or component copy open for editing (its items can be picked one by one). */
  openGroupId: Id | null;
  /** The floor being drawn on; only its items are shown and editable in 2D. */
  activeLevel: Id;
  setActiveLevel: (id: Id) => void;
  /** Add a floor above the top one and switch to it. */
  addLevel: () => void;
  renameLevel: (id: Id, name: string) => void;
  /** Remove a floor (not the ground floor) and everything on it. */
  deleteLevel: (id: Id) => void;
  /** Elements and rooms on the active floor. */
  levelElements: () => PlanElement[];
  levelRooms: () => Room[];
  setPlinthMm: (mm: number) => void;
  /** Sizes for new columns, beams and slabs, in plan units. */
  structure: StructureSpec;
  setStructure: (patch: Partial<StructureSpec>) => void;
  addColumn: (p: Point) => void;
  addBeam: (a: Point, b: Point) => void;
  /** A layout (drafting) line on the floor being drawn. */
  addLine: (a: Point, b: Point) => void;
  /** Make walls (current thickness) along the selected layout lines, and remove the lines. */
  linesToWalls: () => void;
  addSlab: (points: Point[]) => void;
  /** Settings for plots, wall types, gates and stairs. */
  site: SiteSpec;
  setSite: (patch: Partial<SiteSpec>) => void;
  /** A plot with its setbacks, and a boundary wall round it when that option is on. */
  addPlot: (points: Point[]) => void;
  addStair: (p: Point) => void;
  /** Parapet walls round a roof slab, on the floor above it (a Roof floor is added if needed). */
  addParapetAround: (slabId: Id) => void;
  brushSize: number;
  gridPx: number;
  scaleMMperPx: number;
  warnings: string[];
  draft: Draft;

  units: Units;
  showDimensions: boolean;
  showFurniture: boolean;
  showRoomLabels: boolean;
  showRoomFills: boolean;
  exportLines: boolean;
  mode: Mode;
  wallThicknessMm: number;
  marlaSqFt: MarlaSqFt;
  paper: PaperSize;
  wallHeightMm: number;
  /** True while the 3D view is shown instead of the 2D plan. */
  view3d: boolean;
  /** Text typed into the Measurements box, not yet applied. */
  measureText: string;
  /** What the pointer snapped to, shown as a coloured marker. */
  inference: Inference | null;
  /** Arrow-key lock to the red (x) or green (y) axis while drawing. */
  axisLock: 'x' | 'y' | null;
  /** Direction held by Shift while drawing (inference lock). */
  shiftLock: Point | null;
  /** The last Move-copy, so `3x` or `/3` typed next can turn it into an array. */
  lastCopy: { ids: Id[]; dx: number; dy: number; copyIds: Id[] } | null;
  /** Fillet radius and chamfer distances, in plan units, set by typing while those tools are active. */
  filletRadius: number;
  chamferDist: [number, number];
  setFilletRadius: (r: number) => void;
  setChamferDist: (d: [number, number]) => void;
  /** Items copied with Ctrl+C, and the plan they came from. */
  clipboard: { doc: PlanDoc; ids: Id[] } | null;
  theme: ThemeId;
  grid: GridPrefs;
  view: View;
  viewport: Size;

  /** Name of the open plan file, and its path in the desktop app. */
  fileName: string;
  filePath?: string;
  /** Document as last saved or opened; the plan has unsaved changes when doc differs. */
  savedDoc: PlanDoc;

  /** Apply a change to the document, recording it for undo. */
  commit: (recipe: (doc: PlanDoc) => PlanDoc) => void;
  /** Group the following commits into a single undo step until endBatch. */
  beginBatch: () => void;
  endBatch: () => void;
  /** Throw away everything since beginBatch (Esc during a move or rotate). */
  cancelBatch: () => void;
  undo: () => void;
  redo: () => void;

  setTool: (tool: Tool) => void;
  selectMaterial: (id: Id) => void;
  /** Select one item (with the rest of its group), or nothing. */
  select: (id: Id | null) => void;
  /** Shift+click: add an item (and its group) to the selection, or take it out. */
  toggleSelect: (id: Id) => void;
  /** Select these items (and their groups), adding to the selection when additive. */
  setSelection: (ids: Id[], additive?: boolean) => void;
  selectAll: () => void;
  deleteSelected: () => void;
  /** Change the plan based on the plan at the start of the current batch (live Move and Rotate). */
  commitFromBase: (recipe: (base: PlanDoc) => PlanDoc) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  makeComponentFromSelection: () => void;
  /** Open a group or component copy to edit its items; closing a component copy updates the others. */
  openGroup: (groupId: Id) => void;
  closeGroup: () => void;
  placeComponentCopy: (componentId: Id, at?: Point) => void;
  makeSelectedUnique: () => void;
  renameGroup: (groupId: Id, name: string) => void;
  /** The group whose items are exactly the selection, if any. */
  selectedGroup: () => import('../types').Group | null;
  setBrushSize: (px: number) => void;
  setDraft: (draft: Draft) => void;
  setWarning: (message: string | null) => void;
  setMeasureText: (text: string) => void;
  setInference: (inference: Inference | null) => void;
  setAxisLock: (axis: 'x' | 'y' | null) => void;
  setShiftLock: (dir: Point | null) => void;
  setLastCopy: (copy: PlannerState['lastCopy']) => void;
  /** Add finished elements (copies, pastes) as one undo step. */
  addElements: (elements: PlanElement[]) => void;
  /** Four walls around the box from a to b, and the room inside, as one undo step. */
  addRectangle: (a: Point, b: Point) => void;
  copySelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;

  addWall: (a: Point, b: Point) => void;
  placeOpening: (type: 'door' | 'window', p: Point) => void;
  addFurniture: (p: Point) => void;
  applyMaterial: (id: Id) => void;
  paintAt: (p: Point) => void;
  brushAt: (p: Point) => void;
  eraseAt: (p: Point) => void;
  deleteElement: (id: Id) => void;
  /** Remove several items in one step (with any doors and windows in removed walls). */
  eraseMany: (ids: Id[]) => void;
  addMaskPoint: (p: Point) => void;
  finishMask: () => void;
  addMaterial: () => void;
  /** Make a plan or library material the active one, adding a library material to the plan first. */
  pickMaterial: (id: Id) => void;
  updateMaterial: (id: Id, patch: Partial<Omit<Material, 'id'>>) => void;
  /** Take a material out of the plan; anything using it goes back to its default look. */
  removeMaterial: (id: Id) => void;

  setUnits: (units: Units) => void;
  setShowDimensions: (show: boolean) => void;
  setLayer: (layer: 'showFurniture' | 'showRoomLabels' | 'showRoomFills' | 'exportLines', show: boolean) => void;
  /** Library item placed by the Furniture tool. */
  furnitureKind: FurnitureKind;
  setFurnitureKind: (kind: FurnitureKind) => void;
  /** Elements that can be clicked: hidden furniture is left out. */
  /** Items on the floor being drawn that are shown (not hidden, nor on a hidden layer). */
  visibleElements: () => PlanElement[];
  /** Shown items that can be picked: not locked, nor on a locked layer. */
  pickableElements: () => PlanElement[];
  pickableRooms: () => Room[];
  /** The plan without hidden items, for drawing and exports. */
  shownDoc: () => PlanDoc;
  /** Hide or lock a whole layer. */
  setLayerFlags: (layer: LayerId, flags: LayerFlags) => void;
  /** Hide the selection, or lock (or unlock) it. */
  hideSelected: () => void;
  lockSelected: (locked: boolean) => void;
  /** Bring back everything hidden, or unlock everything locked (items and layers). */
  showAllHidden: () => void;
  unlockAll: () => void;
  setMode: (mode: Mode) => void;
  setWallThicknessMm: (mm: number) => void;
  setMarlaSqFt: (sqft: MarlaSqFt) => void;
  setPaper: (paper: PaperSize) => void;
  setWallHeightMm: (mm: number) => void;
  setView3d: (on: boolean) => void;
  setTheme: (theme: ThemeId) => void;
  /** Change some grid settings; spacing is for the current units. */
  setGrid: (patch: Partial<Omit<GridPrefs, 'spacingMm'>> & { spacingMm?: number }) => void;
  /** Set (or with null, reset to the theme's own) a grid line colour for the current theme. */
  setGridColor: (line: 'minor' | 'major', color: string | null) => void;

  /** Make a room from the area enclosed by walls around p. */
  addRoomAt: (p: Point) => void;
  updateRoom: (room: Room) => void;
  /** Room whose area contains p, or null. */
  roomAt: (p: Point) => Room | null;
  setViewport: (size: Size) => void;
  setView: (view: View) => void;
  zoomBy: (factor: number, screen?: Point) => void;
  fitToPlan: () => void;
  /** Screen-independent distance for clicking on things (12 screen pixels). */
  hitTolerance: () => number;
  /** The last press was a finger: targets and snapping reach further. */
  touchInput: boolean;
  setTouchInput: (on: boolean) => void;
  /** How much further to reach for touch (1 for mouse and pen). */
  reach: () => number;
  /** Plan units per screen pixel where the 3D view's pointer is (null until it has been over the model). */
  px3d: number | null;
  setPx3d: (units: number | null) => void;
  /** Plan units per screen pixel: the 2D zoom, or in 3D the size of a pixel where the pointer is. */
  pxUnits: () => number;

  /** Replace an element; doors and windows follow their wall if it changed. */
  updateElement: (next: PlanElement) => void;
  flipOpening: (id: Id, which: 'side' | 'hinge') => void;
  nudgeSelected: (dx: number, dy: number) => void;
  rotateSelected: (degrees: number) => void;

  newPlan: () => void;
  loadDocument: (doc: PlanDoc, file: { name: string; path?: string }) => void;
  markSaved: (file: { name: string; path?: string }) => void;
}

const gridFor = (grid: GridPrefs, units: Units) => grid.spacingMm[units] / MM_PER_UNIT;

export function createPlannerStore(initial: PlanDoc, initialWarning?: string, prefs: Prefs = loadPrefs()) {
  return createStore<PlannerState>()((set, get) => {
    /** Id of the active material, falling back to the first one if it was removed. */
    const activeMat = () => {
      const { doc, selectedMat } = get();
      return (doc.materials.find((m) => m.id === selectedMat) ?? doc.materials[0])?.id;
    };
    const mmToPx = (mm: number) => mm / get().scaleMMperPx;
    const persistPrefs = () => {
      const { units, showDimensions, showFurniture, showRoomLabels, showRoomFills, exportLines } = get();
      const { mode, wallThicknessMm, marlaSqFt, paper, wallHeightMm, theme, grid } = get();
      savePrefs({
        units,
        showDimensions,
        showFurniture,
        showRoomLabels,
        showRoomFills,
        exportLines,
        mode,
        wallThicknessMm,
        marlaSqFt,
        paper,
        wallHeightMm,
        theme,
        grid,
      });
    };
    const resetHistory = {
      past: [],
      future: [],
      batchBase: null,
      draft: null,
      selectedId: null,
      selectedIds: [],
      openGroupId: null,
      warnings: [],
      lastCopy: null,
      activeLevel: GROUND_LEVEL,
    };
    /** Type and height fields for a new wall of the given kind. */
    const kindFields = (kind: SiteSpec['wallKind']) =>
      kind === 'normal' ? {} : { kind, heightMm: KIND_HEIGHT_MM[kind] };
    /** Put a new item on the active floor. */
    const onActive = <T extends { levelId?: Id }>(item: T): T => {
      const level = get().activeLevel;
      return level === GROUND_LEVEL ? item : { ...item, levelId: level };
    };
    /** Keep only selected items that still exist (after undo, erase, hiding furniture). */
    const refreshSelection = () => {
      const { doc, selectedIds, selectedId, showFurniture } = get();
      const visible = (id: Id) => {
        const it = itemById(doc, id);
        return !!it && !('type' in it && it.type === 'furniture' && !showFurniture);
      };
      const ids = selectedIds.filter(visible);
      const open = get().openGroupId;
      set({
        selectedIds: ids,
        selectedId: selectedId && ids.includes(selectedId) ? selectedId : (ids[0] ?? null),
        openGroupId: open && doc.groups.some((g) => g.id === open) ? open : null,
      });
    };
    const updateElements = (fn: (els: PlanElement[]) => PlanElement[]) =>
      get().commit((doc) => {
        const elements = fn(doc.elements);
        return elements === doc.elements ? doc : { ...doc, elements };
      });

    return {
      doc: initial,
      past: [],
      future: [],
      batchBase: null,

      tool: 'select',
      selectedMat: initial.materials[0]?.id ?? '',
      selectedId: null,
      selectedIds: [],
      openGroupId: null,
      activeLevel: GROUND_LEVEL,
      brushSize: 24,
      gridPx: gridFor(prefs.grid, prefs.units),
      scaleMMperPx: MM_PER_UNIT,
      warnings: initialWarning ? [initialWarning] : [],
      draft: null,

      units: prefs.units,
      showDimensions: prefs.showDimensions,
      showFurniture: prefs.showFurniture,
      showRoomLabels: prefs.showRoomLabels,
      showRoomFills: prefs.showRoomFills,
      exportLines: prefs.exportLines,
      furnitureKind: DEFAULT_FURNITURE_KIND,
      mode: prefs.mode,
      wallThicknessMm: prefs.wallThicknessMm,
      marlaSqFt: prefs.marlaSqFt,
      paper: prefs.paper,
      wallHeightMm: prefs.wallHeightMm,
      view3d: false,
      measureText: '',
      inference: null,
      axisLock: null,
      shiftLock: null,
      lastCopy: null,
      clipboard: null,
      filletRadius: 0,
      chamferDist: [600 / MM_PER_UNIT, 600 / MM_PER_UNIT],
      setFilletRadius: (filletRadius) => set({ filletRadius: Math.max(0, filletRadius) }),
      setChamferDist: (chamferDist) => set({ chamferDist }),
      theme: prefs.theme,
      grid: prefs.grid,
      view: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 0, height: 0 },

      fileName: DEFAULT_FILE_NAME,
      filePath: undefined,
      savedDoc: initial,

      commit: (recipe) => {
        const { doc, past, batchBase } = get();
        const next = recipe(doc);
        if (next === doc) return;
        if (batchBase) set({ doc: next });
        else set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [] });
      },
      beginBatch: () => {
        if (!get().batchBase) set({ batchBase: get().doc });
      },
      endBatch: () => {
        const { batchBase, doc, past } = get();
        if (!batchBase) return;
        if (batchBase === doc) set({ batchBase: null });
        else set({ batchBase: null, past: [...past, batchBase].slice(-HISTORY_LIMIT), future: [] });
      },
      cancelBatch: () => {
        const { batchBase } = get();
        if (batchBase) set({ doc: batchBase, batchBase: null });
      },
      undo: () => {
        get().endBatch();
        const { past, doc, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], draft: null });
        refreshSelection();
      },
      redo: () => {
        get().endBatch();
        const { past, doc, future } = get();
        if (!future.length) return;
        set({ doc: future[0], past: [...past, doc], future: future.slice(1), draft: null });
        refreshSelection();
      },

      setTool: (tool) => {
        get().cancelBatch();
        // Tools that work on the selection keep it.
        const keep = ['select', 'move', 'rotate', 'mirror', 'scale'].includes(tool);
        set((s) => ({
          tool,
          draft: null,
          warnings: [],
          selectedId: keep ? s.selectedId : null,
          selectedIds: keep ? s.selectedIds : [],
          measureText: '',
          inference: null,
          axisLock: null,
          shiftLock: null,
          lastCopy: null,
        }));
        // Orbit only turns the 3D view, so it opens it.
        if (tool === 'orbit' && !get().view3d) get().setView3d(true);
      },
      selectMaterial: (id) => set({ selectedMat: id }),
      select: (id) => {
        const { doc, openGroupId } = get();
        const item = id ? itemById(doc, id) : undefined;
        // Picking something outside the open group closes it.
        if (openGroupId && (!item || item.groupId !== openGroupId)) get().closeGroup();
        if (!item) {
          set({ selectedId: null, selectedIds: [] });
          return;
        }
        set({ selectedId: item.id, selectedIds: expandToGroups(get().doc, [item.id], get().openGroupId) });
      },
      toggleSelect: (id) => {
        const { doc, selectedIds, openGroupId } = get();
        if (!itemById(doc, id)) return;
        const ids = expandToGroups(doc, [id], openGroupId);
        const has = selectedIds.includes(id);
        const next = has ? selectedIds.filter((x) => !ids.includes(x)) : [...new Set([...selectedIds, ...ids])];
        set({ selectedIds: next, selectedId: has ? (next[0] ?? null) : id });
      },
      setSelection: (ids, additive = false) => {
        const { doc, openGroupId, selectedIds } = get();
        const picked = expandToGroups(doc, ids, openGroupId);
        const next = additive ? [...new Set([...selectedIds, ...picked])] : picked;
        set({ selectedIds: next, selectedId: next[next.length - 1] ?? null });
      },
      selectAll: () => {
        const { doc, openGroupId } = get();
        const pool = openGroupId
          ? [...doc.elements, ...doc.rooms].filter((it) => it.groupId === openGroupId)
          : [...get().pickableElements(), ...get().pickableRooms()];
        get().setSelection(pool.map((it) => it.id));
      },
      deleteSelected: () => {
        const ids = get().selectedIds;
        if (!ids.length) return;
        get().commit((doc) => deleteItems(doc, ids));
        set({ selectedId: null, selectedIds: [] });
      },
      commitFromBase: (recipe) => {
        const base = get().batchBase;
        if (base) set({ doc: recipe(base) });
        else get().commit(recipe);
      },
      selectedGroup: () => {
        const { doc, selectedIds } = get();
        const first = selectedIds.length ? itemById(doc, selectedIds[0]) : undefined;
        if (!first?.groupId || first.groupId === get().openGroupId) return null;
        const members = new Set(
          [...doc.elements, ...doc.rooms].filter((it) => it.groupId === first.groupId).map((it) => it.id),
        );
        const exact = members.size === selectedIds.length && selectedIds.every((id) => members.has(id));
        return exact ? (doc.groups.find((g) => g.id === first.groupId) ?? null) : null;
      },
      groupSelected: () => {
        const ids = get().selectedIds;
        if (ids.length < 2 && !get().selectedGroup()) return;
        const n = get().doc.groups.filter((g) => !g.componentId).length + 1;
        let groupId = '';
        get().commit((doc) => {
          const out = groupItems(doc, ids, `Group ${n}`);
          groupId = out.groupId;
          return out.doc;
        });
        get().setSelection(ids);
        get().setWarning(null);
        void groupId;
      },
      ungroupSelected: () => {
        const g = get().selectedGroup();
        if (!g) return;
        const ids = get().selectedIds;
        get().commit((doc) => ungroup(doc, g.id));
        get().setSelection(ids);
      },
      makeComponentFromSelection: () => {
        const ids = get().selectedIds;
        if (!ids.length) return;
        const n = get().doc.components.length + 1;
        get().commit((doc) => makeComponent(doc, ids, `Component ${n}`).doc);
        get().setSelection(ids);
      },
      openGroup: (groupId) => {
        if (!get().doc.groups.some((g) => g.id === groupId)) return;
        if (get().openGroupId && get().openGroupId !== groupId) get().closeGroup();
        set({ openGroupId: groupId, selectedIds: [], selectedId: null });
      },
      closeGroup: () => {
        const id = get().openGroupId;
        if (!id) return;
        set({ openGroupId: null });
        const g = get().doc.groups.find((x) => x.id === id);
        // Other copies of a component are rebuilt as part of the last edit, so one undo takes back both.
        if (g?.componentId) set({ doc: syncComponent(get().doc, id) });
        get().setSelection(groupMembers(get().doc, id));
      },
      placeComponentCopy: (componentId, at) => {
        const { view, viewport } = get();
        const centre = at ?? {
          x: view.x + viewport.width / view.zoom / 2,
          y: view.y + viewport.height / view.zoom / 2,
        };
        let groupId: Id | null = null;
        get().commit((doc) => {
          const out = placeComponent(doc, componentId, centre);
          groupId = out?.groupId ?? null;
          return out?.doc ?? doc;
        });
        if (groupId) {
          const gid: Id = groupId;
          get().setSelection(
            get()
              .doc.elements.filter((el) => el.groupId === gid)
              .map((el) => el.id),
          );
        }
      },
      makeSelectedUnique: () => {
        const g = get().selectedGroup();
        if (g?.componentId) get().commit((doc) => makeUnique(doc, g.id));
      },
      renameGroup: (groupId, name) =>
        get().commit((doc) => {
          const g = doc.groups.find((x) => x.id === groupId);
          if (!g || !name.trim() || g.name === name) return doc;
          return {
            ...doc,
            groups: doc.groups.map((x) => (x.id === groupId ? { ...x, name } : x)),
            components: g.componentId
              ? doc.components.map((c) => (c.id === g.componentId ? { ...c, name } : c))
              : doc.components,
          };
        }),
      setBrushSize: (px) => set({ brushSize: px }),
      setDraft: (draft) => set({ draft }),
      setWarning: (message) => set({ warnings: message ? [message] : [] }),
      setMeasureText: (measureText) => set({ measureText }),
      setInference: (inference) => set({ inference }),
      setAxisLock: (axisLock) => set({ axisLock }),
      setShiftLock: (shiftLock) => set({ shiftLock }),
      setLastCopy: (lastCopy) => set({ lastCopy }),
      addElements: (elements) => {
        if (elements.length) updateElements((els) => [...els, ...elements]);
      },
      addRectangle: (a, b) => {
        if (Math.abs(b.x - a.x) <= MIN_WALL_PX || Math.abs(b.y - a.y) <= MIN_WALL_PX) {
          get().setWarning('That rectangle has no width or no depth. Click the opposite corner further away.');
          return;
        }
        const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        get().beginBatch();
        corners.forEach((p, i) => get().addWall(p, corners[(i + 1) % 4]));
        get().addRoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        get().endBatch();
        get().setWarning(null);
      },
      copySelected: () => {
        const { doc, selectedIds } = get();
        if (selectedIds.length) set({ clipboard: { doc, ids: selectedIds } });
      },
      paste: () => {
        const clip = get().clipboard;
        if (!clip) return;
        // Each paste lands one grid step down and to the right of the last.
        const step = get().gridPx;
        const { doc: source, ids } = copyItems(clip.doc, clip.ids, step, step);
        const fresh = new Set(ids);
        const known = new Set(clip.doc.groups.map((g) => g.id));
        const newGroups = source.groups.filter((g) => !known.has(g.id));
        // Pasted items land on the floor being viewed.
        const here = <T extends { levelId?: Id }>(it: T): T => ({ ...onActive({ ...it, levelId: undefined }) });
        get().commit((doc) => ({
          ...doc,
          elements: [...doc.elements, ...source.elements.filter((el) => fresh.has(el.id)).map(here)],
          rooms: [...doc.rooms, ...source.rooms.filter((r) => fresh.has(r.id)).map(here)],
          groups: [...doc.groups, ...newGroups],
          // A pasted component copy brings its component along if this plan doesn't have it.
          components: [
            ...doc.components,
            ...source.components.filter(
              (c) => newGroups.some((g) => g.componentId === c.id) && !doc.components.some((x) => x.id === c.id),
            ),
          ],
        }));
        set({ clipboard: { doc: source, ids } });
        get().setSelection(ids);
      },
      duplicateSelected: () => {
        const ids = get().selectedIds;
        if (!ids.length) return;
        const step = get().gridPx;
        let copies: Id[] = [];
        get().commit((doc) => {
          const out = copyItems(doc, ids, step, step);
          copies = out.ids;
          return out.doc;
        });
        get().setSelection(copies);
      },

      addWall: (a, b) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= MIN_WALL_PX) return;
        const wall: PlanElement = onActive({
          id: newId(),
          type: 'wall',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          thickness: get().wallThicknessMm / MM_PER_UNIT,
          material: activeMat(),
          ...kindFields(get().site.wallKind),
        } as PlanElement);
        updateElements((els) => [...els, wall]);
      },
      placeOpening: (type, p) => {
        const wall = nearestWall(get().levelElements(), p, get().hitTolerance() * 1.5);
        if (!wall) {
          get().setWarning(`Click on a wall to place a ${type}.`);
          return;
        }
        const gate = type === 'door' && get().site.gate;
        const pos = placeOnWall(wall, p, mmToPx(gate ? get().site.gateWidthMm : OPENING_WIDTH_MM[type]));
        updateElements((els) => [
          ...els,
          onActive<PlanElement>({
            id: newId(),
            type,
            wallId: wall.id,
            ...pos,
            material: activeMat(),
            ...(gate ? { gate: true } : {}),
          }),
        ]);
        get().setWarning(null);
      },
      addFurniture: (p) => {
        const kind = get().furnitureKind;
        const size = FURNITURE_CATALOG[kind];
        const el: PlanElement = {
          id: newId(),
          type: 'furniture',
          kind,
          x: p.x,
          y: p.y,
          w: mmToPx(size.w),
          h: mmToPx(size.d),
        };
        updateElements((els) => [...els, onActive(el)]);
        // Show the new item so it is visible even if the furniture layer was hidden.
        if (!get().showFurniture) get().setLayer('showFurniture', true);
      },
      applyMaterial: (id) => {
        const mat = activeMat();
        const room = get().doc.rooms.find((r) => r.id === id);
        if (room) {
          if (room.material !== mat) get().updateRoom({ ...room, material: mat });
          return;
        }
        updateElements((els) =>
          els.some((el) => el.id === id && el.material !== mat)
            ? els.map((el) => (el.id === id ? { ...el, material: mat } : el))
            : els,
        );
      },
      paintAt: (p) => {
        const hit = findElementNear(get().pickableElements(), p, get().hitTolerance()) ?? get().roomAt(p);
        if (hit) get().applyMaterial(hit.id);
      },
      brushAt: (p) => {
        const mat = activeMat();
        const r = get().brushSize;
        // Only what can be picked on this floor (not hidden, locked, or on another floor).
        const pick = new Set(
          get()
            .pickableElements()
            .map((el) => el.id),
        );
        updateElements((els) => {
          let changed = false;
          const next = els.map((el) => {
            const c = elementCenter(el);
            if (!pick.has(el.id) || el.material === mat || Math.hypot(c.x - p.x, c.y - p.y) > r) return el;
            changed = true;
            return { ...el, material: mat };
          });
          return changed ? next : els;
        });
      },
      eraseAt: (p) => {
        get().commit((doc) => {
          const tol = get().hitTolerance();
          const gone = new Set(
            get()
              .pickableElements()
              .filter((el) => isNear(el, p, tol))
              .map((el) => el.id),
          );
          // Only rooms on this floor that can be picked.
          const pickRooms = new Set(
            get()
              .pickableRooms()
              .map((r) => r.id),
          );
          const elements = gone.size
            ? doc.elements.filter((el) => !gone.has(el.id) && !('wallId' in el && gone.has(el.wallId)))
            : doc.elements;
          const masks = doc.masks.filter((m) => !pointInPolygon(p, m.points));
          // Rooms are only erased by clicking inside them away from walls and furniture.
          const rooms = gone.size
            ? doc.rooms
            : doc.rooms.filter((r) => !(pickRooms.has(r.id) && pointInPolygon(p, r.points)));
          if (elements === doc.elements && masks.length === doc.masks.length && rooms.length === doc.rooms.length) {
            return doc;
          }
          return { ...doc, elements, masks, rooms };
        });
        get().select(get().selectedId);
      },
      eraseMany: (ids) => {
        const gone = new Set(ids);
        if (!gone.size) return;
        get().commit((doc) => ({
          ...doc,
          elements: doc.elements.filter((el) => !gone.has(el.id) && !('wallId' in el && gone.has(el.wallId))),
        }));
        const keep = get().selectedIds.filter((id) => !gone.has(id));
        set({ selectedIds: keep, selectedId: keep.length === 1 ? keep[0] : null });
      },
      deleteElement: (id) => {
        if (get().doc.rooms.some((r) => r.id === id)) {
          get().commit((doc) => ({ ...doc, rooms: doc.rooms.filter((r) => r.id !== id) }));
          set({ selectedId: null });
          return;
        }
        updateElements((els) =>
          els.some((el) => el.id === id)
            ? els.filter((el) => el.id !== id && !('wallId' in el && el.wallId === id))
            : els,
        );
        set({ selectedId: null });
      },
      addMaskPoint: (p) => {
        const d = get().draft;
        if (!d || d.type !== 'mask') {
          set({ draft: { type: 'mask', points: [p] } });
          return;
        }
        const last = d.points[d.points.length - 1];
        if (last.x === p.x && last.y === p.y) return; // repeated click, e.g. a double-click
        set({ draft: { ...d, points: [...d.points, p] } });
      },
      finishMask: () => {
        const d = get().draft;
        if (!d || d.type !== 'mask') return;
        if (d.points.length < 3) {
          get().setWarning('A mask needs at least 3 points.');
          return;
        }
        const material = activeMat();
        get().commit((doc) => ({
          ...doc,
          masks: [...doc.masks, { id: newId(), name: `Mask-${doc.masks.length + 1}`, points: d.points, material }],
        }));
        set({ draft: null, warnings: [] });
      },
      addMaterial: () => {
        const id = `mat_custom_${newId()}`;
        get().commit((doc) => ({
          ...doc,
          materials: [...doc.materials, { id, name: 'Custom', color: '#ffffff', texture: '', pattern: 'plain' }],
        }));
        set({ selectedMat: id });
      },
      pickMaterial: (id) => {
        if (!get().doc.materials.some((m) => m.id === id)) {
          const lib = MATERIAL_LIBRARY.find((m) => m.id === id);
          if (!lib) return;
          get().commit((doc) => ({ ...doc, materials: [...doc.materials, planMaterial(lib)] }));
        }
        set({ selectedMat: id });
      },
      updateMaterial: (id, patch) =>
        get().commit((doc) => ({
          ...doc,
          materials: doc.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeMaterial: (id) => {
        if (get().doc.materials.length <= 1) return;
        const clear = <T extends { material?: Id }>(item: T): T =>
          item.material === id ? { ...item, material: undefined } : item;
        get().commit((doc) => ({
          ...doc,
          materials: doc.materials.filter((m) => m.id !== id),
          elements: doc.elements.map(clear),
          rooms: doc.rooms.map(clear),
          masks: doc.masks.map(clear),
          components: doc.components.map((c) => ({ ...c, elements: c.elements.map(clear), rooms: c.rooms.map(clear) })),
        }));
        if (get().selectedMat === id) set({ selectedMat: get().doc.materials[0]?.id ?? '' });
      },

      setUnits: (units) => {
        set({ units, gridPx: gridFor(get().grid, units) });
        persistPrefs();
      },
      setShowDimensions: (showDimensions) => {
        set({ showDimensions });
        persistPrefs();
      },
      setLayer: (layer, show) => {
        set({ [layer]: show });
        if (layer === 'showFurniture' && !show) refreshSelection();
        persistPrefs();
      },
      setFurnitureKind: (furnitureKind) => set({ furnitureKind }),
      visibleElements: () => {
        const { doc, showFurniture } = get();
        const v = { layers: doc.layers, showFurniture };
        const els = get().levelElements();
        const hiddenWalls = new Set(els.filter((el) => el.type === 'wall' && isHidden(el, v)).map((el) => el.id));
        return els.filter((el) => !isHidden(el, v) && !('wallId' in el && hiddenWalls.has(el.wallId)));
      },
      pickableElements: () => {
        const v = { layers: get().doc.layers, showFurniture: get().showFurniture };
        return get()
          .visibleElements()
          .filter((el) => !isLocked(el, v));
      },
      pickableRooms: () => {
        const v = { layers: get().doc.layers, showFurniture: get().showFurniture };
        return get()
          .levelRooms()
          .filter((r) => !isHidden(r, v) && !isLocked(r, v));
      },
      shownDoc: () => withoutHidden(get().doc, { layers: get().doc.layers, showFurniture: get().showFurniture }),
      setLayerFlags: (layer, flags) => {
        if (layer === 'furniture' && flags.hidden !== undefined) {
          get().setLayer('showFurniture', !flags.hidden);
          const { hidden: _hidden, ...rest } = flags;
          if (!Object.keys(rest).length) return;
          flags = rest;
        }
        get().commit((doc) => {
          const next = { ...doc.layers?.[layer], ...flags };
          const layers = { ...doc.layers, [layer]: next };
          if (!next.hidden && !next.locked) delete layers[layer];
          return { ...doc, layers };
        });
        // Nothing hidden or locked stays selected.
        const pick = new Set([...get().pickableElements(), ...get().pickableRooms()].map((it) => it.id));
        get().setSelection(get().selectedIds.filter((id) => pick.has(id)));
      },
      hideSelected: () => {
        const ids = new Set(get().selectedIds);
        if (!ids.size) return;
        get().commit((doc) => ({
          ...doc,
          elements: doc.elements.map((el) => (ids.has(el.id) ? { ...el, hidden: true } : el)),
          rooms: doc.rooms.map((r) => (ids.has(r.id) ? { ...r, hidden: true } : r)),
        }));
        get().select(null);
      },
      lockSelected: (locked) => {
        const ids = new Set(get().selectedIds);
        if (!ids.size) return;
        const flag = <T extends { locked?: boolean }>(it: T): T => {
          if (locked) return { ...it, locked: true };
          const { locked: _locked, ...rest } = it;
          return rest as T;
        };
        get().commit((doc) => ({
          ...doc,
          elements: doc.elements.map((el) => (ids.has(el.id) ? flag(el) : el)),
          rooms: doc.rooms.map((r) => (ids.has(r.id) ? flag(r) : r)),
        }));
        if (locked) get().select(null);
      },
      showAllHidden: () => {
        const clear = <T extends { hidden?: boolean }>(it: T): T => {
          if (!it.hidden) return it;
          const { hidden: _hidden, ...rest } = it;
          return rest as T;
        };
        if (!get().showFurniture) get().setLayer('showFurniture', true);
        get().commit((doc) => {
          const layers = Object.fromEntries(
            Object.entries(doc.layers ?? {})
              .map(([id, f]) => [id, { ...f, hidden: undefined }] as const)
              .filter(([, f]) => f.locked),
          );
          return {
            ...doc,
            elements: doc.elements.map(clear),
            rooms: doc.rooms.map(clear),
            layers: Object.keys(layers).length ? layers : undefined,
          };
        });
      },
      unlockAll: () => {
        const clear = <T extends { locked?: boolean }>(it: T): T => {
          if (!it.locked) return it;
          const { locked: _locked, ...rest } = it;
          return rest as T;
        };
        get().commit((doc) => {
          const layers = Object.fromEntries(
            Object.entries(doc.layers ?? {})
              .map(([id, f]) => [id, { ...f, locked: undefined }] as const)
              .filter(([, f]) => f.hidden),
          );
          return {
            ...doc,
            elements: doc.elements.map(clear),
            rooms: doc.rooms.map(clear),
            layers: Object.keys(layers).length ? layers : undefined,
          };
        });
      },
      levelElements: () => {
        const { doc, activeLevel } = get();
        return doc.elements.filter((el) => levelOf(el) === activeLevel);
      },
      levelRooms: () => {
        const { doc, activeLevel } = get();
        return doc.rooms.filter((r) => levelOf(r) === activeLevel);
      },
      setActiveLevel: (id) => {
        if (!get().doc.levels.some((l) => l.id === id) || id === get().activeLevel) return;
        get().cancelBatch();
        if (get().openGroupId) get().closeGroup();
        set({ activeLevel: id, selectedId: null, selectedIds: [], draft: null, inference: null, lastCopy: null });
      },
      addLevel: () => {
        const names = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor'];
        const id = newId();
        get().commit((doc) => ({
          ...doc,
          levels: [...doc.levels, { id, name: names[doc.levels.length] ?? `Floor ${doc.levels.length}` }],
        }));
        get().setActiveLevel(id);
      },
      renameLevel: (id, name) =>
        get().commit((doc) =>
          name.trim() && doc.levels.some((l) => l.id === id && l.name !== name)
            ? { ...doc, levels: doc.levels.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)) }
            : doc,
        ),
      deleteLevel: (id) => {
        if (id === GROUND_LEVEL) return;
        if (get().activeLevel === id) get().setActiveLevel(GROUND_LEVEL);
        get().commit((doc) => ({
          ...doc,
          levels: doc.levels.filter((l) => l.id !== id),
          elements: doc.elements.filter((el) => levelOf(el) !== id),
          rooms: doc.rooms.filter((r) => levelOf(r) !== id),
        }));
      },
      structure: DEFAULT_STRUCTURE,
      setStructure: (patch) => set((st) => ({ structure: { ...st.structure, ...patch } })),
      addColumn: (p) => {
        const { structure: c } = get();
        const col: PlanElement = {
          id: newId(),
          type: 'column',
          x: p.x,
          y: p.y,
          w: c.columnW,
          h: c.columnShape === 'round' ? c.columnW : c.columnH,
          shape: c.columnShape,
        };
        updateElements((els) => [...els, onActive(col)]);
      },
      addLine: (a, b) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= MIN_WALL_PX) return;
        const line: PlanElement = { id: newId(), type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
        updateElements((els) => [...els, onActive(line)]);
      },
      linesToWalls: () => {
        const { doc, selectedIds } = get();
        const lines = doc.elements.filter((el): el is SketchLine => el.type === 'line' && selectedIds.includes(el.id));
        if (!lines.length) {
          get().setWarning('Select some layout lines first.');
          return;
        }
        get().beginBatch();
        const gone = new Set(lines.map((l) => l.id));
        updateElements((els) => els.filter((el) => !gone.has(el.id)));
        for (const l of lines) get().addWall({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
        get().endBatch();
        get().select(null);
      },
      addBeam: (a, b) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= MIN_WALL_PX) return;
        const { structure: c } = get();
        const beam: PlanElement = {
          id: newId(),
          type: 'beam',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          width: c.beamWidth,
          depth: c.beamDepth,
        };
        updateElements((els) => [...els, onActive(beam)]);
      },
      addSlab: (points) => {
        if (points.length < 3) return;
        const slab: PlanElement = { id: newId(), type: 'slab', points, thickness: get().structure.slabThickness };
        updateElements((els) => [...els, onActive(slab)]);
      },
      site: DEFAULT_SITE,
      setSite: (patch) => set((st) => ({ site: { ...st.site, ...patch } })),
      addPlot: (points) => {
        const { site } = get();
        const plot: PlanElement = { id: newId(), type: 'plot', points, front: 2, setbacks: { ...site.setbacks } };
        get().beginBatch();
        updateElements((els) => [...els, plot]);
        if (site.boundaryWall) {
          const thickness = inch(9);
          const walls = boundaryWallLines(plot as Plot, thickness).map(([a, b]): PlanElement => ({
            id: newId(),
            type: 'wall',
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            thickness,
            kind: 'boundary',
            heightMm: KIND_HEIGHT_MM.boundary,
          }));
          updateElements((els) => [...els, ...walls]);
        }
        get().endBatch();
      },
      addStair: (p) => {
        const { site, doc, wallHeightMm } = get();
        const riseMm = site.climb === 'plinth' ? doc.plinthMm : wallHeightMm + SLAB_MM;
        const spec = { shape: site.stairShape, width: site.stairWidthMm / MM_PER_UNIT, riseMm, treadMm: site.treadMm };
        const layout = stairLayout(spec);
        const stair: PlanElement = {
          id: newId(),
          type: 'stair',
          x: p.x,
          y: p.y,
          ...spec,
          riserMm: layout.riserMm,
          w: layout.w,
          h: layout.h,
        };
        updateElements((els) => [...els, onActive(stair)]);
      },
      addParapetAround: (slabId) => {
        const slab = get().doc.elements.find((el): el is Slab => el.type === 'slab' && el.id === slabId);
        if (!slab) return;
        const levels = get().doc.levels;
        const index = levels.findIndex((l) => l.id === levelOf(slab));
        get().beginBatch();
        let roof = levels[index + 1];
        if (!roof) {
          roof = { id: newId(), name: 'Roof' };
          const added = roof;
          get().commit((doc) => ({ ...doc, levels: [...doc.levels, added] }));
        }
        const thickness = inch(4.5);
        const inner = boundaryWallLines(
          { id: '', type: 'plot', points: slab.points, front: 0, setbacks: { front: 0, rear: 0, sides: 0 } },
          thickness,
        );
        const roofId = roof.id;
        const walls = inner.map(([a, b]): PlanElement => ({
          id: newId(),
          type: 'wall',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          thickness,
          kind: 'parapet',
          heightMm: KIND_HEIGHT_MM.parapet,
          levelId: roofId,
        }));
        updateElements((els) => [...els, ...walls]);
        get().endBatch();
        get().setActiveLevel(roofId);
      },
      setPlinthMm: (mm) =>
        get().commit((doc) => (doc.plinthMm === mm ? doc : { ...doc, plinthMm: Math.max(0, Math.min(3000, mm)) })),
      setMode: (mode) => {
        set((s) => ({ mode, tool: mode === 'simple' && !SIMPLE_TOOLS.includes(s.tool) ? 'select' : s.tool }));
        persistPrefs();
      },
      setWallThicknessMm: (wallThicknessMm) => {
        set({ wallThicknessMm });
        persistPrefs();
      },
      setMarlaSqFt: (marlaSqFt) => {
        set({ marlaSqFt });
        persistPrefs();
      },
      setPaper: (paper) => {
        set({ paper });
        persistPrefs();
      },
      setWallHeightMm: (wallHeightMm) => {
        set({ wallHeightMm: Math.min(6000, Math.max(2000, wallHeightMm)) });
        persistPrefs();
      },
      setTheme: (theme) => {
        set({ theme });
        persistPrefs();
      },
      setGrid: ({ spacingMm, ...patch }) => {
        const { grid, units } = get();
        const next = { ...grid, ...patch };
        if (spacingMm !== undefined && Number.isFinite(spacingMm))
          next.spacingMm = { ...grid.spacingMm, [units]: Math.min(GRID_MAX_MM, Math.max(GRID_MIN_MM, spacingMm)) };
        set({ grid: next, gridPx: gridFor(next, units) });
        persistPrefs();
      },
      setGridColor: (line, color) => {
        const { grid, theme } = get();
        const current = { ...grid.colors[theme] };
        if (color) current[line] = color;
        else delete current[line];
        const colors = { ...grid.colors };
        if (current.minor || current.major) colors[theme] = current;
        else delete colors[theme];
        get().setGrid({ colors });
      },
      setView3d: (view3d) => {
        get().cancelBatch();
        set({ view3d, draft: null, inference: null, measureText: '', axisLock: null, shiftLock: null });
        if (!view3d && get().tool === 'orbit') get().setTool('select');
      },

      addRoomAt: (p) => {
        // Any room already there (even a hidden or locked one) counts.
        const existing =
          get()
            .levelRooms()
            .filter((r) => pointInPolygon(p, r.points))
            .at(-1) ?? null;
        if (existing) {
          get().select(existing.id);
          set({ warnings: [] });
          return;
        }
        const points = detectRoom(get().levelElements(), p);
        if (!points) {
          get().setWarning('Click inside an area that is closed on all sides by walls.');
          return;
        }
        const room = onActive<Room>({ id: newId(), name: `Room ${get().levelRooms().length + 1}`, points });
        get().commit((d) => ({ ...d, rooms: [...d.rooms, room] }));
        get().select(room.id);
        set({ warnings: [] });
      },
      updateRoom: (room) =>
        get().commit((doc) =>
          doc.rooms.some((r) => r.id === room.id)
            ? { ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? room : r)) }
            : doc,
        ),
      roomAt: (p) => {
        const rooms = get().pickableRooms();
        // Topmost (last added) room wins where rooms overlap.
        for (let i = rooms.length - 1; i >= 0; i--) if (pointInPolygon(p, rooms[i].points)) return rooms[i];
        return null;
      },
      setViewport: (viewport) => {
        const first = get().viewport.width === 0 || get().viewport.height === 0;
        set({ viewport });
        if (first && viewport.width > 0 && viewport.height > 0) get().fitToPlan();
      },
      setView: (view) => set({ view }),
      zoomBy: (factor, screen) => {
        const { view, viewport } = get();
        set({ view: zoomAt(view, screen ?? { x: viewport.width / 2, y: viewport.height / 2 }, factor) });
      },
      fitToPlan: () => {
        const { doc, viewport } = get();
        if (!viewport.width || !viewport.height) return;
        set({ view: fitView(planBounds(doc.elements, doc.masks) ?? DEFAULT_AREA, viewport) });
      },
      hitTolerance: () => Math.max(2, 12 * get().reach() * get().pxUnits()),
      px3d: null,
      setPx3d: (px3d) => set({ px3d }),
      pxUnits: () => {
        const { view3d, px3d, view } = get();
        return view3d && px3d ? px3d : 1 / view.zoom;
      },
      touchInput: false,
      setTouchInput: (on) => {
        if (get().touchInput !== on) set({ touchInput: on });
      },
      reach: () => (get().touchInput ? 1.8 : 1),

      updateElement: (next) => {
        get().commit((doc) => {
          const prev = doc.elements.find((el) => el.id === next.id);
          if (!prev || prev === next) return doc;
          const elements = doc.elements.map((el) => {
            if (el.id === next.id) return next;
            if (prev.type === 'wall' && next.type === 'wall' && 'wallId' in el && el.wallId === prev.id) {
              return reattachOpening(el, prev, next);
            }
            return el;
          });
          return { ...doc, elements };
        });
      },
      flipOpening: (id, which) => {
        const el = get().doc.elements.find((e) => e.id === id);
        if (!el || (el.type !== 'door' && el.type !== 'window')) return;
        get().updateElement(which === 'side' ? { ...el, flipSide: !el.flipSide } : { ...el, flipHinge: !el.flipHinge });
      },
      nudgeSelected: (dx, dy) => {
        const { doc, selectedIds } = get();
        // A door or window on its own stays in its wall.
        const movable = selectedIds.filter((id) => {
          const it = itemById(doc, id);
          return it && !('type' in it && (it.type === 'door' || it.type === 'window'));
        });
        if (movable.length) get().commit((d) => moveItems(d, movable, dx, dy));
      },
      rotateSelected: (degrees) => {
        const { doc, selectedIds } = get();
        const box = selectionBounds(doc, selectedIds);
        if (!box) return;
        get().commit((d) => rotateItems(d, selectedIds, boundsCentre(box), degrees));
      },

      newPlan: () => {
        const doc = emptyDoc();
        set({ doc, savedDoc: doc, fileName: DEFAULT_FILE_NAME, filePath: undefined, ...resetHistory });
        get().fitToPlan();
      },
      loadDocument: (doc, file) => {
        set({ doc, savedDoc: doc, fileName: file.name, filePath: file.path, ...resetHistory });
        if (!doc.materials.some((m) => m.id === get().selectedMat)) set({ selectedMat: doc.materials[0]?.id ?? '' });
        get().fitToPlan();
      },
      markSaved: (file) => set({ savedDoc: get().doc, fileName: file.name, filePath: file.path }),
    };
  });
}

const loaded = loadPlan();
export const plannerStore = createPlannerStore(loaded.doc, loaded.warning);

plannerStore.subscribe((state, prev) => {
  if (state.doc !== prev.doc) savePlan(state.doc);
  if (state.theme !== prev.theme) applyTheme(state.theme);
});
// Before the first paint, so the app never flashes in the wrong colours.
applyTheme(plannerStore.getState().theme);

export function usePlanner<T>(selector: (state: PlannerState) => T): T {
  return useStore(plannerStore, selector);
}
