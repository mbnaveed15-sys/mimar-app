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
| **Browser, iPad, tablets and phones** | https://mbnaveed15-sys.github.io/mimar-app/. You can install it from the browser (on iPad: Share › Add to Home Screen), and it works offline. |

Windows may say "Windows protected your PC", because the app is not code-signed. Click **More info**, then **Run anyway**.

{{WHATS_NEW}}

## What Mimar does

### Draw the plan
- **Walls** in 4½", 9" and 13½" brick, retaining walls, and **glass curtain walls** with mullions and transoms. Walls can be straight or **curved** (true arcs).
- **Curves:** a Curve tool draws arcs (by their ends and a bend, by 3 points, by their centre, or carrying on smoothly from the last piece), **circles**, **ovals** and **freeform curves**, as walls, layout lines or **paths and driveways** of a set width. Circles, ovals and closed curves get their room inside. The Rectangle tool can round its corners, and slab, slab-void, levelled-area and plot edges can be bent into curves.
- **Rooms** show their area in sq ft or m², in **marla** (225 or 272.25 sq ft), or both, measured to the centre of the walls.
- **Doors:** single, double, sliding, folding, rolling shutter, a plain opening, and gates. **Windows:** sliding, casement, double casement, fixed and ventilator. Placing one shows the clear distance to each corner and never puts it flush against a corner. Doors and windows in a curved wall follow the curve.
- **Structure:** columns, beams, slabs of any shape with voids (drawn as a rectangle, corner by corner, over the rooms you pick, or round the walls), stairs (straight, L, U, ramp, **curved** and **spiral**), plinth, **basements** with retaining walls, and **pitched roofs** (hip, gable, shed, flat) that work on L, T and any other plan shape, with a pitch for each side, **skylights** and **dormers**.
- **Floors:** as many as you need, each with its own height, plus a basement and the mumty. Duplicate a floor to start the one above, and choose how faintly the floor below shows while you draw. The **Ground** floor and its lawn are one level, with a Floor | Lawn switch, so you can draw your own plinth, platforms and steps from the ground up. The automatic plinth is its own item, with its own height, projection and material (and its own projection and material under any wall), and it shows on the plan where it stands out. Stairs cut their own stairwell in the slab above.
- **Furniture and garden:** a library of about 100 items at their real sizes, in groups for homes, offices, schools, clinics and hospitals, shops, mosques, restaurants, public toilets and gardens, with search and recent picks. Items can be turned before placing, snap against a room's walls, into its corners and beside other furniture, and can be resized one side or one corner at a time. Each item shows the **free space it needs** to be used, from the ADA standards or common practice.
- **Services:** about 70 electrical, fan and AC, water, drainage, gas, data and fire-safety points with their usual plan symbols and mounting heights, and **wiring and pipe runs** that snap to them and stay joined as they move, each kind on its own layer, in 3D, DXF, IFC and a services schedule.
- **Layout lines** for drafting, straight or curved, which can be turned into walls. A line drawn across a block or slab splits it, and walls and lines can be **divided** into equal parts or set lengths.
- A **north arrow** on the plan, which also turns the sun in 3D.

### Draw quickly and precisely (AutoCAD and SketchUp habits work)
- **Snapping** to ends, midpoints, wall faces and corners, the corners of every item (in 2D and 3D), crossings, perpendiculars, the building line and the grid, with red and green axis guides. The **Snap** button at the bottom turns snapping off (its ▴ arrow turns each kind on or off), and holding **Alt** flips it for a moment. The pointer's X and Y show beside it.
- **Dimensions** that keep measuring as the plan changes: horizontal or vertical, aligned, chains and radius, on their own layer, in the drawings and in DXF.
- **Zoom window and Zoom previous** (ZP), as in AutoCAD.
- **Typed input:** `12' 6"`, `3.5 m`, `@x,y`, `length<angle`, and AutoCAD aliases (CO, RO, TR, EX, MI, SC, FIL…).
- **Side and corner grips** resize furniture, columns, stairs, beams, slabs and roofs one side at a time, to a typed size. Room corners have grips that move the walls meeting there.
- **Several items at once:** select walls, furniture, columns, beams or slabs together to change what they share.
- **Modify tools:** move, copy, rotate, mirror, scale (by width, depth or both), stretch, offset, trim, extend, break, join, fillet, chamfer, on straight and curved walls alike.
- **Push/Pull and Shape** as in SketchUp: pull shapes into blocks, and push them into walls to make niches, projections (chajjas) and arched or round openings.
- **Groups, components, layers** that you can hide and lock, and full undo and redo.

