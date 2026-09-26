# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Next (agreed order)

From the 1.23 QA pass (six testers; full reports in the git-ignored `.qa/<tester>/REPORT.md`, combined in
`.qa/SUMMARY.md`). 1.23.1 fixed the blockers and wrong results; plan each of these with the owner first.

1. **1.24 AutoCAD-style 2D:** axis before grid when drawing from an off-grid point; the on-wall/on-line snap reach
   (dead `tolerance*2` in `inference.ts`); `@x,y` and `length<angle` entry (the Measurements box drops `@`/`<`);
   metric bare numbers as mm; Move/Rotate keep the selection when the base point is on another item; Stretch/Scale
   snap to their own preview (tilt) and touch other floors; Fillet radius 0; Rotate counter-clockwise; modify tools
   on layout lines (Trim deletes a wall crossed only by a line); doors keep their distance when a wall's length
   changes; right-click = Enter; undo one segment in a chain; repeat last command; AutoCAD aliases; 2D redraw speed
   (memoised drawing, no per-render `wallFaces`/`isJoined`).
2. **1.25 SketchUp-style 3D:** zoom extents and +/- in 3D; snap marker at the hit point; Select drag box-selects;
   3D tape; material/texture cache and one reused renderer (shader recompiles per edit; a WebGL context leaks per
   open); Push/Pull double-click repeat and height inference; paint per face; standard and parallel views; orbit
   about the cursor.
3. **1.26 Interface polish:** 1024 px top bar; tool keys after side-panel controls; unsaved dialog Save/Esc; plot
   selection with a boundary wall; keyboard focus in welcome and menus; paste then place; empty-plan exports.
4. **Split view (6b):** a 2D + 3D split screen, both editable.
5. **Bill of quantities / cost estimate** from real wall and slab quantities; the Auto Planner's area × rate as a
   first step (`05-auto-planner-review.md`).
6. **Generative layouts** (later): room program → a few variants, placed as ordinary walls and rooms.

Done: bylaws, plot presets and the plan check (1.22); plan hints, the mumty, car porches and the north arrow (1.23).

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
