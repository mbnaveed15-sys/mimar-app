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
  long-press opens the menu. A quick two-finger tap (under 300 ms, under 12 px of travel and spread, no twist) calls
  `undo`, a three-finger tap `redo`. `Gesture.turn` is the two fingers' twist (radians, clockwise on screen), 0 until
  it passes `TWIST_START` (about 8°) in a gesture; `Plan3DView` turns the rig with it (`orbit(-turn / ORBIT_SPEED, 0)`),
  2D ignores it.
- `src/walls.ts` `wallPolygon`: walls overlap at square corners (ends reach on by half the thickness); two straight
  walls meeting end to end at another angle are mitred (`mitreAt`; not for T-junctions, three walls, curves or a
  mitre longer than 4 half-thicknesses). 3D boxes use `wallReach` (to the outer mitre corner).
- `src/components/TouchBar.tsx`: over the plan's bottom-left corner. While drawing on touch: Done, Cancel, Flip hinge
  ("Touch actions"). With a selection: the selection bar ("Selection actions": Delete, Duplicate, Rotate 90°, Mirror,
  Properties, Deselect; enabled by `canCopy` / `canTransform` from `commands.ts`), shown when the plan was touched, on
  a phone, on a coarse pointer, or when the pref `selectionBar` (View › Selection bar, `setLayer`) is on. Labels hide
  below 1024 px.
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
  items and rooms) and `PlotBylaws.tsx` (authority, presets, a building's area and the road width, the plot's
  setbacks). Figures and sources:
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
- Ground (site) level (1.47): `Level.site`, id `SITE_LEVEL` ('site'), after the basement and before the ground floor
  (`normaliseLevels`, `withSiteLevel`). Added when first picked (`showSiteLevel`; the floor list always lists it). Its
  floor is the lawn (`lawnMm`: `ground.levelMm`, 0 when natural); its walls default to `siteWallMm` (plinth less lawn,
  at least 6") and its stairs climb that (`stairRiseMm`). It isn't a storey: use `buildingLevels(doc)` (every level but
  it) for stacking (`levelBaseM`), voids (`levelAbove`/`levelBelow`), implied slabs, level marks, plan hints and storeys;
  `builtAreaSqFt` is 0 for it. In 3D, its walls stand on the terrain like boundary walls (on the lawn when flat), blocks on
  the ground at their middle. `PlanDoc.ownPlinth` (Plinth: Draw my own) drops the automatic plinth band under ground-floor
  walls in 3D and quantities (foundations then come from the walls on Ground (site)). The canvas shows the ground floor
  faintly over it (offset +1) and `tracePoints` in the controller snaps to the ground floor's wall corners. Format 17.