### Plot, site and bylaws
- **Plots:** plot size presets, or any shape drawn corner by corner, with front, rear, left and right setbacks. Each side has its own type (road, neighbour, back, park), setback and boundary wall, and can be straight or curved. Corner plots are supported, with a cut corner (splay) on straight or curved sides.
- **Bylaws:** CDA sectors, Islamabad private schemes, DHA Islamabad/Rawalpindi and LDA Lahore (approved schemes, built-up areas and open areas) are official; DHA Lahore and Bahria Lahore are provisional. Picking one fills in the setbacks from the plot's size and frontage (and, for LDA built-up areas, the road's width).
- **Live plan check:** setbacks, coverage, storeys, height, plinth, boundary walls, mumty, car porch and room sizes, for every locality (a plot with no authority is checked against its own setbacks, and figures a locality's table lacks are flagged to check). Each problem names the bylaw clause and is marked in red on the plan. Click it to go to the item. The **Checks** button at the bottom turns all checks and their marks off while you sketch, or one kind at a time.
- **Non-residential buildings** (offices, schools, clinics, hospitals, shops, restaurants, hotels, apartments, halls, mosques, factories and warehouses) are checked for exits, stair and corridor widths, travel distance, toilets, an accessible toilet, a ramp and a lift, in the plan check with the plot's setbacks.
- **Commercial and other building bylaws** for CDA (21 areas: Blue Area, Markaz, Class-III, I&T centres, Mauve Area, H-series, industrial, hotels, hospitals, apartments, halls and more), DHA Islamabad/Rawalpindi (sector and main commercial) and LDA (converted plots, centres, the CBD, public sites, apartments, halls, petrol stations, industry). Pick the plot's **area** and type the **road's width**, and the plan check measures the FAR, coverage, storeys, height, setbacks, parking, veranda and mumty, and the authority's lift, emergency stair, ramp, storey height, shop and stair rules.
- **Plan hints:** good practice rather than law. Rooms reached only through a bedroom, kitchens and living rooms without an outside window, the kitchen far from dining, blocked furniture (by walls, other items or a door's swing), narrow corridors, doors and stairs, and more.
- **Terrain:** spot levels, contours and levelled areas build a ground surface, measured from the road level.

### Let Mimar lay it out
- **Layout from a room list:** say how many bedrooms and baths, and whether you want a drawing room, dining, car porch, prayer room and so on. Mimar checks the list fits the plot and the bylaws, then offers several plans to choose from. With the ground floor in place, it plans the **first floor** too: bedrooms, a TV lounge and a terrace round the stair, with baths over the wet rooms below.

### See it in 3D
- A live 3D model with materials and textures, open doors, glass and furniture.
- **Build and edit directly in 3D.** Every tool works there, with a SketchUp-style camera and standard views (top, front, sides, iso).
- **Split view:** the plan and the 3D model side by side, both editable.
- **Sun and shadows:** turn shadows on or off, or use the real sun for any date and time.
- It stays fast on large plans.

### Drawings, quantities and cost
- **Sections and elevations,** worked out from the model, with level marks, dimension strings and hatched cuts. **Hatches** on the plan for every common material. Dimensions in your choice of text size and ends.
- **Sheets** on ISO A and B, US architectural and ANSI paper, portrait or landscape, or any size you type, at 1:50, 1:100, 1:200 or any scale, with a title block, isometric and coloured 3D views, and **saved views** (a part of a plan, or a 3D camera).
- **Quantities and cost:** brickwork, RCC, steel, plaster, paint, flooring, glazing, roofing and services, measured from your drawing in the units Pakistani estimates use. Rates can be edited, and everything exports to CSV.

### Share and export
- **PDF** to a true scale with a title block, a north arrow, the plan check and cost pages. **PNG** images.
- **DXF** for AutoCAD, with proper layers, true arcs, hatch layers and real DIMENSION entities.
- **IFC4** for Revit and ArchiCAD. **GLB, DAE and OBJ** for SketchUp, Blender and other 3D tools.
- Plans save as `.mimar` files that you can back up, email or move between computers. Work is also autosaved, and **Open recent** brings back the last plans you worked on.

### Made to fit you
- Every tool is on hand from the start: no separate simple and pro modes.
- Feet and inches or metric. Light and dark themes.
- Tool bars and side panels can be moved, docked and tabbed.
- **Touch and pen:** pinch to zoom, two fingers to pan, twist two fingers to turn the 3D model, three fingers to orbit, tap two fingers to undo (three to redo), and a long press for the menu. On a touch screen, on-screen buttons stand in for the keyboard (Done, Cancel, Flip hinge) and a selection bar offers Delete, Duplicate, Rotate 90°, Mirror, Properties, and Flip hinge and Flip swing for doors and casement windows (on a computer it is under View › Selection bar). An upright iPad gets a compact layout with one Menu button and a slide-out side panel, and a **phone** gets the plan full screen with the tools along the bottom (Select, Move, Eraser and Fit view always there) and the panel as a sheet that slides up.
- A first-run tour and a sample 5-marla house to explore.
