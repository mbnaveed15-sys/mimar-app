# Architecture

Electron 44 + Vite 8 + React 19 + TypeScript 6 + Tailwind 4 + Zustand, three.js for 3D.

## Units and data

- Plan coordinates are in **plan units of 10 mm** (`MM_PER_UNIT` in `src/lib/scale.ts`); lengths the user types are
  in feet/inches or metric (`src/lib/units.ts`). 3D uses metres (`M_PER_UNIT`).
- The whole plan is one `PlanDoc` (`src/types.ts`): `elements` (walls, doors/windows, furniture, columns, beams,
  slabs, plot, stairs, layout lines), `rooms`, `masks`, `materials`, `groups`, `components`, `levels`, `plinthMm`,
  `layers` (hidden/locked layer flags). Every item can carry `levelId`, `groupId`, `hidden`, `locked` and
  `elevMm` (height above its floor, −5000..30000; applied in `src/three/model.ts`); windows can carry `sillMm`.
  `raiseItems()` in `src/lib/selection.ts` changes them (a lone window moves its sill). The Move tool's blue-axis
  lock (`axisLock: 'z'`, 3D only) lives in `src/tools/controller.ts` (`toggleHeightLock`, `showMove`).
- Files: `.mimar` JSON (`src/lib/files.ts`); `src/lib/storage.ts` normalises anything loaded
  (`normaliseDoc`), so old files keep opening. Bump `CURRENT_VERSION` when the format changes.
- **When adding a new item type**, update: `types.ts` (`PlanElement`), `storage.ts` (normalise), `geometry.ts`
  (centre, `isNear`, move/rotate, outline), `lib/modify.ts` (mirror/scale/stretch), `lib/layers.ts` (`BY_TYPE`),
  `SelectionPanel.tsx` (`NAMES`), `PlanDrawing.tsx` (shape), `three/model.ts` (3D), `lib/exportDxf.ts`, and add it to
  `src/store/everyType.test.ts`. The type system flags most of these.

## State: `src/store/plannerStore.ts`

One Zustand store holds the document, undo/redo history (`commit`, `beginBatch`/`endBatch`, `commitFromBase`),
the tool, draft (what is being drawn), selection, view, preferences and every action (`addWall`, `addRoomAt`,
`placeOpening`, `addPlot`, `addStair`, `linesToWalls`, `hideSelected`, …).
Visibility helpers: `levelElements()` (this floor), `visibleElements()` (not hidden), `pickableElements()`
(not hidden or locked), `shownDoc()` (for drawing/exports). Preferences persist via `src/lib/prefs.ts`; the plan
autosaves to local storage on every change.

## Input and tools

- `src/components/usePlanInput.ts`: mouse/pen/touch handling for **both** the 2D canvas and the 3D view
  (selection, moving, box select, drag-erase, handles). It takes a `toPlan(screen point)` function, so 3D reuses it.
- `src/components/useKeyboardShortcuts.ts`: `isTyping` decides which keys a focused control keeps (text fields
  and drop-downs keep all; checkboxes, sliders and menu names only Space, Enter, Tab and the arrows); `ANYWHERE`
  lists the Ctrl keys that work even from a field. `src/components/useFocus.ts`: `useFocusTrap` (dialogs, the
  welcome and tour) and `useMenuKeys` (pop-up menus).
- Paste: `pasteToPlace` in `src/tools/controller.ts` pastes, then starts a Move draft with `pasted: true`;
  `finishMove` joins the paste and the move into one undo step (`mergeLastSteps`), and `cancel` takes the paste
  back (`discardLastStep`).
- `src/components/useTouch.ts`: one finger acts like the mouse; two fingers pan/pinch; three fingers orbit (3D);
  long-press opens the menu.
- `src/tools/controller.ts`: tools that take clicks and typed measurements (wall, line, rectangle, tape, move,
  rotate…), with `structureTools.ts` (column, beam, slab, plot, stairs) and `modifyTools.ts` (Modify menu).
