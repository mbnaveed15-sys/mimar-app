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

export interface Wall {
  id: Id;
  type: 'wall';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  material?: Id;
}

export interface Opening {
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

export interface Furniture {
  id: Id;
  type: 'furniture';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees about the centre. */
  rotation?: number;
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

/** Everything that is saved and covered by undo/redo. */
export interface PlanDoc {
  elements: PlanElement[];
  masks: Mask[];
  materials: Material[];
}

export type Tool = 'select' | 'pan' | 'wall' | 'door' | 'window' | 'furniture' | 'paint' | 'brush' | 'mask' | 'erase';

export const TOOLS: Tool[] = [
  'select',
  'pan',
  'wall',
  'door',
  'window',
  'furniture',
  'paint',
  'brush',
  'mask',
  'erase',
];

/** In-progress drawing that is not yet part of the document. */
export type Draft =
  | { type: 'wall'; x1: number; y1: number; x2: number; y2: number }
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
