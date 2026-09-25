# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Next (agreed order)

1. **Split view (6b):** a 2D + 3D split screen, both editable.
2. **Bill of quantities / cost estimate** from real wall and slab quantities (not just area × rate); the Auto
   Planner's area × rate by city and grade as a first step (`05-auto-planner-review.md`).
3. **Generative layouts** (later): room program → a few variants, placed as ordinary walls and rooms.
4. **Polish release:** the rough edges below that are worth fixing.

Done: bylaws, plot presets and the plan check (1.22); plan hints, the mumty, car porches and the north arrow (1.23).

## Known rough edges

- The welcome tour's highlight positions are measured every 400 ms; on very small windows the card may cover the
  highlighted part.
- Moving up and down (blue axis) only works in 3D; in 2D use the "Height above floor" field or Alt+↑/↓.
- Rooms (floor finishes) and plots can't be raised; a raised wall doesn't carry its room's floor up with it.
- Plan check: coverage and total areas are rooms + walls (about); height adds the floors, slabs and parapets from
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