- Shapes and Push/Pull: `src/tools/shapeTools.ts` (the Shape and Push/Pull tools), `src/lib/pushPull.ts` (pure:
  `faceOf` tells which face a 3D hit is on, `pushPull` returns the plan after moving it), `src/lib/shapes.ts`
  (outlines; `openingProfileMm` for window shapes). A flat shape is a `block` with `heightMm: 0` on a floor, or a
  `window` with `flat: true` on a wall face, whose `depthMm` makes it a niche (< 0) or a projection (> 0);
  `withShapeDepth` cuts it through (clears `flat`, sets `open`) within 2" of the far face. The 3D view registers a picker
  (`src/three/picker.ts`: face under the pointer, pointer on a plane, distance along a line, and `highlight` to
  light up just that face) that these tools use. The 2D plan registers one too (`is3d: false`), built on
  `src/lib/faces2d.ts` (faces seen from above), so Push/Pull also works in 2D.
- `src/lib/inference.ts`: snapping order: points (ends, corners, midpoints incl. wall pieces, intersections) →
  building line → lined up with two ends (or one and the axis, or one on the wall under the pointer) → axes →
  lined up with one end → along walls/faces/lines (grid steps from the nearer end or face corner) → grid.
- Bylaws: `src/lib/bylaws.ts` (the authorities' tables, `ruleFor` by size and frontage, `plotRule`, `plotSetbacks`),
  `src/lib/planCheck.ts` (pure check rows, including the mumty and car porch; `mumtyLevelIds` tells mumty floors
  apart), `src/lib/planHints.ts` (pure good-practice hints: door graph per floor, outside walls and windows, sizes by
  name, kitchen and prayer room placement), `src/store/usePlanCheck.ts` (`usePlanCheck`, `usePlanHints`),
  `src/components/PlanCheckPanel.tsx` (bylaw rows, then Hints), `CheckMarks.tsx` (red, dashed and dotted marks, on
  items and rooms) and `PlotBylaws.tsx` (authority, presets, the plot's setbacks). Figures and sources:
  `docs/handover/06-bylaws.md`. The plan's `northDeg` (degrees clockwise from up) drives the PDF's north arrow.
- Plots (1.30): `src/lib/plot.ts` (pure) has the sides (`Plot.sideList`, one `PlotSide` per edge: kind, typed
  `setbackMm`, `wall` spec, `wallId`; missing in older plots, whose sides `plotSides` works out from `front`),
  `sideSlots`/`sideSetbacks` (main road = front, back sides = rear, the rest side 1 going round from the road and side
  2 coming back; a second road is provisional), the cut corner (`Plot.splay`, `roadCorner`, `plotOutline`,
  `outlinePoints`, `plotArea`), `insetPolygon` (per-edge setbacks for any shape: mitred corners, edges squeezed out
  are dropped, self-touching results split and the biggest part kept) behind `buildableArea`, `sideWallLines`,
  `outlineProblem` (self-crossing) and `orientOutline` (plots go round as `plotRect` makes them; `reversedSides` after
  a mirror, used by `mapOutline`). `src/lib/plotWalls.ts` links boundary walls both ways (`PlotSide.wallId` /
  `splay.wallId` and `Wall.plotId`/`plotSide`): `buildPlotWalls` makes walls match the sides, `placePlotWalls` puts
  them in place (openings reattached), and `syncPlotWalls(prev, next)` runs in every `commit`/`commitFromBase`, so
  whatever changes a plot moves its walls; it also takes a wall's panel edits back to its side, forgets deleted walls,
  lets a pasted plot adopt the pasted copies of its walls (new walls naming the source plot, nearest to where they
  belong) and makes walls whose plot no longer links them ordinary. Store actions: `addPlot(points, road)`,
  `updatePlot`, `movePlotCorner` (the corner grips, `plot-corner-i` handles in `Canvas.tsx`), `addSideGate`,
  `rebuildPlotWalls` (`boundaryWallsAlong` finds old walls). The tool: `plotShape` in `SiteSpec`, draft `plotPoly`
  (`structureTools.ts`: `plotCorner`, `finishPlotPoly`; `measureKindOf` in the controller makes it take lengths);
  UI in `src/components/PlotSides.tsx`. Plan check: per-side rows are `detail: true` (shown under Setbacks, not
  counted); 3D draws the setback line from `Model3D.guides`.
- Layouts from a room list (1.31): `src/lib/layoutGen.ts` (pure) turns a `Program` (bedrooms, attached baths, optional
  rooms, `sizes` in feet over `DEFAULT_SIZES`) into scored `Layout`s in a local frame (x along the road, y in from it,
  plan units, sizes to wall centre lines): `candidate` puts rooms in front/middle/back strips (`BANDS`, by width
  capacity), stacks small rooms two to a column, sizes columns (`widths`: narrowest + `WALL_ALLOW`, spare width by
  `GROWTH`), puts each bath in its bedroom (corner or side strip), adds a passage at random; `scorePlan` makes the doors
  (main entrance, `ENTERED_FROM` preferences, a last-resort way in with a note) and scores sizes, shapes, daylight
  (`DAYLIGHT`) and the kitchen; `generateLayouts` runs ~1,500 seeded tries (`rng`) and keeps the best per strip order,
  unreachable plans last. `src/lib/layoutBuild.ts`: `largestRect`, `layoutSite` (the frame and size inside the
  building line and boundary walls, capped by coverage and by what the rooms need), `buildLayout` (walls from room
  edges: 9" facing outside or the porch, 4½" between rooms, none inside a room or porch-to-outside; doors swinging
  into the room entered; windows; rooms by `detectRoom`; a U stair). Store: `layoutClash`, `placeLayout` (one commit).
  UI: `src/components/LayoutPanel.tsx` (section `layout`; the list in browser storage `mimar.roomList`).
- Basements (1.32): `Level.basement` / `heightMm` (at most one, first in `doc.levels`, before the ground floor;
  `normaliseLevels` keeps that order). `src/lib/levels.ts`: `groundIndex`, `basementOf`, `isBasement`,
  `levelWallMm` (a floor's default wall height). Never treat `levels[0]` as the ground floor: use `GROUND_LEVEL`.
  `levelBaseM` puts floors below the ground floor at the plinth less a slab and their height. Wall kind
  `'retaining'` (`WallKind` in `types.ts`; `KIND_HEIGHT_MM`, `RETAINING_MM` in the store); `addRetainingWalls`
  builds them from `outsideOutline` (`src/lib/outline.ts`: the walls' outside faces from `wallFaces(walls, true)`,
  the centre-line loop round the outside, moved out by half each wall) or the building line. 3D: `Floor.holes`
  opens the lawn over the basement (rendered in `Plan3DView`, exported as a thin prism). Quantities:
  `retainingCft`, `excavationCft`, `raftCft` (`RAFT_FT`), `waterproofSqft`; rates `waterproofing`, ratio
  `steelRetaining`. Bylaws: `Authority.basement` (`extent`, `clearMm`); plan check rows `basement-extent`,
  `basement-height`, `basement`. Layouts: `Program.basement`/`gym`, `basementOutline`, `buildLayout` options
  `outer`, `noWindows`, `stairAt`; `placeLayout(built, true)` replaces retaining walls too.
- Projects (1.33): `PlanDoc.project` (`ProjectSettings`: `type` house/free/building, `use`, `units`, `wallHeightMm`,
  `slabMm`, `panels`); no `project` means a house. `src/lib/project.ts`: `projectOf`, `shows(doc, panel)` (the
  project's switch, else the type's usual), `unitsFor`, `ROOM_TYPES` per use, `daylightRooms`. `planCheck` returns
  null and `planHints` [] when switched off, so the panel, marks and PDF all follow; hints drop the house rules
  (through-bedroom, prayer, kitchen, sizes) for other types, and free projects skip daylight. Store: `newProject`,
  `setProject` (one undo step), `applyProject` (units, grid, wall height follow the doc, also on undo/open);
  `setUnits`/`setWallHeightMm` write into the project when there is one. Heights: any floor's `Level.heightMm`
  (`setLevelHeight`), `levelWallMm`, `slabMm(doc)` (was the `SLAB_MM` constant) and `levelBaseM` sums each floor.
  UI: `NewProjectDialog` (Dialogs.tsx, after File › New clears the plan), `ProjectPanel.tsx` (section `project`).
- `src/lib/spatial.ts`: `GridIndex` (buckets for point lookups) and `boxOf`, used by the hints and the covered
  area so they scale to thousands of rooms. `src/store/usePlanCheck.ts` keeps one shared result per change and uses
  the plan from before a drag (`batchBase`) until it is let go. `src/lib/text.ts` `cleanText` strips control
  characters from names. `rooms.ts buildWallGraph` sweeps along x and hashes corners (no longer O(n²)).
- Autosave keeps the file name, path and unsaved flag under `mimar.file` (`saveFileInfo`/`loadFileInfo`), so File ›
  New still asks after a reload.
- Snapping (`src/lib/inference.ts`): 1) points, nearest wins (ends, wall-face corners, midpoints of whole walls and
  of the pieces between the walls that meet them, crossings incl. faces, perpendicular, axis∩wall); 2) the
  building-line guides (`buildingGuides` in `src/tools/controller.ts`, from `buildingGuide` in `site.ts`, set in by
  the tool's half size); 3) "aligned": lined up with the ends of nearby walls/lines (within 40× the tolerance, not
  the ends of what the pointer is on) where two guides cross, a guide meets the last point's axis, or a guide
  crosses the wall under the pointer (`Inference.guides` holds the dotted lines, drawn in `DrawingOverlay` and the
  3D overlay); 4) the red/green axis from the last point; 5) lined up with one end (only away from walls); 6) along
  walls, wall faces and lines, a whole number of grid steps from the nearer end (for a face, from the corner at the
  end of its piece: `clearAlong` in `openingPlace.ts`); 7) the grid. During Stretch/Scale/Rotate/Mirror previews it snaps to
  `batchBase`. Typed points: `parseMeasure` → `{ kind: 'vector' }` (`@x,y`, `len<angle`). AutoCAD aliases:
  `src/lib/aliases.ts`, read in `useKeyboardShortcuts.ts`; `src/tools/finish.ts` is Enter/right-click. The modify
  library (`src/lib/modify.ts`) treats walls and layout lines alike (`type Wall = WallItem | SketchLine` there).
