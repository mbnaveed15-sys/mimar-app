# Status

_Last updated: 25 September 2026 (with release 1.19.0, awaiting merge)._

Mimar is a house-planning app for Pakistan (feet and marla, local plot sizes and construction), built as a
Windows desktop app (Electron) and a web app (GitHub Pages, installable, works offline) from the same code.

- Repository: `mbnaveed15-sys/mimar-app` (public, by the owner's choice).
- Web version: https://mbnaveed15-sys.github.io/mimar-app/ (published from `main` by `.github/workflows/pages.yml`).
- Windows builds: GitHub Releases, built by `.github/workflows/build-installer.yml` on every merge to `main`.
  The installed app updates itself from the latest release; the portable one offers the download.

## Releases

| Version | Main additions |
| --- | --- |
| 1.19.0 | Awaiting merge. Push/Pull (P) in 3D: wall tops (height), ends (length), sides (thickness); slab tops, bottoms and edges; column tops and sides; beam depth, width and length; blocks. Shape tool (Shift+R): rectangle, circle, arch or polygon on the floor, a slab or block top, or (in 3D) a wall face. Pull a floor shape up into a **block** (new item, own layer); push a wall shape half-way in to **cut an opening** of that shape (rectangular, round, arched or any outline; open or glazed); push a slab shape down through to make a **void**. Shaped openings are built as wall panels in 3D and exported (GLB/DAE/OBJ); voids and blocks go to DXF. Windows get a height field and "Open (no glass)"; walls and columns get their own height. Plot moved to Shift+P. Grid: minor and major sizes on sliders with stops (major as a length, a whole number of minor squares) |
| 1.18.0 | Released 25 Sep 2026. Plots above the grid (grass tint in 2D; grid as a ground-floor backdrop under a slightly see-through lawn in 3D); "Height above floor" for walls, columns, beams, slabs, stairs, furniture and layout lines (negative for sunken); window sill height; Move in 3D with ↑/↓ locks to the blue axis (pointer or typed height); Alt+↑/↓ raises or lowers by a grid step (Shift: a fifth); "+2' 0"" tags in 2D; Electron's default menu bar removed |
| 1.17.0 | Released 25 Sep 2026. First-run welcome and 6-step tour, sample 5-marla house, extruded-M logo everywhere, layout (drafting) lines with "Turn into walls", automatic layers by item type with hide/lock per layer and per item, drag-to-erase, grid points snap even under walls, room names drawn over furniture |
| 1.16.1 | Fixed a crash on mixed selections (columns, beams, slabs, plots, stairs); 3D selection box on screen; horizon guard; square-on 3D camera for empty plans; smoke test over every item type |
| 1.16.0 | Build in 3D: every tool works in the 3D view (raycast to the floor), SketchUp-style camera (middle-drag orbit, Shift+middle pan, wheel zoom, Orbit tool O), 3D picking, previews and snap marker |
| 1.15.0 | Grid colours per theme; touch (pinch, two-finger pan, long-press menu) and pen; web version (PWA, offline, Pages) |
| 1.14.0 | Materials library (63, 8 collections, search, textures in 3D); DXF, GLB, DAE, OBJ export |
| 1.13.0 | Plot with setbacks, boundary and parapet walls, gates, stairs maker (straight, L, U, ramp) |
| 1.12.0 | Floors (levels), plinth, columns, beams, slabs; stacked 3D |
| 1.10–1.11 | Selection, groups and components; Modify tools (offset, mirror, trim, extend, break, join, fillet, chamfer, stretch, scale) |
| earlier | 2D drawing, rooms and marla areas, doors and windows, furniture, PDF/PNG export, themes, auto-update |

## Checks at 1.19.0

229 unit tests (Vitest) and 44 browser tests (Playwright) pass; `npm run check` (types, lint, format, unit tests,
build) is green.

## Things the owner has decided

- Keep the repository **public** (making it private would break free updates and Pages).
- **No paid services.**
- Logo: the **extruded M** (chosen over a T-square set and other options). `scripts/logo.mjs` redraws every logo file.
- Walls: a **click** continues into the next wall; a **drag** makes one wall and stops.
- Camera in 3D: **SketchUp style** (option A).
- Old releases: the owner clears them by hand (no automatic clean-up).
