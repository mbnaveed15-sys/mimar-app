import { describe, expect, it } from 'vitest';
import { dayOfYear, formatHour, shadowsOn, sunDirection, sunPosition } from './sun';

describe('the sun', () => {
  it('counts days of the year', () => {
    expect(dayOfYear(1, 1)).toBe(1);
    expect(dayOfYear(3, 1)).toBe(60);
    expect(dayOfYear(12, 31)).toBe(365);
    expect(dayOfYear(2, 31)).toBe(59);
  });

  it('stands due south at noon, higher in summer, and is down at midnight (Lahore)', () => {
    const june = sunPosition(31.5, dayOfYear(6, 21), 12);
    const dec = sunPosition(31.5, dayOfYear(12, 21), 12);
    expect(june.altitude).toBeCloseTo(90 - 31.5 + 23.44, 0);
    expect(dec.altitude).toBeCloseTo(90 - 31.5 - 23.44, 0);
    expect(dec.azimuth).toBeCloseTo(180, 0);
    expect(sunPosition(31.5, 172, 0).altitude).toBeLessThan(0);
    // Morning in the east, afternoon in the west.
    expect(sunPosition(31.5, 172, 9).azimuth).toBeGreaterThan(45);
    expect(sunPosition(31.5, 172, 9).azimuth).toBeLessThan(135);
    expect(sunPosition(31.5, 172, 16).azimuth).toBeGreaterThan(225);
  });

  it('keeps the usual sun until a date is set, and turns the real one with north', () => {
    expect(sunDirection({}).dir[0]).toBeLessThan(0);
    const sun = { timed: true, month: 12, day: 21, hour: 12 };
    // North up the page: the noon sun is to the south, down the page (+z).
    const up = sunDirection({ sun }).dir;
    expect(up[2]).toBeGreaterThan(0.5);
    expect(Math.abs(up[0])).toBeLessThan(0.01);
    // North pointing right: south is to the left (-x).
    const right = sunDirection({ sun, northDeg: 90 }).dir;
    expect(right[0]).toBeLessThan(-0.5);
    expect(sunDirection({ sun: { ...sun, hour: 0 } }).up).toBe(false);
  });

  it('has shadows unless turned off, and shows times', () => {
    expect(shadowsOn({})).toBe(true);
    expect(shadowsOn({ sun: { month: 1, day: 1, hour: 12, shadows: false } })).toBe(false);
    expect(formatHour(15.5)).toBe('3:30 pm');
    expect(formatHour(9)).toBe('9:00 am');
    expect(formatHour(12)).toBe('12:00 pm');
  });
});
