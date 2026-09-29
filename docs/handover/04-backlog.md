# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Next (agreed order)

From the 1.23 QA pass (six testers; full reports in the git-ignored `.qa/<tester>/REPORT.md`, combined in
`.qa/SUMMARY.md`). 1.23.1 fixed the blockers and wrong results; plan each of these with the owner first.

1. **Still open from the 2D review (after 1.24):** a persistent dimension tool; zoom window and zoom previous; a cursor
   X,Y readout; arcs and circles for layout lines; grips for lines, beams, rooms, slabs and columns; shared
   properties for a multi-selection (done for doors and windows in 1.29.1); Mirror of a group keeping it a group; Paste then place. 2D pan on very large
   plans (~5,000 walls) is limited by SVG layout.
2. **Custom plots (1.30, planned with the owner):** any shape clicked corner by corner, each side its own type
   (road, neighbour, back, open), setback and boundary wall (linked to the plot, gates kept), corner plots with two
   road sides and an optional splay; old plots open as before with a "Rebuild walls from sides" button.
3. **Generative layouts (1.31):** room program → a few variants on any of these plots, placed as ordinary walls,
   rooms, doors and windows.
4. **Basements (1.32):** below-ground floors, retaining walls, 3D, cost and bylaws; a basement option in the
   generator.

Done: bylaws, plot presets and the plan check (1.22); plan hints, the mumty, car porches and the north arrow (1.23);
AutoCAD-style 2D (1.24); SketchUp-style 3D (1.25); interface polish (1.26); split view (1.27); quantities and cost (1.28);
door and window types, plants and garden items (1.29); door and window placing with gaps, and snapping guides (1.29.1); custom plots:
any shape, per-side types, setbacks and walls, corner plots (1.30); layouts from a room list (1.31); basements (1.32);
project types: free projects, buildings, per-floor heights, metric (1.33);
furniture use zones with ADA wheelchair spaces (1.34); sections, elevations and drawing sheets (1.35); terrain and site:
spot levels, contours, survey import, levelled plot and pads, cut and fill, OpenStreetMap surroundings and satellite levels (1.36);
freer form: curved walls, double-height rooms, glass curtain walls and pitched roofs (1.37); faster 3D and IFC export (1.38);
movable side panels: reorder, tabs, dock left or right, resize (1.39).

Planned next (the roadmap agreed with the owner for all kinds of work; plan each with the owner first):
1.40 checks for non-residential buildings (1.39 went to movable side panels, asked for by the owner).
Floating side panels were assessed with 1.39 and left out; revisit only if the owner still wants them.
First-floor plans from a room list are a later idea.

Left from sections and elevations for later: dimension strings on sections (only level marks now); each section and
elevation is worked out whole (about 0.5 s at 576 walls, 3 s at 2,500), and the suggested sheets need them all, so the
Drawings view opens slowly on very big plans;
stair openings aren't cut in the floor slabs the drawings assume (a drawn slab with a void is); a stepped section
line (it is straight); hatching for materials (cut is solid black); the DXF fills only rectangular cuts (others are
outlined); plans on sheets are pictures at up to 200 DPI in the PDF (as the plan PDF); furniture or shading as
options.

Left from freer form for later: no domes, vaults or free-form roofs, no dormers or roof windows (skylights); arcs
are circular only (no ellipses or splines) and can't be extended, joined, filleted or chamfered (straight walls can);
Push/Pull takes only an arc wall's top; no spiral stairs; curved glass is flat panes between mullions; a roof is one
pitch all round (no per-side pitches or mansards) and doesn't clip the walls under it (walls stop at their own
height, gable walls fill up to the roof); roofs aren't drawn in the auto-planner's layouts; the roof over a house with
curved walls follows the curve as short straight eaves.

Left from terrain and site for later: one finished level per plot plus levelled areas (no sloping driveways, ramps or
terraces); site retaining walls are drawn by hand with the Retaining wall type; the plinth check still measures from ±0,
and the rules for sloping plots in hilly areas (e.g. Murree) aren't covered; a survey is placed on the middle of the
plot (line it up with Move and Rotate), not by coordinates; sections and elevations run only 1 m past the building,
and an elevation's ground is the profile along the face it looks at; the cut and fill tint is worked out on a 0.5 m
mesh; OpenStreetMap coverage of Pakistani schemes varies; satellite levels are about 30 m apart across and a few metres
out in height, so only a rough guide for big sites; neighbouring buildings are plain blocks.