- Tool bars: `src/lib/toolbars.ts` (the bars, the saved layout in prefs, `moveToolbar`, `packColumns` which
  wraps bars into columns) and `src/components/ToolDocks.tsx` (the four docks, grips, drag and drop, grip menu).
- `src/commands.ts`: every menu item, shortcut and Ctrl+K palette entry in one registry.

## Drawing

- 2D: `Canvas.tsx` (SVG) → `PlanDrawing.tsx` → shapes in `src/components/shapes/`. The same drawing makes the
  PDF/PNG (`src/lib/planImage.tsx`, `exportPdf.ts`, `exportPng.ts`).
- 3D: `src/three/model.ts` turns the plan into boxes, floors, slabs (with voids), blocks and upright panels
  (the wall round a round/arched/polygon opening, its glass, and flat wall shapes) (pure, tested);
  `Plan3DView.tsx` renders with three.js, raycasts for picking/drawing, shows previews (`draft3d.ts`),
  and uses `cameraRig.ts` for the camera (orbit, pan, dolly, pivot about a point, extents, standard views, and a
  parallel camera kept framed like the perspective one; `rig.active` is the one to render and pick with).
  `viewControls.ts` lets menu commands reach the 3D camera (zoom, extents, standard view, parallel); a view asked
  for before 3D opens is kept until it does. Materials are cached for the session by look (`MATERIALS`, with their
  faded/lit/red variants), one `WebGLRenderer` is reused across opens, and anything in `KEPT` is never disposed.
  A wall's two sides (`materialA` on its left normal (-dy, dx), `materialB` the other) become `sides` on its
  solids and panels: box faces +z/−z and the panel caps (split by `splitCaps`) take their own material, in the view
  and in `export3d.ts`.
