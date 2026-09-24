import type { FurnitureKind } from './furniture/catalog';

export type Id = string;

export interface Point {
  x: number;
  y: number;
}

export interface Material {
  id: Id;
  name: string;
  color: string;
  texture: string;
  type?: string;
}

/** Membership of a group or component copy. */
export interface Grouped {
  /** The group this item belongs to. */
  groupId?: Id;
  /** For a component copy: which item of the component definition this is. */
  defKey?: string;
}

export interface Wall extends Grouped {
  id: Id;
  type: 'wall';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Wall thickness in plan units; the default (9") is used when missing. */
  thickness?: number;
  material?: Id;
}

export interface Opening extends Grouped {
  id: Id;
  type: 'door' | 'window';
  wallId: Id;
  x: number;
  y: number;
  /** Rotation in degrees, matching the host wall. */
  angle: number;
  width: number;
  /** Door swings to the other side of the wall. */
  flipSide?: boolean;
  /** Door hinge is at the other end. */
  flipHinge?: boolean;
  material?: Id;
}

export interface Furniture extends Grouped {
  id: Id;
  type: 'furniture';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees about the centre. */
  rotation?: number;
  /** Library item this is (bed, sofa, ...); plain boxes from older plans have none. */
  kind?: FurnitureKind;
  label?: string;
  material?: Id;
}

export type PlanElement = Wall | Opening | Furniture;

export interface Mask {
  id: Id;
  name: string;
  points: Point[];
  material?: Id;
}

/** A named floor area, outlined by walls. */
export interface Room extends Grouped {
  id: Id;
  name: string;
  points: Point[];
  material?: Id;
}

/**
 * Items that move and select together. A component copy also has a component and a placement
 * (x, y, rotation), so it can be rebuilt when the component changes.
 */
export interface Group {
  id: Id;
  name: string;
  componentId?: Id;
  x: number;
  y: number;
  rotation: number;
}

/** A reusable part: its items drawn around 0,0. Every copy (a group with this componentId) matches it. */
export interface ComponentDef {
  id: Id;
  name: string;
  elements: PlanElement[];
  rooms: Room[];
}

/** Everything that is saved and covered by undo/redo. */
export interface PlanDoc {
  elements: PlanElement[];
  rooms: Room[];
  masks: Mask[];
  materials: Material[];
  groups: Group[];
  components: ComponentDef[];
}

export type Tool =
  | 'select'
  | 'pan'
  | 'zoom'
  | 'wall'
  | 'rectangle'
  | 'room'
  | 'door'
  | 'window'
  | 'furniture'
  | 'move'
  | 'rotate'
  | 'tape'
  | 'paint'
  | 'erase'
  | 'brush'
  | 'mask';

/** Every tool, in tool-rail order. */
export const TOOLS: Tool[] = [
  'select',
  'pan',
  'zoom',
  'wall',
  'rectangle',
  'room',
  'door',
  'window',
  'furniture',
  'move',
  'rotate',
  'tape',
  'paint',
  'erase',
  'brush',
  'mask',
];

/** In-progress drawing that is not yet part of the document. */
export type Draft =
  | {
      type: 'wall';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      /** Click-by-click drawing: each click ends a wall and starts the next, until Esc. */
      chain?: boolean;
      /** Where the chain began; clicking it again closes the loop. */
      chainStart?: Point;
    }
  | { type: 'rectangle'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'tape'; a: Point; b: Point; done?: boolean }
  | { type: 'move'; ids: Id[]; base: Point; to: Point; copy: boolean }
  | { type: 'rotate'; ids: Id[]; center: Point; start?: Point; angle: number }
  /** Box selection: dragging right selects what is inside, dragging left what it touches. */
  | { type: 'marquee'; x1: number; y1: number; x2: number; y2: number; additive: boolean }
  | { type: 'mask'; points: Point[]; cursor?: Point }
  | { type: 'brush' }
  | null;

export type Units = 'imperial' | 'metric';

/** Visible area of the plan: top-left corner in plan units and screen pixels per plan unit. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Simple mode shows the tools homeowners need; Pro mode shows everything. */
export type Mode = 'simple' | 'pro';

export const SIMPLE_TOOLS: Tool[] = TOOLS.filter((t) => t !== 'brush' && t !== 'mask');

export type PaperSize = 'A4' | 'A3';

/** Size of one marla in square feet: 225 (LDA and most societies) or 272.25 (traditional). */
export type MarlaSqFt = 225 | 272.25;