Left from projects for later: room types turning into sizes or a room list for buildings; more uses; per-project
material and cost rates for buildings; a floor-to-floor height field (today the wall height plus the slab).

Left from use zones for later: door swings aren't counted as blocking a zone; zones in the PDF, the 3D view or while
placing with the Furniture tool; room minimums (corridors, door widths) as their own table for the layout generator;
check the "General practice" figures against local homes.

Left from basements for later: more than one basement; sloping sites; footings and columns drawn for the
basement; ramps down for cars; air shafts or light wells drawn for you; basement figures for CDA private schemes,
Bahria and LDA (the check says "check").

Left from layouts for later: first-floor plans from the same list (over the ground floor's stair); L-shaped and
irregular plots used fully (plans go in the largest rectangle); furniture placed in the rooms; a lawn or courtyard
kept inside the house; more room kinds (study, TV lounge upstairs, garage); plans are scored by rules, so check
the notes and the plan hints after placing one.

Left from custom plots for later: a road width for each side; curved sides; official corner-plot figures (the second
road uses the side setback, marked provisional: ask the owner for the CDA/DHA corner-plot rules); corner grips in 3D;
adding or removing a corner of a drawn plot (redraw it for now); the plan check measures each side's setback to the
nearest wall by straight distance, while the drawn building line has sharp inside corners, so the two can differ
slightly at an L-shape's inside corner.

Left from the cost estimate for later: rates for other cities; contingencies and the contractor's margin as a
percentage; woodwork, kitchens and wardrobes; footings drawn rather than assumed; metric units in the table (it
uses cft and sqft, as Pakistani estimates do).

Left from the 3D review for later: section cuts and X-ray (the owner chose to skip them in 1.25); a wall
side's own material isn't shown in 2D, the PDF or DXF.

Left from 3D speed and IFC for later: an edit still rebuilds and re-merges the whole 3D model (about half a second at 1,000
walls on software graphics); glass is merged too, so panes behind panes aren't sorted back to front. IFC: IFC4
only (no IFC2x3 option); walls are their 3D pieces (not one extruded wall with an axis), so Revit and ArchiCAD
import them as fixed shapes, not editable walls; no furniture, terrain, neighbours or plot; no property sets
beyond space quantities; stairs are one element (no flights and landings); not yet opened in Revit or ArchiCAD
themselves (checked with IfcOpenShell only).

## Known rough edges

- 3D on very big plans opens in about 1 s at 1,000 walls on the test machine's software graphics (orbiting is
  smooth since 1.38); real graphics cards do better.
- The welcome's sample house shows three size hints (master bedroom, drawing room, bath slightly small); they are
  advice, and the sample shows how hints look.

- The welcome tour's highlight positions are measured every 400 ms; on very small windows the card may cover the
  highlighted part.
- Moving up and down (blue axis) only works in 3D; in 2D use the "Height above floor" field or Alt+↑/↓.
- Rooms (floor finishes) and plots can't be raised; a raised wall doesn't carry its room's floor up with it.
- Plan check: covered area is to the walls' outer faces (the four outside corner squares aside); height adds the floors, slabs and parapets from
  the ground; porches can't be told from other items in a setback, so columns, slabs and stairs there are "check".
  Only the first plot with bylaws is checked. The mumty is found by floor or room name, car porches by room name;
  the private-schemes mumty area (Schedule-5) and car porches outside DHA Islamabad aren't checked.
- Plan hints go by room names. Unnamed space (a hall or passage not drawn as a room) counts as circulation, the same
  as outside; open-plan rooms joined without a door count as one only if drawn as one room. The window rule (a
  tenth of the floor) is advice, not a bylaw; windows are counted at their width × height (round ones as circles).
- In 2D, Push/Pull can't reach heights (wall tops, slab thickness) or round column sizes; those are in 3D or the
  side panel. Shapes on walls are pushed in 3D (or given a Depth in the side panel).
- A shape drawn on a wall is sized by its outline's box: an arch drawn "upside down" still becomes an arch with
  its round top up.
- Blocks stand on the floor or a slab; they don't cut into walls they overlap.
- Layout lines only snap to walls and lines (not to furniture or columns).
- `Ctrl+L` / `Ctrl+H` in the browser version may be taken by the browser before the app sees them; the Edit menu
  and right-click menu always work.
