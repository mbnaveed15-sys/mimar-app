# Review: "PlanIt! Auto Planner" (Auto_Planner.html)

_Report only, as requested. Nothing from it has been added to Mimar._

## What it is

A single-page web app (about 1,200 lines of plain JavaScript) that drafts a whole house from a few choices:

- **Inputs:** plot (5 marla 25'×45', 10 marla 35'×65', 1 kanal 50'×90'), authority (DHA, CDA, LDA, Bahria),
  storeys (G+1 up to basement + G+2), road side, city and construction grade, and amenities (prayer room,
  walk-in, roof terrace, study, media room, gym).
- **Output:** three variants (original, mirrored, re-planned) of every floor, a site plan, a section, a bylaw
  table, a design-check table and a cost estimate, on a printable sheet with a title block.
- **Prompt Studio:** type a brief ("5 bedrooms, 4 baths, a large kitchen…"); it counts the rooms, estimates the
  area needed and says whether it fits the plot.

## How it works (and its limits)

- **"Generative" is template-based.** Each floor is a fixed list of rectangles given as fractions of the buildable
  area (e.g. drawing room = left 40% × front 36%). Variants are the same template mirrored, or a second template.
  Nothing is actually searched or optimised, and the Prompt Studio's brief does **not** change the drawing; it
  only gives a fits / doesn't-fit verdict.
- **Bylaws are four numbers per authority:** ground coverage % and front/rear/side setbacks, the same for every
  plot size (e.g. DHA 60%, 10'/5'/5'). Real bylaws vary by plot size and also cover height, floors, basement,
  parking, projections and more. There is a bug: the "maximum floors" row reads a value that doesn't exist.
  **All figures are placeholders and would need checking against current published bylaws.**
- **Costs** are covered area × a per-square-foot rate per city and grade, plus fixed multipliers for bricks,
  cement, steel and sand. Indicative only.
- Rooms are rectangles on a grid, with no wall thickness, openings or materials. It is a concept tool, not a
  drawing tool.

## What is worth bringing into Mimar

Recommended, in this order:

1. **Plot presets with authority setbacks and coverage** (low effort, high value). Mimar already has plots and
   setbacks; add a picker for 5/10 marla and 1 kanal (plus custom) and an authority list that fills in the
   setbacks. Keep the numbers in one editable table, and **verify each one**.
2. **Compliance panel** (medium). Mimar knows the real ground-floor area, floors, plot and setbacks, so it can
   check coverage %, setbacks (the building footprint against the buildable line), floor count, and FAR live,
   with ✓/✗ rows, and put the table in the PDF. More accurate than the Auto Planner's, because it measures the
   actual drawing.
3. **Design checks on the real plan** (medium):
   - rooms reachable through doors (graph walk from the main door, like its circulation audit);
   - bedrooms, kitchen and lounge touching an outside wall (for a window);
   - kitchen next to dining/lounge;
   - prayer room not opening onto a bath or kitchen;
   - minimum room sizes and proportions by room name (its "size bands": e.g. bedroom ≥ 80 sq ft and ≥ 8' wide).

   Shown as hints in a "Plan check" panel, never as hard rules.
4. **Quick cost estimate** (low to medium). Start with its area × rate by city and grade, then improve it with
   Mimar's real quantities (wall volume for bricks and mortar, slab and beam volume for concrete and steel). Label
   it indicative and let the rates be edited.
5. **Sheet layout for printing** (low). Its title block (project, drawing, scale, sheet) and north arrow would
   suit Mimar's PDF export.
6. **Room program → starter layout** (high effort, later). Turn "3 bed, 2 bath, lounge, kitchen, car porch" into
   two or three starter layouts drawn as ordinary Mimar walls and rooms, so everything stays editable. Its
   templates-as-fractions idea is a sensible first step (a template per plot size, scaled to the buildable area),
   then mirrored and swapped variants.

Probably not worth copying:

- The rectangle-only room editor (Mimar's wall-based drawing is more capable).
- The shelf-packing fit check in the Prompt Studio (too rough to trust); a plain area budget ("your brief needs
  about 1,450 sq ft; you can build 1,200") gives the same message more honestly.

## Suggested phase

A "Bylaws and checks" release (items 1–3 above, with 4 as a stretch), after the owner confirms the authorities and
plot sizes to support and supplies or approves the bylaw figures.
