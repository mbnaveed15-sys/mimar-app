import type { LayerState } from './lib/layers';
import type { FurnitureKind } from './furniture/catalog';
import type { AuthorityId } from './lib/bylaws';

export type Id = string;

export interface Point {
  x: number;
  y: number;
}

/** How a material's surface is drawn in 3D (and in its swatch). */
export type Pattern =
  | 'plain'
  | 'tiles'
  | 'brick'
  | 'wood'
  | 'marble'
  | 'granite'
  | 'terrazzo'
  | 'stone'
  | 'concrete'
  | 'grass'
  | 'pavers'
  | 'gravel'
  | 'metal'
  | 'glass'
  | 'fabric';

export interface Material {
  id: Id;
  name: string;
  color: string;
  texture: string;
  type?: string;
  /** Surface pattern; plain when missing. */
  pattern?: Pattern;
  /** Size of one repeat (a tile, a brick, a plank's width), in millimetres. */
  sizeMm?: number;
}

/** Membership of a group or component copy, and the floor (level) an item is on. */
export interface Grouped {
  /** The level this item is on; missing means the ground floor. */
  levelId?: Id;
  /** Hidden from view (and exports); it comes back with Show all hidden. */
  hidden?: boolean;
  /** Can't be picked or changed, but still shows and snaps. */
  locked?: boolean;
  /** Raised above (or, below zero, sunk under) its floor, in millimetres. */
  elevMm?: number;
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
  /** A boundary wall stands on natural ground (7' tall); a parapet runs round a roof (3'). */
  kind?: 'boundary' | 'parapet';
  /** Height in millimetres, when it differs from the usual wall height (e.g. a boundary wall). */
  heightMm?: number;
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
  /** A gate: a wide double-leaf opening in a boundary wall, open to the sky. */
  gate?: boolean;
  /** Window sill height above the floor, in millimetres (3' when missing). */
  sillMm?: number;
  /** Window height in millimetres (4' when missing). */
  heightMm?: number;
  /** A window made with the Shape tool: round, arched or any outline (rectangular when missing). */
  shape?: 'circle' | 'arch' | 'polygon';
  /** A polygon's corners in millimetres: x along the wall from its centre, y up from the sill. */
  profile?: Point[];
  /** An open hole: no glass. */
  open?: boolean;
  /** Only drawn on the wall's face so far; Push/Pull it through the wall to cut it. */
  flat?: boolean;
  /** For a flat shape: the face it is drawn on (1 = the left side going from the wall's start to its end). */
  face?: 1 | -1;
  /**
   * For a shape on a wall that isn't cut through, in millimetres: below zero a niche that deep,
   * above zero a projection (a chajja, ledge or pilaster) standing out that far. Flat when missing.
   */
  depthMm?: number;
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

/** A structural column, drawn solid in plan and running floor to ceiling in 3D. */
export interface Column extends Grouped {
  id: Id;
  type: 'column';
  x: number;
  y: number;
  /** Size in plan units (w along x before rotation, h along y); a round column uses w as its diameter. */
  w: number;
  h: number;
  rotation?: number;
  shape: 'rect' | 'round';
  /** Height in millimetres, when it differs from floor to ceiling. */
  heightMm?: number;
  material?: Id;
}

/** A beam under the ceiling, drawn dashed in plan (it is above the cut line). */
export interface Beam extends Grouped {
  id: Id;
  type: 'beam';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Width in plan and depth below the ceiling, in plan units. */
  width: number;
  depth: number;
  material?: Id;
}

/** A floor or roof slab: an outline with a thickness, at the top of its level. */
export interface Slab extends Grouped {
  id: Id;
  type: 'slab';
  points: Point[];
  /** Thickness in plan units. */
  thickness: number;
  /** Voids through it (stair openings, skylights, shafts): outlines in plan units. */
  holes?: Point[][];
  material?: Id;
}

/** The plot: its outline, which edge faces the road, and the setbacks (in mm) from each side. */
export interface Plot extends Grouped {
  id: Id;
  type: 'plot';
  /** Four corners, in order round the plot. */
  points: Point[];
  /** Index of the edge (points[i] to points[i+1]) along the road. */
  front: number;
  /** Side 1 (`sides`) is the side after the road edge going round the outline; side 2 the other (as side 1 when missing). */
  setbacks: { front: number; rear: number; sides: number; side2?: number };
  /** The authority whose bylaws apply (setbacks and the plan check). */
  authority?: AuthorityId;
  material?: Id;
}

/** A stair or ramp, drawn from its computed flights. */
export interface Stair extends Grouped {
  id: Id;
  type: 'stair';
  /** Centre of its footprint, and its turn about that centre. */
  x: number;
  y: number;
  rotation?: number;
  shape: 'straight' | 'L' | 'U' | 'ramp';
  /** Clear width of a flight, in plan units. */
  width: number;
  /** Total height it climbs, in millimetres. */
  riseMm: number;
  /** Riser height and tread depth in millimetres (ramps use riseMm and a 1:12 slope instead). */
  riserMm: number;
  treadMm: number;
  /** Footprint size in plan units (w across, h along the climb), worked out from the rest. */
  w: number;
  h: number;
  material?: Id;
}

/** A layout (drafting) line: a pencil line to plan with, not built. Walls can be made from it. */
export interface SketchLine extends Grouped {
  id: Id;
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  material?: Id;
}

/** The outlines the Shape tool draws. */
export type ShapeKind = 'rect' | 'circle' | 'polygon' | 'arch';

/**
 * A solid block pulled up from a shape (a platform, planter, counter or pillar). With no height it
 * is a flat shape on the floor (or on a slab, or on another block's top), waiting for Push/Pull.
 */
export interface Block extends Grouped {
  id: Id;
  type: 'block';
  /** Outline in plan units. */
  points: Point[];
  /** Height in millimetres; 0 while it is a flat shape. */
  heightMm: number;
  /** What was drawn, for its name and so a circle stays round when it is pushed wider. */
  shape: ShapeKind;
  /** Drawn on top of this slab (its height above floor then counts from the slab's top). */
  slabId?: Id;
  material?: Id;
}

export type PlanElement = Wall | Opening | Furniture | Column | Beam | Slab | Plot | Stair | SketchLine | Block;

/** Items outlined by a list of points. */
export const hasPoints = (el: PlanElement): el is Slab | Plot | Block =>
  el.type === 'slab' || el.type === 'plot' || el.type === 'block';

/** A floor of the building. Levels stack in list order, starting with the ground floor. */
export interface Level {
  id: Id;
  name: string;
}

/** The ground floor's id; items without a levelId are on it. */
export const GROUND_LEVEL = 'ground';

/** The level an item is on. */
export const levelOf = (item: { levelId?: Id }): Id => item.levelId ?? GROUND_LEVEL;

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
  levels: Level[];
  /** Height of the plinth (floor above natural ground), in millimetres. */
  plinthMm: number;
  /** Layers that are hidden or locked (every item is on the layer for its kind). */
  layers?: LayerState;
}

