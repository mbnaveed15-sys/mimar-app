import { describe, expect, it } from 'vitest';
import { minimumOf, narrowWidth, ROOM_MINIMUMS } from './roomMinimums';

describe('room minimums', () => {
  it('give every row a source', () => {
    for (const row of ROOM_MINIMUMS) {
      expect(row.mm, row.id).toBeGreaterThan(0);
      expect(row.source.length, row.id).toBeGreaterThan(5);
    }
  });

  it('use the wheelchair figure only where there is one', () => {
    expect(minimumOf('corridor')).toBe(900);
    expect(minimumOf('corridor', true)).toBe(915);
    expect(minimumOf('stair', true)).toBe(900);
  });

  it('measure a room across at its narrowest, even drawn at an angle', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(narrowWidth(rect)).toBeCloseTo(10);
    const a = Math.PI / 6;
    const turned = rect.map((p) => ({
      x: p.x * Math.cos(a) - p.y * Math.sin(a),
      y: p.x * Math.sin(a) + p.y * Math.cos(a),
    }));
    expect(narrowWidth(turned)).toBeCloseTo(10);
  });
});
