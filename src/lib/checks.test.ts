import { describe, expect, it } from 'vitest';
import type { Wall } from '../types';
import {
  DEFAULT_CHECKS,
  DEFAULT_SNAPS,
  filterCheck,
  filterHints,
  hintCategory,
  readChecks,
  readSnaps,
  rowCategory,
  snapAllowed,
} from './checks';
import { infer } from './inference';
import type { PlanCheck } from './planCheck';
import type { Hint } from './planHints';

const check = {
  authority: { name: 'CDA' },
  rule: null,
  rows: [
    { id: 'setbacks', status: 'fail' },
    { id: 'coverage', status: 'ok' },
    { id: 'rooms', status: 'fail' },
    { id: 'basement-height', status: 'check' },
  ],
} as unknown as PlanCheck;

const hints: Hint[] = [
  { id: 'zone-f1', kind: 'layout', text: '', ids: [] },
  { id: 'opening-gaps', kind: 'layout', text: '', ids: [], fix: 'opening-gaps' },
  { id: 'small-r1', kind: 'size', text: '', ids: [] },
  { id: 'dark-r1', kind: 'daylight', text: '', ids: [] },
  { id: 'no-door-r1', kind: 'reach', text: '', ids: [] },
];

describe('the Checks button', () => {
  it('sorts every check row and hint into a kind', () => {
    expect(check.rows.map(rowCategory)).toEqual(['plot', 'size', 'rooms', 'basement']);
    expect(hints.map(hintCategory)).toEqual(['zones', 'openings', 'rooms', 'daylight', 'layout']);
  });

  it('leaves paused kinds out, and everything when all checks are off', () => {
    expect(filterCheck(check, DEFAULT_CHECKS)).toBe(check);
    expect(filterCheck(check, { on: true, off: ['plot', 'rooms'] })?.rows.map((r) => r.id)).toEqual([
      'coverage',
      'basement-height',
    ]);
    expect(filterCheck(check, { on: false, off: [] })).toBeNull();
    expect(filterHints(hints, { on: true, off: ['zones', 'daylight'] }).map((h) => h.id)).toEqual([
      'opening-gaps',
      'small-r1',
      'no-door-r1',
    ]);
    expect(filterHints(hints, { on: false, off: [] })).toEqual([]);
  });

  it('reads saved settings, dropping anything unknown', () => {
    expect(readChecks(undefined)).toEqual(DEFAULT_CHECKS);
    expect(readChecks({ on: false, off: ['plot', 'nonsense'] })).toEqual({ on: false, off: ['plot'] });
    expect(readSnaps({ off: ['midpoint', 7] })).toEqual({ on: true, off: ['midpoint'] });
  });
});

describe('the Snap button', () => {
  const wall: Wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 };
  const opts = { walls: [wall], tolerance: 5, grid: null };

  it('skips snap points that are turned off', () => {
    expect(infer({ x: 52, y: 2 }, opts).kind).toBe('midpoint');
    const allow = snapAllowed({ on: true, off: ['midpoint'] }, DEFAULT_CHECKS);
    expect(infer({ x: 52, y: 2 }, { ...opts, allow })).toEqual({ point: { x: 52, y: 0 }, kind: 'on-wall' });
    const none = snapAllowed({ on: true, off: ['midpoint', 'on'] }, DEFAULT_CHECKS);
    expect(infer({ x: 52, y: 2 }, { ...opts, allow: none }).kind).toBe('free');
  });

  it('turns axes and guides off too', () => {
    const from = { x: 0, y: 50 };
    expect(infer({ x: 40, y: 52 }, { ...opts, walls: [], from }).kind).toBe('axis-x');
    const allow = snapAllowed({ on: true, off: ['axes'] }, DEFAULT_CHECKS);
    expect(infer({ x: 40, y: 52 }, { ...opts, walls: [], from, allow }).kind).toBe('free');
  });

  it('allows nothing with snapping off; the building line and corner gaps follow their checks', () => {
    expect(snapAllowed({ on: false, off: [] }, DEFAULT_CHECKS)('endpoint')).toBe(false);
    expect(snapAllowed(DEFAULT_SNAPS, DEFAULT_CHECKS)('building-line')).toBe(true);
    expect(snapAllowed(DEFAULT_SNAPS, { on: true, off: ['plot'] })('building-line')).toBe(false);
    expect(snapAllowed(DEFAULT_SNAPS, { on: false, off: [] })('corner-gap')).toBe(false);
    expect(snapAllowed(DEFAULT_SNAPS, { on: false, off: [] })('endpoint')).toBe(true);
  });
});
