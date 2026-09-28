import { describe, expect, it } from 'vitest';
import {
  contextFromOverpass,
  geoToPlan,
  heightLookup,
  overpassQuery,
  parseLocation,
  planToGeo,
  satelliteLevels,
  terrariumHeight,
  tileOf,
  type LatLon,
} from './online';

const isb: LatLon = { lat: 33.6844, lon: 73.0479 };
const anchor = { x: 1000, y: 2000 };

describe('parseLocation', () => {
  it('reads a typed pair with a comma or a space', () => {
    expect(parseLocation('33.6844, 73.0479')).toEqual(isb);
    expect(parseLocation(' 33.6844 73.0479 ')).toEqual(isb);
    expect(parseLocation('-33.9,-70.5')).toEqual({ lat: -33.9, lon: -70.5 });
  });

  it('reads each form of Google Maps link', () => {
    expect(parseLocation('https://www.google.com/maps/@33.6844,73.0479,17z')).toEqual(isb);
    expect(parseLocation('https://maps.google.com/?q=33.6844,73.0479')).toEqual(isb);
    expect(parseLocation('https://maps.google.com/maps?ll=33.6844,73.0479&z=16')).toEqual(isb);
    expect(parseLocation('https://www.google.com/maps/search/?api=1&query=33.6844%2C73.0479')).toEqual(isb);
    // The place pin wins over the map's centre.
    expect(
      parseLocation('https://www.google.com/maps/place/F-7/@33.7,73.0,15z/data=!3m1!4b1!4m6!3m5!3d33.6844!4d73.0479'),
    ).toEqual(isb);
  });

  it('gives null for text with no location or one out of range', () => {
    expect(parseLocation('House 12, Street 5, F-7/2')).toBeNull();
    expect(parseLocation('')).toBeNull();
    expect(parseLocation('95, 73')).toBeNull();
    expect(parseLocation('33, 190')).toBeNull();
  });
});

describe('geoToPlan and planToGeo', () => {
  it('puts the origin at the anchor and goes back the same way', () => {
    expect(geoToPlan(isb, isb, 30, anchor)).toEqual(anchor);
    const p = { lat: 33.6861, lon: 73.0452 };
    const back = planToGeo(geoToPlan(p, isb, 37, anchor), isb, 37, anchor);
    expect(back.lat).toBeCloseTo(p.lat, 9);
    expect(back.lon).toBeCloseTo(p.lon, 9);
  });

  it('puts 100 m north 10,000 plan units up the page, or to the right when north is 90°', () => {
    const north = { lat: isb.lat + 100 / 110574, lon: isb.lon };
    const up = geoToPlan(north, isb, 0, anchor);
    expect(up.x).toBeCloseTo(anchor.x);
    expect(up.y).toBeCloseTo(anchor.y - 10000);
    const right = geoToPlan(north, isb, 90, anchor);
    expect(right.x).toBeCloseTo(anchor.x + 10000);
    expect(right.y).toBeCloseTo(anchor.y);
  });

  it('scales longitude by the cosine of the latitude', () => {
    const east = { lat: isb.lat, lon: isb.lon + 100 / (111320 * Math.cos((isb.lat * Math.PI) / 180)) };
    expect(geoToPlan(east, isb, 0, anchor).x).toBeCloseTo(anchor.x + 10000);
  });
});

describe('overpassQuery', () => {
  it('asks for buildings and roads round the point with geometry', () => {
    const q = overpassQuery(isb, 150);
    expect(q).toContain('way["building"](around:150,33.6844,73.0479)');
    expect(q).toContain('way["highway"](around:150,33.6844,73.0479)');
    expect(q).toContain('out geom');
  });
});

