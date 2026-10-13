import { drawingKey, nextSectionLabel, sideDrawingRefs } from '../lib/drawings/refs';
import { cleanText } from '../lib/text';
import { createStore, useStore } from 'zustand';
import {
  elementCenter,
  findElementNear,
  isNear,
  placeOnWall,
  planBounds,
  pointInPolygon,
  reattachOpening,
  wallLength,
} from '../geometry';
import { DEFAULT_FILE_NAME } from '../lib/files';
import { newId } from '../lib/ids';
import { GRID_MAX_MM, GRID_MIN_MM, loadPrefs, savePrefs, type GridPrefs, type Prefs } from '../lib/prefs';
import type { CheckCategory, ChecksPrefs, SnapGroup, SnapsPrefs } from '../lib/checks';
import { DEFAULT_PANELS, clampPanelWidth, movePanel, type PanelLayout, type SectionId } from '../lib/panels';
import { DEFAULT_TOOLBARS, moveToolbar, type DockArea, type ToolbarId, type ToolbarLayout } from '../lib/toolbars';
import { emptyDoc, loadFileInfo, loadPlan, saveFileInfo, savePlan, STORAGE_KEY, type FileInfo } from '../lib/storage';
import { MM_PER_UNIT } from '../lib/scale';
import { DEFAULT_AREA, fitView, MAX_ZOOM, VIEW_HISTORY, VIEW_STEP_MS, zoomAt, type Size } from '../lib/view';
import { syncDimensions } from '../lib/dimensions';
import { DEFAULT_FURNITURE_KIND, FURNITURE_CATALOG, type FurnitureKind } from '../furniture/catalog';
import { DEFAULT_SERVICE_KIND, isService, kindPlaced, syncRuns } from '../lib/services';
import { resetElementSize, type ScaleAxis } from '../lib/resize';
import { detectRoom, openWallEnds } from '../rooms';
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
  raiseItems,
  rotateItems,
  selectionBounds,
  syncComponent,
  ungroup,
} from '../lib/selection';
import { boundaryWallLines, buildableArea, stairLayout, stairSpec } from '../lib/site';
import { type AuthorityId } from '../lib/bylaws';
import { appliedRule, appliedSetbacks } from '../lib/buildingCheck';
import {
  guessSideKinds,
  insetPolygon,
  orientOutline,
  outlineProblem,
  outlinePoints,
  plotSides,
  setbacksFromLeftRight,
  signedArea2,
  withCorner,
} from '../lib/plot';
import { boundaryWallsAlong, buildPlotWalls, syncPlotWalls } from '../lib/plotWalls';
import { formatLength } from '../lib/units';
import {
  basementOf,
  groundIndex,
  isSiteLevel,
  levelWallMm,
  onSharedLevel,
  sharedLevelIds,
  slabMm,
  stairRiseMm,
  withSiteLevel,
} from '../lib/levels';
import { projectOf, unitsFor } from '../lib/project';
import { outsideOutline } from '../lib/outline';
import { CURTAIN_MM, hasPlinth, isBuildingWall } from '../walls';
import { wallPath, type WallLine } from '../lib/arc';
import { pathOutline, roundedRect, type CurveMode } from '../lib/curves';
import { splitSolidsByLine } from '../lib/splitSolids';
import { DEFAULT_SUN } from '../lib/sun';
import { divideWall } from '../lib/modify';
import {
  DORMER_W_MM,
  DORMER_WALL_MM,
  dormerFrontAt,
  dormerParts,
  faceUnder,
  SKYLIGHT_L_MM,
  SKYLIGHT_W_MM,
  skylightParts,
} from '../lib/roof/roofOpenings';
import { groundOf, roundLevel } from '../lib/terrain/ground';
import type { Built } from '../lib/layoutBuild';
import { MATERIAL_LIBRARY, planMaterial } from '../lib/materials';
import { isHidden, isLocked, withoutHidden, type LayerFlags, type LayerId } from '../lib/layers';
import { clampGap, type Hand } from '../lib/openingPlace';
import { besideOpening, loneOpenings, nounOf, openingAt, refitOpening, tidy } from './openingAt';
import { setActivePicker } from '../three/picker';
import { applyTheme, type ThemeId } from '../theme/themes';
import { BASEMENT_HEIGHT_MM, GROUND_LEVEL, levelOf, SITE_LEVEL } from '../types';
import { ROOF_OVERHANG_MM, ROOF_PITCH_DEG, ROOF_THICKNESS_MM } from '../lib/roof/roof';
import type {
  RoofKind,
  Roof,
  Skylight,
  Dormer,
  RunSystem,
  SunSettings,
  Block,
  ContextItem,
  GroundSettings,
  DoorKind,
  Opening,
  ShapeKind,
  Wall,
  WallKind,
  Plot,
  PlotSide,
  BuildingUse,
  ProjectSettings,
  ProjectType,
  SketchLine,
  Sheet,
  Slab,
  Stair,
  Draft,
  Id,
  AreaIn,
  MarlaSqFt,
  Material,
  PaperSize,
  PlanDoc,
  DrawingStyle,
  PlanElement,
  Point,
  Room,
  Tool,
  Units,
  View,
  WindowKind,
  Bounds,
  Dimension,
  PlinthSpec,
} from '../types';

export const HISTORY_LIMIT = 100;

export interface StructureSpec {
  columnShape: 'rect' | 'round';
  columnW: number;
  columnH: number;
  beamWidth: number;
  beamDepth: number;
  slabThickness: number;
  /**
   * How the Slab tool draws: a rectangle (or the room clicked), corner by corner, over rooms picked
   * one by one, or round the outside of the walls clicked.
   */
  slabMode: SlabMode;
}

export type SlabMode = 'rect' | 'corners' | 'rooms' | 'walls';

export interface SiteSpec {
  /** Setbacks for new plots: `sides` is the left side and `side2` the right (as `sides` when missing), seen from the road. */
  setbacks: { front: number; rear: number; sides: number; side2?: number };
  /** Bylaws for new plots: their setbacks come from the authority's table. */
  authority?: AuthorityId;
  /** A plot size picked from the presets (feet, width along the road × depth): the next click places it. */
  plotSize?: { w: number; d: number };
  /** The Plot tool draws a rectangle, or any shape corner by corner. */
  plotShape: 'rect' | 'any';
  boundaryWall: boolean;
  /** Type of new walls drawn with the Wall and Rectangle tools. */
  wallKind: 'normal' | WallKind;
  /** The Wall tool draws arcs: the start, the end, then a point the curve passes through. */
  wallArc: boolean;
  /** How the Curve tool draws, and whether it makes walls or layout lines. */
  curveMode: CurveMode;
  curveMake: 'wall' | 'line' | 'path';
  /** How the Dimension tool measures, and whether each dimension carries on from the last. */
  dimMode: DimMode;
  dimChain: boolean;
  /** Width of a path or driveway made with the Curve tool, mm. */
  pathWidthMm: number;
  /** The Rectangle tool rounds its corners to this radius (mm); 0 for square corners. */
  rectRadiusMm: number;
  /** Door tool places a door or a gate. */
  gate: boolean;
  gateWidthMm: number;
  /** The type of new doors and windows. */
  doorKind: DoorKind;
  windowKind: WindowKind;
  /** Width of new doors (the type's own width when missing). */
  doorWidthMm?: number;
  /** New doors' hinge side, seen from the side they open into. */
  doorHand: Hand;
  /** Width, sill and height of new windows (the type's own when missing). */
  windowWidthMm?: number;
  windowSillMm?: number;
  windowHeightMm?: number;
  /** A material picked up from a door or window, for new ones (the chosen material when missing). */
  openingMaterial?: Partial<Record<'door' | 'window', Id>>;
  stairShape: Stair['shape'];
  stairWidthMm: number;
  treadMm: number;
  /** A curved stair's inner radius (mm), and which way curved and spiral stairs turn. */
  stairInnerMm?: number;
  stairTurn?: Stair['turn'];
  /** A stair climbs a full floor; a ramp or plinth steps climb the plinth. */
  climb: 'floor' | 'plinth';
  /** Height of new spot levels and contour lines, mm above the datum (the road level). */
  groundMm: number;
  /** New roofs: their shape, pitch (degrees) and overhang (mm; 1'6" or 450 mm by the units when missing). */
  roofShape: RoofKind;
  roofPitchDeg: number;
  roofOverhangMm?: number;
}

/** The Dimension tool: along the two points, horizontal or vertical (by where the pointer goes), or a radius. */
export type DimMode = 'aligned' | 'linear' | 'radius';

/** Heights of boundary walls (7') and parapets (3'). */
/** A path or driveway made with the Curve tool: 4' wide, paving 3" thick, standing on the ground. */
export const PATH_WIDTH_MM = 1219.2;
export const PATH_HEIGHT_MM = 76.2;
export const KIND_HEIGHT_MM = { boundary: 2133.6, parapet: 914.4, retaining: 3048 + 152.4 } as const;
/** The height a new wall of this type starts at, or undefined for the floor's own wall height. */
export const kindHeightMm = (kind?: WallKind): number | undefined =>
  kind && kind !== 'curtain' ? KIND_HEIGHT_MM[kind] : undefined;
/** A retaining wall's usual thickness: 12" RCC, in millimetres. */
export const RETAINING_MM = 304.8;

export const DEFAULT_SITE: SiteSpec = {
  setbacks: { front: 1524, rear: 609.6, sides: 0 },
  plotShape: 'rect',
  boundaryWall: true,
  wallKind: 'normal',
  wallArc: false,
  curveMode: 'arc3',
  curveMake: 'wall',
  pathWidthMm: PATH_WIDTH_MM,
  rectRadiusMm: 0,
  dimMode: 'linear',
  dimChain: false,
  gate: false,
  gateWidthMm: 3048,
  doorKind: 'single',
  windowKind: 'sliding',
  doorHand: 'right',
  stairShape: 'straight',
  stairWidthMm: 914.4,
  treadMm: 254,
  climb: 'floor',
  groundMm: 0,
  roofShape: 'hip',
  roofPitchDeg: ROOF_PITCH_DEG,
};

/** A copy of an object without one key. */
function omit<T extends object, K extends keyof T>(obj: T, key: K): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

const inch = (n: number) => (n * 25.4) / MM_PER_UNIT;
/** Items a plan from the room list takes the place of on its floor (with ordinary walls). */
/** Items Duplicate floor leaves behind: the plot and the site, section lines and roofs. */
const NOT_COPIED_UP: PlanElement['type'][] = ['plot', 'section', 'level', 'contour', 'pad', 'context', 'roof'];

const FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor'];
/** A new top floor's name, by how far above the ground floor it is (a basement doesn't count). */
function nextFloorName(doc: PlanDoc): string {
  const n = doc.levels.filter((l) => !l.basement && !l.site).length;
  return FLOOR_NAMES[n] ?? `Floor ${n}`;
}

const REPLACED_BY_LAYOUT = new Set<string>(['stair', 'furniture', 'column', 'beam', 'slab', 'block']);

/**
 * What a plan from the room list replaces on a floor: its house walls (and walls of the `also`
 * kinds) with their doors and windows, its rooms, and the items in `REPLACED_BY_LAYOUT`. Gives what
 * is kept, and how many of each go.
 */
