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

/** Walls other than ordinary ones. */
export type WallKind = 'boundary' | 'parapet' | 'retaining' | 'curtain';

export interface Wall extends Grouped {
  id: Id;
  type: 'wall';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * A curved wall: how far the middle of the arc bows out from the straight line between its ends,
   * towards side A (negative: side B), in plan units. Missing for a straight wall.
   */
  bow?: number;
  /** Wall thickness in plan units; the default (9") is used when missing. */
  thickness?: number;
  /**
   * A boundary wall stands on natural ground (7' tall); a parapet runs round a roof (3'); a
   * retaining wall is a basement's RCC outside wall, holding back the earth (up to the ground floor); a
   * curtain wall is glass in a frame of mullions and transoms.
   */
  kind?: WallKind;
  /** Height in millimetres, when it differs from the usual wall height (e.g. a boundary wall). */
  heightMm?: number;
  /** A glass curtain wall: the spacing of its mullions (upright frames), mm; 4' (1.2 m metric) when missing. */
  mullionMm?: number;
  /** A glass curtain wall: the height of its transom (cross frame) above the floor, mm; door height when missing, 0 for none. */
  transomMm?: number;
  /** Its material: both sides, the top and the ends (unless a side has its own). */
  material?: Id;
  /**
   * A side's own material, SketchUp style (say plaster inside and brick outside). Side A is the one
   * the wall's left normal (-dy, dx) points to, side B the other.
   */
  materialA?: Id;
  materialB?: Id;
  /** A plot's boundary wall: the plot and the side (or its cut corner) it stands on. It follows the plot. */
  plotId?: Id;
  plotSide?: number | 'splay';
}

/** How a door opens: one leaf, two, sliding, folding, a rolling shutter, or no door (a doorway). */
export type DoorKind = 'single' | 'double' | 'sliding' | 'folding' | 'shutter' | 'opening';
/** How a window opens: sliding panes, one or two casement sashes, fixed glass, or a small high ventilator. */
export type WindowKind = 'sliding' | 'casement' | 'casement2' | 'fixed' | 'vent';

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
  /** A door's type (a single leaf when missing). */
  doorKind?: DoorKind;
  /** A window's type (plain glass when missing, as windows were before there were types). */
  windowKind?: WindowKind;
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
/** What lies beyond a side of a plot. */
export type PlotSideKind = 'road' | 'neighbour' | 'back' | 'open';

/** One side of a plot (the edge from points[i] to points[i+1]). */
export interface PlotSide {
  kind: PlotSideKind;
  /** A setback typed for this side, in millimetres; the plot's setback for this kind of side when missing. */
  setbackMm?: number;
  /** A boundary wall along this side (none when missing). */
  wall?: { heightMm: number; thicknessMm: number };
  /** The wall built for this side: it follows the plot when the plot is reshaped. */
  wallId?: Id;
}

