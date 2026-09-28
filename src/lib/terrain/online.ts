/**
 * The site from the internet: its location from a typed pair or a Google Maps link, the buildings and
 * roads round it from OpenStreetMap, and approximate ground levels from satellite (SRTM) heights.
 * Everything is pure except the two fetchers at the end, which need a browser.
 */
import { pointInPolygon } from '../../geometry';
import type { Point } from '../../types';
import { MM_PER_UNIT } from '../scale';

export interface LatLon {
  lat: number;
  lon: number;
}

/** A signed decimal number, as a pattern to put inside others. */
const DEG = '(-?\\d{1,3}(?:\\.\\d+)?)';

/** Ways a location is written, the most exact first: a Maps place pin, a query, the map's centre, a typed pair. */
const LOCATION_FORMS = [
  new RegExp(`!3d${DEG}!4d${DEG}`),
  new RegExp(`[?&](?:q|ll|query)=(?:loc:)?${DEG}(?:,|%2C|\\+|\\s)+${DEG}`, 'i'),
  new RegExp(`@${DEG},${DEG}`),
  new RegExp(`^\\s*${DEG}°?\\s*(?:,\\s*|\\s+)${DEG}°?\\s*$`),
];

/** A location typed as "33.6844, 73.0479" (comma or space), or taken from a Google Maps link (…/@33.68,73.04,17z, ?q=33.68,73.04, ll=, query=, or !3d33.68!4d73.04); null when none is found or it is out of range. */
export function parseLocation(text: string): LatLon | null {
  for (const form of LOCATION_FORMS) {
    const m = form.exec(text);
    if (!m) continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    return null;
  }
  return null;
}

/** Metres per degree of latitude, and of longitude at the equator. */
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320;

/** The plan's east and north as unit vectors, for a north `northDeg` clockwise from up the page. */
function axes(northDeg: number) {
  const t = (northDeg * Math.PI) / 180;
  return { east: { x: Math.cos(t), y: Math.sin(t) }, north: { x: Math.sin(t), y: -Math.cos(t) } };
}

/** Plan units per metre. */
const UNITS_PER_M = 1000 / MM_PER_UNIT;

/** A point on the map to the plan: `origin` (the site's location) lands at `anchor`, north along the plan's north; metres from an equirectangular projection about the origin (111,320 m per degree of longitude times cos(lat), 110,574 per degree of latitude). */
export function geoToPlan(p: LatLon, origin: LatLon, northDeg: number, anchor: Point): Point {
  const { east, north } = axes(northDeg);
  const e = (p.lon - origin.lon) * M_PER_DEG_LON * Math.cos((origin.lat * Math.PI) / 180) * UNITS_PER_M;
  const n = (p.lat - origin.lat) * M_PER_DEG_LAT * UNITS_PER_M;
  return { x: anchor.x + e * east.x + n * north.x, y: anchor.y + e * east.y + n * north.y };
}

/** The other way round. */
export function planToGeo(p: Point, origin: LatLon, northDeg: number, anchor: Point): LatLon {
  const { east, north } = axes(northDeg);
  const dx = (p.x - anchor.x) / UNITS_PER_M;
  const dy = (p.y - anchor.y) / UNITS_PER_M;
  const e = dx * east.x + dy * east.y;
  const n = dx * north.x + dy * north.y;
  return {
    lat: origin.lat + n / M_PER_DEG_LAT,
    lon: origin.lon + e / (M_PER_DEG_LON * Math.cos((origin.lat * Math.PI) / 180)),
  };
}

/** The Overpass API query for buildings and roads within radiusM of a point. */
export function overpassQuery(at: LatLon, radiusM: number): string {
  const around = `(around:${Math.round(radiusM)},${at.lat},${at.lon})`;
  return `[out:json][timeout:25];\n(\n  way["building"]${around};\n  way["highway"]${around};\n);\nout geom;`;
}

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Road widths in metres by OpenStreetMap highway type. */
const ROAD_WIDTH_M: Record<string, number> = {
  motorway: 20,
  trunk: 12,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  residential: 6,
  unclassified: 6,
  living_street: 6,
  service: 4,
};

/** A building's height in metres from its `height` tag ("12", "12 m", "40 ft", "40'"), or null. */
function heightTagM(h: string | undefined): number | null {
  const m = h ? /^\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|foot|')?\s*$/i.exec(h) : null;
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] && /^(ft|feet|foot|')$/i.test(m[2]) ? v * 0.3048 : v;
}