function replacedByLayout(doc: PlanDoc, level: Id, also: WallKind[] = []) {
  const here = (el: { levelId?: Id }) => levelOf(el) === level;
  const going = doc.elements.filter(
    (el) =>
      here(el) &&
      ((el.type === 'wall' && (isBuildingWall(el) || (!!el.kind && also.includes(el.kind)))) ||
        REPLACED_BY_LAYOUT.has(el.type)),
  );
  const gone = new Set(going.map((el) => el.id));
  const kept = doc.elements.filter(
    (el) => !gone.has(el.id) && !((el.type === 'door' || el.type === 'window') && gone.has(el.wallId)),
  );
  const walls = going.filter((el) => el.type === 'wall').length;
  const rooms = doc.rooms.filter(here).length;
  return { kept, count: { walls, rooms, other: going.length - walls } };
}
/** A 9-inch boundary wall, in millimetres. */
export const BOUNDARY_MM = 228.6;
/** 9" × 12" columns, 9" × 18" beams and a 6" slab: common RCC sizes for Pakistani houses. */
export const DEFAULT_STRUCTURE: StructureSpec = {
  columnShape: 'rect',
  columnW: inch(9),
  columnH: inch(12),
  beamWidth: inch(9),
  beamDepth: inch(18),
  slabThickness: inch(6),
  slabMode: 'rect',
};
export { MM_PER_UNIT };

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
  /** The wall whose automatic plinth is selected (as its own item), or null. */
  selectedPlinth: Id | null;
  /** The group or component copy open for editing (its items can be picked one by one). */
  openGroupId: Id | null;
  /** The floor being drawn on; only its items are shown and editable in 2D. */
  activeLevel: Id;
  setActiveLevel: (id: Id) => void;
  /** Add a floor above the top one and switch to it. */
  addLevel: () => void;
  /**
   * A new floor on top with a copy of everything on the floor being drawn (not the plot, site and
   * terrain items, section lines or roofs), then draw on it.
   */
  duplicateLevel: () => void;
  /** How strongly the floor below shows under the one being drawn, 0 (hidden) to 100. */
  belowOpacity: number;
  setBelowOpacity: (percent: number) => void;
  /** Add a basement below the ground floor (or go to the one there is) and draw on it. */
  addBasement: () => void;
  /** Go to the Ground (site) level, the lawn under the ground floor, adding it if the plan has none. */
  showSiteLevel: () => void;
  /** Draw the plinth yourself on the Ground (site) level (ground-floor walls start at the floor), or not. */
  setOwnPlinth: (own: boolean) => void;
  /** Select the automatic plinth under a wall (null: none). */
  selectPlinth: (wallId: Id | null) => void;
  /** Change the automatic plinth's projection past the walls or its material (undefined: back to the usual). */
  setPlinth: (patch: Partial<PlinthSpec>) => void;
  /** The plinth's own projection (mm) and material under one wall; null goes back to the plinth's own setting. */
  setWallPlinthOwn: (wallId: Id, patch: { projectMm?: number | null; material?: Id | null }) => void;
  /** Build the automatic plinth under a wall, or leave it off. */
  setWallPlinth: (wallId: Id, on: boolean) => void;
  /** The basement's clear height, floor to ceiling, in millimetres. */
  setBasementHeight: (mm: number) => void;
  /**
   * Retaining walls (12" RCC) round the basement, their outer face under the ground floor's outside
   * walls ('house') or on the plot's building line ('building'), in place of the ones it had (one
   * undo step). Says why and returns false when there is no basement, house or plot to follow.
   */
  addRetainingWalls: (mode: 'house' | 'building') => boolean;
  renameLevel: (id: Id, name: string) => void;
  /** Remove a floor (not the ground floor, nor the Ground (site) level while it has items) and everything on it. */
  deleteLevel: (id: Id) => void;
  /** Elements and rooms on the active floor. */
  levelElements: () => PlanElement[];
  levelRooms: () => Room[];
  setPlinthMm: (mm: number) => void;
  /** Which way north points on the plan, in degrees clockwise from up. */
  setNorthDeg: (deg: number) => void;
  /** Change how dimensions and drawings look (one undo step); a default value is dropped. */
  setDrawingStyle: (patch: Partial<DrawingStyle>) => void;
  /** Sizes for new columns, beams and slabs, in plan units. */
  structure: StructureSpec;
  setStructure: (patch: Partial<StructureSpec>) => void;
  addColumn: (p: Point) => void;
  addBeam: (a: Point, b: Point) => void;
  /** A layout (drafting) line on the floor being drawn. */
  /** A layout line; a straight one drawn right across blocks and slabs splits them (see splitSolids.ts). */
  addLine: (a: Point, b: Point, bow?: number) => void;
  /** Cut a wall or layout line into equal parts, or into pieces of a length (mm). */
  divideItem: (id: Id, how: { parts: number } | { everyMm: number }) => void;
  /** A dimension on the floor being drawn (its id is made here); returns the id. */
  addDimension: (dim: Omit<Dimension, 'id'>) => Id;
  /**
   * Add a curve from the Curve tool: walls or layout lines (as the tool is set), one per piece, as
   * one step. A closed curve of walls gets the room inside it, found from `inside`.
   */
  addCurve: (pieces: WallLine[], inside?: Point) => void;
  /** A section line from a to b, looking to its right (or left when flipped), with the next free letter. */
  addSection: (a: Point, b: Point, flip: boolean) => void;
  /** Make walls (current thickness) along the selected layout lines, and remove the lines. */
  linesToWalls: () => void;
  /** A slab over the outline (with voids in it, if given). */
  addSlab: (points: Point[], holes?: Point[][]) => void;
  /** A spot level of the natural ground (on the ground floor), mm above the datum. */
  addSpotLevel: (p: Point, zMm: number) => void;
  /** A contour line of the natural ground (on the ground floor). */
  addContour: (points: Point[], zMm: number) => void;
  /** A levelled area; at the natural ground's height at its middle (rounded) unless given. */
  addPad: (points: Point[], zMm?: number) => void;
  /** A levelled area under the house (its outside walls, 3' or 1 m round), at the natural ground's height there. */
  padUnderHouse: () => boolean;
  /** A roof over an outline drawn round the walls, reaching past it by the overhang, with the Roof tool's settings. */
  addRoof: (points: Point[]) => boolean;
  /** Change the 3D view's sun (one undo step). */
  setSun: (patch: Partial<SunSettings>) => void;
  /** Put the north arrow at a point, turned to north (degrees clockwise from up), as one undo step; null takes it away. */
  placeNorth: (at: Point | null, deg?: number) => void;
  /** A skylight on the roof slope under p (on this floor); false, with a warning, when it can't go there. */
  addSkylight: (p: Point) => boolean;
  /** A dormer on the roof slope under p, its front 600 mm in from the eaves. */
  addDormer: (p: Point) => boolean;
  /** A roof over the outside of the walls on the floor being viewed. */
  roofOverHouse: () => boolean;
  /** How the ground is finished and drawn. */
  setGround: (patch: Partial<GroundSettings>) => void;
  /** Add a survey's levels and contour lines as one step, grouped and selected so they can be lined up. */
  importSurvey: (levels: { x: number; y: number; zMm: number }[], contours: { points: Point[]; zMm: number }[]) => void;
  /** Remove the surveyed spot levels and contour lines (not the satellite levels). */
  clearSurvey: () => void;
  /** Where the site is on the map (none clears it). */
  setLocation: (at: { lat: number; lon: number } | null) => void;
  /** Replace the surroundings with these (fetched from OpenStreetMap). */
  setContext: (items: Omit<ContextItem, 'id' | 'type'>[]) => void;
  /** Replace the satellite levels with these. */
  setSatelliteLevels: (levels: { x: number; y: number; zMm: number }[]) => void;
  /** Where each tool bar is docked; moving one keeps the order of the rest. */
  toolbars: ToolbarLayout;
  dockToolbar: (id: ToolbarId, area: DockArea, index?: number) => void;
  resetToolbars: () => void;
  /** The side panel's layout (kept between sessions). */
  panels: PanelLayout;
  setPanels: (patch: Partial<PanelLayout>) => void;
  /** Move a section of the side panel before the one at `index`. */
  movePanel: (id: SectionId, index: number) => void;
  resetPanels: () => void;
  /** What the Shape tool draws. */
  shapeKind: ShapeKind;
  setShapeKind: (kind: ShapeKind) => void;
  /** A flat shape on the floor (or a slab's or block's top), ready for Push/Pull. Returns its id. */
  addFloorShape: (points: Point[], kind: ShapeKind, on?: { elevMm?: number; slabId?: Id }) => Id | null;
  /**
   * A flat shape on a wall's face: outline along the wall from its start (x) and up from its foot
   * (y), in plan units. Push/Pull it through to cut the opening. Returns its id.
   */
  addWallShape: (wallId: Id, face: 1 | -1, kind: ShapeKind, outline: Point[]) => Id | null;
  /** The face Push/Pull would take hold of in the 2D plan, lit up. */
  hoverEdge: [Point, Point] | null;
  setHoverEdge: (edge: [Point, Point] | null) => void;
  /** Settings for plots, wall types, gates and stairs. */
  site: SiteSpec;
  setSite: (patch: Partial<SiteSpec>) => void;
  /**
   * A plot with its setbacks, and a boundary wall round it when that option is on, linked to its
   * sides. `road` is the edge along the road (the bottom of a `plotRect`). Refuses (with a warning,
   * returning false) outlines that cross themselves.
   */
  addPlot: (points: Point[], road?: number) => boolean;
  /**
   * Change a plot (corners, sides, cut corner…) as one undo step, building or taking away its linked
   * boundary walls to match. Refuses, with a warning, outlines that cross themselves and plots with no road.
   */
  updatePlot: (plot: Plot) => boolean;
  /** Move one corner of a plot (while dragging it); refused where the sides would cross. */
  movePlotCorner: (plotId: Id, index: number, p: Point) => boolean;
  /** A gate in the middle of a side's boundary wall (or its cut corner's). */
  addSideGate: (plotId: Id, side: number | 'splay') => void;
  /**
   * Link a plot to boundary walls built from its sides: boundary walls already along its sides are
   * replaced by linked ones of the same size, keeping their doors and gates; with none, every side gets one.
   */
  rebuildPlotWalls: (plotId: Id) => void;
  /**
   * What placing a plan would take away on the floor being viewed: its walls (not boundary walls or
   * parapets) with their doors and windows, rooms, stairs, furniture, columns, beams, slabs and blocks.
   */
  layoutClash: (retaining?: boolean) => { walls: number; rooms: number; other: number };
  /** Put a plan built from the room list on the floor being viewed, in place of what `layoutClash` counts (one undo step). */
  placeLayout: (built: Built, retaining?: boolean) => void;
  /** The first floor (the floor just above the ground floor), if there is one. */
  firstFloorId: () => Id | null;
  /** What placing a first-floor plan would take away there: as `layoutClash`, parapets included. */
  upperClash: () => { walls: number; rooms: number; other: number };
  /**
   * Put a first-floor plan (built on `levelId`) on the first floor, adding that floor when there is
   * none, in place of what `upperClash` counts; the ground-floor stair room `stairRoomId` is left open
   * to it (its stair well). One undo step; the first floor is then shown.
   */
  placeUpperLayout: (built: Built, levelId: Id, stairRoomId?: Id) => void;
  /** Put a plot under an authority's bylaws (or none), taking its setbacks from their table. */
  setPlotAuthority: (plotId: Id, authority: AuthorityId | undefined) => void;
  /** Put a building's plot in an area under its authority (a Markaz, main commercial…), taking its setbacks. */
  setPlotBylawArea: (plotId: Id, area: string | undefined) => void;
  addStair: (p: Point) => void;
  /** Parapet walls round a roof slab, on the floor above it (a Roof floor is added if needed). */
  addParapetAround: (slabId: Id) => void;
  brushSize: number;
  gridPx: number;
  scaleMMperPx: number;
  warnings: string[];
  /** Wall ends joined to nothing, circled while the warning about a room not closed shows. */
  gapEnds: Point[];
  draft: Draft;

  units: Units;
  showDimensions: boolean;
  showFurniture: boolean;
  showRoomLabels: boolean;
  showRoomFills: boolean;
  exportLines: boolean;
  wallThicknessMm: number;
  marlaSqFt: MarlaSqFt;
  /** What room areas are shown in on the plan (a preference). */
  areaIn: AreaIn;
  setAreaIn: (areaIn: AreaIn) => void;
  paper: PaperSize;
  wallHeightMm: number;
  /**
   * The view in use is the 3D one: the 3D view shown instead of the 2D plan or, in split view, the
   * pointer over the 3D side.
   */
  view3d: boolean;
  /** Split view: the 2D plan and the 3D view side by side, both editable. */
  split: boolean;
  /**
   * The Drawings view: the section, elevation or sheet shown (a drawing key such as "section:<id>"
   * or "elevation:front", or "sheet:<id>"), in place of the plan; null when the plan or 3D is shown.
   */
  drawing: string | null;
  /** Open the Drawings view on a drawing or sheet (the first one when missing). */
  showDrawing: (key?: string) => void;
  /** Keep these drawing sheets in the plan (none: go back to the suggested set). */
  setSheets: (sheets: Sheet[] | undefined) => void;
  /** Text typed into the Measurements box, not yet applied. */
  measureText: string;
  /** What the pointer snapped to, shown as a coloured marker. */
  inference: Inference | null;
  /** Locked to the red (x), green (y) or, moving in 3D, blue (z, up and down) axis. */
  axisLock: 'x' | 'y' | 'z' | null;
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
  checks: ChecksPrefs;
  snaps: SnapsPrefs;
  view: View;
  viewport: Size;
  /** Earlier views, newest last, for Zoom previous. */
  viewBack: View[];

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
  /** Throw away the last undo step without keeping it for redo (a paste taken back with Esc). */
  discardLastStep: () => void;
  /** Join the last two undo steps into one (a paste and where it was placed). */
  mergeLastSteps: () => void;
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
  setAxisLock: (axis: 'x' | 'y' | 'z' | null) => void;
  setShiftLock: (dir: Point | null) => void;
  setLastCopy: (copy: PlannerState['lastCopy']) => void;
  /** Add finished elements (copies, pastes) as one undo step. */
  addElements: (elements: PlanElement[]) => void;
  /** Four walls around the box from a to b, and the room inside, as one undo step. */
  addRectangle: (a: Point, b: Point) => void;
  copySelected: () => void;
  /** Paste the copied items (a grid step on from the last paste); returns the new items' ids. */
  paste: () => Id[];
  duplicateSelected: () => void;

  /** A new wall from a to b on the active floor; with a bow, curved (see Wall.bow). */
  addWall: (a: Point, b: Point, bow?: number) => void;
  /**
   * Place a door or window on the wall near p, or a typed distance from the nearer corner; false
   * (with a warning saying why) when it doesn't fit.
   */
  placeOpening: (type: 'door' | 'window', p: Point, typedMm?: number) => boolean;
  /** Gap kept between doors and windows and corners (and each other), in mm. */
  openingGapMm: number;
  setOpeningGapMm: (mm: number) => void;
  /**
   * A door or window picked up (Alt-click) or pasted: the next clicks place copies of it. Pasted
   * ones (`stampQueue`) go down one per click, in turn; a picked-up one stays until the tool or its
   * settings change.
   */
  openingStamp: Opening[];
  stampQueue: boolean;
  setOpeningStamp: (stamp: Opening[], queue?: boolean) => void;
  /** Place the chosen library item centred at `p`, turned `rotation` (the Furniture tool's angle when missing). */
  addFurniture: (p: Point, rotation?: number) => void;
  /**
   * Give an item the chosen material. For a wall, `side` paints just one side (1 is side A, -1
   * side B) or, with 0, just the top and ends; without it the whole wall, both sides included.
   */
  applyMaterial: (id: Id, side?: 1 | -1 | 0) => void;
  /** Take a wall side's own material off, so it shows the wall's material again. */
  clearWallSide: (id: Id, side: 1 | -1) => void;
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
  setLayer: (
    layer:
      | 'showFurniture'
      | 'showRoomLabels'
      | 'showRoomFills'
      | 'exportLines'
      | 'pdfCheck'
      | 'showHints'
      | 'pdfHints'
      | 'pdfZones'
      | 'accessibleZones'
      | 'selectionBar',
    show: boolean,
  ) => void;
  /** Add the plan check page to PDFs. */
  pdfCheck: boolean;
  /** Show plan hints (good-practice advice) in the Plan check section and on the plan. */
  showHints: boolean;
  /** Add the plan hints to the PDF's plan check page. */
  pdfHints: boolean;
  /** Show every furniture item's use zone in PDF and PNG exports of the plan. */
  pdfZones: boolean;
  /** Furniture use zones sized for a wheelchair user (ADA), where they differ. */
  accessibleZones: boolean;
  /** Show the selection bar with a mouse (touch screens always show it). */
  selectionBar: boolean;
  /** Library item placed by the Furniture tool. */
  furnitureKind: FurnitureKind;
  setFurnitureKind: (kind: FurnitureKind) => void;
  /** The Services tool's item (a light, socket, tap…). */
  serviceKind: FurnitureKind;
  setServiceKind: (kind: FurnitureKind) => void;
  /** What the Wire or pipe tool draws. */
  runSystem: RunSystem;
  setRunSystem: (system: RunSystem) => void;
  /** A wire or pipe run through `points`, its ends joined to the items given (one undo step). */
  addRun: (points: Point[], from?: Id, to?: Id) => void;
  /** How far the Furniture tool turns the next item placed (degrees, clockwise on the plan, as Rotation). */
  furnitureAngle: number;
  setFurnitureAngle: (deg: number) => void;
  /** Where the Furniture tool would put the item at the pointer (its centre), shown see-through. */
  furnitureGhost: (Point & { rotation: number }) | null;
  setFurnitureGhost: (at: (Point & { rotation: number }) | null) => void;
  /** Which way the Scale tool stretches: both ways, or only across (x) or only up and down (y). */
  scaleAxis: ScaleAxis;
  setScaleAxis: (axis: ScaleAxis) => void;
  /** Alt is held: snapping works the other way round (off while it is on, on while it is off). */
  snapFlip: boolean;
  setSnapFlip: (flip: boolean) => void;
  /** The side grip last dragged, so a length typed next sets that size exactly. */
  lastResize: { id: Id; grip: string } | null;
  setLastResize: (r: { id: Id; grip: string } | null) => void;
  /** Move items to another level: on Ground, between its floor and its lawn (doors and windows go with their walls). */
  setItemsLevel: (ids: Id[], levelId: Id) => void;
  /** Put the selected furniture back to its library size, and columns to the Structure size. */
  resetSize: (ids?: Id[]) => number;
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
  setWallThicknessMm: (mm: number) => void;
  setMarlaSqFt: (sqft: MarlaSqFt) => void;
  setPaper: (paper: PaperSize) => void;
  setWallHeightMm: (mm: number) => void;
  setView3d: (on: boolean) => void;
  /** Show the 2D plan and the 3D view side by side (or go back to the one in use). */
  setSplit: (on: boolean) => void;
  /** In split view, the side the pointer is over is the one in use; what is being drawn carries on. */
  setActivePane: (is3d: boolean) => void;
  setTheme: (theme: ThemeId) => void;
  /** Change some grid settings; spacing is for the current units. */
  setGrid: (patch: Partial<Omit<GridPrefs, 'spacingMm'>> & { spacingMm?: number }) => void;
  /** Turn all checks on or off, or one kind of check. */
  setChecks: (patch: { on?: boolean; category?: CheckCategory; categoryOn?: boolean }) => void;
  /** Turn all snapping on or off, or one group of snap points. */
  setSnaps: (patch: { on?: boolean; group?: SnapGroup; groupOn?: boolean }) => void;
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
  /** Zoom so the box (plan units) fills the view. */
  zoomToBox: (box: Bounds) => void;
  /** Back to the view before the last zoom or pan; false when there is none. */
  zoomPrevious: () => boolean;
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
  /** Change several items together, as one undo step (shared settings of a selection). */
  editElements: (ids: Id[], fn: (el: PlanElement) => PlanElement) => void;
  flipOpening: (id: Id, which: 'side' | 'hinge') => void;
  /**
   * Change doors and windows together, as one undo step: `patch` gives each its new fields. A new
   * width is fitted in the wall, clear of corners and other openings; one that doesn't fit keeps
   * its old width (with a warning).
   */
  editOpenings: (ids: Id[], patch: (o: Opening) => Partial<Opening>) => void;
  /** Move doors and windows the least they must to keep their gaps (one undo step); says which can't. */
  fixOpeningGaps: (ids: Id[]) => void;
  nudgeSelected: (dx: number, dy: number) => void;
  /** Raise the selection by mm (lower it when negative); a window on its own moves its sill. */
  raiseSelected: (mm: number) => void;
  rotateSelected: (degrees: number) => void;

  newPlan: () => void;
  /** Start a new project of a type (and, for a building, its use), in the units it starts with. */
  newProject: (type: ProjectType, use?: BuildingUse) => void;
  /** Change the project's type or settings (one undo step). */
  setProject: (patch: Partial<ProjectSettings>) => void;
  /** Take on the project's own units and wall height (after opening or starting one). */
  applyProject: () => void;
  /** A floor's own wall height in millimetres (the usual one when undefined). */
  setLevelHeight: (id: Id, mm: number | undefined) => void;
  loadDocument: (doc: PlanDoc, file: { name: string; path?: string }) => void;
  markSaved: (file: { name: string; path?: string }) => void;
}

