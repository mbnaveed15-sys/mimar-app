import { describe, expect, it } from 'vitest';
import type { Inference } from '../lib/inference';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { createPlannerStore } from '../store/plannerStore';
import type { Contour, Pad, SpotLevel } from '../types';
import { finishStep } from './finish';
import { structureHover, structureMeasure, structurePress, structureRelease } from './structureTools';

const at = (x: number, y: number): Inference => ({ point: { x, y }, kind: 'free' });
const make = () => createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);

describe('the ground tools', () => {
  it('puts spot levels at the typed height', () => {
    const store = make();
    const s = store.getState;
    s().setTool('level');
    expect(structureMeasure(store, { kind: 'length', mm: -457.2 })).toBeNull();
    structurePress(store, at(100, 100));
    structureMeasure(store, { kind: 'length', mm: 0 });
    structurePress(store, at(300, 100));
    const levels = s().doc.elements.filter((el): el is SpotLevel => el.type === 'level');
    expect(levels.map((l) => [l.x, l.zMm])).toEqual([
      [100, -457.2],
      [300, 0],
    ]);
  });

  it('draws a contour line point by point, finished by Enter or by closing it', () => {
    const store = make();
    const s = store.getState;
    s().setTool('contour');
    structureMeasure(store, { kind: 'length', mm: 600 });
    structurePress(store, at(0, 0));
    structureHover(store, at(100, 50));
    expect(s().draft).toMatchObject({ type: 'contour', cursor: { x: 100, y: 50 } });
    structurePress(store, at(100, 50));
    structurePress(store, at(200, 0));
    // Ctrl+Z takes back the last point while drawing.
    s().undo();
    expect(s().draft).toMatchObject({
      type: 'contour',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
    });
    expect(finishStep(store)).toBe(true);
    const [open] = s().doc.elements.filter((el): el is Contour => el.type === 'contour');
    expect(open.points).toHaveLength(2);
    expect(open.zMm).toBe(600);
    // A loop round a hill: clicking the first point closes it.
    structurePress(store, at(500, 500));
    structurePress(store, at(700, 500));
    structurePress(store, at(600, 700));
    structurePress(store, at(501, 501));
    const loop = s().doc.elements.filter((el): el is Contour => el.type === 'contour')[1];
    expect(loop.points).toHaveLength(4);
    expect(loop.points[3]).toEqual(loop.points[0]);
  });

  it('drags out a levelled area at the natural ground’s height, or takes a typed size', () => {
    const store = make();
    const s = store.getState;
    s().addSpotLevel({ x: 0, y: 0 }, 1000);
    s().setTool('pad');
    structurePress(store, at(0, 0));
    structureHover(store, at(300, 200));
    structureRelease(store, true);
    const [pad] = s().doc.elements.filter((el): el is Pad => el.type === 'pad');
    expect(pad.points).toHaveLength(4);
    // Rounded to 3": 3'-3".
    expect(pad.zMm).toBeCloseTo(990.6);
    expect(s().selectedIds).toEqual([pad.id]);
    structurePress(store, at(1000, 1000));
    structureHover(store, at(900, 1100));
    expect(structureMeasure(store, { kind: 'pair', a: 3048, b: 6096 })).toBeNull();
    const second = s().doc.elements.filter((el): el is Pad => el.type === 'pad')[1];
    const xs = second.points.map((p) => p.x);
    const ys = second.points.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([695.2, 1000, 1000, 1609.6]);
  });

  it('levels an area round the house, 3 feet out from its walls', () => {
    const store = make();
    const s = store.getState;
    expect(s().padUnderHouse()).toBe(false);
    s().addRectangle({ x: 0, y: 0 }, { x: 600, y: 400 });
    expect(s().padUnderHouse()).toBe(true);
    const [pad] = s().doc.elements.filter((el): el is Pad => el.type === 'pad');
    const xs = pad.points.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(-90);
    expect(Math.max(...xs)).toBeGreaterThan(690);
  });

  it('keeps only the ground settings that differ from the defaults, and saves them', () => {
    const store = make();
    const s = store.getState;
    s().setGround({ grade: 'natural', contourMm: 500 });
    expect(s().doc.ground).toEqual({ grade: 'natural', contourMm: 500 });
    s().setGround({ grade: 'level', levelMm: 300, cutFill: false });
    expect(s().doc.ground).toEqual({ contourMm: 500, levelMm: 300, cutFill: false });
    s().setGround({ contourMm: undefined, levelMm: 0, cutFill: true });
    expect(s().doc.ground).toBeUndefined();
    s().setGround({ levelMm: 450 });
    s().setLocation({ lat: 33.68, lon: 73.04 });
    s().addSpotLevel({ x: 10, y: 20 }, -300);
    s().setSatelliteLevels([{ x: 5000, y: 0, zMm: 2000 }]);
    s().setContext([
      {
        kind: 'building',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
        heightMm: 9000,
      },
    ]);
    const back = normaliseDoc(JSON.parse(JSON.stringify(s().doc)));
    expect(back.ground).toEqual({ levelMm: 450 });
    expect(back.location).toEqual({ lat: 33.68, lon: 73.04 });
    expect(back.elements.map((el) => el.type).sort()).toEqual(['context', 'level', 'level']);
    expect(back.elements.find((el) => el.type === 'level' && el.approx)).toBeTruthy();
    // Nonsense is dropped.
    const junk = normaliseDoc({
      ...JSON.parse(JSON.stringify(s().doc)),
      ground: { grade: 'sideways', levelMm: 'x', contourMm: -1 },
      location: { lat: 200, lon: 0 },
    });
    expect(junk.ground).toBeUndefined();
    expect(junk.location).toBeUndefined();
  });

  it('imports a survey as one step, grouped and selected', () => {
    const store = make();
    const s = store.getState;
    s().importSurvey(
      [
        { x: 0, y: 0, zMm: 100 },
        { x: 100, y: 0, zMm: 200 },
      ],
      [
        {
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
          ],
          zMm: 150,
        },
      ],
    );
    expect(s().doc.elements).toHaveLength(3);
    expect(s().doc.groups).toHaveLength(1);
    expect(s().selectedIds).toHaveLength(3);
    s().undo();
    expect(s().doc.elements).toHaveLength(0);
    s().redo();
    s().clearSurvey();
    expect(s().doc.elements).toHaveLength(0);
  });
});
