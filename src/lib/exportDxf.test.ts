import { describe, expect, it } from 'vitest';
import type { Opening, PlanDoc, PlanElement, Wall } from '../types';
import { dxfText, planToDxf, sideDrawingsToDxf, wallPieces } from './exportDxf';
import type { SideDrawing } from './drawings/views';
import { emptyDoc } from './storage';

const wall: Wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 500, y2: 0, thickness: 20 };
const door: Opening = { id: 'd', type: 'door', wallId: 'w', x: 250, y: 0, width: 100, angle: 0 };
const opts = {
  units: 'metric' as const,
  marlaSqFt: 225 as const,
  showDimensions: true,
  showFurniture: true,
  showRoomLabels: true,
};

describe('DXF export', () => {
  it('cuts a wall where a door goes through it', () => {
    const pieces = wallPieces(wall, [wall], [door]);
    expect(pieces).toHaveLength(2);
    const xs = pieces.map((p) => p.map((q) => q.x));
    expect(Math.max(...xs[0])).toBeCloseTo(200);
    expect(Math.min(...xs[1])).toBeCloseTo(300);
  });

  it('writes an R12 drawing in millimetres, with y pointing up and a layer per kind of thing', () => {
    const doc: PlanDoc = {
      ...emptyDoc(),
      elements: [
        { ...wall, y1: 100, y2: 100 },
        { ...door, y: 100 },
      ],
      rooms: [
        {
          id: 'r',
          name: 'Drawing room',
          points: [
            { x: 0, y: 110 },
            { x: 500, y: 110 },
            { x: 500, y: 500 },
          ],
        },
      ],
    };
    const dxf = planToDxf(doc, opts);
    const lines = dxf.split('\r\n');
    expect(lines.slice(0, 6)).toEqual(['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER']);
    expect(lines[lines.length - 2]).toBe('EOF');
    for (const layer of ['A-WALL', 'A-DOOR', 'A-AREA-IDEN', 'A-ANNO-DIMS'])
      expect(dxf).toContain(`\r\n8\r\n${layer}\r\n`);
    expect(dxf).toContain('Drawing room');
    expect(dxf).toContain('5.00 m'); // the wall's dimension
    // 100 plan units down the screen is 1000 mm below the origin on the drawing.
    expect(dxf).toContain('\r\n20\r\n-1000\r\n');
    expect([...dxf].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
  });

  it('keeps text to plain characters', () => {
    expect(dxfText('27 m² · 1.2 marla')).toBe('27 m2 - 1.2 marla');
    expect(dxfText('کمرہ')).toBe('\\U+06A9\\U+0645\\U+0631\\U+06C1');
  });

  it('exports a big floor (thousands of walls) without running out of stack', () => {
    const walls: Wall[] = Array.from({ length: 3000 }, (_, i) => ({ ...wall, id: `w${i}`, y1: i * 30, y2: i * 30 }));
    const doc: PlanDoc = { ...emptyDoc(), elements: walls };
    expect(() => planToDxf(doc, opts)).not.toThrow();
  });

  it('marks section lines on the plan', () => {
    const doc: PlanDoc = {
      ...emptyDoc(),
      elements: [wall, { id: 's', type: 'section', x1: 0, y1: -50, x2: 0, y2: 50, label: 'B' }],
    };
    const dxf = planToDxf(doc, opts);
    expect(dxf).toContain('\r\n8\r\nA-ANNO-SECT\r\n');
    expect(dxf).toContain('\r\n1\r\nB\r\n');
  });

  it('writes sections and elevations side by side, true size, on their own layers', () => {
    const d: SideDrawing = {
      title: 'Section A–A',
      cut: [
        [
          [
            [0, 0],
            [0.23, 0],
            [0.23, 3],
            [0, 3],
          ],
        ],
      ],
      lines: [
        { a: [1, 0], b: [1, 3], heavy: true },
        { a: [0.5, 1], b: [0.9, 1] },
      ],
      bounds: { minU: 0, maxU: 1, minV: 0, maxV: 3 },
      ground: { u0: -1, u1: 2 },
      levels: [{ v: 0, name: 'Natural ground', label: '+/-0.000' }],
    };
    const dxf = sideDrawingsToDxf([d, { ...d, title: 'Front elevation', cut: [] }]);
    for (const layer of ['A-SECT-CUT', 'A-SECT-OUTL', 'A-SECT-BYND', 'A-SECT-GRND', 'A-ANNO-LEVL', 'A-ANNO-TTLB'])
      expect(dxf).toContain(`\r\n8\r\n${layer}\r\n`);
    expect(dxf).toContain('\r\n0\r\nSOLID\r\n');
    expect(dxf).toContain('SECTION A-A');
    expect(dxf).toContain('FRONT ELEVATION');
    // A 3 m wall is 3000 mm tall.
    expect(dxf).toContain('\r\n20\r\n3000\r\n');
    expect([...dxf].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
  });

  it('draws the natural ground dashed on sections, on its own layer', () => {
    const d: SideDrawing = {
      title: 'Section A–A',
      cut: [],
      lines: [{ a: [1, 0], b: [1, 3], heavy: true }],
      bounds: { minU: 0, maxU: 1, minV: 0, maxV: 3 },
      ground: { u0: -1, u1: 2 },
      profile: {
        finished: [
          [-1, -0.5],
          [0, -0.5],
          [2, -1.5],
        ],
        natural: [
          [
            [-1, 0],
            [0, -0.5],
          ],
        ],
      },
      levels: [{ v: 0, name: 'Road level (datum)', label: '+/-0.000' }],
    };
    const dxf = sideDrawingsToDxf([d]);
    expect(dxf).toContain('\r\n8\r\nC-TOPO-SECT\r\n');
    expect(dxf).toContain('\r\n8\r\nA-SECT-GRND\r\n');
    // The finished ground falls to 1.5 m below the datum.
    expect(dxf).toContain('\r\n20\r\n-1500\r\n');
    expect(dxf).toContain('Road level (datum)');
  });

  it('puts the ground and the surroundings on the site layers', () => {
    const level = (id: string, x: number, y: number, zMm: number): PlanElement => ({ id, type: 'level', x, y, zMm });
    const doc: PlanDoc = {
      ...emptyDoc(),
      elements: [
        wall,
        level('l1', 0, 0, 0),
        level('l2', 2000, 0, 0),
        level('l3', 0, 2000, -3000),
        level('l4', 2000, 2000, -3000),
        {
          id: 'c',
          type: 'contour',
          zMm: -1200,
          points: [
            { x: 0, y: 800 },
            { x: 2000, y: 800 },
          ],
        },
        {
          id: 'p',
          type: 'pad',
          zMm: -1000,
          points: [
            { x: 500, y: 500 },
            { x: 1500, y: 500 },
            { x: 1500, y: 1500 },
            { x: 500, y: 1500 },
          ],
        },
        {
          id: 'b',
          type: 'context',
          kind: 'building',
          points: [
            { x: 2500, y: 0 },
            { x: 3000, y: 0 },
            { x: 3000, y: 500 },
          ],
          heightMm: 6000,
        },
        {
          id: 'r',
          type: 'context',
          kind: 'road',
          name: 'Main Boulevard',
          points: [
            { x: -500, y: 2500 },
            { x: 2500, y: 2500 },
          ],
        },
      ],
    };
    const dxf = planToDxf(doc, opts);
    for (const layer of ['C-TOPO-MAJR', 'C-TOPO-MINR', 'C-TOPO-SPOT', 'C-TOPO-GRAD', 'C-CTXT-BLDG', 'C-CTXT-ROAD'])
      expect(dxf).toContain(`\r\n8\r\n${layer}\r\n`);
    // Heights as the drawings write them: the major contours, the spot levels, the drawn contour, the levelled area.
    for (const text of ['-2.500', '+/-0.000', '-3.000', '-1.200', 'FGL -1.000', 'Main Boulevard'])
      expect(dxf).toContain(`\r\n1\r\n${dxfText(text.replace('+/-', '\u00b1'))}\r\n`);
    // Without the ground (another floor's plan, or none given), none of it.
    const bare = planToDxf({ ...doc, elements: [wall] }, { ...opts, ground: null });
    expect(bare).not.toContain('\r\n8\r\nC-TOPO-MAJR\r\n');
    expect(bare).not.toContain('\r\n8\r\nC-TOPO-MINR\r\n');
  });
});
