# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Reported by the owner, queued "for later"

2. **Plots are drawn under the grid.** The plot outline and lawn should sit above the grid lines (2D), and be easy
   to see in 3D.
3. **Moving in the z direction isn't possible.** Items can't be raised or lowered (e.g. a slab or beam at a set
   height, furniture on a mezzanine, sunken areas). Needs a design proposal: an elevation field per item
   (inspector) plus vertical moves with the Move tool in 3D (e.g. an up/down axis lock like SketchUp's blue axis).

## Proposed next phases

4. **Push/Pull and split view (6b):** drag the top of a wall to change its height, or a slab's edge; a 2D + 3D
   split screen, both editable.
5. **Bylaws and plot templates (5d):** see `05-auto-planner-review.md`. Recommended: plot-size presets (5/10
   marla, 1 kanal) with authority setbacks and coverage, and a compliance report. **Verify every number against
   the authority's current bylaws before shipping**; the Auto Planner's figures are placeholders.
6. **Bill of quantities / cost estimate** from real wall and slab quantities (not just area × rate).
7. **Generative layouts** (later, after 5 and 6): room program → a few variants, placed as ordinary walls and rooms.

## Known rough edges

- The welcome tour's highlight positions are measured every 400 ms; on very small windows the card may cover the
  highlighted part.
- Layout lines only snap to walls and lines (not to furniture or columns).
- `Ctrl+L` / `Ctrl+H` in the browser version may be taken by the browser before the app sees them; the Edit menu
  and right-click menu always work.
