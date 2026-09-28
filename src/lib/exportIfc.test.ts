import { describe, expect, it } from 'vitest';
import { ifcGuid, planToIfc, stepString } from './exportIfc';
import { buildSamplePlan } from './samplePlan';
import { emptyDoc } from './storage';
import type { PlanDoc, PlanElement } from '../types';

const opts = { wallHeightMm: 3048, name: 'House', time: '2026-09-28T12:00:00' };
const count = (ifc: string, entity: string) => (ifc.match(new RegExp(`=${entity}\\(`, 'g')) ?? []).length;

/** Every #reference points at a line that exists, and no line is defined twice. */
function checkReferences(ifc: string) {
  const defined = new Set<string>();
  for (const m of ifc.matchAll(/^(#\d+)=/gm)) {
    expect(defined.has(m[1])).toBe(false);
    defined.add(m[1]);
  }
  for (const m of ifc.matchAll(/=.*$/gm)) for (const r of m[0].matchAll(/#\d+/g)) expect(defined).toContain(r[0]);
}

describe('IFC export', () => {
  it('writes the sample house as IFC4: storey, walls, doors and windows in openings, and rooms as spaces', () => {
    const doc = buildSamplePlan();
    const ifc = planToIfc(doc, opts);
    expect(ifc.startsWith('ISO-10303-21;')).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    checkReferences(ifc);

    const walls = doc.elements.filter((el) => el.type === 'wall');
    const doors = doc.elements.filter((el) => el.type === 'door');
    const windows = doc.elements.filter((el) => el.type === 'window');
    expect(count(ifc, 'IFCBUILDINGSTOREY')).toBe(1);
    expect(count(ifc, 'IFCWALL')).toBe(walls.length);
    expect(count(ifc, 'IFCWINDOW')).toBe(windows.length);
    expect(count(ifc, 'IFCOPENINGELEMENT')).toBe(doors.length + windows.length);
    expect(count(ifc, 'IFCRELVOIDSELEMENT')).toBe(doors.length + windows.length);
    expect(count(ifc, 'IFCRELFILLSELEMENT')).toBe(count(ifc, 'IFCDOOR') + windows.length);
    expect(count(ifc, 'IFCSPACE')).toBe(doc.rooms.length);
    expect(ifc).toContain('IFCSPACE(');
    expect(ifc).toContain("'Master bedroom'");
    expect(ifc).toContain("'NetFloorArea'");
    // A floor slab under the house, and a roof slab over it.
    expect(ifc).toContain("'Floor slab'");
    expect(ifc).toContain("'Roof slab'");
    // Furniture and the plot's lawn stay out.
    expect(ifc).not.toContain('IFCFURNISHINGELEMENT');
  });

  it('gives every element a GlobalId of its own, the same on every export', () => {
    const doc = buildSamplePlan();
    const ifc = planToIfc(doc, opts);
    const ids = [...ifc.matchAll(/^#\d+=IFC\w+\('([0-9A-Za-z_$]{22})'/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    expect(planToIfc(doc, opts)).toBe(ifc);
    expect(ifcGuid('a')).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(ifcGuid('a')).not.toBe(ifcGuid('b'));
  });

  it('writes roofs as roofs, gable ends and curtain walls as walls, and each floor as a storey', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 400 },
      { x: 0, y: 400 },
    ];
    const walls: PlanElement[] = outline.map((p, i) => {
      const q = outline[(i + 1) % 4];
      return { id: `w${i}`, type: 'wall', x1: p.x, y1: p.y, x2: q.x, y2: q.y, thickness: 23, levelId: 'first' };
    });
    const doc: PlanDoc = {
      ...emptyDoc(),
      levels: [
        { id: 'ground', name: 'Ground floor' },
        { id: 'first', name: 'First floor' },
      ],
      elements: [
        { id: 'glass', type: 'wall', x1: 0, y1: 0, x2: 600, y2: 0, thickness: 10, kind: 'curtain' },
        { id: 'col', type: 'column', x: 600, y: 400, w: 30, h: 30, shape: 'rect' },
        ...walls,
        {
          id: 'rf',
          type: 'roof',
          shape: 'gable',
          pitchDeg: 30,
          overhangMm: 457.2,
          thicknessMm: 152.4,
          levelId: 'first',
          points: [
            { x: -46, y: -46 },
            { x: 646, y: -46 },
            { x: 646, y: 446 },
            { x: -46, y: 446 },
          ],
        },
      ],
    };
    const ifc = planToIfc(doc, opts);
    checkReferences(ifc);
    expect(count(ifc, 'IFCBUILDINGSTOREY')).toBe(2);
    expect(ifc).toContain("'First floor'");
    expect(count(ifc, 'IFCCURTAINWALL')).toBe(1);
    expect(count(ifc, 'IFCCOLUMN')).toBe(1);
    expect(ifc).toMatch(/IFCROOF\([^;]*\.GABLE_ROOF\.\)/);
    expect(count(ifc, 'IFCTRIANGULATEDFACESET')).toBe(1);
    expect(ifc).toContain("'Gable wall'");
    // Walls sit on their own storey: the first floor's four walls and the gable walls.
    expect(count(ifc, 'IFCWALL')).toBe(5);
  });

  it('writes text as STEP wants it', () => {
    expect(stepString("Ali's room")).toBe("'Ali''s room'");
    expect(stepString('Café')).toBe("'Caf\\X2\\00E9\\X0\\'");
    expect(stepString('کمرہ')).toBe("'\\X2\\06A9\\X0\\\\X2\\0645\\X0\\\\X2\\0631\\X0\\\\X2\\06C1\\X0\\'");
  });
});
