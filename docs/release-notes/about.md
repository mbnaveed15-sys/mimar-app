<!--
  The description every Mimar release gets on GitHub. The release build (.github/workflows/build-installer.yml)
  runs scripts/release-notes.mjs, which fills in {{VERSION}} and puts docs/release-notes/<version>.md where
  {{WHATS_NEW}} is. Keep "What Mimar does" up to date when a release adds or changes a feature.
-->

# Mimar {{VERSION}}

**Plan a house the way it is actually built, in feet and marla, and check it against the bylaws as you draw.**

Mimar is a house-planning app made for Pakistan. You draw your plot and rooms, see the house in 3D, check it against CDA, DHA and other bylaws, estimate quantities and cost, and print drawings to scale. It is built for homeowners who want to plan their own house and for architects and draftsmen who need proper drawings and exports. Since 1.33 it also handles free design work and non-residential buildings.

It is free, and runs on Windows or in any modern browser.

## Get Mimar

| | |
| --- | --- |
| **Windows (installer)** | `Mimar-Setup-{{VERSION}}.exe` below. It updates itself when a new version comes out. |
| **Windows (portable)** | `Mimar-Portable-{{VERSION}}.exe` below. It runs without installing and tells you when an update is available. |
| **Browser, iPad and tablets** | https://mbnaveed15-sys.github.io/mimar-app/. You can install it from the browser (on iPad: Share › Add to Home Screen), and it works offline. |

Windows may say "Windows protected your PC", because the app is not code-signed. Click **More info**, then **Run anyway**.

{{WHATS_NEW}}

## What Mimar does

### Draw the plan
- **Walls** in 4½", 9" and 13½" brick, retaining walls, and **glass curtain walls** with mullions and transoms. Walls can be straight or **curved** (true arcs).
- **Rooms** show their area in sq ft or m² and in **marla** (225 or 272.25 sq ft), measured to the centre of the walls.
- **Doors:** single, double, sliding, folding, rolling shutter, a plain opening, and gates. **Windows:** sliding, casement, double casement, fixed and ventilator. Placing one shows the clear distance to each corner and never puts it flush against a corner.
- **Structure:** columns, beams, slabs with voids, stairs (straight, L, U, ramp), plinth, **basements** with retaining walls, and **pitched roofs** (hip, gable, shed, flat) that work on L, T and any other plan shape.
- **Floors:** as many as you need, each with its own height, plus a basement and the mumty.
- **Furniture and garden:** a library of beds, sofas, dining, kitchen, bath, cars, plants and garden items at their real sizes. Each item shows the **free space it needs** to be used, from the ADA standards or common practice.
- **Layout lines** for drafting, which can be turned into walls.

### Draw quickly and precisely (AutoCAD and SketchUp habits work)
- **Snapping** to ends, midpoints, wall faces, crossings, perpendiculars, the building line and the grid, with red and green axis guides.
- **Typed input:** `12' 6"`, `3.5 m`, `@x,y`, `length<angle`, and AutoCAD aliases (CO, RO, TR, EX, MI, SC, FIL…).
- **Modify tools:** move, copy, rotate, mirror, scale, stretch, offset, trim, extend, break, join, fillet, chamfer.
- **Push/Pull and Shape** as in SketchUp: pull shapes into blocks, and push them into walls to make niches, projections (chajjas) and arched or round openings.
- **Groups, components, layers** that you can hide and lock, and full undo and redo.

### Plot, site and bylaws
- **Plots:** plot size presets, or any shape drawn corner by corner. Each side has its own type (road, neighbour, back, park), setback and boundary wall. Corner plots are supported.
- **Bylaws:** CDA sectors, Islamabad private schemes, DHA Islamabad/Rawalpindi (official); DHA Lahore, Bahria Lahore and LDA (provisional). Picking one fills in the setbacks from the plot's size and frontage.
- **Live plan check:** setbacks, coverage, storeys, height, plinth, boundary walls, mumty, car porch and room sizes. Each problem names the bylaw clause and is marked in red on the plan. Click it to go to the item.
- **Plan hints:** good practice rather than law. Rooms reached only through a bedroom, kitchens and living rooms without an outside window, the kitchen far from dining, blocked furniture, and more.
- **Terrain:** spot levels, contours and levelled areas build a ground surface, measured from the road level.

### Let Mimar lay it out
- **Layout from a room list:** say how many bedrooms and baths, and whether you want a drawing room, dining, car porch, prayer room and so on. Mimar checks the list fits the plot and the bylaws, then offers several plans to choose from.

### See it in 3D
- A live 3D model with materials and textures, open doors, glass and furniture.
- **Build and edit directly in 3D.** Every tool works there, with a SketchUp-style camera and standard views (top, front, sides, iso).
- **Split view:** the plan and the 3D model side by side, both editable.
- It stays fast on large plans.

### Drawings, quantities and cost
- **Sections and elevations,** worked out from the model, with level marks. Sheets on A4, A3 or A1 at 1:50, 1:100 or 1:200, with a title block.
- **Quantities and cost:** brickwork, RCC, steel, plaster, paint, flooring, glazing, roofing and services, measured from your drawing in the units Pakistani estimates use. Rates can be edited, and everything exports to CSV.

### Share and export
- **PDF** to a true scale with a title block, a north arrow, the plan check and cost pages. **PNG** images.
- **DXF** for AutoCAD, with proper layers and true arcs.
- **IFC4** for Revit and ArchiCAD. **GLB, DAE and OBJ** for SketchUp, Blender and other 3D tools.
- Plans save as `.mimar` files that you can back up, email or move between computers. Work is also autosaved.

### Made to fit you
- **Simple mode** has the main tools for homeowners. **Pro mode** has everything.
- Feet and inches or metric. Light and dark themes.
- Tool bars and side panels can be moved, docked and tabbed.
- **Touch and pen:** pinch to zoom, two fingers to pan, three to turn the 3D view, and a long press for the menu. On a touch screen, on-screen buttons stand in for the keyboard (Done, Cancel, Flip hinge, Delete), and an upright iPad gets a compact layout with one Menu button and a slide-out side panel.
- A first-run tour and a sample 5-marla house to explore.