export interface Plot extends Grouped {
  id: Id;
  type: 'plot';
  /** Corners, in order round the plot (three or more). */
  points: Point[];
  /** Index of the edge (points[i] to points[i+1]) along the main road. */
  front: number;
  /** Side 1 (`sides`) is the side after the road edge going round the outline; side 2 the other (as side 1 when missing). */
  setbacks: { front: number; rear: number; sides: number; side2?: number };
  /**
   * Each side's type, setback and wall, one per edge. Missing in plots made before 1.30: their sides
   * are worked out from `front` (the road, the side opposite it and the two sides between).
   */
  sideList?: PlotSide[];
  /** A corner plot's cut corner (splay) where the main road meets the other road: its size along each side. */
  splay?: { sizeMm: number; wallId?: Id };
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

/**
 * A section line: where the building is cut for a section drawing, and which way it looks. It is
 * drawn on the plan of every floor, with its letter and an arrow at each end.
 */
export interface SectionLine extends Grouped {
  id: Id;
  type: 'section';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Its letter, at both ends and in the drawing's name (A for "Section A–A"). */
  label: string;
  /** Looks to the left of the line going from its start to its end (to the right when missing). */
  flip?: boolean;
  material?: Id;
}

/**
 * A spot level: the height of the natural ground at a point, above the datum (±0, the road level at
 * the middle of the plot's road side), as on a survey sheet. Always on the ground floor.
 */
export interface SpotLevel extends Grouped {
  id: Id;
  type: 'level';
  x: number;
  y: number;
  /** Height above the datum, in millimetres (below it when negative). */
  zMm: number;
  /** From satellite data (SRTM), roughly 30 m apart: only a guide, and a survey wins where both exist. */
  approx?: boolean;
  material?: Id;
}

/** A contour line of the natural ground: every point of it at one height (above the datum, mm). */
export interface Contour extends Grouped {
  id: Id;
  type: 'contour';
  /** The line, click by click (two or more points; closed when its last point is its first). */
  points: Point[];
  zMm: number;
  material?: Id;
}

/** A finished-ground area (a building pad or a terrace): the ground inside it is levelled to one height. */
export interface Pad extends Grouped {
  id: Id;
  type: 'pad';
  points: Point[];
  zMm: number;
  material?: Id;
}

/** Surroundings fetched from OpenStreetMap: a neighbouring building (a block) or a road (a strip). */
export interface ContextItem extends Grouped {
  id: Id;
  type: 'context';
  kind: 'building' | 'road';
  /** A building's outline, or a road's centre line. */
  points: Point[];
  /** A building's height, mm. */
  heightMm?: number;
  /** A road's width, mm. */
  widthMm?: number;
  /** Its name on the map (a road's name), when it has one. */
  name?: string;
  material?: Id;
}

export type PlanElement =
  | Wall
  | Opening
  | Furniture
  | Column
  | Beam
  | Slab
  | Plot
  | Stair
  | SketchLine
  | Block
  | SectionLine
  | SpotLevel
  | Contour
  | Pad
  | ContextItem;

/** Items outlined (or, for contours and roads, drawn) by a list of points. */
export type PointsElement = Slab | Plot | Block | Contour | Pad | ContextItem;

/** Items outlined (or, for contours and roads, drawn) by a list of points. */
export const hasPoints = (el: PlanElement): el is PointsElement =>
  el.type === 'slab' ||
  el.type === 'plot' ||
  el.type === 'block' ||
  el.type === 'contour' ||
  el.type === 'pad' ||
  el.type === 'context';

/** Ground items: spot levels, contours, finished-ground pads and the surroundings (always on the ground floor). */
export const isSiteItem = (el: PlanElement): el is SpotLevel | Contour | Pad | ContextItem =>
  el.type === 'level' || el.type === 'contour' || el.type === 'pad' || el.type === 'context';

/** A floor of the building. Levels stack in list order, starting with the ground floor. */
export interface Level {
  id: Id;
  name: string;
  /** A floor below the ground floor (there is at most one, first in the list). */
  basement?: boolean;
  /**
   * This floor's wall height (a basement's clear height), floor to ceiling, in millimetres; the
   * project's usual height (a basement's `BASEMENT_HEIGHT_MM`) when missing.
   */
  heightMm?: number;
}

/** A basement's usual clear height: 10'. */
export const BASEMENT_HEIGHT_MM = 3048;

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
  /** A double-height room: the floor above is left open over it. */
  openAbove?: boolean;
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
  /** Which way north points on the plan, in degrees clockwise from straight up (up when missing). */
  northDeg?: number;
  /** Layers that are hidden or locked (every item is on the layer for its kind). */
  layers?: LayerState;
  /** What kind of project this is, and its own settings (a house on a plot, as before 1.33, when missing). */
  project?: ProjectSettings;
  /** The drawing sheets printed to PDF; the suggested set (worked out from the plan) when missing. */
  sheets?: Sheet[];
  /** How the ground is shown and finished (flat at ±0 and levelled there when missing). */
  ground?: GroundSettings;
  /** Where the site is on the map, for the surroundings and satellite levels. */
  location?: { lat: number; lon: number };
}

/** The finished ground and how the ground is drawn. */
export interface GroundSettings {
  /** Inside the plot the ground is levelled to `levelMm` (the default), or left as it is. */
  grade?: 'level' | 'natural';
  /** The height the plot is levelled to, mm above the datum (0, the road level, when missing). */
  levelMm?: number;
  /** Contour interval on the plan, mm (1' or 0.5 m when missing). */
  contourMm?: number;
  /** Tint the plan red where earth is cut and blue where it is filled (on when missing). */
  cutFill?: boolean;
}

/** An elevation: the building seen from one side (the front is the plot's road side). */
export type ElevationSide = 'front' | 'back' | 'left' | 'right';

