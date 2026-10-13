# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Next (agreed order)

From the 1.23 QA pass (six testers; full reports in the git-ignored `.qa/<tester>/REPORT.md`, combined in
`.qa/SUMMARY.md`). 1.23.1 fixed the blockers and wrong results; plan each of these with the owner first.

1. **Still open from the 2D review (after 1.24):** 2D pan on very large plans (~5,000 walls) is limited by SVG layout.
   (Grips for beams, rooms, stairs and furniture, shared properties for a multi-selection and Mirror keeping groups came
   in 1.49; Paste then place was already in.)
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
movable side panels: reorder, tabs, dock left or right, resize (1.39); iPad polish: compact portrait layout, touch buttons, bigger touch targets, release descriptions (1.40);
curves part 1: the Curve tool (arcs by ends and bend, 3 points, centre, tangent; circles, ovals, freeform curves), rounded
rectangles, curved layout lines, and Fillet, Extend, Join, Chamfer and Push/Pull on curves (1.41); one mode (no Simple/Pro),
Checks and Snap buttons with per-kind menus, an X,Y readout, checks for non-residential buildings, and curves part 2:
windows bent with curved walls, curved and spiral stairs, curved slab, levelled-area and plot edges, curved paths and
driveways (1.42, all in one release as the owner asked); furniture for every kind of building with a grouped library,
checks for every building type and locality, more building uses, left and right setbacks, and snapping to every
corner with more grips (1.43, one release); dimensions that follow the plan, zoom window and zoom previous, curved doors,
curved slab voids, a cut corner on a curved plot side, a phone layout, and first floors from a room list (1.44, one release);
CDA, DHA Islamabad and LDA rules for commercial and other buildings, and LDA houses made official (1.45); phone tools
always at hand (Select, Move, Eraser, Fit view), a selection bar, two/three-finger tap for Undo/Redo and a 3D twist (1.46);
a Ground (site) level with the lawn and plinth heights and your own plinth, and slabs drawn corner by corner, over rooms
picked or round the walls (1.47); furniture turned before placing and snapped to room walls, Alt to flip snapping, side
grips, one-way Scale, Reset size, one Ground level with a Floor | Lawn switch, the plinth as its own item, automatic
stairwells, Push/Pull snapping, setback marks by the visible shape, and Snap/Checks menus from their arrows only (1.48);
room, stair and furniture corner grips, beam width grips, furniture lining up with furniture, shared settings for a
selection, Mirror keeping groups, the plinth on the plan and per wall, rooms on Ground's floor and lawn together, door
swings in use zones, room minimums, use zones in 3D and exports, a touch tour, the twist round the fingers and narrower
phone buttons (1.49); dimension strings and hatching on sections, plan hatches for every material, DIMENSION entities
in DXF, dimension text size and ends, 3D views on sheets, any sheet scale, a pitch per roof side, skylights, dormers,
layout lines splitting solids, Divide, Open recent, the sun by date and time with shadows on or off, a North arrow
tool, room areas in sq ft, marla or both, and Properties on picking a tool (1.50).

Left from 1.50 (for later): mansards, domes and vaults; roofs cutting the walls under them; eyebrow or curved dormers
and dormers on flat roofs; stepped section lines; hovering a roof side in the panel doesn't light it up on the plan;
the sun uses solar time (no time zone or longitude correction).