const gridFor = (grid: GridPrefs, units: Units) => grid.spacingMm[units] / MM_PER_UNIT;

export function createPlannerStore(
  initial: PlanDoc,
  initialWarning?: string,
  prefs: Prefs = loadPrefs(),
  file: FileInfo | null = null,
) {
  return createStore<PlannerState>()((set, get) => {
    /** Id of the active material, falling back to the first one if it was removed. */
    const activeMat = () => {
      const { doc, selectedMat } = get();
      return (doc.materials.find((m) => m.id === selectedMat) ?? doc.materials[0])?.id;
    };
    const mmToPx = (mm: number) => mm / get().scaleMMperPx;
    const persistPrefs = () => {
      const { units, showDimensions, showFurniture, showRoomLabels, showRoomFills, exportLines, pdfCheck } = get();
      const { showHints, pdfHints, pdfZones, accessibleZones, selectionBar, belowOpacity, checks, snaps } = get();
      const { areaIn } = get();
      const { wallThicknessMm, marlaSqFt, paper, wallHeightMm, theme, grid, toolbars, openingGapMm, panels } = get();
      savePrefs({
        units,
        showDimensions,
        showFurniture,
        showRoomLabels,
        showRoomFills,
        exportLines,
        pdfCheck,
        showHints,
        pdfHints,
        pdfZones,
        accessibleZones,
        selectionBar,
        belowOpacity,
        wallThicknessMm,
        openingGapMm,
        marlaSqFt,
        areaIn,
        paper,
        wallHeightMm,
        theme,
        grid,
        checks,
        snaps,
        toolbars,
        panels,
      });
    };
    const resetHistory = {
      past: [],
      future: [],
      batchBase: null,
      draft: null,
      selectedId: null,
      selectedIds: [],
      selectedPlinth: null,
      openGroupId: null,
      warnings: [],
      gapEnds: [],
      lastCopy: null,
      activeLevel: GROUND_LEVEL,
    };
    /** Type and height fields for a new wall of the given kind. */
    const kindFields = (kind: SiteSpec['wallKind']) => {
      if (kind === 'normal') return {};
      // A retaining wall is 12" RCC, up to the ground floor from the floor it stands on.
      if (kind === 'retaining')
        return {
          kind,
          thickness: RETAINING_MM / MM_PER_UNIT,
          heightMm: levelWallMm(get().doc, get().activeLevel, get().wallHeightMm) + slabMm(get().doc),
        };
      // A glass curtain wall is as tall as the floor, and thin.
      if (kind === 'curtain') return { kind, thickness: CURTAIN_MM / MM_PER_UNIT };
      return { kind, heightMm: KIND_HEIGHT_MM[kind] };
    };
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
      // Undo can take away the floor being shown (a floor just added or duplicated): show the top floor left.
      if (!doc.levels.some((l) => l.id === get().activeLevel)) {
        const floors = doc.levels.filter((l) => !l.site);
        set({
          activeLevel: floors[floors.length - 1]?.id ?? GROUND_LEVEL,
          draft: null,
          inference: null,
          lastCopy: null,
        });
      }
      const open = get().openGroupId;
      const plinth = get().selectedPlinth;
      set({
        selectedIds: ids,
        selectedPlinth: plinth && hasPlinth(doc, plinth) ? plinth : null,
        selectedId: selectedId && ids.includes(selectedId) ? selectedId : (ids[0] ?? null),
        openGroupId: open && doc.groups.some((g) => g.id === open) ? open : null,
      });
    };
    /**
     * Drop what is being drawn or moved, putting the plan back as it was before it; a paste still
     * being placed is taken back too (as Esc does).
     */
    const abandonDraft = () => {
      const d = get().draft;
      get().cancelBatch();
      if (d?.type === 'move' && d.pasted) get().discardLastStep();
    };
    /**
     * Before the view changes: remember it for Zoom previous, unless it is part of the same gesture
     * (changes within VIEW_STEP_MS of the last one). `step` always counts it (a fit, a window zoom).
     */
    let lastViewAt = 0;
    const noteView = (step = false) => {
      const now = Date.now();
      const fresh = step || now - lastViewAt > VIEW_STEP_MS;
      lastViewAt = now;
      const { view, viewport, viewBack } = get();
      if (!fresh || !viewport.width) return;
      const top = viewBack[viewBack.length - 1];
      if (top && top.x === view.x && top.y === view.y && top.zoom === view.zoom) return;
      set({ viewBack: [...viewBack, view].slice(-VIEW_HISTORY) });
    };
    // Every change: a plot's boundary walls follow it, then dimensions follow what they measure.
    const settle = (prev: PlanDoc, next: PlanDoc) => syncDimensions(prev, syncRuns(syncPlotWalls(prev, next)));
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
      selectedPlinth: null,
      openGroupId: null,
      activeLevel: GROUND_LEVEL,
      brushSize: 24,
      gridPx: gridFor(prefs.grid, initial.project?.units ?? prefs.units),
      scaleMMperPx: MM_PER_UNIT,
      warnings: initialWarning ? [initialWarning] : [],
      gapEnds: [],
      draft: null,

      // A project's own units and wall height win over the app's.
      units: initial.project?.units ?? prefs.units,
      showDimensions: prefs.showDimensions,
      showFurniture: prefs.showFurniture,
      showRoomLabels: prefs.showRoomLabels,
      showRoomFills: prefs.showRoomFills,
      exportLines: prefs.exportLines,
      pdfCheck: prefs.pdfCheck,
      showHints: prefs.showHints,
      pdfHints: prefs.pdfHints,
      pdfZones: prefs.pdfZones,
      accessibleZones: prefs.accessibleZones,
      selectionBar: prefs.selectionBar,
      furnitureKind: DEFAULT_FURNITURE_KIND,
      serviceKind: DEFAULT_SERVICE_KIND,
      runSystem: 'lighting',
      furnitureAngle: 0,
      furnitureGhost: null,
      scaleAxis: 'both',
      lastResize: null,
      snapFlip: false,
      wallThicknessMm: prefs.wallThicknessMm,
      openingGapMm: prefs.openingGapMm,
      openingStamp: [],
      stampQueue: false,
      setOpeningStamp: (openingStamp, queue = false) =>
        set({ openingStamp, stampQueue: queue && openingStamp.length > 0 }),
      marlaSqFt: prefs.marlaSqFt,
      areaIn: prefs.areaIn,
      paper: prefs.paper,
      wallHeightMm: initial.project?.wallHeightMm ?? prefs.wallHeightMm,
      view3d: false,
      split: false,
      drawing: null,
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
      checks: prefs.checks,
      snaps: prefs.snaps,
      toolbars: prefs.toolbars,
      dockToolbar: (id, area, index) => {
        set({ toolbars: moveToolbar(get().toolbars, id, area, index) });
        persistPrefs();
      },
      resetToolbars: () => {
        set({ toolbars: DEFAULT_TOOLBARS });
        persistPrefs();
      },
      panels: prefs.panels,
      setPanels: (patch) => {
        const next = { ...get().panels, ...patch };
        set({ panels: { ...next, width: clampPanelWidth(next.width) } });
        persistPrefs();
      },
      movePanel: (id, index) => {
        set({ panels: { ...get().panels, order: movePanel(get().panels.order, id, index) } });
        persistPrefs();
      },
      resetPanels: () => {
        set({ panels: DEFAULT_PANELS });
        persistPrefs();
      },
      view: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 0, height: 0 },

      fileName: file?.name ?? DEFAULT_FILE_NAME,
      filePath: file?.path,
      // Changes not yet saved to the file before a reload are still unsaved after it.
      savedDoc: file?.dirty ? { ...initial } : initial,

      commit: (recipe) => {
        const { doc, past, batchBase } = get();
        // A plot's boundary walls follow it, whatever changed it, and dimensions what they measure.
        const next = settle(doc, recipe(doc));
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
      discardLastStep: () => {
        const { past } = get();
        if (past.length) set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [] });
      },
      mergeLastSteps: () => {
        const { past } = get();
        if (past.length) set({ past: past.slice(0, -1) });
      },
      undo: () => {
        get().endBatch();
        // Drawing a plot corner by corner, undo takes back the last corner.
        const drawing = get().draft;
        if (
          drawing?.type === 'plotPoly' ||
          drawing?.type === 'contour' ||
          drawing?.type === 'roof' ||
          drawing?.type === 'slabPoly' ||
          drawing?.type === 'run'
        ) {
          const points = drawing.points.slice(0, -1);
          set({ draft: points.length ? { ...drawing, points } : null });
          return;
        }
        // Picking rooms for a slab, undo puts back the last room picked.
        if (drawing?.type === 'slabRooms') {
          const rooms = drawing.rooms.slice(0, -1);
          set({ draft: rooms.length ? { ...drawing, rooms } : null });
          return;
        }
        const { past, doc, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        // In a chain of walls or lines, undo takes back the last piece and carries on drawing from
        // where it started (AutoCAD's LINE › Undo); otherwise the step being drawn is dropped.
        const d = get().draft;
        let draft: PlannerState['draft'] = null;
        if ((d?.type === 'wall' || d?.type === 'line') && d.chain) {
          const kept = new Set(prev.elements.map((el) => el.id));
          const piece = doc.elements.find(
            (el) => !kept.has(el.id) && el.type === d.type && Math.hypot(el.x2 - d.x1, el.y2 - d.y1) < 1e-6,
          ) as { x1: number; y1: number } | undefined;
          if (piece) draft = { ...d, x1: piece.x1, y1: piece.y1 };
        }
        // A run of arcs carries on from where the last arc started (its direction found again from the plan).
        if (d?.type === 'curve' && d.points.length === 1) {
          const kept = new Set(prev.elements.map((el) => el.id));
          const [at] = d.points;
          const piece = doc.elements.find(
            (el) =>
              !kept.has(el.id) &&
              (el.type === 'wall' || el.type === 'line') &&
              Math.hypot(el.x2 - at.x, el.y2 - at.y) < 1e-6,
          ) as { x1: number; y1: number } | undefined;
          if (piece) draft = { ...d, points: [{ x: piece.x1, y: piece.y1 }], tangent: undefined };
        }
        set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], draft });
        refreshSelection();
        get().applyProject();
      },
      redo: () => {
        get().endBatch();
        const { past, doc, future } = get();
        if (!future.length) return;
        set({ doc: future[0], past: [...past, doc], future: future.slice(1), draft: null });
        refreshSelection();
        get().applyProject();
      },

      setTool: (tool) => {
        abandonDraft();
        // Tools that work on the selection keep it.
        const keep = ['select', 'move', 'rotate', 'mirror', 'scale'].includes(tool);
        set((s) => ({
          tool,
          draft: null,
          openingStamp: [],
          stampQueue: false,
          warnings: [],
          selectedId: keep ? s.selectedId : null,
          selectedIds: keep ? s.selectedIds : [],
          selectedPlinth: tool === 'select' ? s.selectedPlinth : null,
          measureText: '',
          inference: null,
          axisLock: null,
          shiftLock: null,
          lastCopy: null,
          lastResize: null,
          furnitureGhost: null,
          hoverEdge: null,
          // Picking a tool goes back to the plan from the Drawings view (Select, Pan and Zoom work there).
          ...(!['select', 'pan', 'zoom'].includes(tool) && { drawing: null }),
        }));
        // Orbit only turns the 3D view, so it opens it.
        if (tool === 'orbit' && !get().view3d && !get().split) get().setView3d(true);
      },
      selectMaterial: (id) => set({ selectedMat: id }),
      select: (id) => {
        const { doc, openGroupId } = get();
        const item = id ? itemById(doc, id) : undefined;
        // Picking something outside the open group closes it.
        if (openGroupId && (!item || item.groupId !== openGroupId)) get().closeGroup();
        if (!item) {
          set({ selectedId: null, selectedIds: [], selectedPlinth: null });
          return;
        }
        set({
          selectedId: item.id,
          selectedIds: expandToGroups(get().doc, [item.id], get().openGroupId),
          selectedPlinth: null,
        });
      },
      toggleSelect: (id) => {
        const { doc, selectedIds, openGroupId } = get();
        if (!itemById(doc, id)) return;
        const ids = expandToGroups(doc, [id], openGroupId);
        const has = selectedIds.includes(id);
        const next = has ? selectedIds.filter((x) => !ids.includes(x)) : [...new Set([...selectedIds, ...ids])];
        set({ selectedIds: next, selectedId: has ? (next[0] ?? null) : id, selectedPlinth: null });
      },
      setSelection: (ids, additive = false) => {
        // Items all on another floor (picked from the plan check, say): go to that floor, so the
        // selection is seen before anything is done to it.
        const floors = new Set(
          ids
            .map((id) => itemById(get().doc, id))
            .filter(Boolean)
            .map((it) => levelOf(it!)),
        );
        if (floors.size === 1 && !floors.has(get().activeLevel)) get().setActiveLevel([...floors][0]);
        const { doc, openGroupId, selectedIds } = get();
        const picked = expandToGroups(doc, ids, openGroupId);
        const next = additive ? [...new Set([...selectedIds, ...picked])] : picked;
        set({ selectedIds: next, selectedId: next[next.length - 1] ?? null, selectedPlinth: null });
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
        // Deleting the automatic plinth leaves it off under that wall.
        const plinth = get().selectedPlinth;
        if (!ids.length && plinth) {
          get().setWallPlinth(plinth, false);
          set({ selectedPlinth: null });
          return;
        }
        if (!ids.length) return;
        get().commit((doc) => deleteItems(doc, ids));
        set({ selectedId: null, selectedIds: [] });
      },
      commitFromBase: (recipe) => {
        const base = get().batchBase;
        if (base) set({ doc: settle(base, recipe(base)) });
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
          name = cleanText(name);
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
      setWarning: (message) => set({ warnings: message ? [message] : [], gapEnds: [] }),
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
        const radius = get().site.rectRadiusMm / MM_PER_UNIT;
        get().beginBatch();
        if (radius > 0)
          // Corners rounded to the tool's radius: straight sides and a quarter circle at each corner.
          for (const piece of roundedRect(a, b, radius))
            get().addWall({ x: piece.x1, y: piece.y1 }, { x: piece.x2, y: piece.y2 }, piece.bow);
        else corners.forEach((p, i) => get().addWall(p, corners[(i + 1) % 4]));
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
        if (!clip) return [];
        // Each paste lands one grid step down and to the right of the last.
        const step = get().gridPx;
        const { doc: source, ids } = copyItems(clip.doc, clip.ids, step, step);
        if (!ids.length) {
          get().setWarning('Doors and windows are copied with their wall: select the wall too, then copy.');
          return [];
        }
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
        return ids;
      },
      duplicateSelected: () => {
        const ids = get().selectedIds;
        if (!ids.length) return;
        const lone = loneOpenings(get().doc, ids);
        if (lone.length) {
          // Doors and windows on their own: each copy goes beside its original, on the same wall.
          let made: Id[] = [];
          let misses = 0;
          get().commit((doc) => {
            made = [];
            misses = 0;
            let working = doc;
            for (const o of lone) {
              const copy = besideOpening(get(), working, o, newId());
              if (!copy) misses += 1;
              else {
                working = { ...working, elements: [...working.elements, copy] };
                made.push(copy.id);
              }
            }
            return working;
          });
          if (made.length) get().setSelection(made);
          get().setWarning(
            misses
              ? `No room on the wall for another ${nounOf(lone[0])} beside it: copy it (Ctrl+C) and paste it (Ctrl+V) onto another wall.`
              : null,
          );
          return;
        }
        const step = get().gridPx;
        let copies: Id[] = [];
        get().commit((doc) => {
          const out = copyItems(doc, ids, step, step);
          copies = out.ids;
          return out.doc;
        });
        get().setSelection(copies);
      },

      addWall: (a, b, bow) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= MIN_WALL_PX) return;
        const wall: PlanElement = onActive({
          id: newId(),
          type: 'wall',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          ...(bow && Math.abs(bow) > 0.05 && { bow }),
          thickness: get().wallThicknessMm / MM_PER_UNIT,
          material: activeMat(),
          ...kindFields(get().site.wallKind),
        } as PlanElement);
        updateElements((els) => [...els, wall]);
      },
      placeOpening: (type, p, typedMm) => {
        const at = openingAt(get(), type, p, typedMm);
        if (!at.ok) {
          get().setWarning(at.error);
          return false;
        }
        updateElements((els) => [...els, onActive<PlanElement>({ ...at.opening, id: newId() })]);
        get().setWarning(null);
        // Pasted doors and windows go down one per click; after the last, back to selecting.
        const { openingStamp, stampQueue } = get();
        if (stampQueue) {
          const rest = openingStamp.slice(1);
          get().setTool(rest.length ? rest[0].type : 'select');
          if (rest.length) set({ openingStamp: rest, stampQueue: true });
        }
        return true;
      },
      addFurniture: (p, rotation = get().furnitureAngle) => {
        const kind = kindPlaced(get());
        const size = FURNITURE_CATALOG[kind];
        const el: PlanElement = {
          id: newId(),
          type: 'furniture',
          kind,
          x: p.x,
          y: p.y,
          w: mmToPx(size.w),
          h: mmToPx(size.d),
          ...(rotation ? { rotation } : {}),
        };
        updateElements((els) => [...els, onActive(el)]);
        // Show the new item so it is visible even if the furniture layer was hidden.
        if (!get().showFurniture && !isService(kind)) get().setLayer('showFurniture', true);
      },
      applyMaterial: (id, side) => {
        const mat = activeMat();
        const room = get().doc.rooms.find((r) => r.id === id);
        if (room) {
          if (room.material !== mat) get().updateRoom({ ...room, material: mat });
          return;
        }
        const wall = get().doc.elements.find((el): el is Wall => el.id === id && el.type === 'wall');
        if (wall) {
          const next: Wall =
            side === 1
              ? { ...wall, materialA: mat }
              : side === -1
                ? { ...wall, materialB: mat }
                : side === 0
                  ? { ...wall, material: mat }
                  : { ...wall, material: mat, materialA: undefined, materialB: undefined };
          const same = (['material', 'materialA', 'materialB'] as const).every((k) => next[k] === wall[k]);
          if (!same) updateElements((els) => els.map((el) => (el.id === id ? next : el)));
          return;
        }
        updateElements((els) =>
          els.some((el) => el.id === id && el.material !== mat)
            ? els.map((el) => (el.id === id ? { ...el, material: mat } : el))
            : els,
        );
      },
      clearWallSide: (id, side) => {
        const key = side === 1 ? 'materialA' : 'materialB';
        updateElements((els) =>
          els.some((el) => el.id === id && el.type === 'wall' && el[key])
            ? els.map((el) => (el.id === id && el.type === 'wall' ? { ...el, [key]: undefined } : el))
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
        // A project keeps its own units.
        const { doc } = get();
        if (doc.project && doc.project.units !== units) set({ doc: { ...doc, project: { ...doc.project, units } } });
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
      setServiceKind: (serviceKind) => set({ serviceKind }),
      setRunSystem: (runSystem) =>
        set((st) => ({ runSystem, draft: st.draft?.type === 'run' ? { ...st.draft, system: runSystem } : st.draft })),
      addRun: (points, from, to) => {
        if (points.length < 2) return;
        const el: PlanElement = {
          id: newId(),
          type: 'run',
          system: get().runSystem,
          points,
          ...(from && { from }),
          ...(to && { to }),
        };
        updateElements((els) => [...els, onActive(el)]);
      },
      setFurnitureAngle: (deg) => set({ furnitureAngle: (((Math.round(deg * 100) / 100) % 360) + 360) % 360 }),
      setFurnitureGhost: (furnitureGhost) => set({ furnitureGhost }),
      setScaleAxis: (scaleAxis) => set({ scaleAxis }),
      setLastResize: (lastResize) => set({ lastResize }),
      setSnapFlip: (snapFlip) => {
        if (get().snapFlip !== snapFlip) set({ snapFlip });
      },
      resetSize: (ids) => {
        const picked = new Set(ids ?? get().selectedIds);
        const c = get().structure;
        let count = 0;
        updateElements((els) =>
          els.map((el) => {
            if (!picked.has(el.id) || el.locked) return el;
            const next = resetElementSize(el, c);
            if (next !== el) count++;
            return next;
          }),
        );
        return count;
      },
      visibleElements: () => {
        const { doc, showFurniture, activeLevel } = get();
        const v = { layers: doc.layers, showFurniture };
        // On Ground, its floor and its lawn show (and can be picked) together.
        const els = doc.elements.filter(onSharedLevel(doc, activeLevel));
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
        const { doc, activeLevel } = get();
        return doc.rooms.filter(onSharedLevel(doc, activeLevel)).filter((r) => !isHidden(r, v) && !isLocked(r, v));
      },
      shownDoc: () => withoutHidden(get().doc, { layers: get().doc.layers, showFurniture: get().showFurniture }),
      setLayerFlags: (layer, flags) => {
        if (layer === 'furniture' && flags.hidden !== undefined) {
          get().setLayer('showFurniture', !flags.hidden);
          const rest = omit(flags, 'hidden');
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
          return locked ? { ...it, locked: true } : omit(it, 'locked');
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
          return it.hidden ? omit(it, 'hidden') : it;
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
          return it.locked ? omit(it, 'locked') : it;
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
        abandonDraft();
        // Ground's Floor | Lawn switch keeps what is selected: both show together.
        const same = sharedLevelIds(get().doc, get().activeLevel).includes(id);
        if (get().openGroupId && !same) get().closeGroup();
        set({
          activeLevel: id,
          ...(same ? {} : { selectedId: null, selectedIds: [], selectedPlinth: null }),
          draft: null,
          inference: null,
          lastCopy: null,
        });
      },
      setItemsLevel: (ids, levelId) => {
        const picked = new Set(ids);
        get().commit((doc) => {
          const levels = isSiteLevel(doc, levelId) ? withSiteLevel(doc.levels) : doc.levels;
          if (!levels.some((l) => l.id === levelId)) return doc;
          // Doors and windows go with their walls.
          const walls = new Set(
            doc.elements.filter((el) => picked.has(el.id) && el.type === 'wall').map((el) => el.id),
          );
          const moved = <T extends { levelId?: Id }>(it: T): T => {
            if (levelOf(it) === levelId) return it;
            const next: T = { ...it, levelId };
            if (levelId === GROUND_LEVEL) delete next.levelId;
            return next;
          };
          return {
            ...doc,
            levels,
            elements: doc.elements.map((el) =>
              picked.has(el.id) || ('wallId' in el && walls.has(el.wallId)) ? moved(el) : el,
            ),
            rooms: doc.rooms.map((r) => (picked.has(r.id) ? moved(r) : r)),
          };
        });
      },
      addLevel: () => {
        const id = newId();
        get().commit((doc) => ({ ...doc, levels: [...doc.levels, { id, name: nextFloorName(doc) }] }));
        get().setActiveLevel(id);
      },
      duplicateLevel: () => {
        const { doc, activeLevel } = get();
        const from = doc.levels.find((l) => l.id === activeLevel);
        // The Ground (site) level isn't a floor to copy upwards.
        if (!from || from.site) return;
        const ids = [
          ...doc.elements.filter(
            (el) =>
              levelOf(el) === activeLevel && !NOT_COPIED_UP.includes(el.type) && !(el.type === 'wall' && el.plotId),
          ),
          ...doc.rooms.filter((r) => levelOf(r) === activeLevel),
        ].map((it) => it.id);
        const id = newId();
        get().commit((d) => {
          // The new floor keeps the copied floor's own wall height (a basement's is a clear height).
          const level = {
            id,
            name: nextFloorName(d),
            ...(from.heightMm !== undefined && !from.basement && { heightMm: from.heightMm }),
          };
          const copied = copyItems({ ...d, levels: [...d.levels, level] }, ids, 0, 0);
          const made = new Set(copied.ids);
          const up = <T extends { id: Id; levelId?: Id }>(it: T): T => (made.has(it.id) ? { ...it, levelId: id } : it);
          return {
            ...copied.doc,
            elements: copied.doc.elements.map(up),
            // A copied room isn't open to the floor below it.
            rooms: copied.doc.rooms.map((r) => (made.has(r.id) ? { ...up(r), openAbove: undefined } : r)),
          };
        });
        get().setActiveLevel(id);
      },
      belowOpacity: prefs.belowOpacity,
      setBelowOpacity: (percent) => {
        set({ belowOpacity: Math.max(0, Math.min(100, Math.round(percent))) });
        persistPrefs();
      },
      addBasement: () => {
        const existing = basementOf(get().doc);
        if (existing) return get().setActiveLevel(existing.id);
        const id = newId();
        get().commit((doc) => ({ ...doc, levels: [{ id, name: 'Basement', basement: true }, ...doc.levels] }));
        get().setActiveLevel(id);
      },
      showSiteLevel: () => {
        if (!get().doc.levels.some((l) => l.site))
          get().commit((doc) => ({ ...doc, levels: withSiteLevel(doc.levels) }));
        get().setActiveLevel(SITE_LEVEL);
      },
      setOwnPlinth: (own) =>
        get().commit((doc) => {
          if (!!doc.ownPlinth === own) return doc;
          const next: PlanDoc = { ...doc, ownPlinth: true };
          if (!own) delete next.ownPlinth;
          return next;
        }),
      selectPlinth: (wallId) => {
        if (wallId && !hasPlinth(get().doc, wallId)) return;
        if (get().openGroupId) get().closeGroup();
        set({ selectedPlinth: wallId, selectedId: null, selectedIds: [] });
      },
      setPlinth: (patch) =>
        get().commit((doc) => {
          const merged: PlinthSpec = { ...doc.plinth, ...patch };
          const plinth: PlinthSpec = {};
          if (merged.projectMm && merged.projectMm > 0) plinth.projectMm = Math.min(Math.round(merged.projectMm), 1000);
          if (merged.material) plinth.material = merged.material;
          if (plinth.projectMm === doc.plinth?.projectMm && plinth.material === doc.plinth?.material) return doc;
          const next: PlanDoc = { ...doc, plinth };
          if (!Object.keys(plinth).length) delete next.plinth;
          return next;
        }),
      setWallPlinthOwn: (wallId, patch) =>
        updateElements((els) => {
          const wall = els.find((el) => el.id === wallId);
          if (!wall || wall.type !== 'wall') return els;
          const next: Wall = { ...wall };
          if (patch.projectMm === null) delete next.plinthProjectMm;
          else if (patch.projectMm !== undefined)
            next.plinthProjectMm = Math.max(0, Math.min(Math.round(patch.projectMm), 1000));
          if (patch.material === null) delete next.plinthMaterial;
          else if (patch.material !== undefined) next.plinthMaterial = patch.material;
          if (next.plinthProjectMm === wall.plinthProjectMm && next.plinthMaterial === wall.plinthMaterial) return els;
          return els.map((el) => (el === wall ? next : el));
        }),
      setWallPlinth: (wallId, on) =>
        updateElements((els) => {
          const wall = els.find((el) => el.id === wallId);
          if (!wall || wall.type !== 'wall' || !wall.noPlinth === on) return els;
          const next: Wall = { ...wall, noPlinth: true };
          if (on) delete next.noPlinth;
          return els.map((el) => (el === wall ? next : el));
        }),
      addRetainingWalls: (mode) => {
        const { doc } = get();
        const basement = basementOf(doc);
        if (!basement) {
          get().setWarning('Add a basement first: Floors › Add basement below.');
          return false;
        }
        let outline: Point[] | null;
        if (mode === 'house') {
          const walls = doc.elements.filter(
            (el): el is Wall => el.type === 'wall' && isBuildingWall(el) && !el.hidden && levelOf(el) === GROUND_LEVEL,
          );
          outline = outsideOutline(walls);
          if (!outline) {
            get().setWarning('Draw the ground floor’s walls first: the basement goes under them.');
            return false;
          }
        } else {
          const plot = doc.elements.find((el): el is Plot => el.type === 'plot' && !el.hidden);
          outline = plot ? buildableArea(plot) : null;
          if (!outline || outline.length < 3) {
            get().setWarning('Draw a plot first: the basement fills its building line.');
            return false;
          }
        }
        const t = RETAINING_MM / MM_PER_UNIT;
        const line = insetPolygon(
          outline,
          outline.map(() => t / 2),
        ).points;
        const heightMm = (basement.heightMm ?? BASEMENT_HEIGHT_MM) + slabMm(doc);
        const walls: Wall[] = line.map((a, i) => {
          const b = line[(i + 1) % line.length];
          return {
            id: newId(),
            type: 'wall',
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            thickness: t,
            kind: 'retaining',
            heightMm,
            levelId: basement.id,
          };
        });
        get().commit((d) => {
          const old = new Set(
            d.elements
              .filter((el) => el.type === 'wall' && el.kind === 'retaining' && levelOf(el) === basement.id)
              .map((el) => el.id),
          );
          const kept = d.elements.filter(
            (el) => !old.has(el.id) && !((el.type === 'door' || el.type === 'window') && old.has(el.wallId)),
          );
          return { ...d, elements: [...kept, ...walls] };
        });
        get().setActiveLevel(basement.id);
        get().setWarning(null);
        return true;
      },
      setBasementHeight: (mm) => {
        const b = basementOf(get().doc);
        if (b && Math.abs((b.heightMm ?? BASEMENT_HEIGHT_MM) - mm) >= 0.5) get().setLevelHeight(b.id, mm);
      },
      renameLevel: (id, name) =>
        get().commit((doc) =>
          cleanText(name).trim() && doc.levels.some((l) => l.id === id && l.name !== name)
            ? { ...doc, levels: doc.levels.map((l) => (l.id === id ? { ...l, name: cleanText(name).trim() } : l)) }
            : doc,
        ),
      deleteLevel: (id) => {
        if (id === GROUND_LEVEL) return;
        const { doc } = get();
        if (isSiteLevel(doc, id) && [...doc.elements, ...doc.rooms].some((it) => levelOf(it) === id)) {
          get().setWarning('Ground (site) has items on it. Delete them first, or leave it: it is not a floor.');
          return;
        }
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
      addLine: (a, b, bow) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= MIN_WALL_PX) return;
        const line: PlanElement = {
          id: newId(),
          type: 'line',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          ...(bow && Math.abs(bow) > 0.05 && { bow }),
        };
        const placed = onActive(line) as SketchLine;
        updateElements((els) => splitSolidsByLine([...els, placed], placed));
      },
      divideItem: (id, how) => {
        const openings = (doc: PlanDoc) =>
          doc.elements.filter((el) => el.type === 'door' || el.type === 'window').length;
        const before = openings(get().doc);
        get().commit((doc) => divideWall(doc, id, 'parts' in how ? how : { every: how.everyMm / MM_PER_UNIT }));
        const lost = before - openings(get().doc);
        get().setWarning(
          lost > 0
            ? `A division went through ${lost === 1 ? 'a door or window' : `${lost} doors or windows`}, so ${lost === 1 ? 'it was' : 'they were'} removed. Undo (Ctrl+Z) to bring ${lost === 1 ? 'it' : 'them'} back.`
            : null,
        );
      },
      addDimension: (dim) => {
        const id = newId();
        updateElements((els) => [...els, onActive({ ...dim, id } as Dimension)]);
        return id;
      },
      addCurve: (pieces, inside) => {
        const kept = pieces.filter((p) => Math.hypot(p.x2 - p.x1, p.y2 - p.y1) > MIN_WALL_PX);
        if (!kept.length) return;
        const { curveMake, pathWidthMm } = get().site;
        if (curveMake === 'path') {
          // A paved path of the set width along the curve, on the ground.
          const points = pathOutline(kept, pathWidthMm / MM_PER_UNIT / 2);
          if (points.length < 3) return;
          const concrete = get().doc.materials.some((m) => m.id === 'mat_concrete');
          const block: Block = {
            id: newId(),
            type: 'block',
            points,
            heightMm: PATH_HEIGHT_MM,
            shape: 'polygon',
            path: true,
            ...(concrete && { material: 'mat_concrete' }),
          };
          updateElements((els) => [...els, onActive(block)]);
          get().select(null);
          return;
        }
        const asLines = curveMake === 'line';
        get().beginBatch();
        for (const p of kept) {
          const a = { x: p.x1, y: p.y1 };
          const b = { x: p.x2, y: p.y2 };
          if (asLines) get().addLine(a, b, p.bow);
          else get().addWall(a, b, p.bow);
        }
        const outline = kept.flatMap((p) => wallPath(p));
        if (inside && !asLines && pointInPolygon(inside, outline)) get().addRoomAt(inside);
        get().endBatch();
        // Nothing selected, so the tool's options stay in view for the next curve.
        get().select(null);
      },
      addSection: (a, b, flip) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= MIN_WALL_PX) return;
        const line: PlanElement = {
          id: newId(),
          type: 'section',
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          label: nextSectionLabel(get().doc),
          ...(flip && { flip: true }),
        };
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
        for (const l of lines) get().addWall({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }, l.bow);
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
      addSlab: (points, holes) => {
        if (points.length < 3) return;
        const slab: PlanElement = {
          id: newId(),
          type: 'slab',
          points,
          ...(holes?.length ? { holes } : {}),
          thickness: get().structure.slabThickness,
        };
        updateElements((els) => [...els, onActive(slab)]);
      },
      addSpotLevel: (p, zMm) => updateElements((els) => [...els, { id: newId(), type: 'level', x: p.x, y: p.y, zMm }]),
      addContour: (points, zMm) => {
        if (points.length < 2) return;
        updateElements((els) => [...els, { id: newId(), type: 'contour', points, zMm }]);
      },
      addPad: (points, zMm) => {
        if (points.length < 3) return;
        const c = points.reduce((m, p) => ({ x: m.x + p.x / points.length, y: m.y + p.y / points.length }), {
          x: 0,
          y: 0,
        });
        const metric = get().units === 'metric';
        const z = zMm ?? roundLevel(groundOf(get().doc).naturalAt(c.x, c.y), metric);
        const pad: PlanElement = { id: newId(), type: 'pad', points, zMm: z };
        updateElements((els) => [...els, pad]);
        get().select(pad.id);
      },
      padUnderHouse: () => {
        const walls = get().doc.elements.filter(
          (el): el is Wall => el.type === 'wall' && isBuildingWall(el) && levelOf(el) === GROUND_LEVEL,
        );
        const outline = walls.length ? outsideOutline(walls) : null;
        if (!outline || outline.length < 3) {
          get().setWarning('Draw the house’s walls on the ground floor first: the levelled area goes round them.');
          return false;
        }
        const margin = (get().units === 'metric' ? 1000 : 914.4) / MM_PER_UNIT;
        const grown = insetPolygon(
          outline,
          outline.map(() => -margin),
        ).points;
        get().addPad(grown.length >= 3 ? grown : outline);
        return true;
      },
      addRoof: (points) => {
        const { site, units } = get();
        const overhangMm = site.roofOverhangMm ?? ROOF_OVERHANG_MM[units];
        const grown =
          overhangMm > 0
            ? insetPolygon(
                points,
                points.map(() => -overhangMm / MM_PER_UNIT),
              ).points
            : points;
        if (grown.length < 3) {
          get().setWarning('That outline can’t take a roof: draw round the walls with at least three corners.');
          return false;
        }
        const roof: PlanElement = {
          id: newId(),
          type: 'roof',
          points: grown,
          shape: site.roofShape,
          pitchDeg: site.roofPitchDeg,
          overhangMm,
          thicknessMm: ROOF_THICKNESS_MM,
        };
        updateElements((els) => [...els, onActive(roof)]);
        get().select(roof.id);
        return true;
      },
      setSun: (patch) =>
        get().commit((doc) => {
          const sun: SunSettings = { ...DEFAULT_SUN, ...doc.sun, ...patch };
          return JSON.stringify(sun) === JSON.stringify(doc.sun) ? doc : { ...doc, sun };
        }),
      placeNorth: (at, deg) =>
        get().commit((doc) => {
          const next: PlanDoc = { ...doc };
          if (at) next.northArrow = { x: at.x, y: at.y };
          else delete next.northArrow;
          if (deg !== undefined) {
            const north = ((Math.round(deg) % 360) + 360) % 360;
            if (north) next.northDeg = north;
            else delete next.northDeg;
          }
          return JSON.stringify(next.northArrow) === JSON.stringify(doc.northArrow) && next.northDeg === doc.northDeg
            ? doc
            : next;
        }),
      addSkylight: (p) => {
        const roof = get()
          .pickableElements()
          .find((el): el is Roof => el.type === 'roof' && !!faceUnder(el, p));
        if (!roof) {
          get().setWarning('Click on a roof (draw one with the Roof tool, Shift+H, on this floor).');
          return false;
        }
        const sk: Skylight = { id: newId(), x: p.x, y: p.y, wMm: SKYLIGHT_W_MM, lMm: SKYLIGHT_L_MM };
        if (!skylightParts(roof, sk)) {
          get().setWarning(
            'A skylight doesn’t fit there: keep it inside one slope, clear of the hips, ridge and valleys.',
          );
          return false;
        }
        get().setWarning(null);
        get().updateElement({ ...roof, skylights: [...(roof.skylights ?? []), sk] });
        return true;
      },
      addDormer: (p) => {
        const roof = get()
          .pickableElements()
          .find((el): el is Roof => el.type === 'roof' && !!faceUnder(el, p));
        const front = roof && dormerFrontAt(roof, p);
        if (!roof || !front) {
          get().setWarning('Click on a sloping roof (draw one with the Roof tool, Shift+H, on this floor).');
          return false;
        }
        const d: Dormer = { id: newId(), ...front, wMm: DORMER_W_MM, kind: 'gable', wallMm: DORMER_WALL_MM };
        if (!dormerParts(roof, d)) {
          get().setWarning(
            'A dormer doesn’t fit on that slope: it needs a slope of 15° or more and room to run back up to the roof. Try a steeper roof, or a narrower or lower dormer.',
          );
          return false;
        }
        get().setWarning(null);
        get().updateElement({ ...roof, dormers: [...(roof.dormers ?? []), d] });
        return true;
      },
      roofOverHouse: () => {
        const { activeLevel, doc } = get();
        const walls = doc.elements.filter(
          (el): el is Wall => el.type === 'wall' && isBuildingWall(el) && levelOf(el) === activeLevel,
        );
        const outline = walls.length ? outsideOutline(walls) : null;
        if (!outline || outline.length < 3) {
          get().setWarning(
            'Draw the walls of this floor first (or go to the top floor with Page Up): the roof goes round their outside.',
          );
          return false;
        }
        return get().addRoof(outline);
      },
      setGround: (patch) =>
        get().commit((doc) => {
          const ground: GroundSettings = { ...doc.ground, ...patch };
          if (ground.grade === 'level') delete ground.grade;
          if (!ground.levelMm) delete ground.levelMm;
          if (ground.cutFill !== false) delete ground.cutFill;
          if (ground.contourMm === undefined) delete ground.contourMm;
          const next: PlanDoc = { ...doc, ground };
          if (!Object.keys(ground).length) delete next.ground;
          return next;
        }),
      importSurvey: (levels, contours) => {
        const items: PlanElement[] = [
          ...levels.map((l): PlanElement => ({ id: newId(), type: 'level', x: l.x, y: l.y, zMm: l.zMm })),
          ...contours
            .filter((c) => c.points.length >= 2)
            .map((c): PlanElement => ({ id: newId(), type: 'contour', points: c.points, zMm: c.zMm })),
        ];
        if (!items.length) return;
        if (get().activeLevel !== GROUND_LEVEL) get().setActiveLevel(GROUND_LEVEL);
        const ids = items.map((el) => el.id);
        get().beginBatch();
        updateElements((els) => [...els, ...items]);
        get().setSelection(ids);
        if (ids.length > 1) get().groupSelected();
        get().endBatch();
        get().setSelection(ids);
      },
      clearSurvey: () =>
        updateElements((els) => els.filter((el) => !(el.type === 'contour' || (el.type === 'level' && !el.approx)))),
      setLocation: (at) =>
        get().commit((doc) => {
          const next: PlanDoc = { ...doc, ...(at ? { location: at } : {}) };
          if (!at) delete next.location;
          return next;
        }),
      setContext: (items) =>
        updateElements((els) => [
          ...els.filter((el) => el.type !== 'context'),
          ...items.map((it): PlanElement => ({ ...it, id: newId(), type: 'context' })),
        ]),
      setSatelliteLevels: (levels) =>
        updateElements((els) => [
          ...els.filter((el) => !(el.type === 'level' && el.approx)),
          ...levels.map((l): PlanElement => ({ id: newId(), type: 'level', x: l.x, y: l.y, zMm: l.zMm, approx: true })),
        ]),
      shapeKind: 'rect',
      setShapeKind: (shapeKind) => set({ shapeKind }),
      addFloorShape: (points, kind, on = {}) => {
        if (points.length < 3) return null;
        const block: Block = {
          id: newId(),
          type: 'block',
          points,
          heightMm: 0,
          shape: kind,
          ...(on.slabId ? { slabId: on.slabId } : {}),
          ...(on.elevMm ? { elevMm: on.elevMm } : {}),
        };
        updateElements((els) => [...els, onActive(block)]);
        get().select(block.id);
        return block.id;
      },
      addWallShape: (wallId, face, kind, outline) => {
        const wall = get().doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === wallId);
        if (!wall || outline.length < 3) return null;
        const xs = outline.map((p) => p.x);
        const ys = outline.map((p) => p.y);
        const [minS, maxS, minV, maxV] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const len = wallLength(wall) || 1;
        const mid = (minS + maxS) / 2;
        const at = { x: wall.x1 + ((wall.x2 - wall.x1) * mid) / len, y: wall.y1 + ((wall.y2 - wall.y1) * mid) / len };
        const shape = kind === 'rect' ? undefined : kind;
        const win: Opening = {
          id: newId(),
          type: 'window',
          wallId,
          ...placeOnWall(wall, at, maxS - minS),
          sillMm: Math.max(0, minV * MM_PER_UNIT),
          heightMm: (maxV - minV) * MM_PER_UNIT,
          ...(shape ? { shape } : {}),
          ...(shape === 'polygon'
            ? { profile: outline.map((p) => ({ x: (p.x - mid) * MM_PER_UNIT, y: (p.y - minV) * MM_PER_UNIT })) }
            : {}),
          flat: true,
          face,
          ...(wall.levelId ? { levelId: wall.levelId } : {}),
        };
        updateElements((els) => [...els, win]);
        get().select(win.id);
        return win.id;
      },
      hoverEdge: null,
      setHoverEdge: (hoverEdge) => {
        if (hoverEdge || get().hoverEdge) set({ hoverEdge });
      },
      site: DEFAULT_SITE,
      // New settings for the tools: a picked-up door or window gives way to them.
      setSite: (patch) =>
        set((st) => ({ site: { ...st.site, ...patch }, openingStamp: st.stampQueue ? st.openingStamp : [] })),
      addPlot: (corners, road = 2) => {
        const problem = outlineProblem(corners);
        if (problem) {
          get().setWarning(problem);
          return false;
        }
        const { site } = get();
        const { points, edge } = orientOutline(corners);
        const front = edge(road % corners.length);
        const wall = site.boundaryWall ? { heightMm: KIND_HEIGHT_MM.boundary, thicknessMm: BOUNDARY_MM } : undefined;
        const sideList = guessSideKinds(points, front).map((kind): PlotSide => (wall ? { kind, wall } : { kind }));
        const { front: f, rear, sides: left, side2: right = left } = site.setbacks;
        const setbacks = setbacksFromLeftRight({ points, front }, { front: f, rear, left, right });
        let plot: Plot = { id: newId(), type: 'plot', points, front, sideList, setbacks };
        if (site.authority) {
          plot = { ...plot, authority: site.authority };
          const rule = appliedRule(get().doc, plot);
          if (rule) plot = { ...plot, setbacks: appliedSetbacks(rule, plot) };
        }
        const added = plot;
        get().commit((doc) => buildPlotWalls({ ...doc, elements: [...doc.elements, added] }, added.id, newId));
        return true;
      },
      updatePlot: (next) => {
        const problem = outlineProblem(next.points) ?? outlineProblem(outlinePoints(next));
        if (problem) {
          get().setWarning(problem);
          return false;
        }
        let plot = next;
        const sides = plotSides(plot);
        if (!sides.some((side) => side.kind === 'road')) {
          get().setWarning('A plot needs a road side. Mark another side Road first.');
          return false;
        }
        if (sides[plot.front % sides.length].kind !== 'road')
          plot = { ...plot, front: sides.findIndex((side) => side.kind === 'road') };
        const final = plot;
        get().commit((doc) =>
          buildPlotWalls(
            { ...doc, elements: doc.elements.map((el) => (el.id === final.id ? final : el)) },
            final.id,
            newId,
          ),
        );
        return true;
      },
      movePlotCorner: (plotId, index, p) => {
        const plot = get().doc.elements.find((el): el is Plot => el.type === 'plot' && el.id === plotId);
        if (!plot) return false;
        const next = withCorner(plot, index, p);
        if (outlineProblem(next.points) || outlineProblem(outlinePoints(next))) return false;
        // Corners can't be dragged round past each other: the plot keeps going the same way round.
        if (signedArea2(next.points) <= 0) return false;
        get().updateElement(next);
        return true;
      },
      addSideGate: (plotId, side) => {
        const { doc, site } = get();
        const plot = doc.elements.find((el): el is Plot => el.type === 'plot' && el.id === plotId);
        const wallId = plot && (side === 'splay' ? plot.splay?.wallId : plot.sideList?.[side]?.wallId);
        const wall = doc.elements.find(
          (el): el is Wall => el.type === 'wall' && el.id === wallId && el.plotId === plotId,
        );
        if (!plot || !wall) {
          get().setWarning('This side has no wall yet: give it a boundary wall first.');
          return;
        }
        const width = site.gateWidthMm / MM_PER_UNIT;
        const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
        const material = (doc.materials.find((m) => m.id === get().selectedMat) ?? doc.materials[0])?.id;
        const gate: Opening = {
          id: newId(),
          type: 'door',
          wallId: wall.id,
          gate: true,
          // A plot's walls run the same way round as the plot, so this swings the gate into the plot.
          flipSide: true,
          ...(material ? { material } : {}),
          ...placeOnWall(wall, mid, width),
          ...(wall.levelId ? { levelId: wall.levelId } : {}),
        };
        const fitted = refitOpening(get(), doc, gate, width);
        if (!fitted) {
          get().setWarning(`There's no room for a ${formatLength(site.gateWidthMm, get().units)} gate on this side.`);
          return;
        }
        get().setWarning(null);
        updateElements((els) => [...els, fitted]);
        get().select(fitted.id);
      },
      rebuildPlotWalls: (plotId) => {
        const { doc } = get();
        const plot = doc.elements.find((el): el is Plot => el.type === 'plot' && el.id === plotId);
        if (!plot) return;
        const level = levelOf(plot);
        const found = boundaryWallsAlong(
          plot,
          doc.elements.filter((el) => levelOf(el) === level),
        );
        const any = found.some((w) => w.length > 0);
        const sideList = plotSides(plot).map((side, i): PlotSide => {
          const old = found[i][0];
          const wall = old
            ? {
                heightMm: old.heightMm ?? KIND_HEIGHT_MM.boundary,
                thicknessMm: (old.thickness ?? inch(9)) * MM_PER_UNIT,
              }
            : any
              ? undefined
              : { heightMm: KIND_HEIGHT_MM.boundary, thicknessMm: BOUNDARY_MM };
          const kept = { ...side };
          delete kept.wall;
          delete kept.wallId;
          return wall ? { ...kept, wall } : kept;
        });
        const removed = new Map(found.flatMap((walls, i) => walls.map((w) => [w.id, i] as const)));
        get().commit((d) => {
          const without = { ...d, elements: d.elements.filter((el) => !removed.has(el.id)) };
          const plotNow = { ...plot, sideList, ...(plot.splay ? { splay: { sizeMm: plot.splay.sizeMm } } : {}) };
          let built = buildPlotWalls(
            { ...without, elements: without.elements.map((el) => (el.id === plot.id ? plotNow : el)) },
            plot.id,
            newId,
          );
          // Doors and gates on the old walls move onto the new wall of their side.
          const linked = built.elements.find((el): el is Plot => el.id === plot.id)!;
          built = {
            ...built,
            elements: built.elements.map((el) => {
              if ((el.type !== 'door' && el.type !== 'window') || !removed.has(el.wallId)) return el;
              const id = linked.sideList?.[removed.get(el.wallId)!]?.wallId;
              const host = built.elements.find((w): w is Wall => w.type === 'wall' && w.id === id);
              return host ? { ...el, wallId: host.id, ...placeOnWall(host, el, el.width) } : el;
            }),
          };
          return built;
        });
      },
      layoutClash: (retaining = false) => {
        const { doc, activeLevel } = get();
        return replacedByLayout(doc, activeLevel, retaining ? ['retaining'] : []).count;
      },
      placeLayout: (built, retaining = false) => {
        const level = get().activeLevel;
        get().commit((doc) => {
          const { kept } = replacedByLayout(doc, level, retaining ? ['retaining'] : []);
          const added = [...built.walls, ...built.openings, ...built.stairs].map((el) => onActive(el));
          return {
            ...doc,
            elements: [...kept, ...added],
            rooms: [...doc.rooms.filter((r) => levelOf(r) !== level), ...built.rooms.map((r) => onActive(r))],
          };
        });
        get().select(null);
        get().setWarning(null);
      },
      firstFloorId: () => {
        const { levels } = get().doc;
        return levels[groundIndex(get().doc) + 1]?.id ?? null;
      },
      upperClash: () => {
        const level = get().firstFloorId();
        return level ? replacedByLayout(get().doc, level, ['parapet']).count : { walls: 0, rooms: 0, other: 0 };
      },
      placeUpperLayout: (built, levelId, stairRoomId) => {
        const existing = get().firstFloorId();
        const level = existing ?? levelId;
        const on = <T extends { levelId?: Id }>(el: T): T => ({ ...el, levelId: level });
        get().commit((doc) => {
          // A new first floor goes just above the ground floor.
          const levels = existing
            ? doc.levels
            : [
                ...doc.levels.slice(0, groundIndex(doc) + 1),
                { id: level, name: 'First floor' },
                ...doc.levels.slice(groundIndex(doc) + 1),
              ];
          const { kept } = replacedByLayout(doc, level, ['parapet']);
          const rooms = doc.rooms
            .filter((r) => levelOf(r) !== level)
            .map((r) => (r.id === stairRoomId && !r.openAbove ? { ...r, openAbove: true } : r));
          return {
            ...doc,
            levels,
            elements: [...kept, ...[...built.walls, ...built.openings, ...built.stairs].map(on)],
            rooms: [...rooms, ...built.rooms.map(on)],
          };
        });
        get().setActiveLevel(level);
        get().select(null);
        get().setWarning(null);
      },
      setPlotAuthority: (plotId, authority) => {
        const plot = get().doc.elements.find((el): el is Plot => el.type === 'plot' && el.id === plotId);
        if (!plot) return;
        const next: Plot = { ...plot, authority };
        if (!authority) delete next.authority;
        // Areas belong to an authority: another one starts on its usual area for the use.
        if (authority !== plot.authority) delete next.bylawArea;
        const rule = authority ? appliedRule(get().doc, next) : null;
        get().updateElement(rule ? { ...next, setbacks: appliedSetbacks(rule, next) } : next);
      },
      setPlotBylawArea: (plotId, area) => {
        const plot = get().doc.elements.find((el): el is Plot => el.type === 'plot' && el.id === plotId);
        if (!plot) return;
        const next: Plot = { ...plot, bylawArea: area };
        if (!area) delete next.bylawArea;
        const rule = appliedRule(get().doc, next);
        get().updateElement(rule ? { ...next, setbacks: appliedSetbacks(rule, next) } : next);
      },
      addStair: (p) => {
        const { site, doc, wallHeightMm, activeLevel } = get();
        // A full floor: this floor's height and the slab over it (a basement's own height).
        const riseMm = stairRiseMm(doc, activeLevel, site.climb, wallHeightMm);
        const spec = stairSpec(site, riseMm);
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
        const inner = boundaryWallLines({ points: slab.points }, thickness);
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
      setDrawingStyle: (patch) =>
        get().commit((doc) => {
          const next: DrawingStyle = { ...doc.drawing, ...patch };
          if (next.dimText === 'medium') delete next.dimText;
          if (next.dimEnds === 'tick') delete next.dimEnds;
          if (next.sideDims !== false) delete next.sideDims;
          if (next.solidCuts !== true) delete next.solidCuts;
          if (next.planHatch !== false) delete next.planHatch;
          if (next.floorHatch !== false) delete next.floorHatch;
          const was: DrawingStyle = doc.drawing ?? {};
          const keys = new Set([...Object.keys(next), ...Object.keys(was)]) as Set<keyof DrawingStyle>;
          if ([...keys].every((key) => next[key] === was[key])) return doc;
          const out: PlanDoc = { ...doc, drawing: next };
          if (!Object.keys(next).length) delete out.drawing;
          return out;
        }),
      setNorthDeg: (deg) => {
        const north = ((deg % 360) + 360) % 360;
        get().commit((doc) => {
          if ((doc.northDeg ?? 0) === north) return doc;
          const next: PlanDoc = { ...doc, northDeg: north };
          if (!north) delete next.northDeg;
          return next;
        });
      },
      setPlinthMm: (mm) =>
        get().commit((doc) => (doc.plinthMm === mm ? doc : { ...doc, plinthMm: Math.max(0, Math.min(3000, mm)) })),
      setWallThicknessMm: (wallThicknessMm) => {
        set({ wallThicknessMm });
        persistPrefs();
      },
      setOpeningGapMm: (mm) => {
        set({ openingGapMm: clampGap(mm) });
        persistPrefs();
      },
      setMarlaSqFt: (marlaSqFt) => {
        set({ marlaSqFt });
        persistPrefs();
      },
      setAreaIn: (areaIn) => {
        set({ areaIn });
        persistPrefs();
      },
      setPaper: (paper) => {
        set({ paper });
        persistPrefs();
      },
      setWallHeightMm: (mm) => {
        const wallHeightMm = Math.min(6000, Math.max(2000, mm));
        set({ wallHeightMm });
        persistPrefs();
        const { doc } = get();
        if (doc.project && doc.project.wallHeightMm !== wallHeightMm)
          set({ doc: { ...doc, project: { ...doc.project, wallHeightMm } } });
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
      setChecks: ({ on, category, categoryOn }) => {
        const { checks } = get();
        const next = { ...checks, on: on ?? checks.on };
        if (category) next.off = checks.off.filter((c) => c !== category).concat(categoryOn ? [] : [category]);
        set({ checks: next });
        persistPrefs();
      },
      setSnaps: ({ on, group, groupOn }) => {
        const { snaps } = get();
        const next = { ...snaps, on: on ?? snaps.on };
        if (group) next.off = snaps.off.filter((g) => g !== group).concat(groupOn ? [] : [group]);
        set({ snaps: next });
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
        abandonDraft();
        set({
          view3d,
          split: false,
          drawing: null,
          draft: null,
          inference: null,
          measureText: '',
          axisLock: null,
          shiftLock: null,
        });
        setActivePicker(view3d);
        if (!view3d && get().tool === 'orbit') get().setTool('select');
      },
      setSplit: (split) => {
        if (split === get().split && !get().drawing) return;
        abandonDraft();
        set({ split, drawing: null, draft: null, inference: null, measureText: '', axisLock: null, shiftLock: null });
      },
      setSheets: (sheets) =>
        get().commit((doc) => {
          const next: PlanDoc = { ...doc, sheets };
          if (!sheets) delete next.sheets;
          return next;
        }),
      showDrawing: (key) => {
        abandonDraft();
        // Drawings are looked at, not drawn on: put the drawing tool down.
        if (!['select', 'pan', 'zoom'].includes(get().tool)) get().setTool('select');
        const first = sideDrawingRefs(get().doc)[0];
        set({
          drawing: key ?? get().drawing ?? drawingKey(first),
          view3d: false,
          split: false,
          draft: null,
          inference: null,
          measureText: '',
          axisLock: null,
          shiftLock: null,
        });
        setActivePicker(false);
      },
      setActivePane: (is3d) => {
        if (!get().split || get().view3d === is3d) return;
        setActivePicker(is3d);
        // A lock on the blue axis only means something in 3D.
        set({ view3d: is3d, inference: null, ...(get().axisLock === 'z' && { axisLock: null }) });
      },

      addRoomAt: (p) => {
        // Any room already there (even a hidden or locked one) counts.
        // On Ground, a room on its floor or its lawn counts (they show together).
        const { doc: d0, activeLevel } = get();
        const existing =
          d0.rooms
            .filter(onSharedLevel(d0, activeLevel))
            .filter((r) => pointInPolygon(p, r.points))
            .at(-1) ?? null;
        if (existing) {
          get().select(existing.id);
          set({ warnings: [] });
          return;
        }
        // On Ground, closed in by the floor's and the lawn's walls together (a courtyard between the
        // house and the boundary walls), else by this one's alone.
        const shared = d0.elements.filter(onSharedLevel(d0, activeLevel));
        const own = get().levelElements();
        const points = (shared.length > own.length ? detectRoom(shared, p) : null) ?? detectRoom(own, p);
        if (!points) {
          const gapEnds = openWallEnds(get().levelElements());
          if (gapEnds.length)
            set({
              warnings: [
                'These walls are not closed on all sides. The circled wall ends are not joined: drag an end onto the wall it should meet, then click inside again.',
              ],
              gapEnds,
            });
          else get().setWarning('Click inside an area that is closed on all sides by walls.');
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
            ? { ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? { ...room, name: cleanText(room.name) } : r)) }
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
        if (first && viewport.width > 0 && viewport.height > 0) {
          get().fitToPlan();
          // The first view isn't a step to go back to.
          set({ viewBack: [] });
        }
      },
      setView: (view) => {
        noteView();
        set({ view });
      },
      zoomBy: (factor, screen) => {
        noteView();
        const { view, viewport } = get();
        set({ view: zoomAt(view, screen ?? { x: viewport.width / 2, y: viewport.height / 2 }, factor) });
      },
      fitToPlan: () => {
        const { doc, viewport } = get();
        if (!viewport.width || !viewport.height) return;
        noteView(true);
        set({ view: fitView(planBounds(doc.elements, doc.masks) ?? DEFAULT_AREA, viewport) });
      },
      zoomToBox: (box) => {
        const { viewport } = get();
        if (!viewport.width || !viewport.height) return;
        noteView(true);
        set({ view: fitView(box, viewport, 8, MAX_ZOOM) });
      },
      zoomPrevious: () => {
        const back = get().viewBack;
        if (!back.length) return false;
        lastViewAt = 0;
        set({ view: back[back.length - 1], viewBack: back.slice(0, -1) });
        return true;
      },
      viewBack: [],
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
      editElements: (ids, fn) => {
        const picked = new Set(ids);
        get().commit((doc) => {
          const changed = new Map<Id, { prev: PlanElement; next: PlanElement }>();
          for (const el of doc.elements) {
            if (!picked.has(el.id) || el.locked) continue;
            const next = fn(el);
            if (next !== el) changed.set(el.id, { prev: el, next });
          }
          if (!changed.size) return doc;
          const elements = doc.elements.map((el) => {
            const hit = changed.get(el.id);
            if (hit) return hit.next;
            const host = 'wallId' in el && el.wallId ? changed.get(el.wallId) : undefined;
            if (host && host.prev.type === 'wall' && host.next.type === 'wall')
              return reattachOpening(el as Opening, host.prev, host.next);
            return el;
          });
          return { ...doc, elements };
        });
      },
      editOpenings: (ids, patch) => {
        let misfits: Opening[] = [];
        get().commit((doc) => {
          misfits = [];
          let working = doc;
          for (const id of ids) {
            const o = working.elements.find(
              (el): el is Opening => el.id === id && (el.type === 'door' || el.type === 'window'),
            );
            if (!o) continue;
            const next = tidy({ ...o, ...patch(o) } as Opening);
            const placed = next.width !== o.width && !o.flat ? refitOpening(get(), working, next) : next;
            if (!placed) {
              misfits.push(o);
              continue;
            }
            working = { ...working, elements: working.elements.map((el) => (el.id === id ? placed : el)) };
          }
          return working;
        });
        const [first] = misfits;
        get().setWarning(
          !first
            ? null
            : misfits.length === 1
              ? `The ${nounOf(first)} doesn't fit at that width here, with its gaps from the corners: it kept its width.`
              : `${misfits.length} doors and windows don't fit at that width, with their gaps: they kept theirs.`,
        );
      },
      fixOpeningGaps: (ids) => {
        let stuck = 0;
        get().commit((doc) => {
          stuck = 0;
          let working = doc;
          for (const id of ids) {
            const o = working.elements.find(
              (el): el is Opening => el.id === id && (el.type === 'door' || el.type === 'window'),
            );
            if (!o) continue;
            const moved = refitOpening(get(), working, o);
            if (!moved) stuck += 1;
            else working = { ...working, elements: working.elements.map((el) => (el.id === id ? moved : el)) };
          }
          return working;
        });
        get().setWarning(
          stuck
            ? `${stuck === 1 ? 'One door or window is' : `${stuck} doors and windows are`} too wide for its piece of wall with the gaps: make it narrower, or the gap smaller in Settings.`
            : null,
        );
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
      raiseSelected: (mm) => {
        const { selectedIds } = get();
        if (selectedIds.length) get().commit((d) => raiseItems(d, selectedIds, mm));
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
      newProject: (type, use) => {
        const units = unitsFor(type);
        // Free projects and buildings start round: 3 m walls, 200 mm thick.
        const project: ProjectSettings = {
          type,
          ...(type === 'building' ? { use: use ?? 'other' } : {}),
          units,
          ...(type !== 'house' ? { wallHeightMm: 3000 } : {}),
        };
        const doc = { ...emptyDoc(), project };
        set({ doc, savedDoc: doc, fileName: DEFAULT_FILE_NAME, filePath: undefined, ...resetHistory });
        get().applyProject();
        // A house starts from the bylaws picked before; other projects have none unless asked.
        if (type !== 'house') {
          get().setSite({ authority: undefined });
          get().setWallThicknessMm(200);
        }
        get().fitToPlan();
      },
      setProject: (patch) => {
        get().commit((doc) => ({ ...doc, project: { ...projectOf(doc), ...patch } }));
        get().applyProject();
      },
      applyProject: () => {
        const p = get().doc.project;
        if (p?.units && p.units !== get().units) set({ units: p.units, gridPx: gridFor(get().grid, p.units) });
        if (p?.wallHeightMm && p.wallHeightMm !== get().wallHeightMm) set({ wallHeightMm: p.wallHeightMm });
      },
      setLevelHeight: (id, mm) =>
        get().commit((doc) => {
          const level = doc.levels.find((l) => l.id === id);
          if (!level || level.heightMm === mm) return doc;
          const next = { ...level, ...(mm === undefined ? {} : { heightMm: mm }) };
          if (mm === undefined) delete next.heightMm;
          return { ...doc, levels: doc.levels.map((l) => (l === level ? next : l)) };
        }),
      loadDocument: (doc, file) => {
        set({ doc, savedDoc: doc, fileName: file.name, filePath: file.path, ...resetHistory });
        get().applyProject();
        if (!doc.materials.some((m) => m.id === get().selectedMat)) set({ selectedMat: doc.materials[0]?.id ?? '' });
        get().fitToPlan();
      },
      markSaved: (file) => set({ savedDoc: get().doc, fileName: file.name, filePath: file.path }),
    };
  });
}