export type Tool =
  | 'select'
  | 'pan'
  | 'zoom'
  | 'orbit'
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
  | 'mask'
  | 'offset'
  | 'mirror'
  | 'trim'
  | 'extend'
  | 'breakWall'
  | 'join'
  | 'fillet'
  | 'chamfer'
  | 'stretch'
  | 'scale'
  | 'column'
  | 'beam'
  | 'slab'
  | 'plot'
  | 'stairs'
  | 'line'
  | 'shape'
  | 'pushpull';

/** Every tool, in tool-rail order. */
export const TOOLS: Tool[] = [
  'select',
  'pan',
  'zoom',
  'orbit',
  'wall',
  'line',
  'rectangle',
  'room',
  'column',
  'beam',
  'slab',
  'plot',
  'stairs',
  'door',
  'window',
  'furniture',
  'shape',
  'pushpull',
  'move',
  'rotate',
  'tape',
  'paint',
  'erase',
  'brush',
  'mask',
  'offset',
  'mirror',
  'trim',
  'extend',
  'breakWall',
  'join',
  'fillet',
  'chamfer',
  'stretch',
  'scale',
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
  | { type: 'beam'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; chain?: boolean }
  | { type: 'slab'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'plot'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'tape'; a: Point; b: Point; done?: boolean }
  /**
   * Move from base to `to`, and up by dz (mm) when locked to the blue axis in 3D. screenY is the
   * pointer's last height on screen; zFrom is where it was (and dz then) when the lock began.
   */
  | {
      type: 'move';
      ids: Id[];
      base: Point;
      to: Point;
      copy: boolean;
      dz?: number;
      screenY?: number;
      zFrom?: { y: number; dz: number };
    }
  | { type: 'rotate'; ids: Id[]; center: Point; start?: Point; angle: number }
  /** Offset: a parallel copy of a wall follows the pointer. */
  | { type: 'offset'; wallId: Id; side: Point; dist: number; x1: number; y1: number; x2: number; y2: number }
  /** Mirror line from a to b; flip turns the originals over instead of copying them. */
  | { type: 'mirror'; ids: Id[]; a: Point; b: Point; flip: boolean }
  /** The first wall picked by Join, Fillet, Chamfer or Break, and where it was clicked. */
  | { type: 'pick'; wallId: Id; point: Point }
  /** Stretch: the box, then a move from base to `to`. */
  | { type: 'stretch'; x1: number; y1: number; x2: number; y2: number; boxDone: boolean; base?: Point; to?: Point }
  /** Scale about base; the reference point sets the size being changed. */
  | { type: 'scale'; ids: Id[]; base: Point; ref?: Point; factor: number }
  /** Box selection: dragging right selects what is inside, dragging left what it touches. */
  | { type: 'marquee'; x1: number; y1: number; x2: number; y2: number; additive: boolean }
  | { type: 'mask'; points: Point[]; cursor?: Point }
  | { type: 'brush' }
  /** Items the eraser has been dragged over, removed when it is let go. */
  | { type: 'erase'; ids: Id[] }
  /** Shape tool: the corners clicked so far on a surface, and where the pointer is. */
  | { type: 'shape'; kind: ShapeKind; surface: ShapeSurface; points: Point[]; cursor: Point }
  /**
   * Push/Pull: the face of an item being pushed or pulled, where it was grabbed (scene metres),
   * the way it faces, and how far it has gone so far (mm, outward is positive).
   */
  | { type: 'push'; id: Id; face: PushFace; origin: Vec3; normal: Vec3; dist: number; dragged?: boolean }
  | null;

/** A point or direction in the 3D scene, in metres (y up, z = plan y). */
export type Vec3 = [number, number, number];

/**
 * Where a shape is drawn. On a floor (or a slab's or block's top), its points are plan points; on a
 * wall's face they are along the wall from its start (x) and up from its foot (y), in plan units.
 */
export type ShapeSurface =
  { on: 'floor'; elevMm: number; slabId?: Id; levelId?: Id } | { on: 'wall'; wallId: Id; face: 1 | -1 };

/** Which face of an item Push/Pull has hold of. */
export type PushFace =
  | { part: 'top' }
  | { part: 'bottom' }
  /** A wall's or beam's end: 1 is its start, 2 its end. */
  | { part: 'end'; end: 1 | 2 }
  /** A side: of a wall or beam (1 = left going from start to end), or of a column along its x or y. */
  | { part: 'side'; sign: 1 | -1; axis?: 'x' | 'y' }
  /** One edge of a slab's or block's outline (from points[index] to the next point). */
  | { part: 'edge'; index: number }
  /** A flat shape on a wall, pushed into it. */
  | { part: 'into' };

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

/** The AutoCAD-style editing tools, shown in Pro mode. */
export const MODIFY_TOOLS: Tool[] = [
  'offset',
  'mirror',
  'trim',
  'extend',
  'breakWall',
  'join',
  'fillet',
  'chamfer',
  'stretch',
  'scale',
];

export const SIMPLE_TOOLS: Tool[] = TOOLS.filter((t) => t !== 'brush' && t !== 'mask' && !MODIFY_TOOLS.includes(t));

export type PaperSize = 'A4' | 'A3';

/** Size of one marla in square feet: 225 (LDA and most societies) or 272.25 (traditional). */
export type MarlaSqFt = 225 | 272.25;