describe('contextFromOverpass', () => {
  /** A square way of side 2·d metres centred `dn` metres north of the site. */
  const square = (dn: number, d = 5) => {
    const lat = isb.lat + dn / 110574;
    const dLat = d / 110574;
    const dLon = d / (111320 * Math.cos((isb.lat * Math.PI) / 180));
    const ring = [
      { lat: lat - dLat, lon: isb.lon - dLon },
      { lat: lat - dLat, lon: isb.lon + dLon },
      { lat: lat + dLat, lon: isb.lon + dLon },
      { lat: lat + dLat, lon: isb.lon - dLon },
    ];
    return [...ring, ring[0]];
  };
  const json = {
    elements: [
      { type: 'way', id: 1, tags: { building: 'yes', height: '9 m' }, geometry: square(50) },
      { type: 'way', id: 2, tags: { building: 'house', 'building:levels': '3' }, geometry: square(-50) },
      { type: 'way', id: 3, tags: { building: 'yes' }, geometry: square(100) },
      { type: 'way', id: 4, tags: { building: 'yes', height: "40'" }, geometry: square(0) },
      {
        type: 'way',
        id: 5,
        tags: { highway: 'residential', name: 'Street 21' },
        geometry: [
          { lat: isb.lat, lon: isb.lon - 0.001 },
          { lat: isb.lat, lon: isb.lon + 0.001 },
        ],
      },
      { type: 'relation', id: 6, tags: { building: 'yes' }, members: [] },
      { type: 'node', id: 7, lat: isb.lat, lon: isb.lon, tags: { highway: 'street_lamp' } },
      { type: 'way', id: 8, tags: {}, geometry: square(200) },
    ],
  };
  // The plot: 10,000 units (100 m) square round the anchor.
  const plot = [
    { x: anchor.x - 500, y: anchor.y - 500 },
    { x: anchor.x + 500, y: anchor.y - 500 },
    { x: anchor.x + 500, y: anchor.y + 500 },
    { x: anchor.x - 500, y: anchor.y + 500 },
  ];
  const out = contextFromOverpass(json, isb, 0, anchor, plot);

  it('keeps buildings outside the plot with their heights', () => {
    const buildings = out.filter((c) => c.kind === 'building');
    expect(buildings.map((b) => b.heightMm)).toEqual([9000, 9000, 6000]);
    expect(buildings[0].points).toHaveLength(4);
    // 50 m north: 5000 units up the page.
    const cy = buildings[0].points.reduce((s, p) => s + p.y, 0) / 4;
    expect(cy).toBeCloseTo(anchor.y - 5000, 0);
  });

  it('keeps roads with their width and name, and ignores relations and nodes', () => {
    const roads = out.filter((c) => c.kind === 'road');
    expect(roads).toHaveLength(1);
    expect(roads[0]).toMatchObject({ widthMm: 6000, name: 'Street 21' });
    expect(roads[0].points).toHaveLength(2);
    expect(out).toHaveLength(4);
  });

  it('reads heights in feet and gives other roads their widths', () => {
    const [b, r1, r2] = contextFromOverpass(
      {
        elements: [
          { type: 'way', tags: { building: 'yes', height: '40 ft' }, geometry: square(0) },
          { type: 'way', tags: { highway: 'primary' }, geometry: square(0).slice(0, 2) },
          { type: 'way', tags: { highway: 'footway' }, geometry: square(0).slice(0, 2) },
        ],
      },
      isb,
      0,
      anchor,
    );
    expect(b.heightMm).toBe(12192);
    expect(r1.widthMm).toBe(12000);
    expect(r2.widthMm).toBe(2000);
    expect(r2.name).toBeUndefined();
  });

  it('gives nothing for an answer that is not Overpass JSON', () => {
    expect(contextFromOverpass(null, isb, 0, anchor)).toEqual([]);
    expect(contextFromOverpass({ foo: 1 }, isb, 0, anchor)).toEqual([]);
  });
});

describe('satellite heights', () => {
  it('decodes terrarium pixels', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(130, 28, 128)).toBe(540.5);
    expect(terrariumHeight(127, 255, 0)).toBe(-1);
  });

  it('finds the tile and pixel of a point', () => {
    const n = 2 ** 14;
    const x = ((isb.lon + 180) / 360) * n;
    const y = ((1 - Math.asinh(Math.tan((isb.lat * Math.PI) / 180)) / Math.PI) / 2) * n;
    expect(tileOf(isb, 14)).toEqual({
      x: Math.floor(x),
      y: Math.floor(y),
      px: Math.floor((x % 1) * 256),
      py: Math.floor((y % 1) * 256),
    });
    expect(tileOf(isb, 14)).toEqual({ x: 11516, y: 6562, px: 125, py: 47 });
    expect(tileOf({ lat: 0, lon: 0 }, 1)).toEqual({ x: 1, y: 1, px: 0, py: 0 });
  });

  /** A terrarium tile whose height is 500 m plus 0.1 m per pixel to the right. */
  const slopeTile = (x: number, y: number, zoom: number) => {
    const data = new Uint8ClampedArray(256 * 256 * 4);
    for (let j = 0; j < 256; j++) {
      for (let i = 0; i < 256; i++) {
        const h = 500 + 0.1 * i + 32768;
        const k = (j * 256 + i) * 4;
        data[k] = Math.floor(h / 256);
        data[k + 1] = Math.floor(h % 256);
        data[k + 2] = Math.round((h % 1) * 256);
        data[k + 3] = 255;
      }
    }
    return { x, y, zoom, data };
  };

  it('looks heights up between pixels, and gives null off the tiles', () => {
    const t = tileOf(isb, 14);
    const lookup = heightLookup([slopeTile(t.x, t.y, 14)]);
    // Pixel centres are at +0.5: halfway between pixel 125 and the next is the edge of pixel 125 plus 0.5.
    const n = 2 ** 14;
    const lonAt = (px: number) => ((t.x + px / 256) / n) * 360 - 180;
    expect(lookup({ lat: isb.lat, lon: lonAt(125.5) })).toBeCloseTo(512.5, 1);
    expect(lookup({ lat: isb.lat, lon: lonAt(126) })).toBeCloseTo(512.55, 1);
    expect(lookup({ lat: isb.lat, lon: isb.lon + 1 })).toBeNull();
    expect(heightLookup([])(isb)).toBeNull();
  });

  it('gives levels on a grid relative to the datum', () => {
    // A plane rising 1 m per 10 m to the north.
    const plane = (p: LatLon) => 500 + ((p.lat - isb.lat) * 110574) / 10;
    const datum = { x: anchor.x, y: anchor.y + 1000 }; // 10 m south of the site
    const levels = satelliteLevels(plane, isb, 0, anchor, anchor, datum, 20, 5);
    expect(levels).toHaveLength(81);
    const at = (x: number, y: number) => levels.find((l) => Math.abs(l.x - x) < 1e-6 && Math.abs(l.y - y) < 1e-6);
    expect(at(anchor.x, anchor.y)?.zMm).toBe(1000);
    expect(at(anchor.x + 500, anchor.y + 1000)?.zMm).toBe(0);
    expect(at(anchor.x, anchor.y - 2000)?.zMm).toBe(3000);
  });

  it('gives no levels when the datum height is unknown', () => {
    expect(satelliteLevels(() => null, isb, 0, anchor, anchor, anchor, 20, 5)).toEqual([]);
  });
});
