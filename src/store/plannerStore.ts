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
  translateElement,
} from '../geometry';
import { DEFAULT_FILE_NAME } from '../lib/files';
import { newId } from '../lib/ids';
import { GRID_MAX_MM, GRID_MIN_MM, loadPrefs, savePrefs, type GridPrefs, type Prefs } from '../lib/prefs';
import { emptyDoc, loadPlan, savePlan } from '../lib/storage';
import { MM_PER_UNIT } from '../lib/scale';
import { DEFAULT_AREA, fitView, zoomAt, type Size } from '../lib/view';
import { DEFAULT_FURNITURE_KIND, FURNITURE_CATALOG, type FurnitureKind } from '../furniture/catalog';
import { detectRoom } from '../rooms';
import { applyTheme, type ThemeId } from '../theme/themes';
import { SIMPLE_TOOLS } from '../types';
import type {
  Draft,
  Id,
  MarlaSqFt,
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
  selectedId: Id | null;
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
  mode: Mode;
  wallThicknessMm: number;
  marlaSqFt: MarlaSqFt;
  paper: PaperSize;
  wallHeightMm: number;
  /** True while the 3D view is shown instead of the 2D plan. */
  view3d: boolean;
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
  undo: () => void;
  redo: () => void;

  setTool: (tool: Tool) => void;
  selectMaterial: (id: Id) => void;
  select: (id: Id | null) => void;
  setBrushSize: (px: number) => void;
  setDraft: (draft: Draft) => void;
  setWarning: (message: string | null) => void;

  addWall: (a: Point, b: Point) => void;
  placeOpening: (type: 'door' | 'window', p: Point) => void;
  addFurniture: (p: Point) => void;
  applyMaterial: (id: Id) => void;
  paintAt: (p: Point) => void;
  brushAt: (p: Point) => void;
  eraseAt: (p: Point) => void;
  deleteElement: (id: Id) => void;
  addMaskPoint: (p: Point) => void;
  finishMask: () => void;
  addMaterial: () => void;

  setUnits: (units: Units) => void;
  setShowDimensions: (show: boolean) => void;
  setLayer: (layer: 'showFurniture' | 'showRoomLabels' | 'showRoomFills', show: boolean) => void;
  /** Library item placed by the Furniture tool. */
  furnitureKind: FurnitureKind;
  setFurnitureKind: (kind: FurnitureKind) => void;
  /** Elements that can be clicked: hidden furniture is left out. */
  visibleElements: () => PlanElement[];
  setMode: (mode: Mode) => void;
  setWallThicknessMm: (mm: number) => void;
  setMarlaSqFt: (sqft: MarlaSqFt) => void;
  setPaper: (paper: PaperSize) => void;
  setWallHeightMm: (mm: number) => void;
  setView3d: (on: boolean) => void;
  setTheme: (theme: ThemeId) => void;
  /** Change some grid settings; spacing is for the current units. */
  setGrid: (patch: Partial<Omit<GridPrefs, 'spacingMm'>> & { spacingMm?: number }) => void;

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
      const { units, showDimensions, showFurniture, showRoomLabels, showRoomFills } = get();
      const { mode, wallThicknessMm, marlaSqFt, paper, wallHeightMm, theme, grid } = get();
      savePrefs({
        units,
        showDimensions,
        showFurniture,
        showRoomLabels,
        showRoomFills,
        mode,
        wallThicknessMm,
        marlaSqFt,
        paper,
        wallHeightMm,
        theme,
        grid,
      });
    };
    const resetHistory = { past: [], future: [], batchBase: null, draft: null, selectedId: null, warnings: [] };
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
      furnitureKind: DEFAULT_FURNITURE_KIND,
      mode: prefs.mode,
      wallThicknessMm: prefs.wallThicknessMm,
      marlaSqFt: prefs.marlaSqFt,
      paper: prefs.paper,
      wallHeightMm: prefs.wallHeightMm,
      view3d: false,
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
      undo: () => {
        get().endBatch();
        const { past, doc, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], draft: null });
        get().select(get().selectedId);
      },
      redo: () => {
        get().endBatch();
        const { past, doc, future } = get();
        if (!future.length) return;
        set({ doc: future[0], past: [...past, doc], future: future.slice(1), draft: null });
        get().select(get().selectedId);
      },

      setTool: (tool) => {
        get().endBatch();
        set((s) => ({ tool, draft: null, warnings: [], selectedId: tool === 'select' ? s.selectedId : null }));
      },
      selectMaterial: (id) => set({ selectedMat: id }),
      select: (id) =>
        set((s) => ({
          selectedId:
            id && (s.doc.elements.some((el) => el.id === id) || s.doc.rooms.some((r) => r.id === id)) ? id : null,
        })),
      setBrushSize: (px) => set({ brushSize: px }),
      setDraft: (draft) => set({ draft }),
      setWarning: (message) => set({ warnings: message ? [message] : [] }),

      addWall: (a, b) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= MIN_WALL_PX) return;
        const wall: PlanElement = {
          id: newId(),
          type: 'wall',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          thickness: get().wallThicknessMm / MM_PER_UNIT,
          material: activeMat(),
        };
        updateElements((els) => [...els, wall]);
      },
      placeOpening: (type, p) => {
        const wall = nearestWall(get().doc.elements, p, get().hitTolerance() * 1.5);
        if (!wall) {
          get().setWarning(`Click on a wall to place a ${type}.`);
          return;
        }
        const pos = placeOnWall(wall, p, mmToPx(OPENING_WIDTH_MM[type]));
        updateElements((els) => [...els, { id: newId(), type, wallId: wall.id, ...pos, material: activeMat() }]);
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
        updateElements((els) => [...els, el]);
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
        const hit = findElementNear(get().visibleElements(), p, get().hitTolerance()) ?? get().roomAt(p);
        if (hit) get().applyMaterial(hit.id);
      },
      brushAt: (p) => {
        const mat = activeMat();
        const r = get().brushSize;
        updateElements((els) => {
          let changed = false;
          const next = els.map((el) => {
            const c = elementCenter(el);
            if (el.material === mat || Math.hypot(c.x - p.x, c.y - p.y) > r) return el;
            if (el.type === 'furniture' && !get().showFurniture) return el;
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
              .visibleElements()
              .filter((el) => isNear(el, p, tol))
              .map((el) => el.id),
          );
          const elements = gone.size
            ? doc.elements.filter((el) => !gone.has(el.id) && !('wallId' in el && gone.has(el.wallId)))
            : doc.elements;
          const masks = doc.masks.filter((m) => !pointInPolygon(p, m.points));
          // Rooms are only erased by clicking inside them away from walls and furniture.
          const rooms = gone.size ? doc.rooms : doc.rooms.filter((r) => !pointInPolygon(p, r.points));
          if (elements === doc.elements && masks.length === doc.masks.length && rooms.length === doc.rooms.length) {
            return doc;
          }
          return { ...doc, elements, masks, rooms };
        });
        get().select(get().selectedId);
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
        get().commit((doc) => ({
          ...doc,
          materials: [...doc.materials, { id: `mat_custom_${newId()}`, name: 'Custom', color: '#ffffff', texture: '' }],
        }));
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
        if (layer === 'showFurniture' && !show) {
          const sel = get().doc.elements.find((el) => el.id === get().selectedId);
          if (sel?.type === 'furniture') set({ selectedId: null });
        }
        persistPrefs();
      },
      setFurnitureKind: (furnitureKind) => set({ furnitureKind }),
      visibleElements: () => {
        const { doc, showFurniture } = get();
        return showFurniture ? doc.elements : doc.elements.filter((el) => el.type !== 'furniture');
      },
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
      setView3d: (view3d) => {
        get().endBatch();
        set({ view3d, draft: null });
      },

      addRoomAt: (p) => {
        const { doc } = get();
        const existing = get().roomAt(p);
        if (existing) {
          set({ selectedId: existing.id, warnings: [] });
          return;
        }
        const points = detectRoom(doc.elements, p);
        if (!points) {
          get().setWarning('Click inside an area that is closed on all sides by walls.');
          return;
        }
        const room: Room = { id: newId(), name: `Room ${doc.rooms.length + 1}`, points };
        get().commit((d) => ({ ...d, rooms: [...d.rooms, room] }));
        set({ selectedId: room.id, warnings: [] });
      },
      updateRoom: (room) =>
        get().commit((doc) =>
          doc.rooms.some((r) => r.id === room.id)
            ? { ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? room : r)) }
            : doc,
        ),
      roomAt: (p) => {
        const rooms = get().doc.rooms;
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
      hitTolerance: () => Math.max(2, 12 / get().view.zoom),

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
        const el = get().doc.elements.find((e) => e.id === get().selectedId);
        if (!el || el.type === 'door' || el.type === 'window') return;
        get().updateElement(translateElement(el, dx, dy));
      },
      rotateSelected: (degrees) => {
        const el = get().doc.elements.find((e) => e.id === get().selectedId);
        if (el?.type !== 'furniture') return;
        get().updateElement({ ...el, rotation: ((((el.rotation ?? 0) + degrees) % 360) + 360) % 360 });
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
