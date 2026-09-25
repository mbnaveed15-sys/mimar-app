# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Follow-ups to Push/Pull (held back from 1.19 to keep it safe)

1. **Niches and pull-outs:** pushing a wall shape only part-way in (an alcove or shelf niche), and pulling a shape
   out of a wall (a ledge or pilaster). Today a wall shape must go at least half-way in, and is then cut right
   through.
2. **Push/Pull in the 2D view** (wall ends and slab edges seen from above). Today it asks for the 3D view.
3. Hovering a face lights up the whole item, not just the face under the pointer.

## Proposed next phases

4. **Split view (6b):** a 2D + 3D split screen, both editable (Push/Pull moved up to 1.19).
5. **Bylaws and plot templates (5d):** see `05-auto-planner-review.md`. Recommended: plot-size presets (5/10
   marla, 1 kanal) with authority setbacks and coverage, and a compliance report. **Verify every number against
   the authority's current bylaws before shipping**; the Auto Planner's figures are placeholders.
6. **Bill of quantities / cost estimate** from real wall and slab quantities (not just area × rate).
7. **Generative layouts** (later, after 5 and 6): room program → a few variants, placed as ordinary walls and rooms.

## Known rough edges

- The welcome tour's highlight positions are measured every 400 ms; on very small windows the card may cover the
  highlighted part.
- Moving up and down (blue axis) only works in 3D; in 2D use the "Height above floor" field or Alt+↑/↓.
- Rooms (floor finishes) and plots can't be raised; a raised wall doesn't carry its room's floor up with it.
- A shape drawn on a wall is sized by its outline's box: an arch drawn "upside down" still becomes an arch with
  its round top up.
- Blocks stand on the floor or a slab; they don't cut into walls they overlap.
- Layout lines only snap to walls and lines (not to furniture or columns).
- `Ctrl+L` / `Ctrl+H` in the browser version may be taken by the browser before the app sees them; the Edit menu
  and right-click menu always work.