- Freeform slabs (1.47): `structure.slabMode` (`rect`, `corners`, `rooms`, `walls`; StructureOptions "Slab shape").
  Drafts `slabPoly` (corner by corner, like the roof) and `slabRooms` (rooms picked, Enter finishes; `finishSlab`).
  `src/lib/slabOutline.ts`: `joinOutlines` (rooms meeting along shared centre-line sides joined, courtyards as holes),
  `toOuterFaces` (out to the walls' far faces, but only halfway over a wall with a room beyond), `roomsSlab`,
  `wallsOutlineAt` (the outside of the joined walls clicked). `addSlab(points, holes)`.
- One Ground level (1.48): the ground floor and its lawn (`SITE_LEVEL`) show and pick together. `sharedLevelIds` /
  `onSharedLevel` in `levels.ts` are used by `visibleElements`, `pickableRooms`, `useLevelDoc` (offsets count past
  the pair), the 3D view (`faceAt`, `pickAt`, `styleMeshes`) and `setActiveLevel` (keeps the selection within the
  pair). The floor list shows `buildingLevels` only, with a Draw on: Floor | Lawn switch; `GroundPlace.tsx` (Properties,
  multi-select) calls store `setItemsLevel` (doors and windows follow their walls). Room detection and the wall graph
  stay on the active level only (`ownShown` in `structureTools.ts`). `stepLevel` (Page Up/Down) uses `buildingLevels`.
- The plinth as an item (1.48): `PlanDoc.plinth` (`PlinthSpec`: `projectMm`, `material`), `Wall.noPlinth`. In 3D the
  band under each wall has id `plinthId(wallId)` (`'plinth:' + id`, `plinthWallOf` in `walls.ts`; `takesPlinth`,
  `hasPlinth`), built from the walls widened by the projection. Store `selectedPlinth` (kept apart from
  `selectedIds`), `selectPlinth`, `setPlinth`, `setWallPlinth`; `deleteSelected` on it sets `noPlinth`; 3D Select and
  Paint pick it in `usePlanInput.ts`. UI `PlinthPanel.tsx` (`PlinthPanel`, and `WallPlinth` in a wall's Properties).
  Quantities add `L × (t + 2 × projection) × plinth height`.
- Furniture and resizing (1.48): `src/tools/furnitureTool.ts` (ghost `furnitureGhost`, `furnitureAngle`, V =
  `turnFurniture`, `placeFurniture` / `againstWall` with `snapToWalls` in `src/lib/furnitureSnap.ts`). `snapsOn(s)` in
  `checks.ts` (`snaps.on` flipped while Alt is held, `snapFlip`) replaces direct `snaps.on` reads. `src/lib/resize.ts`:
  side grips (`sideGrips`, `dragSide`, `setSideSize` for the typed size after a drag via `lastResize`), `scaledSize`,
  `axisFactors` (`scaleAxis`: both, width, depth; typed `2,1` is the Measure kind `factors`), `stretchPlaced`,
  `resetElementSize` (store `resetSize`). `Furniture.heightMm` (`furnitureLibraryHeightMm`, `furnitureStretch` in
  `model.ts`). `src/lib/itemShape.ts` `visibleShapes` (what the setback check and its marks use). Push/Pull snaps to
  corners through `Picker3D.cornerAt`. Stairwells: `stairOpenings`, `slabVoids`, `floorVoids` in `voids.ts`, computed
  live (not stored) and used by the model, drawings, exports and quantities. Format 18.
- Editing, plinth and zones (1.49): `src/lib/roomGrips.ts` (`wallEndsAt`, `dragRoomCorner`: room corner grips move the
  wall ends within ¾ of a wall's thickness of the corner, then `detectRoom` finds each room sharing it again). Corner
  grips `corner-rb|rt|lb|lt` (`cornerGrips`, `dragCorner` in `resize.ts`, furniture and straight stairs) and beam
  `beam-width-*` grips in `Canvas.tsx` / `usePlanInput.ts`. `snapToFurniture` (`furnitureSnap.ts`) through
  `snapFurniture` (`furnitureTool.ts`). `SharedPanel.tsx` with store `editElements(ids, fn)` (one undo step, openings
  re-attached). `mirrorItems` regroups whole groups. `src/lib/plinth.ts`: `plinthProjectMm`, `plinthMaterialOf`,
  `plinthWalls` (used by `model.ts`), `plinthOutlines` (plan in `PlanDrawing.tsx`, DXF `A-WALL-PLIN`), `plinthAt`
  (2D select and erase); `Wall.plinthProjectMm`, `Wall.plinthMaterial`, store `setWallPlinthOwn`. `doorSwingAreas`
  (`openingPlace.ts`) in `blockedZones`. `src/lib/roomMinimums.ts` (`ROOM_MINIMUMS`, `minimumOf`, `narrowWidth`,
  `PASSAGE`) used by `planHints` for houses. 3D zone tint in `drawOverlay` (`Plan3DView.tsx`); pref `pdfZones` →
  `PlanDrawing` `showZones`. `CameraRig.turnAbout` for the twist. Format 19.
  `levelBaseM` puts floors below the ground floor at the plinth less a slab and their height. Wall kind
  `'retaining'` (`WallKind` in `types.ts`; `KIND_HEIGHT_MM`, `RETAINING_MM` in the store); `addRetainingWalls`
  builds them from `outsideOutline` (`src/lib/outline.ts`: the walls' outside faces from `wallFaces(walls, true)`,
  the centre-line loop round the outside, moved out by half each wall) or the building line. 3D: `Floor.holes`
  opens the lawn over the basement (rendered in `Plan3DView`, exported as a thin prism). Quantities:
  `retainingCft`, `excavationCft`, `raftCft` (`RAFT_FT`), `waterproofSqft`; rates `waterproofing`, ratio
  `steelRetaining`. Bylaws: `Authority.basement` (`extent`, `clearMm`); plan check rows `basement-extent`,
  `basement-height`, `basement`. Layouts: `Program.basement`/`gym`, `basementOutline`, `buildLayout` options
  `outer`, `noWindows`, `stairAt`; `placeLayout(built, true)` replaces retaining walls too.
- Drawings, roofs, sun and extras (1.50): dimension look `doc.drawing` (`dimStyle.ts`). Section and elevation
  dimension strings and hatched cuts in `src/lib/drawings` (`sidePrims` takes the style). Plan hatches `src/lib/hatch.ts`
  (`hatchOf`, `surfaceHatchOf`, `HatchArea` in `shapes/Hatching.tsx`; `Material.hatch`). DXF DIMENSION entities
  (`dxf.dimension` with a drawn block) and hatch layers. 3D views on sheets: `view3d` refs, iso lines from
  `hiddenLines.ts`, the coloured picture from `three/picture.ts` (off screen). `SheetScale` is any whole number
  (`sheetScaleOf`, `ScalePicker`). Roofs: `Roof.sidePitches` through the weighted skeleton (`skeletonRoof(…, weight)`,
  `roofEaves`, `built()` cached per roof); `src/lib/roof/roofOpenings.ts` (`skylightParts`, `dormerParts`, `faceUnder`)
  give holes (`Roof3D.holes`, `triangulateHoles`), frame/glass roofs (`Roof3D.role 'glass'`, IFCWINDOW .SKYLIGHT.) and
  dormer walls (in `gables`). `src/lib/splitSolids.ts` (`splitSolidsByLine`, called by `addLine`), `divideWall` in
  `modify.ts` (store `divideItem`). `src/lib/recent.ts` (desktop IPC `mimar:recent-list|open|clear`, `recent.json` in
  userData; browser localStorage copies `mimar-recent:<name>`). `src/lib/sun.ts` (`sunPosition`, `sunDirection` from
  `doc.sun` and `doc.northDeg`, used by `Plan3DView` and `picture.ts`); North arrow tool (`doc.northArrow`, store
  `placeNorth`, `NorthArrowShape`, DXF `A-ANNO-SYMB`). Pref `areaIn` and `roomAreaText` in `units.ts`. `SidePanel`
  switches to Properties when the tool changes. Format 20.
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
- Side panel: `src/lib/panels.ts` (the sections, the saved `PanelLayout` in prefs: order, stacked or tabs, side,
  width, open tab, folded; `readPanels`, `movePanel`), `src/components/SidePanel.tsx` (stacked sections, the tabs
  view, the resize edge; docked left with CSS `order-first`) and `src/components/PanelMoves.tsx` (section grips and
  tabs, the panel heading with its Stacked/Tabs switch and dock button, drag and drop, the section menu). Which
  stacked sections are open stays in `useOpenSections` (`mimar.panels`). `showSection` opens a section's tab in the
  tabs view.
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
  Since 1.38 `buildMeshes` still makes a mesh per part, and `mergeParts` (`src/three/merge.ts`, tested) then merges
  meshes sharing a material, floor and shadow settings into one (in scene coordinates), keeping each part's index
  range, id and box in `userData.ranges`, and all edge lines of a floor into one `LineSegments` (not hit-tested).
  A merged mesh hit-tests part by part (only parts whose box the ray crosses, via `drawRange`); `partAt` turns a
  hit's `faceIndex` into the part, `idOf`/`partOf` in `Plan3DView.tsx` use it for picking, face highlights and
  Push/Pull extents, and `styleMeshes` draws selected/erased parts through geometry groups (`lookRuns`: materials
  0 base, 1 lit, 2 red) and a floor above as a whole faded mesh. Solids' edges are a shared unit box's
  (`BOX_EDGES`) scaled, not `EdgesGeometry`. The draft preview (ghost) is not merged.
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
- Library (1.43): each catalog item has a `group` (`FURNITURE_GROUPS`: Home, Office, School, Health, Shop, Prayer,
  Food, Toilets, Garden & plants, General) and a `category` (a folding heading). Items added from 1.43 are drawn
  from one parts list in `src/furniture/shapes.ts` (`SHAPES`: boxes, discs and lines placed by shares of the
  footprint, with heights for 3D), used by `FurnitureSymbol` and `furnitureSolids`; the older items stay hand-drawn.
  `groupForProject` picks the group the library opens on; Recent picks are kept in localStorage
  (`mimar.furniture.recent`).
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

- 1.44 (dimensions, zoom window, the rest of the curves, phones, first floors):
  - Dimensions: `Dimension` element (`types.ts`: `x1,y1,x2,y2`, line point `lx,ly`, `angle` 0/90 for horizontal or
    vertical (none = aligned), `radius`, ties `tie1`/`tie2` = `DimTie` naming the item and the point on it).
    `src/lib/dimLine.ts` (pure) gives the drawn line, extension lines and value; `src/lib/dimensions.ts` (pure):
    `tieFor`/`tieOn`/`tiePoint` (what an end sticks to), `syncDimensions(prev, next)` in every commit moves tied ends
    (deleted items untie), `remapTies` for paste and duplicate, `dragDimension` (its grip moves the line),
    `radiusDimension`. Tool `src/tools/dimensionTool.ts` (draft `dimension`: points, ties, `chain`; `site.dimMode`
    linear / aligned / radius, `site.dimChain`; typed lengths in `dimMeasure`). Drawn by
    `shapes/DimensionShape.tsx` (canvas and `PlanDrawing`, so sheets and the PDF); layer `dimensions`; DXF writes
    lines and text on `A-ANNO-DIMS`. Aliases DIM and ZP (`aliases.ts`).
  - Zoom: the Zoom tool's drag is a window (`zoom-box` in `DrawingOverlay.tsx`); zooms and pans push the old view
    on the store's `viewBack` (`VIEW_HISTORY` deep), `zoomPrevious` pops it (command `view.zoomPrevious`, `ViewControls`).
  - Curved doors: `openingBend` takes doors too; `bentSymbol` (`openingKinds.ts`) keeps a swing leaf straight
    (`SWING_KINDS`) and bends the rest; 3D `doorPanel`/`doorLeaves`/`closedDoor` in `model.ts` bend panels via
    `bendPath`; `straightPieces` splits a lone door into panes.
  - Curved voids: `Slab.holeCurves` (one `EdgeCurve | null` per hole), `curvedEdges.ts` `holeOutline`, `bendHoleEdge`
    (grip `void-bend-h-e`), `straightHoles`, `holeEdgeMiddles`; `mapOutline` maps them; `storage.ts` drops them if
    they no longer match the holes. Format 15.
  - Splay on a curved side: `plotOutline` takes each side's span along its arc (`t0..t1`), `sidePath` builds the
    sub-arc with `bowThrough`, and the splay runs straight between the cut ends.
  - First floor from a room list: `generateUpperLayouts(program, W, D, ground, opts)` in `layoutGen.ts`. `Ground`
    = the stair rect (frame units), `open` (the stair's room is open to below), terrace depth, wet rooms and wall
    lines below. `candidate(..., stair)` keeps a hall column over the stair (`stairColumn`), splits each strip
    either side of it (`stretches`, `splitColumns`), and turns the hall into the 'stair' room plus 'Landing'
    passages; `scorePlan` with `upper` links rooms from the stair (`UPPER_FROM`), wants the TV lounge by it;
    `overGround` scores baths over wet rooms and walls over walls; `withTerrace` adds the front terrace and its
    door. `layoutBuild.ts`: `upperSite(doc, plot)` (the ground floor's outline, stair, wet rooms; a message
    string when it can't), `terraceDepth`, and `buildLayout` options `noStair`/`openStair`; terraces get a
    `parapet` wall (3') on open sides and no Room. Store: `placeUpperLayout(built, levelId, stairRoomId)` adds the
    First floor level after the ground if needed, sets `openAbove` on the ground stair room, one commit;
    `replacedByLayout` shared with `placeLayout`. Panel: "Plans for" radio, list `mimar.firstFloorList`.
  - Phones: `usePhone()` (`useCompact.ts`, `PHONE_QUERY`: under 640 px wide, or under 500 px tall with a coarse
    pointer) and the same query as Tailwind variants `phone:` / `phone-short:` (`index.css`). `PlannerApp` drops the
    tool docks for `PhoneTools.tsx` (groups `PHONE_GROUPS`, `PHONE_ALWAYS`, `phoneGroupOf` in `toolbars.ts`; a tested
    rule that every tool is in it once; since 1.46 `PHONE_ALWAYS` (Select, Move, Eraser) and a Fit view button sit in a
    non-scrolling `phone-pinned` part, and Pan is in the View group) and puts `main` and the panel in one column; `SidePanel` renders
    `PhoneSheet` (peek / half / full, `data-sheet`; state in `panelSheet.ts` `overStore`, which also holds the iPad
    drawer's open state; `revealPanel()` opens either for menu commands via `showSection`). MenuBar adds Undo/Redo
    and hides Split (split view renders 2D on a phone); `StatusBar` has a two-line phone form; `Welcome` places the
    tour card above or below its target; `DrawingsView` stacks. Tests: `e2e/phone.spec.ts`.

- 1.42 (one mode, checks and snaps your way, building-use checks, curves part 2):
  - No modes: `Mode`, `SIMPLE_TOOLS` and `setMode` are gone; every tool is on the bars (`useBarTools`).
  - Checks: `src/lib/checks.ts` (pure) has `CheckCategory`/`CHECK_CATEGORIES`, `rowCategory`/`hintCategory`,
    `filterCheck`/`filterHints`; the store's `checks` ({ on, off[] }, saved in prefs, `setChecks`). `usePlanCheck` and
    `usePlanHints` return the filtered results (so the panel, marks and PDF follow); `useFullCheck` is unfiltered.
    Snaps: `SNAP_GROUPS` and `snapAllowed(snaps, checks)` (the building line needs plot checks, door gaps need opening
    checks); `InferOptions.allow` in `inference.ts`; `inferAt` returns the raw point when snapping is off (unless an
    axis is locked); the grid needs `snaps.on` too. The bottom bar is `src/components/StatusChips.tsx` (`ChipMenu`
    opens on hover after 350 ms or on its ▴ button; `SnapChip`, `ChecksChip`, `PointerReadout` from
    `src/store/pointerStore.ts`). Commands `view.snapping` (F3) and `view.checks` (F4).
  - Building use: `src/lib/buildingUse.ts` (pure) `buildingUseHints(doc, use, floors, len)`, called from
    `planHints.ts` for Building projects: occupants per floor from room areas, exits, exit/stair/corridor/door widths,
    travel distance, WCs, an accessible toilet, a ramp and a lift; hints of kind 'use', ids `use-*`. From 1.43
    `src/lib/fullCheck.ts` adds them to the plan check as rows (`buildingUseRows`, one per kind, ids `use-*`), and
    `usePlanCheck`/the PDF use `fullCheck`; the hints list then leaves the 'use' hints out.
  - Checks everywhere (1.43): `planCheck` falls back to `GENERAL` (`bylaws.ts`) for a plot with no authority (its
    own setbacks, a `local-bylaws` row) and for a building with no plot; a Building project ignores the house tables
    (`rule` null, its own setbacks, a `building-bylaws` row); `missing(...)` adds "not in Mimar's tables" rows for
    storeys, height, boundary wall and room sizes an authority lacks. `PlanCheck.note` is the line under the
    authority's name; `PlanCheck.plot` can be null.
  - Left/right setbacks (1.43): data unchanged (`setbacks.sides` = side 1, `side2`); `leftSlot`, `leftRightOf` and
    `setbacksFromLeftRight` in `plot.ts` translate to left and right seen from the road. `site.setbacks.sides` is the
    left and `side2` the right for new plots (`addPlot` converts).
  - Building bylaws (1.45): `src/lib/buildingBylaws.ts` is data only (CDA, DHA Islamabad and LDA: areas with a
    `limits(measures)` function, a `parking()` rule and `facilities`); `buildingRuleFor(plot, use, storeys)` picks the
    plot's `bylawArea` (or the usual area for the use) and works out the limits from the plot's size, frontage, depth
    and `roadWidthMm`. `planCheck` keeps it on `PlanCheck.building` and checks the setbacks from it (`buildingPlotRule`;
    the plot's own when the area has none; `altSides`, and `frontAsTyped`/`rearAsTyped`/`sidesAsTyped` through
    `withTyped`, handled with the swap); `fullCheck` then adds `buildingCheckRows` (`src/lib/buildingCheck.ts`, ids
    `bylaw-*`, one row per id). Where the authority and the national codes check the same thing (lift, ramp,
    stairs), `mergeOverlaps` in `fullCheck.ts` keeps one row: the authority's, with the worse result and both
    clauses. The `bylaw-area` row shows only until the area is picked (the check's note names it). `appliedRule`/`appliedSetbacks` in the
    same file give the rule the check uses, for `setPlotAuthority`, `setPlotBylawArea`, placing a plot and the plot
    panels. Import order avoids a cycle: `buildingBylaws` <- `planCheck` <- `buildingCheck` <- `fullCheck`/store.
    Houses: `Authority.adjust(rule, {areaSqFt, frontageFt, roadFt})` lets a table row depend on the road or frontage
    (LDA built-up and open areas); `PlotRule.far`/`heightMm` give the house FAR row and the row's own height.
  - Corners (1.43): `src/lib/snapPoints.ts` gives every item's corners (`item-corner`), edge middles and round
    centres; `inferAt` passes them (memoised per plan) as `InferOptions.points`; `infer` also finds true wall corners
    where faces of nearby walls cross, and ranks a midpoint 1.6× further than it is so corners win. Snap group
    `items`. In 3D, `cornerNear` (`src/three/cornerSnap.ts`, 1.43.2) moves the pick to the nearest mesh vertex
    within 10 px that is in sight and not along a curve (`curveTest`). Grips use `snapGrip` (`usePlanInput.ts`); new grips `shape-corner-i`, `beam-start/end`,
    `column-size`. Dragging a whole item: walls, beams, lines and sections snap their start like a grip; any
    other item goes through `cornerSnap` (`controller.ts`, 1.43.1): its 4 corners nearest the pointer are each
    inferred, the smallest nudge to a face, corner, item corner or line wins, else the anchor goes to the grid.
  - Windows on arcs: `openingBend` / `bendPoint` / `bendPath` in `arc.ts` bend a window's symbol in the plan and the
    DXF; `straightPieces` splits a lone window into panes along the curve in 3D.
  - Stairs: `Stair.shape` 'curved' | 'spiral' with `innerMm` and `turn`; `stairLayout` in `site.ts` gives wedge
    treads (`partOutline`, `roundStair`), a spiral's `pole` part and its `overhead` treads; `spiralTurnRiseMm` for the
    headroom note; 3D in `stairBlocks` (role 'stair', spiral treads as plates). Format 13.
  - Curved edges: `src/lib/curvedEdges.ts` (pure). `Slab.curve` / `Pad.curve` (`EdgeCurve`: corners and a middle
    point per edge, null when straight); `points` always hold the faceted outline, so every consumer works unchanged.
    `curveOf` checks the curve still matches the points (a stretch drops it); `mapOutline` moves, mirrors and scales
    the curve; `bendEdge` is the `edge-bend-i` grip. Plots: `PlotSide.bow`; `plotOutline` facets curved sides
    (`sideLine`, `sideMiddle`), so the setback line, area, 3D lawn and DXF follow; `sideWallLines` merges the facets of
    a side back into one bowed wall line, which `plotWalls.ts` builds as a curved wall; `withCorner` keeps the bow in
    proportion; the `plot-bend-i` grip (every side, cut corner or not, since 1.44).
  - Paths: `pathOutline(pieces, half)` in `curves.ts` (mitred offsets; a ring for a closed curve); a path is a
    `Block` with `path: true` (76.2 mm high, concrete), on the ground in 3D, left out of `planCheck`.
- Curves (1.41):
  - `src/lib/curves.ts` (pure, tested) builds curves out of arc pieces (`WallLine`s with a bow): `segThrough`
    (3 points), `tangentArc`, `centreArc` with `trackSweep` (follows the pointer past a half circle), `circleSegs`
    (two halves), `ovalSegs`/`ovalInBox` (four-centred, small radius searched to keep closest to the ellipse),
    `splineSegs`/`biarc` (a biarc per span, Catmull-Rom style directions), `roundedRect`, `endDirection`. Also the
    exact geometry the Modify tools use on curves: `carrierOf` (the whole line or circle), `offsetCarrier`,
    `crossings` (line/line, line/circle, circle/circle), `footOn`, `fractionOn`, `withEndAt` (move one end round the
    circle keeping the other), `sameCarrier`.
  - The tool: `src/tools/curveTool.ts` (press, hover, release, typed values, readout, hint; `curvePreview` for the
    overlay and `draft3d.ts`; `directionInto` finds the direction a wall or line ends in for tangent arcs). Draft
    `{ type: 'curve', mode, points, cursor, sweep?, tangent?, chainStart? }`; settings `site.curveMode`,
    `site.curveMake` ('wall' | 'line' | 'path', with `site.pathWidthMm`), `site.rectRadiusMm`; options in `src/components/CurveOptions.tsx`. The store's
    `addCurve(pieces, inside?)` adds them as walls or lines in one step, the room inside a closed curve of walls, and
    clears the selection. `undo` in a run of arcs carries on from where the last arc started.
  - `SketchLine.bow` (format 12): `isNear`, `elementCenter`, outlines, mirror (bow negated), scale, stretch,
    `linesToWalls`, the Inspector's Radius, the `wall-*` grips (now for lines too), `SketchLineShape` (`CurvedLine`),
    DXF bulges and inference (`Segment.bow`; curved lines snap like curved walls without faces). Inference adds the
    `centre` snap kind for curved walls and lines.
  - Modify on curves (`src/lib/modify.ts`): `extendWall` (crossings of the wall's carrier with each other wall,
    `fromKept`/`onPiece`), `joinArcs`, `cornerOf`/`keepsStart`/`shaped`, `filletWalls` (centre where the carriers
    moved by ±r cross, touching points between the kept end and the corner, one arc wall), `chamferWalls`
    (`atFromKept`). `modifyTools.ts` picks walls and lines by `distanceToWall` (along the curve).
  - Push/Pull: `faceOf` gives a curved wall's sides and ends from the hit point; `pushPull` offsets it on the same
    centre (`offsetWall`) or runs an end round the circle (`withArcEnd`); `faces2d.ts` `arcFaces` gives 2D faces
    piece by piece.

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
- **Services (1.51)** (`src/lib/services.ts`, pure): service points are `Furniture` whose `kind` is in the catalog's
  `Services` group; `SERVICES[kind]` gives the trade (electrical, hvac, plumbing, drainage, gas, data, fire), the mount
  (ceiling items hang under the ceiling; wall items' `heightMm` is their middle; floor items' is their base), the 3D size
  and the runs (`RunSystem`) each takes. `FIXTURE_RUNS` lets ordinary fixtures (WC, basin, sink, shower, washing
  machine, stove…) take runs too. A `Furniture.elevMm` on a service is its own mounting height. Placing: the Services
  tool shares the Furniture tool's code (`PLACING_TOOLS`, `kindPlaced` picks `serviceKind` or `furnitureKind`;
  ceiling items don't snap to walls). Runs: `ServiceRun` (`type: 'run'`, a `PointsElement`) with `from`/`to` item ids;
  `tools/runTool.ts` (`joinAt` prefers items taking the picked system; clicking an item after the first point ends
  the run; Enter or right-click ends it anywhere; typed lengths); the store's `settle` runs `syncRuns` so joined ends
  follow their items and let go of deleted ones; copies remap joins (`remapJoins` in `modify.ts`/`selection.ts`).
  `findElementNear` prefers an item over a run that merely ends on it. Plan: `ServiceSymbol.tsx` (from
  `FurnitureSymbol`), strokes in `TRADE_COLORS`; `RunShape.tsx` (`runPath`: wires as quadratic bows unless
  `straight`; pipe size label; fall arrows on drains). Layers: `layerOf` maps runs and services to their trade's layer.
  3D: `three/services3d.ts` (`serviceSolid`, `runSolids`, `PIPE_HEIGHT_MM`, role `service`), built whatever
  `showFurniture` says. DXF: `TRADE_LAYER`/`RUN_LAYER` in `exportDxf.ts` (curved wires as `curvedRunPoints`).
  IFC: `serviceIfcClass` (IfcLightFixture, IfcSwitchingDevice, IfcOutlet, IfcSanitaryTerminal, IfcValve, IfcTank,
  IfcPipeSegment, IfcWasteTerminal, IfcDistributionChamberElement…, all with a PredefinedType). Schedule:
  `servicesSchedule.ts` (counts and plan lengths per floor, CSV). Hints: `servicesHints.ts` (kind `services`, only on
  floors that have services).
- **Saved views and paper (1.51):** `doc.views` (`SavedView`): `plan` (level + area in plan units) or `3d`
  (`SavedCamera`: the `CameraRig`'s target, distance, azimuth, elevation, parallel). Saved by the store's `saveView`
  (the 2D view's visible area, or `getViewControls().camera()`), restored by `goToView` (`zoomToBox`, or
  `requestCamera` → `setCamera`). On sheets as `DrawingRef` `{ kind: 'view', id, style? }`: `planOf` gives a plan
  view's level and area (no pad), `linesOf`/`isPicture` route 3D ones to `sideDrawing` (parallel projection from
  `cameraLook`) or to a `picture` prim carrying the camera (`renderPicture(..., camera)`). Paper: `lib/paper.ts`
  (`PAPERS` in mm, landscape; `paperMm` turns them for `Sheet.portrait`, `custom` uses `Sheet.customMm`; `pdfPage`
  gives jsPDF a `[w, h]` format).


## Exports

`src/lib/exportActions.ts` (entry points), `exportDxf.ts` (R12, mm, AIA layers; `sideDrawingsToDxf` for sections
and elevations), `export3d.ts` (GLB, DAE, OBJ, written directly; `zip.ts` for OBJ+MTL), `exportPdf.ts` /
`exportPng.ts`, `exportSheets.ts` (drawing sheets, loaded when first used).

IFC (1.38): `src/lib/exportIfc.ts` `planToIfc(doc, opts)` writes IFC4 STEP text directly (Design Transfer View;
metres, z up, IFC x = scene x, IFC y = −scene z so north is up the page). It builds the 3D model
(`closedDoors`, no furniture) and groups its parts by the plan item they came from: walls (`IFCWALL`, parapets
`.PARAPET.`; curtain walls `IFCCURTAINWALL`; flat projections and niches join their wall; a roof's gable panels
become one "Gable wall"), doors and windows (`IFCDOOR`/`IFCWINDOW` with size and operation), columns, beams,
stairs, drawn slabs, blocks (proxies) and roofs (`IFCROOF` with its shape as PredefinedType, body an
`IFCTRIANGULATEDFACESET` from `roofMesh`). Boxes are `IFCRECTANGLEPROFILEDEF` extrusions, panels and slabs
`IFCARBITRARY(CLOSED)PROFILEDEF(WITHVOIDS)` extrusions. Implied floor and roof slabs come from
`impliedSlabList` (`drawings/views.ts`). Each door or window gets an `IFCOPENINGELEMENT` (its outline through the
wall, 0.1 m thicker) with `IFCRELVOIDSELEMENT`/`IFCRELFILLSELEMENT`; the wall's own pieces already have the hole.
Rooms are `IFCSPACE`s (floor to ceiling) with `Qto_SpaceBaseQuantities` (NetFloorArea, Height). Every element sits
in its storey (`IFCBUILDINGSTOREY` at `levelBaseM`, geometry relative to it); colours are `IFCSURFACESTYLE`s,
materials `IFCMATERIAL` (the chosen material's name, else a default per class). GlobalIds are `ifcGuid` of the
file name and element id (stable; the project, storeys, implied slabs and relations also mix in the plan's first
item's id, so two plans with the same file name don't share them). Plain entities (points, directions, placements) are written once (`Step.add`).
Checked with IfcOpenShell: `pip install ifcopenshell pytest`, then `python3 -m ifcopenshell.validate --rules f.ifc`.

## Desktop, web and branding

- `electron-main.cjs`, `preload.cjs`, `updater.cjs`: window, splash, file dialogs, auto-update (electron-updater).
- Web: `src/lib/pwa.ts` registers `sw.js`, which `vite.config.ts` writes after each build from `src/sw-template.js`
  with the exact file list; `public/manifest.webmanifest`; icons in `public/icons/`.
- Logo: `src/components/Mark.tsx` (in-app) and `scripts/logo.mjs` (all logo files + PNGs); then
  `scripts/make-icons.mjs` for the web icons.
- Themes: CSS variables in `src/theme/themes.css` (five themes); plan colours in `src/theme/plan.ts`.