Planned next (plan each with the owner first): DHA Lahore and Bahria building figures (their buildings still say
"check with the authority" until the owner sends the schedules). Left from 1.45: Mimar can't tell a veranda, an
emergency stair or a flat unless they are named so (Veranda, Emergency stair, Kitchen); parking counts rooms named
Parking, Car park or Garage at 250 sq ft a car (no motorcycle share, no stall layout); a mixed building is checked
for its one use (DHA 6.8.5 adds each use up); the FAR leaves out parking and lift rooms by name, not stairs or plant;
LDA skyscrapers' FAR (4% of the height) and the CAA's height limits are rows to check; CDA's area is picked by hand
(Mimar has no sector map); the LDA Land Use Rules' List A (building lines per road) isn't in Mimar, so a converted
plot's front is the one typed. Left from 1.43: room corners are
where walls meet (drag a wall end), not their own grips; stairs and furniture have no corner grips (furniture keeps
its resize grip); grips are 2D only (3D edits by Move, Push/Pull and the panel); the older library items keep their
hand-drawn symbols. Left from curves: a single or double swing door in a curved wall keeps a flat leaf (its frame
bends; sliding, folding and shutter doors bend too); a path is one flat paving block (on a sloping
site it sits at the ground's height at its middle) and a ring path has a seam line where it closes; each arc of a
3-point chain makes its own path piece. The non-residential checks are good-practice hints (from common building-code
figures), not any Pakistani authority's bylaws.
Left from 1.44: dimensions have no text-size or arrow-style setting and go to DXF as lines and text (not DIMENSION
entities); there is no ZW alias (the Zoom tool's drag is the zoom window). First floors from a room list: the first
floor only (no second floor, no basement from the list), the ground stair room is left open to below (the stair
doesn't carry on to the roof), no Mirror for first-floor plans, and the ground floor needs a stair first. On phones,
the tool bars can't be docked (one strip at the bottom) and the panel's sections are tabs only; the welcome tour's
hover hints still mention keys.
Left from 1.46: on a 375 px phone about five of a group's tools show beside the pinned ones (the rest scroll).
Left from 1.47: the plot, spot levels, contours and levelled areas stay on the Ground floor (the ground tools go there);
on a sloping natural site, blocks and steps on Ground (site) stand at the ground's height at their middle, and walls step
with the ground; the Ground (site) level can't be deleted while it has items, and its walls snap to the ground floor's wall
corners only (not its doors or faces). A Rooms slab stops halfway over a wall to a space left out, including a
courtyard. The Slab tool's Rooms and Follow the walls have no 3D preview.
Left from 1.48: Stairwells are cut for stairs rising at least 1.5 m with a floor above, shaped
from the stair's footprint (straight, U, ramp) or its parts (L, curved, spiral), with no headroom margin. Furniture
snaps to walls within 2' and to their faces only.
Left from 1.49: a room corner grip moves only wall ends that meet at the corner (a wall running on past it, a T, stays
put); rooms don't follow walls moved any other way (as before). A mirrored component copy is a plain group, not a
flipped copy of the component. The plinth's height is one figure for the whole house; the flush plinth (no projection)
shows nothing on the plan. A courtyard round a house that touches no boundary wall is found as the whole space inside the
boundary (Mimar rooms have no holes). Use zones show in 3D only for selected furniture and the one being placed. Room
minimums are checked for houses (buildings have their own corridor, door and stair rules); the U-kitchen aisle and the
turning space are listed for reference only. The welcome tour changes with the pointer (touch or mouse), not the screen size.
Floating side panels were assessed with 1.39 and left out; revisit only if the owner still wants them.

Left from sections and elevations for later: dimension strings on sections (only level marks now); each section and
elevation is worked out whole (about 0.5 s at 576 walls, 3 s at 2,500), and the suggested sheets need them all, so the
Drawings view opens slowly on very big plans;
stair openings aren't cut in the floor slabs the drawings assume (a drawn slab with a void is); a stepped section
line (it is straight); hatching for materials (cut is solid black); the DXF fills only rectangular cuts (others are
outlined); plans on sheets are pictures at up to 200 DPI in the PDF (as the plan PDF); furniture or shading as
options.

Left from freer form for later: no domes, vaults or free-form roofs, no dormers or roof windows (skylights); walls
are circular arcs only: ovals are four-centred and freeform curves are biarcs (both true arcs, not ellipses or
splines); curved glass is flat panes between mullions; a roof is one
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

Left from use zones for later: the room minimums table (1.49) isn't used by the layout generator yet; check the
"General practice" figures against local homes.

Left from basements for later: more than one basement; sloping sites; footings and columns drawn for the
basement; ramps down for cars; air shafts or light wells drawn for you; basement figures for CDA private schemes
and Bahria (the check says "check").

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