interface OsmWay {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** Buildings and roads from an Overpass answer ("out geom" JSON: elements with type 'way', tags and geometry [{lat, lon}]), on the plan. Buildings (closed ways tagged building) get a height from `height` ("12", "12 m", "40 ft", "40'") or `building:levels` × 3 m, else 6 m; any building whose centre is inside `skipInside` (the plot) is left out. Roads (ways tagged highway) keep their centre line, a width by type (motorway 20 m, trunk and primary 12 m, secondary 10 m, tertiary 8 m, residential, unclassified and living_street 6 m, service 4 m, anything else 2 m) and their `name`. Relations and nodes are ignored. */
export function contextFromOverpass(
  json: unknown,
  origin: LatLon,
  northDeg: number,
  anchor: Point,
  skipInside?: Point[],
): { kind: 'building' | 'road'; points: Point[]; heightMm?: number; widthMm?: number; name?: string }[] {
  const elements = (json as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const out: { kind: 'building' | 'road'; points: Point[]; heightMm?: number; widthMm?: number; name?: string }[] = [];
  for (const el of elements as OsmWay[]) {
    if (el?.type !== 'way' || !Array.isArray(el.geometry)) continue;
    const tags = el.tags ?? {};
    const geo = el.geometry.filter((g) => Number.isFinite(g?.lat) && Number.isFinite(g?.lon));
    const pts = geo.map((g) => geoToPlan(g, origin, northDeg, anchor));
    if (tags.building && tags.building !== 'no') {
      const a = geo[0];
      const b = geo[geo.length - 1];
      if (geo.length < 4 || a.lat !== b.lat || a.lon !== b.lon) continue;
      const ring = pts.slice(0, -1);
      const centre = {
        x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
        y: ring.reduce((s, p) => s + p.y, 0) / ring.length,
      };
      if (skipInside && skipInside.length >= 3 && pointInPolygon(centre, skipInside)) continue;
      const levels = Number(tags['building:levels']);
      const m = heightTagM(tags.height) ?? (levels > 0 ? levels * 3 : 6);
      out.push({ kind: 'building', points: ring, heightMm: Math.round(m * 1000) });
    } else if (tags.highway && pts.length >= 2) {
      // A slip road (motorway_link and the like) is as wide as the road it joins.
      const width = ROAD_WIDTH_M[tags.highway.replace(/_link$/, '')] ?? 2;
      const road: (typeof out)[number] = { kind: 'road', points: pts, widthMm: width * 1000 };
      if (tags.name) road.name = tags.name;
      out.push(road);
    }
  }
  return out;
}

/** Satellite (SRTM) heights come from the free "terrarium" tiles on AWS open data. */
export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

/** Height in metres of a terrarium pixel. */
export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Tile pixels across. */
const TILE = 256;

/** Where a point is in the whole web map at a zoom, in tiles (fractional). */
function tileXY(p: LatLon, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const lat = (p.lat * Math.PI) / 180;
  return {
    x: ((p.lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n,
  };
}

/** The web-map tile holding a point at a zoom, and the pixel in it (256 px tiles, slippy-map numbering). */
export function tileOf(p: LatLon, zoom: number): { x: number; y: number; px: number; py: number } {
  const t = tileXY(p, zoom);
  const x = Math.floor(t.x);
  const y = Math.floor(t.y);
  return { x, y, px: Math.floor((t.x - x) * TILE), py: Math.floor((t.y - y) * TILE) };
}

/** A height lookup over decoded terrarium tiles (RGBA pixels, 256 × 256 each): bilinear between pixel centres, null off the tiles. */
export function heightLookup(
  tiles: { x: number; y: number; zoom: number; data: Uint8ClampedArray }[],
): (p: LatLon) => number | null {
  const byKey = new Map(tiles.map((t) => [`${t.zoom}/${t.x}/${t.y}`, t.data]));
  const zoom = tiles[0]?.zoom ?? 0;
  /** The height of one pixel, counted across the whole map, or null where there is no tile. */
  const pixel = (i: number, j: number): number | null => {
    const tx = Math.floor(i / TILE);
    const ty = Math.floor(j / TILE);
    const data = byKey.get(`${zoom}/${tx}/${ty}`);
    if (!data) return null;
    const k = ((j - ty * TILE) * TILE + (i - tx * TILE)) * 4;
    return terrariumHeight(data[k], data[k + 1], data[k + 2]);
  };
  return (p) => {
    if (!tiles.length) return null;
    const t = tileXY(p, zoom);
    const u = t.x * TILE - 0.5;
    const v = t.y * TILE - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fx = u - i;
    const fy = v - j;
    let sum = 0;
    let weight = 0;
    for (const [di, dj, w] of [
      [0, 0, (1 - fx) * (1 - fy)],
      [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy],
      [1, 1, fx * fy],
    ]) {
      const h = pixel(i + di, j + dj);
      if (h === null || w === 0) continue;
      sum += h * w;
      weight += w;
    }
    // At the edge of the tiles fetched, the pixels there are used alone.
    return weight > 0 ? sum / weight : null;
  };
}

/** Approximate levels on a square grid `stepM` apart, `halfM` each way round `centre` (a plan point), from a height lookup (metres above sea, or null where there is none); each is in mm above the height at `datum` (a plan point: the middle of the plot's road side), so the datum stays ±0. Returns [] when the datum's height is unknown. */
export function satelliteLevels(
  heightAt: (p: LatLon) => number | null,
  origin: LatLon,
  northDeg: number,
  anchor: Point,
  centre: Point,
  datum: Point,
  halfM: number,
  stepM: number,
): { x: number; y: number; zMm: number }[] {
  const h0 = heightAt(planToGeo(datum, origin, northDeg, anchor));
  if (h0 === null || !(stepM > 0)) return [];
  const n = Math.floor(halfM / stepM + 1e-9);
  const step = stepM * UNITS_PER_M;
  const out: { x: number; y: number; zMm: number }[] = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const p = { x: centre.x + i * step, y: centre.y + j * step };
      const h = heightAt(planToGeo(p, origin, northDeg, anchor));
      if (h !== null) out.push({ ...p, zMm: Math.round((h - h0) * 1000) });
    }
  }
  return out;
}

/** Fetch buildings and roads round a location from OpenStreetMap (browser only). */
export async function fetchContext(at: LatLon, radiusM: number): Promise<unknown> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(overpassQuery(at, radiusM)),
  });
  if (res.status === 429 || res.status === 504) {
    throw new Error('OpenStreetMap is busy just now. Try again in a minute.');
  }
  if (!res.ok) throw new Error(`OpenStreetMap could not be reached (error ${res.status}).`);
  return res.json();
}