- Split view: `store.split` is the layout; `store.view3d` means "the view in use" (in split view, the side under
  the pointer, set by `setActivePane` from `src/components/SplitView.tsx`, which keeps any draft going). Each view
  registers its picker (`src/three/picker.ts`: `setPicker`/`clearPicker`, one per side; `getPicker` answers for
  the side in use). The 3D view publishes its camera to `src/three/cameraEye.ts`, which the plan draws
  (`CameraEyeMark` in `Canvas.tsx`). `useShownDoc` in `Plan3DView.tsx` holds back 3D rebuilds while a drag runs on
  the plan side.
- Quantities and cost: `src/lib/quantities.ts` measures each floor (pure, tested); `src/lib/estimate.ts` holds the
  starter rates and ratios, prices the quantities into lines and works out the materials, and writes the CSV;
  `src/lib/costReport.ts` puts them together for the panel (`CostPanel.tsx`), the CSV and the PDF page
  (`costPage` in `exportPdf.ts`). Rates live in `src/store/costStore.ts` (browser storage key `mimar.cost`, not
  in the plan file).
- Door and window types: `Opening.doorKind` / `windowKind` (missing = the old single door / plain window; a gate is
  drawn as a double). `src/lib/openingKinds.ts` holds the names, sizes and the plan symbol as paths in the
  opening's own frame (`openingSymbol`), used by `OpeningShape.tsx` (plan, PDF, PNG) and `exportDxf.ts`; 3D is in
  `doorLeaves` and `windowPanes` in `three/model.ts`.
