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
- `src/lib/inference.ts`: snapping order: ends → midpoints → intersections → grid points → axes → along
  walls/lines (in grid steps) → grid.
- Bylaws: `src/lib/bylaws.ts` (the authorities' tables, `ruleFor` by size and frontage, `plotRule`, `plotSetbacks`),
  `src/lib/planCheck.ts` (pure check rows, including the mumty and car porch; `mumtyLevelIds` tells mumty floors
  apart), `src/lib/planHints.ts` (pure good-practice hints: door graph per floor, outside walls and windows, sizes by
  name, kitchen and prayer room placement), `src/store/usePlanCheck.ts` (`usePlanCheck`, `usePlanHints`),
  `src/components/PlanCheckPanel.tsx` (bylaw rows, then Hints), `CheckMarks.tsx` (red, dashed and dotted marks, on
  items and rooms) and `PlotBylaws.tsx` (authority, presets, the plot's setbacks). Figures and sources:
  `docs/handover/06-bylaws.md`. The plan's `northDeg` (degrees clockwise from up) drives the PDF's north arrow.
- Snapping (`src/lib/inference.ts`): wall and line ends, midpoints, crossings, then the building-line guides
  (`buildingGuides` in `src/tools/controller.ts`, from `buildingGuide` in `site.ts`, set in by the tool's half size),
  then grid points, axes, and points along walls and lines.
- Tool bars: `src/lib/toolbars.ts` (the bars, the saved layout in prefs, `moveToolbar`, `packColumns` which
  wraps bars into columns) and `src/components/ToolDocks.tsx` (the four docks, grips, drag and drop, grip menu).
- `src/commands.ts`: every menu item, shortcut and Ctrl+K palette entry in one registry.

## Drawing

- 2D: `Canvas.tsx` (SVG) → `PlanDrawing.tsx` → shapes in `src/components/shapes/`. The same drawing makes the
  PDF/PNG (`src/lib/planImage.tsx`, `exportPdf.ts`, `exportPng.ts`).
- 3D: `src/three/model.ts` turns the plan into boxes, floors, slabs (with voids), blocks and upright panels
  (the wall round a round/arched/polygon opening, its glass, and flat wall shapes) (pure, tested);
  `Plan3DView.tsx` renders with three.js, raycasts for picking/drawing, shows previews (`draft3d.ts`),
  and uses `cameraRig.ts` for the camera.
- Materials: `src/lib/materials.ts` (library), `patterns.ts` (procedural textures for 3D and swatches).

## Exports

`src/lib/exportActions.ts` (entry points), `exportDxf.ts` (R12, mm, AIA layers), `export3d.ts` (GLB, DAE, OBJ,
written directly; `zip.ts` for OBJ+MTL), `exportPdf.ts` / `exportPng.ts`.

## Desktop, web and branding

- `electron-main.cjs`, `preload.cjs`, `updater.cjs`: window, splash, file dialogs, auto-update (electron-updater).
- Web: `src/lib/pwa.ts` registers `sw.js`, which `vite.config.ts` writes after each build from `src/sw-template.js`
  with the exact file list; `public/manifest.webmanifest`; icons in `public/icons/`.
- Logo: `src/components/Mark.tsx` (in-app) and `scripts/logo.mjs` (all logo files + PNGs); then
  `scripts/make-icons.mjs` for the web icons.
- Themes: CSS variables in `src/theme/themes.css` (five themes); plan colours in `src/theme/plan.ts`.
