/**
 * Where the sun is for the 3D view's light and shadows: the usual fixed sun (from the south-west, high up), or
 * the real sun for a date and time at the plan's latitude, turned to the plan's north. Pure.
 */
import type { PlanDoc } from '../types';

/** Lahore. */
export const DEFAULT_LATITUDE = 31.5;
export const DEFAULT_SUN = { month: 6, day: 21, hour: 15 };
const RAD = Math.PI / 180;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const daysIn = (month: number) => DAYS[Math.min(12, Math.max(1, Math.round(month))) - 1];

/** Day of the year, 1 to 365. */
export function dayOfYear(month: number, day: number): number {
  const m = Math.min(12, Math.max(1, Math.round(month)));
  return DAYS.slice(0, m - 1).reduce((s, d) => s + d, 0) + Math.min(daysIn(m), Math.max(1, Math.round(day)));
}

/**
 * The sun's height above the horizon and its bearing (degrees clockwise from north) at a latitude, on a day of
 * the year, at a solar time (12 is noon). Simple textbook formulas: close enough for shadows.
 */
export function sunPosition(latitude: number, dayNumber: number, hour: number): { altitude: number; azimuth: number } {
  const phi = latitude * RAD;
  const decl = 23.44 * RAD * Math.sin(((2 * Math.PI) / 365) * (284 + dayNumber));
  const h = (hour - 12) * 15 * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // Bearing from north, measured towards the east.
  const az = Math.atan2(
    -Math.sin(h) * Math.cos(decl),
    Math.cos(phi) * Math.sin(decl) - Math.sin(phi) * Math.cos(decl) * Math.cos(h),
  );
  return { altitude: alt / RAD, azimuth: (((az / RAD) % 360) + 360) % 360 };
}

/** North on the plan, degrees clockwise from straight up the page. */
export const northOf = (doc: Pick<PlanDoc, 'northDeg'>) => doc.northDeg ?? 0;

/**
 * A unit vector towards the sun in the 3D scene (x across the plan, y up, z down the page), and whether the
 * sun is up. The fixed sun stands to the left of and below the plan, high up, as before.
 */
export function sunDirection(doc: Pick<PlanDoc, 'northDeg' | 'sun' | 'location'>): {
  dir: [number, number, number];
  up: boolean;
} {
  const sun = doc.sun;
  if (!sun?.timed) {
    const len = Math.hypot(0.6, 1.4, 0.9);
    return { dir: [-0.6 / len, 1.4 / len, 0.9 / len], up: true };
  }
  const { altitude, azimuth } = sunPosition(
    sun.latitude ?? doc.location?.lat ?? DEFAULT_LATITUDE,
    dayOfYear(sun.month, sun.day),
    sun.hour,
  );
  // Below the horizon the light stays just above it, so the model can still be seen.
  const alt = Math.max(altitude, 3) * RAD;
  const t = northOf(doc) * RAD;
  // North on the plan, then east a quarter turn clockwise from it (y points down the page).
  const north = [Math.sin(t), -Math.cos(t)];
  const east = [Math.cos(t), Math.sin(t)];
  const a = azimuth * RAD;
  const hx = Math.cos(a) * north[0] + Math.sin(a) * east[0];
  const hz = Math.cos(a) * north[1] + Math.sin(a) * east[1];
  return { dir: [hx * Math.cos(alt), Math.sin(alt), hz * Math.cos(alt)], up: altitude > 0 };
}

/** Shadows are on unless turned off. */
export const shadowsOn = (doc: Pick<PlanDoc, 'sun'>) => doc.sun?.shadows !== false;

/** A time for showing: "3:30 pm". */
export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const [hh, mm] = m === 60 ? [h + 1, 0] : [h, m];
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 || hh === 24 ? 'am' : 'pm'}`;
}
