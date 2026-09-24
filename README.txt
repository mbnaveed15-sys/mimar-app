Mimar 1.3 - 2D floor planner (desktop app)
------------------------------------------
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

PROJECT LAYOUT
  src/types.ts             Data types for plans, elements and materials
  src/geometry.ts          Hit-testing, snapping and wall maths
  src/store/               App state, actions and undo/redo (Zustand)
  src/lib/                 Saving/loading (with migration from older versions), PNG export
  src/components/          UI: Toolbar, Materials panel, Canvas, Inspector, shapes/
  e2e/                     Playwright browser tests
  electron-main.cjs        Desktop window (Electron main process)
  branding/                Logo, icons, splash screen, watermark

Plans are saved automatically in the app's local storage. Plans made with
Mimar 1.1-1.3 are converted automatically on first launch.
