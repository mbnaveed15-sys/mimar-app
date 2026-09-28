import { describe, expect, it } from 'vitest';
import type { Opening, PlanDoc, Wall } from '../types';
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
});