/** Zoom of the satellite height tiles: about 10 m a pixel at the equator. */
const HEIGHT_ZOOM = 14;

/** Decode a PNG into RGBA pixels through a canvas. */
async function decodePng(blob: Blob): Promise<Uint8ClampedArray> {
  const img = await createImageBitmap(blob);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(img.width, img.height)
      : Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('The satellite heights could not be read on this computer.');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height).data;
}

/** A height lookup from satellite tiles round a location (browser only): fetches the zoom-14 tiles covering halfM round the point (at most 4), decodes them through a canvas (createImageBitmap + OffscreenCanvas or a document canvas), and answers by bilinear interpolation of the pixels. */
export async function fetchHeights(at: LatLon, halfM: number): Promise<(p: LatLon) => number | null> {
  const cosLat = Math.cos((at.lat * Math.PI) / 180);
  // Kept under half a tile each way, so the area spans at most 2 × 2 tiles.
  const tileM = (40075016.686 * cosLat) / 2 ** HEIGHT_ZOOM;
  const half = Math.min(halfM, 0.45 * tileM);
  const dLat = half / M_PER_DEG_LAT;
  const dLon = half / (M_PER_DEG_LON * cosLat);
  const nw = tileOf({ lat: at.lat + dLat, lon: at.lon - dLon }, HEIGHT_ZOOM);
  const se = tileOf({ lat: at.lat - dLat, lon: at.lon + dLon }, HEIGHT_ZOOM);
  const wanted: { x: number; y: number }[] = [];
  for (let y = nw.y; y <= se.y; y++) for (let x = nw.x; x <= se.x; x++) wanted.push({ x, y });
  const tiles = await Promise.all(
    wanted.map(async ({ x, y }) => {
      const res = await fetch(`${TERRARIUM_URL}/${HEIGHT_ZOOM}/${x}/${y}.png`);
      if (!res.ok) throw new Error(`The satellite heights could not be downloaded (error ${res.status}).`);
      return { x, y, zoom: HEIGHT_ZOOM, data: await decodePng(await res.blob()) };
    }),
  );
  return heightLookup(tiles);
}
