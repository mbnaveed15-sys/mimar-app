# Architecture

Electron 44 + Vite 8 + React 19 + TypeScript 6 + Tailwind 4 + Zustand, three.js for 3D.

## Units and data

- Plan coordinates are in **plan units of 10 mm** (`MM_PER_UNIT` in `src/lib/scale.ts`); lengths the user types are
  in feet/inches or metric (`src/lib/units.ts`). 3D uses metres (`M_PER_UNIT`).
- The whole plan is one `PlanDoc` (`src/types.ts`): `elements` (walls, doors/windows, furniture, columns, beams,
  slabs, plot, stairs, layout lines), `rooms`, `masks`, `materials`, `groups`, `components`, `levels`, `plinthMm`,
  `layers` (hidden/locked layer flags). Every item can carry `levelId`, `groupId`, `hidden`, `locked`.
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
- `src/lib/inference.ts`: snapping order: ends → midpoints → intersections → grid points → axes → along
  walls/lines (in grid steps) → grid.
- `src/commands.ts`: every menu item, shortcut and Ctrl+K palette entry in one registry.

## Drawing

- 2D: `Canvas.tsx` (SVG) → `PlanDrawing.tsx` → shapes in `src/components/shapes/`. The same drawing makes the
  PDF/PNG (`src/lib/planImage.tsx`, `exportPdf.ts`, `exportPng.ts`).
- 3D: `src/three/model.ts` turns the plan into boxes, floors and slabs (pure, tested);
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
