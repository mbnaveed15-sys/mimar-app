import { describe, expect, it } from 'vitest';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { planToDxf } from './exportDxf';
import { planToIfc } from './exportIfc';
import { layerOf } from './layers';
import { planHints } from './planHints';
import { plotRect } from './site';
import {
  curvedRunPoints,
  isService,
  remapJoins,
  RUN_ORDER,
  runPath,
  SERVICE_KINDS,
  SERVICES,
  serviceIfcClass,
  serviceTag,
  syncRuns,
} from './services';
import { servicesCsv, servicesSchedule } from './servicesSchedule';
import { emptyDoc, normaliseDoc } from './storage';
import { buildModel } from '../three/model';
import type { Furniture, PlanDoc, PlanElement, Room, ServiceRun } from '../types';

const FT = 30.48;
const item = (id: string, kind: Furniture['kind'], x: number, y: number): Furniture => ({
  id,
  type: 'furniture',
  kind,
  x: x * FT,
  y: y * FT,
  w: 20,
  h: 20,
});
const run = (
  id: string,
  system: ServiceRun['system'],
  pts: [number, number][],
  from?: string,
  to?: string,
): ServiceRun => ({
  id,
  type: 'run',
  system,
  points: pts.map(([x, y]) => ({ x: x * FT, y: y * FT })),
  ...(from && { from }),
  ...(to && { to }),
});
const room = (id: string, name: string, x: number, y: number, w: number, d: number): Room => ({
  id,
  name,
  points: plotRect({ x: x * FT, y: y * FT }, { x: (x + w) * FT, y: (y + d) * FT }),
});
const docOf = (elements: PlanElement[], rooms: Room[] = []): PlanDoc => ({ ...emptyDoc(), elements, rooms });

