# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Next (agreed order)

From the 1.23 QA pass (six testers; full reports in the git-ignored `.qa/<tester>/REPORT.md`, combined in
`.qa/SUMMARY.md`). 1.23.1 fixed the blockers and wrong results; plan each of these with the owner first.

1. **Still open from the 2D review (after 1.24):** a persistent dimension tool; zoom window and zoom previous; a cursor
   X,Y readout; arcs and circles for layout lines; grips for lines, beams, rooms, slabs and columns; shared
   properties for a multi-selection; Mirror of a group keeping it a group; Paste then place. 2D pan on very large
   plans (~5,000 walls) is limited by SVG layout.
2. **Generative layouts** (later): room program → a few variants, placed as ordinary walls and rooms.

Done: bylaws, plot presets and the plan check (1.22); plan hints, the mumty, car porches and the north arrow (1.23);
AutoCAD-style 2D (1.24); SketchUp-style 3D (1.25); interface polish (1.26); split view (1.27); quantities and cost (1.28).

Left from the cost estimate for later: rates for other cities; contingencies and the contractor's margin as a
percentage; woodwork, kitchens and wardrobes; footings drawn rather than assumed; metric units in the table (it
uses cft and sqft, as Pakistani estimates do).

Left from the 3D review for later: section cuts and X-ray (the owner chose to skip them in 1.25); 3D first open and
orbiting on big plans are still slow (one mesh and edge set per part: merging or instancing them is the fix); a wall
side's own material isn't shown in 2D, the PDF or DXF.

## Known rough edges

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
