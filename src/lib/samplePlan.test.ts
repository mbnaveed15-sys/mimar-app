import { planHints } from './planHints';
import { describe, expect, it } from 'vitest';
import { roomAreaSqMm } from '../rooms';
import { buildSamplePlan } from './samplePlan';

describe('sample 5-marla house', () => {
  it('has a plot, walls, named rooms, openings, furniture and a stair', () => {
    const doc = buildSamplePlan();
    const count = (t: string) => doc.elements.filter((el) => el.type === t).length;
    expect(count('plot')).toBe(1);
    expect(count('wall')).toBeGreaterThanOrEqual(15); // house + boundary
    expect(count('door')).toBe(9); // 8 doors + the gate
    expect(count('window')).toBe(5);
    expect(count('furniture')).toBeGreaterThan(8);
    expect(count('stair')).toBe(1);
    // Every room can be reached from the entrance, and the rooms that want daylight get enough.
    const hints = planHints(doc, { units: 'imperial' });
    expect(hints.filter((h) => h.kind === 'reach' || h.kind === 'daylight')).toEqual([]);
    expect(doc.rooms.map((r) => r.name)).toEqual([
      'Bedroom',
      'Master bedroom',
      'TV lounge',
      'Kitchen',
      'Drawing room',
      'Bath',
      'Store',
      'Stairs',
    ]);
    expect(doc.rooms.every((r) => roomAreaSqMm(r) > 0)).toBe(true);
  });
});