/** A drawing that can go on a sheet: a floor plan, a section or an elevation. */
export type DrawingRef =
  { kind: 'plan'; levelId: Id } | { kind: 'section'; id: Id } | { kind: 'elevation'; side: ElevationSide };

/** The scales a drawing can be printed at on a sheet (1:50, 1:100, 1:200). */
export type SheetScale = 50 | 100 | 200;

export interface SheetItem {
  drawing: DrawingRef;
  scale: SheetScale;
}

/** A printed sheet: its paper, the drawings on it, and its name in the title block. */
export interface Sheet {
  id: Id;
  name: string;
  paper: PaperSize;
  items: SheetItem[];
}

/** A house on a plot (with bylaws and marla), a free project (studio work, no rules), or a non-residential building. */
export type ProjectType = 'house' | 'free' | 'building';
/** What a building is for: it gives the room types and their hints. */
export type BuildingUse = 'office' | 'school' | 'clinic' | 'shop' | 'mosque' | 'other';
/** The side panel's sections a project can hide. */
export type ProjectPanel = 'bylaws' | 'hints' | 'roomList' | 'cost';

export interface ProjectSettings {
  type: ProjectType;
  use?: BuildingUse;
  /** This project's units; the app's own setting when missing. */
  units?: Units;
  /** The usual wall height of a floor, mm (the slab goes on top); the app's own setting when missing. */
  wallHeightMm?: number;
  /** Floor slab thickness, mm (6" when missing). */
  slabMm?: number;
  /** Sections shown or hidden, where they differ from the project type's usual. */
  panels?: Partial<Record<ProjectPanel, boolean>>;
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
  | 'pushpull'
  | 'section'
  | 'level'
  | 'contour'
  | 'pad';

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
  'section',
  'level',
  'contour',
  'pad',
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
      /** An arc wall with both ends down: the pointer bends it (its bow, as on Wall). */
      bend?: boolean;
      bow?: number;
    }
  | { type: 'rectangle'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'beam'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; chain?: boolean }
  /** A section line: its two ends, then (once both are down) the side it looks to, from the pointer. */
  | { type: 'section'; x1: number; y1: number; x2: number; y2: number; placed: boolean; flip: boolean }
  | { type: 'slab'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'plot'; x1: number; y1: number; x2: number; y2: number }
  /** A plot drawn corner by corner: the corners so far, and where the pointer is. */
  | { type: 'plotPoly'; points: Point[]; cursor: Point }
  /** A contour line drawn click by click: its points so far, and where the pointer is. */
  | { type: 'contour'; points: Point[]; cursor: Point }
  /** A levelled area (pad) dragged or clicked out as a rectangle. */
  | { type: 'pad'; x1: number; y1: number; x2: number; y2: number }
  | {
      type: 'tape';
      a: Point;
      b: Point;
      /** In 3D: heights (mm above the floor being drawn) of the two ends. */
      za?: number;
      zb?: number;
      done?: boolean;
    }
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
      /** Just pasted: placing it finishes the paste (one undo step), Esc takes the paste back. */
      pasted?: boolean;
      /** Copying a door or window on its own: the copy's id. */
      copyId?: Id;
    }
  | { type: 'rotate'; ids: Id[]; center: Point; start?: Point; angle: number }
  /** Offset: a parallel copy of a wall follows the pointer. */
  | {
      type: 'offset';
      wallId: Id;
      side: Point;
      dist: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      /** Offsetting a curved wall: the copy's bow. */
      bow?: number;
    }
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
   * Door or window tool: what would be placed where the pointer is (a see-through copy, and the clear
   * distances to the ends of its piece of wall), or why it can't go there.
   */
  | {
      type: 'opening';
      cursor: Point;
      ghost?: Opening;
      /** Thickness of the wall it would go in. */
      thickness?: number;
      /** Clear distances from the ends of the piece of wall to the opening's edges. */
      dims?: [Point, Point][];
      /** Unit direction across the wall, towards the pointer: the side the distances are shown on. */
      side?: Point;
      error?: string;
    }
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

export type PaperSize = 'A4' | 'A3' | 'A1';

/** Size of one marla in square feet: 225 (LDA and most societies) or 272.25 (traditional). */
export type MarlaSqFt = 225 | 272.25;
