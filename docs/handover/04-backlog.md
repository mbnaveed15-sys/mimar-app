# Backlog

In the order agreed with the owner. Confirm the plan with the owner before starting each item.

## Next (agreed order)

1. **1.22 Bylaws and plan check** (plan approved by the owner): authority + plot presets that fill setbacks from
   size and frontage (separate Side 1/Side 2, choose which side), a live "Plan check" panel (setbacks against
   walls/columns/blocks with offenders highlighted, coverage, first floor vs ground, storeys and height, plinth,
   boundary wall, smallest room and house), each row with its clause; the check table and a title block in the
   PDF. Figures and sources: `06-bylaws.md` (CDA and DHA I&R official; DHA Lahore, Bahria, LDA setbacks
   provisional).
2. **1.23 Plan hints**: rooms reachable through doors, bedrooms/kitchen on an outside wall, minimum sizes by name.

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
- In 2D, Push/Pull can't reach heights (wall tops, slab thickness) or round column sizes; those are in 3D or the
  side panel. Shapes on walls are pushed in 3D (or given a Depth in the side panel).
- A shape drawn on a wall is sized by its outline's box: an arch drawn "upside down" still becomes an arch with
  its round top up.
- Blocks stand on the floor or a slab; they don't cut into walls they overlap.
- Layout lines only snap to walls and lines (not to furniture or columns).
- `Ctrl+L` / `Ctrl+H` in the browser version may be taken by the browser before the app sees them; the Edit menu
  and right-click menu always work.
