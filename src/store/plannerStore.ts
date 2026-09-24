import { createStore, useStore } from 'zustand';
import { elementCenter, findElementNear, isNear, nearestWall, placeOnWall, pointInPolygon } from '../geometry';
import { newId } from '../lib/ids';
import { loadPlan, savePlan } from '../lib/storage';
import type { Draft, Id, PlanDoc, PlanElement, Point, Tool } from '../types';

export const HISTORY_LIMIT = 100;

const OPENING_WIDTH_MM = { door: 900, window: 1200 } as const;
const FURNITURE_SIZE_MM = { w: 1200, h: 800 } as const;
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
}

export function createPlannerStore(initial: PlanDoc, initialWarning?: string) {
  return createStore<PlannerState>()((set, get) => {
    /** Id of the active material, falling back to the first one if it was removed. */
    const activeMat = () => {
      const { doc, selectedMat } = get();
      return (doc.materials.find((m) => m.id === selectedMat) ?? doc.materials[0])?.id;
    };
    const mmToPx = (mm: number) => mm / get().scaleMMperPx;
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
      gridPx: 25,
      scaleMMperPx: 10,
      warnings: initialWarning ? [initialWarning] : [],
      draft: null,

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
      select: (id) => set((s) => ({ selectedId: id && s.doc.elements.some((el) => el.id === id) ? id : null })),
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
          material: activeMat(),
        };
        updateElements((els) => [...els, wall]);
      },
      placeOpening: (type, p) => {
        const wall = nearestWall(get().doc.elements, p, 20);
        if (!wall) {
          get().setWarning(`Click on a wall to place a ${type}.`);
          return;
        }
        const pos = placeOnWall(wall, p, mmToPx(OPENING_WIDTH_MM[type]));
        updateElements((els) => [...els, { id: newId(), type, wallId: wall.id, ...pos, material: activeMat() }]);
        get().setWarning(null);
      },
      addFurniture: (p) => {
        const el: PlanElement = {
          id: newId(),
          type: 'furniture',
          x: p.x,
          y: p.y,
          w: mmToPx(FURNITURE_SIZE_MM.w),
          h: mmToPx(FURNITURE_SIZE_MM.h),
          material: activeMat(),
        };
        updateElements((els) => [...els, el]);
      },
      applyMaterial: (id) => {
        const mat = activeMat();
        updateElements((els) =>
          els.some((el) => el.id === id && el.material !== mat)
            ? els.map((el) => (el.id === id ? { ...el, material: mat } : el))
            : els,
        );
      },
      paintAt: (p) => {
        const hit = findElementNear(get().doc.elements, p, 16);
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
            changed = true;
            return { ...el, material: mat };
          });
          return changed ? next : els;
        });
      },
      eraseAt: (p) => {
        get().commit((doc) => {
          const gone = new Set(doc.elements.filter((el) => isNear(el, p, 12)).map((el) => el.id));
          const elements = gone.size
            ? doc.elements.filter((el) => !gone.has(el.id) && !('wallId' in el && gone.has(el.wallId)))
            : doc.elements;
          const masks = doc.masks.filter((m) => !pointInPolygon(p, m.points));
          if (elements === doc.elements && masks.length === doc.masks.length) return doc;
          return { ...doc, elements, masks };
        });
        get().select(get().selectedId);
      },
      deleteElement: (id) => {
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
    };
  });
}

const loaded = loadPlan();
export const plannerStore = createPlannerStore(loaded.doc, loaded.warning);

plannerStore.subscribe((state, prev) => {
  if (state.doc !== prev.doc) savePlan(state.doc);
});

export function usePlanner<T>(selector: (state: PlannerState) => T): T {
  return useStore(plannerStore, selector);
}