const loaded = loadPlan();
export const plannerStore = createPlannerStore(loaded.doc, loaded.warning, undefined, loadFileInfo());

let autosaveWarned = false;
plannerStore.subscribe((state, prev) => {
  if (state.doc !== prev.doc) {
    const ok = savePlan(state.doc);
    if (!ok && !autosaveWarned)
      state.setWarning(
        "Autosave failed: the browser's storage is full. Save the plan to a file (Ctrl+S) so nothing is lost.",
      );
    autosaveWarned = !ok;
  }
  if (
    state.doc !== prev.doc ||
    state.savedDoc !== prev.savedDoc ||
    state.fileName !== prev.fileName ||
    state.filePath !== prev.filePath
  )
    saveFileInfo({ name: state.fileName, path: state.filePath, dirty: state.doc !== state.savedDoc });
  if (state.theme !== prev.theme) applyTheme(state.theme);
});

// Another window of Mimar saving the same autosave: say so once, as the two would overwrite each other.
if (typeof window !== 'undefined') {
  let told = false;
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || told) return;
    told = true;
    plannerStore
      .getState()
      .setWarning(
        'Mimar is open in another window too. Both save to the same place, so the last change wins: close one of them, or save this plan to a file.',
      );
  });
}
// Before the first paint, so the app never flashes in the wrong colours.
applyTheme(plannerStore.getState().theme);

export function usePlanner<T>(selector: (state: PlannerState) => T): T {
  return useStore(plannerStore, selector);
}
