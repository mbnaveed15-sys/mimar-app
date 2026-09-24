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
  /** Wall thickness in plan units; the default (9") is used when missing. */
  thickness?: number;
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

/** A named floor area, outlined by walls. */
export interface Room {
  id: Id;
  name: string;
  points: Point[];
  material?: Id;
}

/** Everything that is saved and covered by undo/redo. */
export interface PlanDoc {
  elements: PlanElement[];
  rooms: Room[];
  masks: Mask[];
  materials: Material[];
}

export type Tool =
  'select' | 'pan' | 'wall' | 'room' | 'door' | 'window' | 'furniture' | 'paint' | 'brush' | 'mask' | 'erase';

export const TOOLS: Tool[] = [
  'select',
  'pan',
  'wall',
  'room',
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

/** Simple mode shows the tools homeowners need; Pro mode shows everything. */
export type Mode = 'simple' | 'pro';

export const SIMPLE_TOOLS: Tool[] = ['select', 'pan', 'wall', 'room', 'door', 'window', 'furniture', 'erase'];

export type PaperSize = 'A4' | 'A3';

/** Size of one marla in square feet: 225 (LDA and most societies) or 272.25 (traditional). */
export type MarlaSqFt = 225 | 272.25;
