import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { mirrorItems } from '../lib/modify';
import { plotSides } from '../lib/plot';
import { plotRect } from '../lib/site';
import { emptyDoc } from '../lib/storage';
import type { Opening, Plot, Point, Wall } from '../types';
import { createPlannerStore, KIND_HEIGHT_MM } from './plannerStore';

const ft = (f: number) => (f * 304.8) / 10;
const P = (x: number, y: number): Point => ({ x: ft(x), y: ft(y) });

function setup() {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  const s = () => store.getState();
  const plot = () => s().doc.elements.find((el): el is Plot => el.type === 'plot')!;
  const walls = () => s().doc.elements.filter((el): el is Wall => el.type === 'wall');
  const gates = () => s().doc.elements.filter((el): el is Opening => el.type === 'door');
  return { s, plot, walls, gates };
}

describe("a plot's linked boundary walls", () => {
  it('builds one wall per side, each linked to its side', () => {
    const { s, plot, walls } = setup();
    expect(s().addPlot(plotRect({ x: 0, y: 0 }, P(25, 45)))).toBe(true);
    expect(walls()).toHaveLength(4);
    const p = plot();
    expect(p.sideList!.map((x) => x.kind)).toEqual(['back', 'neighbour', 'road', 'neighbour']);
    p.sideList!.forEach((side, i) => {
      const wall = walls().find((w) => w.id === side.wallId)!;
      expect(wall).toMatchObject({ plotId: p.id, plotSide: i, kind: 'boundary', heightMm: KIND_HEIGHT_MM.boundary });
    });
    s().undo();
    expect(s().doc.elements).toHaveLength(0);
  });

  it('moves the walls, keeping their ids, when a corner is dragged; the gate stays on its wall', () => {
    const { s, plot, walls, gates } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    s().addSideGate(plot().id, 2);
    const gate = gates()[0];
    const road = walls().find((w) => w.id === plot().sideList![2].wallId)!;
    expect(gate.wallId).toBe(road.id);
    // It swings into the plot, not out onto the road.
    expect(gate.flipSide).toBe(true);
    // Centred on the road side.
    expect(gate.x).toBeCloseTo(ft(15));
    const ids = walls().map((w) => w.id);
    // Drag the bottom-right corner 10' further right: the plot gets wider at the road.
    expect(s().movePlotCorner(plot().id, 2, P(40, 50))).toBe(true);
    expect(walls().map((w) => w.id)).toEqual(ids);
    const moved = walls().find((w) => w.id === road.id)!;
    expect(Math.max(moved.x1, moved.x2)).toBeGreaterThan(ft(39));
    const after = gates()[0];
    expect(after.wallId).toBe(road.id);
    // It keeps its place along the wall, and is still on it.
    expect(after.y).toBeCloseTo(moved.y1);
  });

  it('refuses a corner dragged across another side', () => {
    const { s, plot } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    const before = plot().points;
    expect(s().movePlotCorner(plot().id, 2, P(-10, -10))).toBe(false);
    expect(plot().points).toEqual(before);
  });

  it('refuses a new plot whose sides cross', () => {
    const { s } = setup();
    expect(s().addPlot([P(0, 0), P(10, 10), P(10, 0), P(0, 12)], 0)).toBe(false);
    expect(s().warnings[0]).toMatch(/cross/);
    expect(s().doc.elements).toHaveLength(0);
  });

  it('takes a side’s wall away (with its gate) and builds it again', () => {
    const { s, plot, walls, gates } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    s().addSideGate(plot().id, 2);
    const p = plot();
    const noWall = p.sideList!.map((x, i) => (i === 2 ? { kind: x.kind } : x));
    s().updatePlot({ ...p, sideList: noWall });
    expect(walls()).toHaveLength(3);
    expect(gates()).toHaveLength(0);
    const again = plot().sideList!.map((x, i) =>
      i === 2 ? { ...x, wall: { heightMm: 1500, thicknessMm: 114.3 } } : x,
    );
    s().updatePlot({ ...plot(), sideList: again });
    const road = walls().find((w) => w.id === plot().sideList![2].wallId)!;
    expect(road).toMatchObject({ heightMm: 1500, thickness: 11.43 });
  });

  it('forgets a side’s wall when the wall is deleted', () => {
    const { s, plot, walls } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    s().deleteElement(plot().sideList![0].wallId!);
    expect(walls()).toHaveLength(3);
    expect(plot().sideList![0]).toEqual({ kind: 'back' });
  });

  it('takes a wall’s new thickness from its own panel back to its side', () => {
    const { s, plot, walls } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    const wall = walls().find((w) => w.id === plot().sideList![1].wallId)!;
    s().updateElement({ ...wall, thickness: 11.43 });
    expect(plot().sideList![1].wall!.thicknessMm).toBeCloseTo(114.3);
  });

  it('keeps the walls with the plot when the plot alone is moved', () => {
    const { s, plot, walls } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    s().select(plot().id);
    s().nudgeSelected(ft(10), 0);
    const back = walls().find((w) => w.id === plot().sideList![0].wallId)!;
    expect(Math.min(back.x1, back.x2)).toBeCloseTo(ft(10) + 11.43);
  });

  it('gives a pasted plot its own copies of the walls, and leaves the original alone', () => {
    const { s, plot, walls } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    const original = plot();
    s().setSelection([original.id, ...walls().map((w) => w.id)]);
    s().copySelected();
    s().paste();
    const plots = s().doc.elements.filter((el): el is Plot => el.type === 'plot');
    expect(plots).toHaveLength(2);
    const copy = plots.find((p) => p.id !== original.id)!;
    expect(walls()).toHaveLength(8);
    for (const p of plots)
      p.sideList!.forEach((side, i) => {
        const wall = walls().find((w) => w.id === side.wallId)!;
        expect(wall).toMatchObject({ plotId: p.id, plotSide: i });
      });
    // Reshaping the copy moves only the copy's walls.
    const before = walls().filter((w) => w.plotId === original.id);
    s().movePlotCorner(copy.id, 2, { x: copy.points[2].x + ft(5), y: copy.points[2].y });
    expect(walls().filter((w) => w.plotId === original.id)).toEqual(before);
  });

  it('keeps the road on the road after a mirror', () => {
    const { s, plot } = setup();
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    const p = plot();
    const out = mirrorItems(s().doc, [p.id], P(0, 0), P(0, 10), false);
    const m = out.doc.elements.find((el): el is Plot => el.type === 'plot')!;
    const a = m.points[m.front];
    const b = m.points[(m.front + 1) % 4];
    expect(a.y).toBeCloseTo(ft(50));
    expect(b.y).toBeCloseTo(ft(50));
    expect(plotSides(m)[m.front].kind).toBe('road');
  });

  it('links an older plot to walls rebuilt from its sides, keeping the gate', () => {
    const { s, plot, walls, gates } = setup();
    // As a plot from before 1.30: no sides, ordinary boundary walls.
    s().setSite({ boundaryWall: false });
    s().addPlot(plotRect({ x: 0, y: 0 }, P(30, 50)));
    const old = { ...plot() };
    delete old.sideList;
    s().updateElement(old);
    s().setSite({ wallKind: 'boundary' });
    s().addWall({ x: 11.43, y: ft(50) - 11.43 }, { x: ft(30) - 11.43, y: ft(50) - 11.43 });
    s().setSite({ gate: true });
    s().placeOpening('door', P(15, 50));
    expect(gates()).toHaveLength(1);
    s().rebuildPlotWalls(plot().id);
    // Only the road side had a wall: it is replaced by a linked one, and the gate moves onto it.
    expect(walls()).toHaveLength(1);
    const road = walls()[0];
    expect(road.plotId).toBe(plot().id);
    expect(plot().sideList![2].wallId).toBe(road.id);
    expect(gates()[0].wallId).toBe(road.id);
  });

  it('turns the corners of an outline drawn the other way round', () => {
    const { s, plot } = setup();
    // An L drawn anticlockwise on screen, starting along the road at the bottom.
    const L = [P(0, 40), P(40, 40), P(40, 20), P(20, 20), P(20, 0), P(0, 0)];
    s().addPlot(L, 0);
    const p = plot();
    const a = p.points[p.front];
    const b = p.points[(p.front + 1) % 6];
    expect([a.y, b.y].map((y) => Math.round(y))).toEqual([Math.round(ft(40)), Math.round(ft(40))]);
    expect(plotSides(p).filter((x) => x.kind === 'back')).toHaveLength(2);
  });
});
