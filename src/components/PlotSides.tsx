import { plotRule } from '../lib/bylaws';
import { isCornerPlot, plotSides, roadCorner, sideSetbacks, SIDE_KIND_NAMES } from '../lib/plot';
import { formatLength } from '../lib/units';
import { BOUNDARY_MM, KIND_HEIGHT_MM, MM_PER_UNIT, usePlanner } from '../store/plannerStore';
import type { Plot, PlotSide, PlotSideKind } from '../types';
import { LengthField } from './LengthField';

const KINDS: PlotSideKind[] = ['road', 'neighbour', 'back', 'open'];
/** Boundary wall thicknesses: 9" and 4½" brick. */
const THICKNESS: { mm: number; label: string }[] = [
  { mm: BOUNDARY_MM, label: '9"' },
  { mm: 114.3, label: '4½"' },
];

/**
 * A plot's sides, from the main road going round: each one's type, setback and boundary wall, a
 * gate on it, and (for a corner plot) the cut corner. Hovering a row lights its side up on the plan.
 */
export function PlotSidesPanel({ plot }: { plot: Plot }) {
  const units = usePlanner((s) => s.units);
  const updatePlot = usePlanner((s) => s.updatePlot);
  const addSideGate = usePlanner((s) => s.addSideGate);
  const setHoverEdge = usePlanner((s) => s.setHoverEdge);
  const rebuild = usePlanner((s) => s.rebuildPlotWalls);
  const elements = usePlanner((s) => s.doc.elements);
  const sides = plotSides(plot);
  const setbacks = sideSetbacks(plot, sides);
  const n = plot.points.length;
  const order = Array.from({ length: n }, (_, k) => (plot.front + k) % n);
  const len = (mm: number) => formatLength(mm, units);
  const hasBylaws = !!plotRule(plot)?.rule;
  const linked = sides.some((s) => s.wallId) || !!plot.splay?.wallId;
  const gatesOn = (wallId: string | undefined) =>
    wallId ? elements.filter((el) => el.type === 'door' && el.gate && el.wallId === wallId).length : 0;

  const setSide = (i: number, patch: (side: PlotSide) => PlotSide) =>
    updatePlot({ ...plot, sideList: sides.map((side, j) => (j === i ? patch(side) : side)) });
  const withoutKey = <K extends keyof PlotSide>(side: PlotSide, key: K): PlotSide => {
    const copy = { ...side };
    delete copy[key];
    return copy;
  };
  const corner = isCornerPlot(plot);

  return (
    <div className="flex flex-col gap-2" data-testid="plot-sides">
      <div className="font-medium">Sides</div>
      {order.map((i, k) => {
        const side = sides[i];
        const a = plot.points[i];
        const b = plot.points[(i + 1) % n];
        const lengthMm = Math.hypot(b.x - a.x, b.y - a.y) * MM_PER_UNIT;
        const sb = setbacks[i];
        const main = i === plot.front % n;
        return (
          <div
            key={i}
            data-testid={`plot-side-${k + 1}`}
            className="flex flex-col gap-1 rounded-sm border border-line p-1.5"
            onMouseEnter={() => setHoverEdge([a, b])}
            onMouseLeave={() => setHoverEdge(null)}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-medium tabular-nums">
                {k + 1}. {len(lengthMm)}
                {main && <span className="ml-1 text-muted">(main road)</span>}
              </span>
              <select
                aria-label={`Side ${k + 1} type`}
                value={side.kind}
                onChange={(e) => setSide(i, (s) => ({ ...s, kind: e.target.value as PlotSideKind }))}
                className="rounded-sm border p-0.5"
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SIDE_KIND_NAMES[kind]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 items-end gap-2">
              <LengthField
                id={`plot-side-${k + 1}-setback`}
                label={sb.typed ? 'Setback (typed)' : hasBylaws ? 'Setback (bylaws)' : 'Setback'}
                mm={sb.mm}
                units={units}
                min={0}
                onCommit={(mm) => setSide(i, (s) => ({ ...s, setbackMm: mm }))}
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor={`plot-side-${k + 1}-wall`} className="text-muted">
                  Wall
                </label>
                <select
                  id={`plot-side-${k + 1}-wall`}
                  value={side.wall ? String(side.wall.thicknessMm) : ''}
                  onChange={(e) =>
                    setSide(i, (s) =>
                      e.target.value
                        ? {
                            ...s,
                            wall: {
                              heightMm: s.wall?.heightMm ?? KIND_HEIGHT_MM.boundary,
                              thicknessMm: Number(e.target.value),
                            },
                          }
                        : withoutKey(s, 'wall'),
                    )
                  }
                  className="rounded-sm border p-1"
                >
                  <option value="">None</option>
                  {THICKNESS.map((t) => (
                    <option key={t.mm} value={String(t.mm)}>
                      Boundary {t.label}
                    </option>
                  ))}
                  {side.wall && !THICKNESS.some((t) => Math.abs(t.mm - side.wall!.thicknessMm) < 0.5) && (
                    <option value={String(side.wall.thicknessMm)}>Boundary {len(side.wall.thicknessMm)}</option>
                  )}
                </select>
              </div>
            </div>
            {sb.provisional && (
              <div className="text-muted">
                Side setback for a second road{' '}
                <span className="rounded-sm bg-sunken px-1 text-[10px]">provisional</span>
              </div>
            )}
            {side.wall && (
              <div className="grid grid-cols-2 items-end gap-2">
                <LengthField
                  id={`plot-side-${k + 1}-height`}
                  label="Wall height"
                  mm={side.wall.heightMm}
                  units={units}
                  onCommit={(mm) => setSide(i, (s) => ({ ...s, wall: { ...s.wall!, heightMm: mm } }))}
                />
                <button
                  className="m-btn px-2 py-0.5"
                  disabled={!side.wallId}
                  title={side.wallId ? undefined : 'Rebuild the walls from the sides first'}
                  onClick={() => addSideGate(plot.id, i)}
                >
                  Add gate{gatesOn(side.wallId) ? ` (${gatesOn(side.wallId)})` : ''}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {sb.typed && (
                <button className="m-btn px-2 py-0.5" onClick={() => setSide(i, (s) => withoutKey(s, 'setbackMm'))}>
                  {hasBylaws ? 'Use the bylaws' : 'Use the plot’s setback'}
                </button>
              )}
              {side.kind === 'road' && !main && (
                <button
                  className="m-btn px-2 py-0.5"
                  onClick={() => updatePlot({ ...plot, sideList: sides, front: i })}
                >
                  Make main road
                </button>
              )}
            </div>
          </div>
        );
      })}

      {corner && (
        <div className="flex flex-col gap-1 rounded-sm border border-line p-1.5" data-testid="corner-plot">
          <div className="font-medium">Corner plot</div>
          <div className="text-muted">
            The second road takes the side setback for now. No official corner-plot figures are in Mimar yet, so check
            them with the authority.
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!plot.splay}
              disabled={roadCorner(plot, sides) === null}
              onChange={(e) => {
                if (e.target.checked) updatePlot({ ...plot, sideList: sides, splay: { sizeMm: 1524 } });
                else {
                  const next = { ...plot, sideList: sides };
                  delete next.splay;
                  updatePlot(next);
                }
              }}
            />
            Cut the corner (splay)
          </label>
          {roadCorner(plot, sides) === null && (
            <div className="text-muted">The two roads don’t meet at a corner, so there is no corner to cut.</div>
          )}
          {plot.splay && (
            <LengthField
              id="plot-splay"
              label="Cut along each road"
              mm={plot.splay.sizeMm}
              units={units}
              onCommit={(mm) => updatePlot({ ...plot, sideList: sides, splay: { ...plot.splay!, sizeMm: mm } })}
            />
          )}
        </div>
      )}

      {linked ? (
        <div className="text-muted">
          The boundary walls follow the plot: drag a corner (the round grips) and they move with it, gates and all.
        </div>
      ) : (
        <>
          <button
            className="m-btn px-2 py-0.5"
            onClick={() => rebuild(plot.id)}
            title="Replace the boundary walls along the sides with walls that follow the plot"
          >
            Rebuild walls from sides
          </button>
          <div className="text-muted">
            The boundary walls are ordinary walls. Rebuild them from the sides so they follow the plot; their doors and
            gates move onto the new walls.
          </div>
        </>
      )}
    </div>
  );
}
