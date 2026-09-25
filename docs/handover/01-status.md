# Status

_Last updated: 25 September 2026 (with release 1.17.0)._

Mimar is a house-planning app for Pakistan (feet and marla, local plot sizes and construction), built as a
Windows desktop app (Electron) and a web app (GitHub Pages, installable, works offline) from the same code.

- Repository: `mbnaveed15-sys/mimar-app` (public, by the owner's choice).
- Web version: https://mbnaveed15-sys.github.io/mimar-app/ (published from `main` by `.github/workflows/pages.yml`).
- Windows builds: GitHub Releases, built by `.github/workflows/build-installer.yml` on every merge to `main`.
  The installed app updates itself from the latest release; the portable one offers the download.

## Releases

| Version | Main additions |
| --- | --- |
| 1.17.0 | **Open as PR #20, to be merged.** First-run welcome and 6-step tour, sample 5-marla house, extruded-M logo everywhere, layout (drafting) lines with "Turn into walls", automatic layers by item type with hide/lock per layer and per item, drag-to-erase, grid points snap even under walls, room names drawn over furniture |
| 1.16.1 | Fixed a crash on mixed selections (columns, beams, slabs, plots, stairs); 3D selection box on screen; horizon guard; square-on 3D camera for empty plans; smoke test over every item type |
| 1.16.0 | Build in 3D: every tool works in the 3D view (raycast to the floor), SketchUp-style camera (middle-drag orbit, Shift+middle pan, wheel zoom, Orbit tool O), 3D picking, previews and snap marker |
| 1.15.0 | Grid colours per theme; touch (pinch, two-finger pan, long-press menu) and pen; web version (PWA, offline, Pages) |
| 1.14.0 | Materials library (63, 8 collections, search, textures in 3D); DXF, GLB, DAE, OBJ export |
| 1.13.0 | Plot with setbacks, boundary and parapet walls, gates, stairs maker (straight, L, U, ramp) |
| 1.12.0 | Floors (levels), plinth, columns, beams, slabs; stacked 3D |
| 1.10–1.11 | Selection, groups and components; Modify tools (offset, mirror, trim, extend, break, join, fillet, chamfer, stretch, scale) |
| earlier | 2D drawing, rooms and marla areas, doors and windows, furniture, PDF/PNG export, themes, auto-update |

## Checks at 1.17.0

204 unit tests (Vitest) and 42 browser tests (Playwright) pass; `npm run check` (types, lint, format, unit tests,
build) is green.

## Things the owner has decided

- Keep the repository **public** (making it private would break free updates and Pages).
- **No paid services.**
- Logo: the **extruded M** (chosen over a T-square set and other options). `scripts/logo.mjs` redraws every logo file.
- Walls: a **click** continues into the next wall; a **drag** makes one wall and stops.
- Camera in 3D: **SketchUp style** (option A).
- Old releases: the owner clears them by hand (no automatic clean-up).