- Placing doors and windows: `src/lib/openingPlace.ts` (pure) splits a wall into pieces between the faces of the
  walls that meet or cross it (`wallPieces`; no gap where a wall carries straight on), and places an opening in a
  piece (`placeOnWallPiece`: snaps to the piece's centre, half centres, the gap from a corner, grid steps from the
  corner; kept the gap from corners and other openings; `placeAtDistance` for a typed distance; `openingFits`); it
  also turns door flips into hands and back (`doorSides`, `flipsFor`, `handOf`, `flipsTowards`: hand is seen from
  the side it opens into). `src/store/openingAt.ts` builds the new opening from the tool's settings (`site`:
  `doorWidthMm`, `doorHand`, `windowWidthMm`/`SillMm`/`HeightMm`, `openingMaterial`) or a picked-up/pasted one
  (`openingStamp`, `stampQueue` = pasted ones go down one per click), and has `slideOpening`, `refitOpening`,
  `copyOpeningTo`, `besideOpening`, `loneOpenings`, `fitterFor` (for `mirrorItems`' lone openings). The tool itself
  is `src/tools/openingTool.ts` (hover shows `draft.type === 'opening'` with a ghost and distances; press places or,
  with Alt, picks up; typed lengths; V flips the hinge). The gap is a preference (`openingGapMm`, 6"). Multi-edit:
  `editOpenings` in the store and `OpeningsPanel.tsx`; `fixOpeningGaps` backs the plan hint `opening-gaps`
  (`tightOpenings` in `planHints.ts`).
- Plants and garden items are ordinary furniture kinds (`furniture/catalog.ts`, categories Plants and Garden);
  `isPlant` gives them a green plan fill; their 3D forms are stacked boxes in `furnitureSolids`.
- Furniture use zones (1.34): `src/furniture/useZones.ts` holds `USE_ZONES` (free space in mm in front, behind and at
  the sides of each library kind, an optional ADA wheelchair zone, and a source), `zoneRects` (in the item's own
  frame: centred, back at the top) and `zoneSamples` (lines of test points out from the item). `blockedZones` in
  `planHints.ts` finds zones where a wall or another item stands in half the width or more (`oneSide` items need
  only one side free) and gives the `zone-<id>` hints. `FurnitureShape` draws the zone round a selected item; the
  side panel's `UseZoneNote` gives the figures and source. The preference `accessibleZones` (Settings) picks the
  ADA zones. Figures are public-domain ADA 2010 values or marked "General practice": never copy from copyrighted
  handbooks (the owner's Architectural Graphic Standards disc is encrypted and not to be used).
- Sections, elevations and sheets (1.35), in `src/lib/drawings/` (pure, tested):
  - `refs.ts` (light, used by the store and plan): drawing keys (`section:<id>`, `elevation:front`, `plan:<levelId>`,
    and `sheet:<id>` for `store.drawing`), titles, the next section letter, `sectionLook` (the right of the line
    from its start to its end, (−dy, dx), or the left when `flip`).
  - `hiddenLines.ts`: turns prisms (an outline with holes pushed along a vector, in scene metres) into a drawing
    seen along a level direction: u to the viewer's right (`rightOf`), v up, d the depth. Sections clip the faces at
    d ≥ 0 and cut each prism along the plane (`cut`: polygons with holes); every face edge is split where it crosses
    other faces' outlines or depths, and each piece is kept, hidden, left out as a joint (two flush faces facing the
    same way) or marked heavy (against empty space) by looking just to each side of it (`classify`, via `FaceGrid`).
    `mergeLines` joins pieces in line.
  - `views.ts`: `sideDrawing(doc, ref, opts)` builds the model (`buildModel` with `closedDoors` and no furniture),
    adds the floor and roof slabs a plan leaves understood (`impliedSlabs`, from the building's outside outline),
    leaves boundary walls and their gates out of elevations (clipped at the ground, `minV`), and adds `levelMarks`;
    `frontLook` is from the plot's road side (`sideOutward`), else up the page. `sideCache` works each out once.
  - `sheet.ts`: sheets as paper-millimetre primitives (`Prim`: line, fill, tri, rect, circle, text and a `plan`
    box the plan renderer fills), shared by the Drawings view (`SheetSvg.tsx`) and the PDF (`exportSheets.ts`,
    which rasterises plans as the plan PDF does, up to 200 DPI). `layoutSheet` packs the drawings in rows (`pack`),
    captions them, adds the north arrow and the title block; `suggestedSheets` / `sheetsOf` give the suggested set
    when `doc.sheets` is missing (an empty array means the owner cleared them). `source.ts` ties them to the store.
  - `src/components/DrawingsView.tsx` (loaded when first opened) lists them and edits sheets (`setSheets`);
    `store.drawing` (the key shown) is set by `showDrawing` and cleared by 2D/3D/Split and by drawing tools.
  - The Section tool is in `structureTools.ts` (draft `section`: two ends, then the side); section lines are
    `SectionLine` elements (`type: 'section'`, `label`, `flip`) drawn by `SectionShape.tsx` on every floor.

- Terrain and site (1.36), in `src/lib/terrain/` (pure, tested, except the two fetchers):
  - Items: `SpotLevel` (`type: 'level'`, `zMm`, `approx` for satellite levels), `Contour`, `Pad` (a levelled area) and
    `ContextItem` (`kind: 'building' | 'road'`, from OpenStreetMap). They have no `levelId` (ground floor) and sit on
    the layers `terrain`, `pads` and `context`. `PlanDoc.ground` (`GroundSettings`: `grade`, `levelMm`, `contourMm`,
    `cutFill`; only non-defaults kept) and `PlanDoc.location` ({lat, lon}). Heights are mm above the datum, ±0 = the
    road level at the middle of the plot's road side.
  - `surface.ts`: Delaunay triangulation, `buildSurface` (height anywhere; flat beyond the hull), `contourLines`,
    `meshArea` (a triangle mesh of an area with holes), `earthworks` (cut and fill by sampling a grid),
    `profileAlong`. `ground.ts`: `groundOf(doc)` (memoised on the ground inputs) gives `naturalAt` and `finishedAt`
    (a pad, else the levelled plot, else natural); satellite levels within 10 m of a surveyed point are dropped.
    `groundView.ts`: contour lines with majors every fifth, the cut/fill tint and daylight line
    (`cutFillMap`), `siteEarthworks` (for `quantities.ts`: `cutCft`, `fillCft`) and `groundOnPlan` (what the plan,
    PDF, PNG, sheets and plan DXF draw; passed to `PlanDrawing` as `ground`, from the whole plan on the ground floor).
  - `importSurvey.ts`: CSV and DXF survey readers and `placeSurvey` (units, column order, datum, centred on the plot).
    `online.ts`: `parseLocation` (typed pairs and Google Maps links), `geoToPlan`/`planToGeo`, the Overpass query and
    `contextFromOverpass`, terrarium (SRTM) tiles, `satelliteLevels`; `fetchContext` and `fetchHeights` need a browser
    (the CSP in `vite.config.ts` allows `overpass-api.de` and `s3.amazonaws.com`).
  - Tools: `src/tools/groundTools.ts` (Spot level, Contour, Levelled area; typed heights set `site.groundMm`),
    dispatched from `structureTools.ts`; drafts `contour` and `pad`. Store actions: `addSpotLevel`, `addContour`,
    `addPad`, `padUnderHouse`, `setGround`, `importSurvey`, `clearSurvey`, `setLocation`, `setContext`,
    `setSatelliteLevels`. UI: `GroundPanel.tsx` (side panel "Ground and site", and the tools' options),
    `shapes/TerrainShapes.tsx` (plan shapes and `GroundOverlay`), Inspector height fields.
  - 3D: `src/three/terrain3d.ts` and `model.ts` (ground meshes, walls and plinth down to the ground, stepped
    boundary walls, context blocks and roads). Drawings: `views.ts` adds a ground `profile` (finished and natural)
    and `hiddenLines.ts` clips elevations under a varying ground (`ViewFrame.ground`).

- Freer form (1.37):
  - Curved walls: `Wall.bow` is the signed sagitta (plan units) towards side A (the left normal); none or 0 is
    straight. `src/lib/arc.ts` (pure, tested) has the circle (`arcOf`, cached), `runLength`, `pointAlong`,
    `wallPath` (faceted: 0.2 unit tolerance, 5° steps), `wallSegments`, `projectOnWall`/`distanceToWall`,
    `bowThrough`/`bowForRadius`, `partOf`, `reversed`, `offsetWall` (same centre), `straightPieces` (the 3D pieces,
    openings in their own flat piece, joints closed) and `placeOnArc` (a door flat across the curve, ends on it).
    Everything that measured a wall by its ends goes through these (geometry, rooms' wall graph, outline, inference,
    opening placing, quantities, hints, modify, DXF bulges and ARC dimensions). Draw: `site.wallArc`, draft
    `wall.bend`/`bow`, `finishArcWall` in `controller.ts`; the `wall-bend` grip in `Canvas.tsx`/`usePlanInput.ts`.
  - Double-height rooms: `Room.openAbove`. `src/lib/voids.ts`: `openRooms` (none on the top floor), `voidsOver`,
    `within`/`overlaps`; used for slab holes (model, implied slabs, quantities), floors above, `builtAreaSqFt`,
    the "Open to below" plan shape (`voids` prop of `PlanDrawing`, from `exportActions.ts`/`drawings/source.ts`) and
    the over-void hint.
  - Curtain walls: `kind: 'curtain'` (`isBuildingWall` counts them), `mullionMm`, `transomMm`. `src/lib/curtain.ts`
    (spacing, transom, `mullionStops`, `metricProject`); `curtainParts` in `model.ts`; `CurtainMarks` in
    `WallsLayer.tsx`; quantities `glazingSqft` (rate `glazing`).
  - Pitched roofs: `Roof` (`type: 'roof'`, `points` = the eaves, `shape` hip/gable/shed/flat, `pitchDeg`,
    `gables?`, `lowEdge?`, `overhangMm`, `thicknessMm`) on the `roofs` layer. `src/lib/roof/skeleton.ts` (pure,
    tested): `skeletonRoof` (weighted straight skeleton: eaves weight 1, gables 0; faces, ridge/hip/valley lines,
    `heightAt`, `peak`) and `shedRoof`. `src/lib/roof/roof.ts`: `roofShape` (cached per item), `gableEdges`
    (default: wing ends), `lowEdgeOf`, `eaveMm` (the slope passes over the walls' outside faces, `overhangMm` in,
    at the top of the walls), `roofTopMm`, `slopedArea`, `gableWalls`, `readPitch`/`formatPitch`, `withOverhang`
    (keeps gable edges via `insetPolygon`'s edge map) and a small `triangulate`. `mapOutline` remaps gable and low
    edges when a mirror turns the outline round. 3D: `Model3D.roofs` (`Roof3D`: sloped faces thickened straight
    up), `roofMesh` (used by `Plan3DView.tsx` and `export3d.ts`), gable walls as wall `Panel`s. Drawings: roof faces
    are prisms in `modelPrisms`; `hiddenLines.ts` cuts a sloping face pushed upright; `impliedSlabs` and
    `slabEstimateCft` skip a roofed floor; `levelMarks` adds "Top of walls" and "Ridge". Tool: `roof` in
    `structureTools.ts` (draft `roof`, corner by corner like the plot; `finishRoof` on Enter), settings
    `site.roofShape`/`roofPitchDeg`/`roofOverhangMm`, store `addRoof`/`roofOverHouse`, UI `RoofOptions.tsx`
    (tool options and Inspector fields), plan `RoofShape` in `shapes/StructureShapes.tsx`, DXF `A-ROOF`/`A-ROOF-OTLN`.
    Quantities: `roofSqft` (rate `roof`), the roof as RCC slab, gable walls as brickwork.


## Exports

`src/lib/exportActions.ts` (entry points), `exportDxf.ts` (R12, mm, AIA layers; `sideDrawingsToDxf` for sections
and elevations), `export3d.ts` (GLB, DAE, OBJ, written directly; `zip.ts` for OBJ+MTL), `exportPdf.ts` /
`exportPng.ts`, `exportSheets.ts` (drawing sheets, loaded when first used).

## Desktop, web and branding

- `electron-main.cjs`, `preload.cjs`, `updater.cjs`: window, splash, file dialogs, auto-update (electron-updater).
- Web: `src/lib/pwa.ts` registers `sw.js`, which `vite.config.ts` writes after each build from `src/sw-template.js`
  with the exact file list; `public/manifest.webmanifest`; icons in `public/icons/`.
- Logo: `src/components/Mark.tsx` (in-app) and `scripts/logo.mjs` (all logo files + PNGs); then
  `scripts/make-icons.mjs` for the web icons.
- Themes: CSS variables in `src/theme/themes.css` (five themes); plan colours in `src/theme/plan.ts`.