describe('services', () => {
  it('has a symbol size, trade and tag for every Services item, all in the Services group', () => {
    expect(SERVICE_KINDS.length).toBeGreaterThan(60);
    for (const kind of SERVICE_KINDS) {
      expect(FURNITURE_CATALOG[kind].group, kind).toBe('Services');
      expect(
        SERVICES[kind].size3d.every((v) => v > 0),
        kind,
      ).toBe(true);
      expect(serviceTag(kind).length, kind).toBeLessThanOrEqual(5);
    }
    // Every Services-group item is a service, and no other library item is.
    for (const [kind, c] of Object.entries(FURNITURE_CATALOG))
      expect(isService(kind), kind).toBe(c.group === 'Services');
    // Tags are told apart within a trade.
    const tags = SERVICE_KINDS.map((k) => `${SERVICES[k].trade}:${serviceTag(k)}`);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('keeps run ends on the items they are joined to, and lets go of deleted ones', () => {
    const doc = docOf([
      item('s', 'switch-1', 0, 0),
      item('l', 'light-ceiling', 10, 0),
      run(
        'r',
        'lighting',
        [
          [0, 0],
          [5, 3],
          [10, 0],
        ],
        's',
        'l',
      ),
    ]);
    expect(syncRuns(doc)).toBe(doc);
    const moved = syncRuns({
      ...doc,
      elements: doc.elements.map((el) => (el.id === 'l' ? { ...el, x: 12 * FT } : el)),
    });
    const r = moved.elements.find((el) => el.id === 'r') as ServiceRun;
    expect(r.points[2]).toEqual({ x: 12 * FT, y: 0 });
    expect(r.points[1]).toEqual({ x: 5 * FT, y: 3 * FT });
    const gone = syncRuns({ ...doc, elements: doc.elements.filter((el) => el.id !== 's') });
    const g = gone.elements.find((el) => el.id === 'r') as ServiceRun;
    expect(g.from).toBeUndefined();
    expect(g.to).toBe('l');
  });

  it('points copied runs at the copied items', () => {
    const r = run(
      'r',
      'cold',
      [
        [0, 0],
        [1, 0],
      ],
      'a',
      'b',
    );
    expect(remapJoins(r, new Map([['a', 'a2']]))).toMatchObject({ from: 'a2' });
    expect(remapJoins(r, new Map([['a', 'a2']])).to).toBeUndefined();
  });

  it('draws wires curved and pipes straight', () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 0],
    ];
    expect(runPath(run('w', 'lighting', pts))).toContain('Q');
    expect(runPath({ ...run('w', 'lighting', pts), straight: true })).not.toContain('Q');
    expect(runPath(run('p', 'drain', pts))).not.toContain('Q');
    expect(curvedRunPoints(run('w', 'power', pts).points, 4)).toHaveLength(5);
  });

  it('puts each trade and each run on its own layer', () => {
    expect(layerOf(item('a', 'socket', 0, 0))).toBe('electrical');
    expect(layerOf(item('a', 'manhole', 0, 0))).toBe('drainage');
    expect(layerOf(item('a', 'ac-split', 0, 0))).toBe('hvac');
    expect(layerOf(item('a', 'bed-double', 0, 0))).toBe('furniture');
    expect(
      layerOf(
        run('r', 'gas', [
          [0, 0],
          [1, 0],
        ]),
      ),
    ).toBe('gas');
    expect(
      layerOf(
        run('r', 'cold', [
          [0, 0],
          [1, 0],
        ]),
      ),
    ).toBe('plumbing');
    expect(
      layerOf(
        run('r', 'data', [
          [0, 0],
          [1, 0],
        ]),
      ),
    ).toBe('data');
  });

  it('keeps runs when loading, dropping broken ones', () => {
    const doc = normaliseDoc({
      elements: [
        {
          id: 'a',
          type: 'run',
          system: 'hot',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
          from: 'x',
          sizeMm: 13,
        },
        {
          id: 'b',
          type: 'run',
          system: 'steam',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        },
        { id: 'c', type: 'run', system: 'cold', points: [{ x: 0, y: 0 }] },
        {
          id: 'd',
          type: 'run',
          system: 'cold',
          points: [
            { x: 0, y: 0 },
            { x: 5, y: 5 },
          ],
          sizeMm: -3,
        },
      ],
    });
    const runs = doc.elements.filter((el): el is ServiceRun => el.type === 'run');
    expect(runs.map((r) => r.id)).toEqual(['a', 'd']);
    expect(runs.find((r) => r.id === 'd')!.sizeMm).toBeUndefined();
    expect(runs.find((r) => r.id === 'a')).toMatchObject({ from: 'x', sizeMm: 13 });
  });

  it('counts items and measures runs for the schedule', () => {
    const doc = docOf([
      item('l1', 'light-ceiling', 0, 0),
      item('l2', 'light-ceiling', 5, 0),
      item('s', 'switch-1', 0, 5),
      run('r', 'lighting', [
        [0, 0],
        [10, 0],
      ]),
      run('p', 'cold', [
        [0, 0],
        [0, 10],
      ]),
      item('b', 'bed-double', 0, 0),
    ]);
    const s = servicesSchedule(doc);
    expect(s.items.map((i) => [i.kind, i.count])).toEqual([
      ['light-ceiling', 2],
      ['switch-1', 1],
    ]);
    expect(s.runs.map((r) => r.system)).toEqual(['lighting', 'cold']);
    expect(s.runs[0].lengthMm).toBeCloseTo(3048, 0);
    const csv = servicesCsv(doc, 'Test', 'metric');
    expect(csv).toContain('Ceiling light');
    expect(csv).toContain('3.0');
  });

  it('gives hints only where services are drawn', () => {
    const rooms = [room('bath', 'Bath', 0, 0, 8, 6), room('bed', 'Bedroom', 10, 0, 12, 12)];
    const quiet = planHints(docOf([], rooms), { units: 'imperial' }).filter((h) => h.kind === 'services');
    expect(quiet).toEqual([]);
    const doc = docOf(
      [
        item('wc', 'wc', 2, 2),
        item('l', 'light-ceiling', 15, 5),
        item('g', 'geyser', 3, 1),
        run(
          'p',
          'cold',
          [
            [0, 0],
            [2, 2],
          ],
          undefined,
          'wc',
        ),
        run('w', 'lighting', [
          [10, 10],
          [12, 10],
        ]),
        run(
          'x',
          'gas',
          [
            [15, 5],
            [20, 5],
          ],
          'l',
        ),
      ],
      rooms,
    );
    const texts = planHints(doc, { units: 'imperial' })
      .filter((h) => h.kind === 'services')
      .map((h) => h.text);
    expect(texts).toContain('Bath has no floor trap: wet areas need one to drain the floor.');
    expect(texts).toContain('Bedroom has lights but no switch: put a switch by the door.');
    expect(texts).toContain('WC (commode) has no drain pipe joined to it.');
    expect(texts).not.toContain('WC (commode) has no water pipe joined to it.');
    expect(texts.some((t) => t.includes('geyser has no hot water'))).toBe(true);
    expect(texts.some((t) => t.includes("isn't on any lighting circuit"))).toBe(true);
    expect(texts.some((t) => t.includes('gas run is joined to Ceiling light'))).toBe(true);
    expect(texts.some((t) => t.includes('distribution board'))).toBe(true);
  });

  it('builds services and pipes in 3D whatever the furniture setting, but not wires', () => {
    const doc = docOf([
      item('s', 'switch-1', 0, 0),
      item('f', 'fan-ceiling', 5, 5),
      run('p', 'drain', [
        [0, 0],
        [10, 0],
        [10, 5],
      ]),
      run('w', 'power', [
        [0, 0],
        [10, 0],
      ]),
    ]);
    const model = buildModel(doc, { wallHeightMm: 3000, showFurniture: false });
    const ids = model.solids.filter((s) => s.role === 'service').map((s) => s.id);
    expect(ids.filter((id) => id === 's')).toHaveLength(1);
    expect(ids.filter((id) => id === 'p')).toHaveLength(2);
    expect(ids).not.toContain('w');
    // The switch's middle 1.2 m up and the fan just under the ceiling, 3 m up (both from the floor).
    const sw = model.solids.find((s) => s.id === 's')!;
    const fan = model.solids.find((s) => s.id === 'f')!;
    expect(fan.y0 + fan.h - (sw.y0 + sw.h / 2)).toBeCloseTo(1.8, 2);
  });

  it('exports services to DXF on their own layers and to IFC as distribution elements', () => {
    const doc = docOf([
      item('s', 'socket', 0, 0),
      item('m', 'manhole', 5, 5),
      run('p', 'drain', [
        [0, 0],
        [10, 0],
      ]),
    ]);
    const dxf = planToDxf(doc, { units: 'metric', showFurniture: false } as Parameters<typeof planToDxf>[1]);
    expect(dxf).toContain('E-DEVC');
    expect(dxf).toContain('P-SANR');
    expect(dxf).toMatch(/\nSO\r?\n/);
    expect(serviceIfcClass('socket')).toBe('IFCOUTLET');
    expect(serviceIfcClass('light-ceiling')).toBe('IFCLIGHTFIXTURE');
    expect(serviceIfcClass('tap')).toBe('IFCSANITARYTERMINAL');
    const ifc = planToIfc(doc, { wallHeightMm: 3000, name: 'Test' });
    expect(ifc).toContain('IFCOUTLET(');
    expect(ifc).toContain('IFCDISTRIBUTIONCHAMBERELEMENT(');
    expect(ifc).toContain('IFCPIPESEGMENT(');
  });

  it('lists every run system once', () => {
    expect(new Set(RUN_ORDER).size).toBe(RUN_ORDER.length);
  });
});
