# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Next: 1.19 (asked for by the owner)

1. **Push/Pull, and shape tools that use it.** Draw a shape (rectangle, circle, polygon) on a face or the floor,
   then push or pull it into a solid, SketchUp style. It must be able to **puncture a wall**: pushing a shape
   through a wall cuts an opening (a custom-shaped door or window hole). Includes dragging the top of a wall to
   change its height and a slab's edge. Send the owner a plan to approve before building.

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
- Layout lines only snap to walls and lines (not to furniture or columns).
- `Ctrl+L` / `Ctrl+H` in the browser version may be taken by the browser before the app sees them; the Edit menu
  and right-click menu always work.
