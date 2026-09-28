import { describe, expect, it } from 'vitest';
import { levelRange, parseSurveyCsv, parseSurveyDxf, placeSurvey, type Placement } from './importSurvey';

/** A DXF file with these group code / value pairs in its ENTITIES section, and an optional header. */
const dxf = (entities: (string | number)[], header: (string | number)[] = [], eol = '\n') =>
  [
    ...(header.length ? [0, 'SECTION', 2, 'HEADER', ...header, 0, 'ENDSEC'] : []),
    0,
    'SECTION',
    2,
    'BLOCKS',
    0,
    'BLOCK',
    2,
    'TREE',
    0,
    'POINT',
    10,
    999,
    20,
    999,
    30,
    999,
    0,
    'ENDBLK',
    0,
    'ENDSEC',
    0,
    'SECTION',
    2,
    'ENTITIES',
    ...entities,
    0,
    'ENDSEC',
    0,
    'EOF',
  ].join(eol);

describe('parseSurveyCsv', () => {
  it('reads PENZD rows under a header, dropping the point number and keeping the code', () => {
    const { rows, skipped } = parseSurveyCsv(
      'Point,Easting,Northing,Level,Code\n1,1000.5,2000.25,100.1,TBM\n2,1010,2005,99.8,TREE\n\n3,1020,2010,99.5,GL\n',
    );
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { a: 1000.5, b: 2000.25, z: 100.1, code: 'TBM' },
      { a: 1010, b: 2005, z: 99.8, code: 'TREE' },
      { a: 1020, b: 2010, z: 99.5, code: 'GL' },
    ]);
  });

  it('reads tab-separated rows with CRLF line ends', () => {
    const { rows } = parseSurveyCsv('P\tE\tN\tZ\r\n10\t5.5\t6.5\t1.25\r\n11\t7.5\t8.5\t1.5\r\n');
    expect(rows).toEqual([
      { a: 5.5, b: 6.5, z: 1.25 },
      { a: 7.5, b: 8.5, z: 1.5 },
    ]);
  });

  it('reads plain "x y z" rows separated by spaces', () => {
    const { rows, skipped } = parseSurveyCsv('x y z\n0 0 100\n10   0 100.5\n0 10 99.75');
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { a: 0, b: 0, z: 100 },
      { a: 10, b: 0, z: 100.5 },
      { a: 0, b: 10, z: 99.75 },
    ]);
  });

  it('reads semicolons and keeps a first column that is not a point number', () => {
    const { rows } = parseSurveyCsv('1000.5;2000.5;100;1\n1001.5;2001.5;101;1');
    expect(rows).toEqual([
      { a: 1000.5, b: 2000.5, z: 100 },
      { a: 1001.5, b: 2001.5, z: 101 },
    ]);
  });

  it('counts a line it cannot read as skipped', () => {
    const { rows, skipped } = parseSurveyCsv('1,0,0,100\n2,5,abc,100\n3,5,5\n4,10,10,101');
    expect(rows).toHaveLength(2);
    expect(skipped).toBe(2);
  });

  it('keeps the file order of the coordinates for NE files', () => {
    const { rows } = parseSurveyCsv('PNEZD\n1,3700000,500000,512.3,GL');
    expect(rows).toEqual([{ a: 3700000, b: 500000, z: 512.3, code: 'GL' }]);
    const placed = placeSurvey([...rows, { a: 3700010, b: 500000, z: 512.3 }], [], {
      units: 'm',
      order: 'NE',
      datum: 512.3,
      anchor: { x: 0, y: 0 },
      northDeg: 0,
    });
    // The second point is 10 m further north: 1000 plan units higher on the page.
    expect(placed.levels[1].y - placed.levels[0].y).toBeCloseTo(-1000);
    expect(placed.levels[1].x - placed.levels[0].x).toBeCloseTo(0);
  });
});

