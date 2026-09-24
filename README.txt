Mimar - 2D floor planner (desktop app)
--------------------------------------
React 19 + TypeScript + Vite + Tailwind CSS, packaged with Electron.

REQUIREMENTS
- Node.js 22 LTS (https://nodejs.org)

RUN THE APP WITHOUT BUILDING AN INSTALLER
  npm install          (first time only)
  npm run dev          Opens at http://localhost:5173 in your browser.
                       Changes to the code appear instantly.
  npm run app          Builds and opens the real desktop window (Electron).

CHECKS (the same ones GitHub runs on every pull request)
  npm run check        Type-check, lint, formatting, unit tests and build.
  npm run test:e2e     Browser tests (Playwright). First time: npx playwright install chromium
  npm run format       Auto-format the code.

BUILD THE WINDOWS INSTALLER
- On GitHub: pushing to 'main' runs "Build Mimar Windows Installer". Download
  Mimar-Setup-<version>.exe (installer) or Mimar-Portable-<version>.exe (runs
  without installing) from the run's Artifacts section. You can also start
  it from the Actions tab with "Run workflow" on any branch.
- Locally on Windows: double-click make_installer.bat (output in the 'release' folder).

USING THE PLANNER
  Zoom                 Mouse wheel, the + / - buttons, or + and - keys. "Fit" or 0 shows the whole plan.
  Move around          Pan tool, or hold Space (or the middle mouse button) and drag.
  Select and edit      Select tool: click an item, drag to move it. Walls have end handles,
                       furniture has resize (corner) and rotate (top) handles. Doors and windows
                       slide along their wall. Exact sizes can be typed in the Inspector.
  Keyboard             Arrow keys nudge (Shift = finer), R rotates furniture 90 degrees,
                       Delete removes, Ctrl+Z / Ctrl+Y undo and redo.
  Modes                Simple (the main tools, for homeowners) or Pro (all tools, materials,
                       custom wall thickness). Switch at the top of the left panel.
  Walls                Choose 4½", 9" or 13½" brick thickness while the Wall tool is active;
                       change a wall's thickness later in the Inspector.
  Rooms                Room tool: click inside walls to make a room. It shows its area in
                       sq ft (or m²) and marla; the Inspector totals the covered area.
                       Marla size (225 or 272.25 sq ft) is in the settings.
                       Areas are measured to the centre of the walls.
  Export               PDF: print-ready at a true scale (1:50, 1:100 ...) on A4 or A3 with a
                       title block. PNG: an image of the plan with the Mimar watermark.
  Units                Feet & inches (default) or metric, in the Units setting. Lengths can be
                       typed as 12' 6", 12ft 6in, 12.5, 3.5 m or 3500 mm.
  Files                New / Open / Save / Save as, or Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S.
                       Plans are saved as .mimar files you can back up, email or move between PCs.

PROJECT LAYOUT
  src/types.ts             Data types for plans, elements and materials
  src/geometry.ts          Hit-testing, snapping and wall maths
  src/store/               App state, actions and undo/redo (Zustand)
  src/lib/                 Storage (with migration), .mimar files, units, zoom maths, PNG export
  src/components/          UI: Toolbar, Materials panel, Canvas, Inspector, shapes/
  e2e/                     Playwright browser tests
  electron-main.cjs        Desktop window (Electron main process)
  branding/                Logo, icons, splash screen, watermark

The current plan is also kept automatically in the app's local storage, so work
is not lost if the app closes. Plans made with Mimar 1.1-1.3 are converted
automatically on first launch.