describe('parseSurveyDxf', () => {
  it('reads POINT and INSERT as points, ignoring blocks', () => {
    const r = parseSurveyDxf(
      dxf([0, 'POINT', 8, '0', 10, 1.5, 20, 2.5, 30, 100.25, 0, 'INSERT', 2, 'TREE', 10, 3, 20, 4, 30, 99]),
    );
    expect(r.points).toEqual([
      { x: 1.5, y: 2.5, z: 100.25 },
      { x: 3, y: 4, z: 99 },
    ]);
    expect(r.contours).toEqual([]);
    expect(r.units).toBeUndefined();
  });

  it('reads an LWPOLYLINE contour with its elevation and closed flag, with CRLF', () => {
    const r = parseSurveyDxf(
      dxf(
        [0, 'LWPOLYLINE', 90, 3, 70, 1, 38, 101.5, 10, 0, 20, 0, 10, 10, 20, 0, 10, 10, 20, 10],
        [9, '$INSUNITS', 70, 6],
        '\r\n',
      ),
    );
    expect(r.contours).toEqual([
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        z: 101.5,
        closed: true,
      },
    ]);
    expect(r.units).toBe('m');
  });

  it('reads R12 POLYLINEs: a flat 2D one and a flat 3D one as contours, a sloping 3D one as points', () => {
    const vertex = (x: number, y: number, z: number) => [0, 'VERTEX', 8, '0', 10, x, 20, y, 30, z];
    const r = parseSurveyDxf(
      dxf([
        ...[0, 'POLYLINE', 66, 1, 10, 0, 20, 0, 30, 98, 70, 0],
        ...vertex(0, 0, 0),
        ...vertex(5, 0, 0),
        ...[0, 'SEQEND'],
        ...[0, 'POLYLINE', 66, 1, 70, 9],
        ...vertex(0, 0, 97),
        ...vertex(5, 5, 97),
        ...vertex(0, 5, 97),
        ...[0, 'SEQEND'],
        ...[0, 'POLYLINE', 66, 1, 70, 8],
        ...vertex(1, 1, 90),
        ...vertex(2, 2, 91),
        ...[0, 'SEQEND'],
      ]),
    );
    expect(r.contours).toEqual([
      {
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        z: 98,
        closed: false,
      },
      {
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 0, y: 5 },
        ],
        z: 97,
        closed: true,
      },
    ]);
    expect(r.points).toEqual([
      { x: 1, y: 1, z: 90 },
      { x: 2, y: 2, z: 91 },
    ]);
  });

  it('reads a level LINE as a contour', () => {
    const r = parseSurveyDxf(dxf([0, 'LINE', 10, 0, 20, 0, 30, 50, 11, 3, 21, 4, 31, 50], [9, '$INSUNITS', 70, 2]));
    expect(r.contours).toEqual([
      {
        points: [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ],
        z: 50,
        closed: false,
      },
    ]);
    expect(r.units).toBe('ft');
  });

  it('reads millimetres and centimetres from $INSUNITS', () => {
    expect(parseSurveyDxf(dxf([], [9, '$INSUNITS', 70, 4])).units).toBe('mm');
    expect(parseSurveyDxf(dxf([], [9, '$INSUNITS', 70, 5])).units).toBe('cm');
    expect(parseSurveyDxf(dxf([], [9, '$INSUNITS', 70, 0])).units).toBeUndefined();
  });
});

describe('placeSurvey', () => {
  const base: Placement = { units: 'm', order: 'EN', datum: 100, anchor: { x: 500, y: 500 }, northDeg: 0 };
  // Two points 20 m apart north–south: the middle is between them.
  const rows = [
    { a: 50, b: 90, z: 100 },
    { a: 50, b: 110, z: 101.5 },
  ];

  it('puts north up the page when north is up', () => {
    const { levels } = placeSurvey(rows, [], base);
    expect(levels[1].x).toBeCloseTo(500);
    expect(levels[1].y).toBeCloseTo(500 - 1000);
    expect(levels[0].y).toBeCloseTo(500 + 1000);
  });

  it('puts north to the right when north is 90°', () => {
    const { levels } = placeSurvey(rows, [], { ...base, northDeg: 90 });
    expect(levels[1].x).toBeCloseTo(500 + 1000);
    expect(levels[1].y).toBeCloseTo(500);
  });

  it('measures levels above the datum in mm', () => {
    const { levels } = placeSurvey(rows, [], base);
    expect(levels.map((l) => l.zMm)).toEqual([0, 1500]);
  });

  it('scales feet', () => {
    const feet = [
      { a: 0, b: 0, z: 10 },
      { a: 0, b: 10, z: 12 },
    ];
    const { levels } = placeSurvey(feet, [], { ...base, units: 'ft', datum: 10 });
    expect(levels[1].y - levels[0].y).toBeCloseTo(-304.8);
    expect(levels[1].zMm).toBeCloseTo(609.6);
  });

  it('places contours and closes closed ones', () => {
    const { contours } = placeSurvey(
      [],
      [
        {
          points: [
            { a: 0, b: 0 },
            { a: 10, b: 0 },
            { a: 10, b: 10 },
          ],
          z: 101,
          closed: true,
        },
      ],
      { ...base, anchor: { x: 0, y: 0 } },
    );
    expect(contours[0].zMm).toBe(1000);
    expect(contours[0].points).toHaveLength(4);
    expect(contours[0].points[0].x).toBeCloseTo(-500);
    expect(contours[0].points[0].y).toBeCloseTo(500);
    expect(contours[0].points[3]).toEqual(contours[0].points[0]);
  });
});

describe('levelRange', () => {
  it('gives the lowest and highest level', () => {
    expect(levelRange([3, -1, 7.5, 2])).toEqual({ min: -1, max: 7.5 });
    expect(levelRange([])).toBeNull();
  });
});
