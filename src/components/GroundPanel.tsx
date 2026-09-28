import { useMemo, useState } from 'react';
import { formatLevel } from '../lib/drawings/levels';
import { groundOf, surveyItems } from '../lib/terrain/ground';
import { siteEarthworks } from '../lib/terrain/groundView';
import {
  levelRange,
  parseSurveyCsv,
  parseSurveyDxf,
  placeSurvey,
  type SurveyRow,
  type SurveyUnits,
} from '../lib/terrain/importSurvey';
import {
  contextFromOverpass,
  fetchContext,
  fetchHeights,
  parseLocation,
  satelliteLevels,
  type LatLon,
} from '../lib/terrain/online';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { GROUND_LEVEL, levelOf, type PlanDoc, type Plot, type Point } from '../types';
import { LengthField } from './LengthField';

const box = 'flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs';
const btn = 'm-btn px-2 py-0.5';
/** Heights of the ground are kept within a kilometre of the road level. */
const MAX_GROUND_MM = 1_000_000;
const CFT_PER_M3 = 35.3147;
/** How far round the plot the surroundings are fetched (m). */
const CONTEXT_RADIUS_M = 150;

const INTERVALS = {
  imperial: [
    { mm: 152.4, label: '6"' },
    { mm: 304.8, label: "1'" },
    { mm: 609.6, label: "2'" },
    { mm: 1524, label: "5'" },
  ],
  metric: [
    { mm: 250, label: '0.25 m' },
    { mm: 500, label: '0.5 m' },
    { mm: 1000, label: '1 m' },
    { mm: 2000, label: '2 m' },
  ],
};

/** The plot on the ground floor, if any. */
const plotOf = (doc: PlanDoc) =>
  doc.elements.find((el): el is Plot => el.type === 'plot' && levelOf(el) === GROUND_LEVEL) ?? null;

const centreOf = (pts: Point[]) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

/** Where the site's location lands on the plan (the middle of the plot) and the datum (the middle of its road side). */
function siteAnchors(doc: PlanDoc): { anchor: Point; datum: Point; radiusM: number } {
  const plot = plotOf(doc);
  if (!plot || plot.points.length < 3) return { anchor: { x: 0, y: 0 }, datum: { x: 0, y: 0 }, radiusM: 20 };
  const anchor = centreOf(plot.points);
  const a = plot.points[plot.front];
  const b = plot.points[(plot.front + 1) % plot.points.length];
  const radius = Math.max(...plot.points.map((p) => Math.hypot(p.x - anchor.x, p.y - anchor.y))) / 100;
  return { anchor, datum: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, radiusM: radius };
}

/** Options for the Spot level, Contour and Levelled area tools. */
export function GroundToolOptions() {
  const tool = usePlanner((s) => s.tool);
  const groundMm = usePlanner((s) => s.site.groundMm);
  const setSite = usePlanner((s) => s.setSite);
  const units = usePlanner((s) => s.units);
  const padUnderHouse = usePlanner((s) => s.padUnderHouse);
  return (
    <div className={box}>
      {tool === 'pad' ? (
        <>
          <div className="text-muted">
            Drag out an area to level. It takes the natural ground’s height at its middle; change it on the right once
            drawn.
          </div>
          <button className={btn} onClick={() => padUnderHouse()}>
            Level round the house
          </button>
        </>
      ) : (
        <>
          <LengthField
            id="ground-tool-height"
            label={tool === 'contour' ? 'Height of the next contour line' : 'Height of the next spot level'}
            mm={groundMm}
            units={units}
            min={-MAX_GROUND_MM}
            onCommit={(mm) => setSite({ groundMm: Math.min(mm, MAX_GROUND_MM) })}
          />
          <div className="text-muted">
            Heights count from the road level at the middle of the plot’s road side (±0). Type a minus sign for below
            it.
          </div>
        </>
      )}
    </div>
  );
}

interface PendingSurvey {
  name: string;
  points: SurveyRow[];
  contours: { points: { a: number; b: number }[]; z: number; closed?: boolean }[];
  dxf: boolean;
  skipped: number;
  units: SurveyUnits;
  order: 'EN' | 'NE';
  datum: string;
}

/** The import form: how to read the survey's numbers, then place it on the plot. */
function SurveyImport({ pending, onDone }: { pending: PendingSurvey; onDone: () => void }) {
  const [p, setP] = useState(pending);
  const range = levelRange([...p.points.map((q) => q.z), ...p.contours.map((c) => c.z)]);
  const datum = Number(p.datum);
  const place = () => {
    const s = plannerStore.getState();
    const { anchor } = siteAnchors(s.doc);
    const placed = placeSurvey(p.points, p.contours, {
      units: p.units,
      order: p.order,
      datum: Number.isFinite(datum) ? datum : (range?.min ?? 0),
      anchor,
      northDeg: s.doc.northDeg ?? 0,
    });
    s.importSurvey(placed.levels, placed.contours);
    s.setWarning(
      `Imported ${placed.levels.length} spot levels and ${placed.contours.length} contour lines, grouped and selected. Line them up with Move (M) and Rotate (R).`,
    );
    onDone();
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-sm bg-canvas p-1.5" data-testid="survey-import">
      <div className="font-medium">{p.name}</div>
      <div>
        {p.points.length} points{p.contours.length ? `, ${p.contours.length} contour lines` : ''}
        {range ? `, levels ${range.min} to ${range.max}` : ''}
        {p.skipped ? ` (${p.skipped} lines could not be read)` : ''}
      </div>
      <label className="flex items-center justify-between gap-2">
        The numbers are in
        <select
          aria-label="Survey units"
          value={p.units}
          onChange={(e) => setP({ ...p, units: e.target.value as SurveyUnits })}
          className="rounded-sm border p-0.5"
        >
          <option value="m">metres</option>
          <option value="ft">feet</option>
          <option value="mm">millimetres</option>
          <option value="cm">centimetres</option>
          <option value="in">inches</option>
        </select>
      </label>
      {!p.dxf && (
        <label className="flex items-center justify-between gap-2">
          Columns
          <select
            aria-label="Column order"
            value={p.order}
            onChange={(e) => setP({ ...p, order: e.target.value as 'EN' | 'NE' })}
            className="rounded-sm border p-0.5"
          >
            <option value="EN">easting, northing, level</option>
            <option value="NE">northing, easting, level</option>
          </select>
        </label>
      )}
      <label className="flex items-center justify-between gap-2">
        Road level (±0) in the survey
        <input
          aria-label="Survey datum"
          value={p.datum}
          onChange={(e) => setP({ ...p, datum: e.target.value })}
          className="w-20 rounded-sm border p-0.5"
        />
      </label>
      <div className="text-muted">
        The survey goes on the middle of the plot, with its north along the plan’s north. Levels become heights above
        the road level.
      </div>
      <div className="flex gap-2">
        <button className={`${btn} m-btn-primary`} onClick={place}>
          Place survey
        </button>
        <button className={btn} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Read a survey file into the import form, or say why it can't be. */
async function readSurvey(file: File): Promise<PendingSurvey | string> {
  const text = await file.text();
  const dxf = /\.dxf$/i.test(file.name) || /^\s*0\s*\r?\n\s*SECTION/.test(text);
  if (dxf) {
    const d = parseSurveyDxf(text);
    if (!d.points.length && !d.contours.length)
      return 'No survey points or contour lines were found in that DXF (they need a height: 3D points, or polylines at an elevation).';
    const all = [...d.points.map((q) => q.z), ...d.contours.map((c) => c.z)];
    return {
      name: file.name,
      points: d.points.map((q) => ({ a: q.x, b: q.y, z: q.z })),
      contours: d.contours.map((c) => ({ ...c, points: c.points.map((q) => ({ a: q.x, b: q.y })) })),
      dxf: true,
      skipped: 0,
      units: d.units ?? 'm',
      order: 'EN',
      datum: String(levelRange(all)?.min ?? 0),
    };
  }
  const { rows, skipped } = parseSurveyCsv(text);
  if (!rows.length) return 'No survey points were found. The file needs rows of x, y and level, one point per line.';
  return {
    name: file.name,
    points: rows,
    contours: [],
    dxf: false,
    skipped,
    units: 'm',
    order: 'EN',
    datum: String(levelRange(rows.map((r) => r.z))?.min ?? 0),
  };
}

/** The angle (degrees) to turn north by so the nearest road runs along the plot's road side, if it is a few degrees off. */
function northFix(doc: PlanDoc): { deg: number; road: string } | null {
  const plot = plotOf(doc);
  if (!plot) return null;
  const { datum } = siteAnchors(doc);
  const a = plot.points[plot.front];
  const b = plot.points[(plot.front + 1) % plot.points.length];
  let best: { d: number; angle: number; name: string } | null = null;
  for (const el of doc.elements) {
    if (el.type !== 'context' || el.kind !== 'road') continue;
    for (let i = 0; i + 1 < el.points.length; i++) {
      const p = el.points[i];
      const q = el.points[i + 1];
      const d = Math.hypot((p.x + q.x) / 2 - datum.x, (p.y + q.y) / 2 - datum.y);
      if (!best || d < best.d)
        best = { d, angle: Math.atan2(q.y - p.y, q.x - p.x), name: el.name ?? 'the nearest road' };
    }
  }
  if (!best) return null;
  let deg = ((Math.atan2(b.y - a.y, b.x - a.x) - best.angle) * 180) / Math.PI;
  // A road runs both ways: take the smaller turn.
  deg = ((((deg + 90) % 180) + 180) % 180) - 90;
  const rounded = Math.round(deg);
  return Math.abs(rounded) >= 1 && Math.abs(rounded) <= 45 ? { deg: rounded, road: best.name } : null;
}

/** Turn the map items round the site's anchor as north turns by `deg` (clockwise on the page). */
function turnNorth(deg: number) {
  const s = plannerStore.getState();
  const { anchor } = siteAnchors(s.doc);
  const t = (deg * Math.PI) / 180;
  const turn = (p: Point) => {
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    return { x: anchor.x + dx * Math.cos(t) - dy * Math.sin(t), y: anchor.y + dx * Math.sin(t) + dy * Math.cos(t) };
  };
  const context = s.doc.elements.flatMap((el) =>
    el.type === 'context'
      ? [{ kind: el.kind, points: el.points.map(turn), heightMm: el.heightMm, widthMm: el.widthMm, name: el.name }]
      : [],
  );
  const approx = s.doc.elements.flatMap((el) =>
    el.type === 'level' && el.approx ? [{ ...turn(el), zMm: el.zMm }] : [],
  );
  s.beginBatch();
  s.setNorthDeg(((((s.doc.northDeg ?? 0) + deg) % 360) + 360) % 360);
  s.setContext(
    context.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as typeof c),
  );
  if (approx.length) s.setSatelliteLevels(approx);
  s.endBatch();
}

/** The ground and the site: the survey, how the plot is levelled, contours, cut and fill, and the site's location. */
export function GroundPanel() {
  const doc = usePlanner((s) => s.doc);
  const units = usePlanner((s) => s.units);
  const setGround = usePlanner((s) => s.setGround);
  const setLayerFlags = usePlanner((s) => s.setLayerFlags);
  const padUnderHouse = usePlanner((s) => s.padUnderHouse);
  const metric = units === 'metric';
  const ground = groundOf(doc);
  const earth = useMemo(() => siteEarthworks(ground), [ground]);
  const survey = surveyItems(doc);
  const approx = doc.elements.filter((el) => el.type === 'level' && el.approx).length;
  const context = doc.elements.filter((el) => el.type === 'context').length;
  const [pending, setPending] = useState<PendingSurvey | null>(null);
  const [place, setPlace] = useState(doc.location ? `${doc.location.lat}, ${doc.location.lon}` : '');
  const [busy, setBusy] = useState<string | null>(null);
  const warn = (text: string) => plannerStore.getState().setWarning(text);
  const interval = doc.ground?.contourMm ?? (metric ? 500 : 304.8);
  const intervals = INTERVALS[metric ? 'metric' : 'imperial'];
  const fix = context ? northFix(doc) : null;

  const volume = (m3: number) =>
    metric ? `${m3.toFixed(1)} m³` : `${Math.round(m3 * CFT_PER_M3).toLocaleString()} cft`;

  async function openSurvey(file: File | undefined) {
    if (!file) return;
    const read = await readSurvey(file);
    if (typeof read === 'string') warn(read);
    else setPending(read);
  }

  function setLocation(text: string) {
    if (!text.trim()) return plannerStore.getState().setLocation(null);
    const at = parseLocation(text);
    if (!at) return warn('Type the latitude and longitude (e.g. 33.6844, 73.0479), or paste a Google Maps link.');
    plannerStore.getState().setLocation(at);
    setPlace(`${at.lat}, ${at.lon}`);
  }

  async function run(what: string, job: (at: LatLon) => Promise<string>) {
    const at = plannerStore.getState().doc.location;
    if (!at) return warn('Set the site location first: type its latitude and longitude, or paste a Google Maps link.');
    setBusy(what);
    try {
      warn(await job(at));
    } catch (e) {
      warn(e instanceof Error && e.message ? e.message : 'The internet could not be reached. Check the connection.');
    } finally {
      setBusy(null);
    }
  }

  const fetchSurroundings = () =>
    run('context', async (at) => {
      const s = plannerStore.getState();
      const { anchor } = siteAnchors(s.doc);
      const plot = plotOf(s.doc);
      const json = await fetchContext(at, CONTEXT_RADIUS_M);
      const items = contextFromOverpass(json, at, s.doc.northDeg ?? 0, anchor, plot?.points);
      plannerStore.getState().setContext(items);
      const buildings = items.filter((i) => i.kind === 'building').length;
      return items.length
        ? `Added ${buildings} buildings and ${items.length - buildings} roads from OpenStreetMap, on the Surroundings layer.`
        : 'OpenStreetMap has no buildings or roads drawn round this location.';
    });

  const fetchLevels = () =>
    run('levels', async (at) => {
      const s = plannerStore.getState();
      const { anchor, datum, radiusM } = siteAnchors(s.doc);
      const halfM = Math.max(40, radiusM + 20);
      const heightAt = await fetchHeights(at, halfM);
      const levels = satelliteLevels(heightAt, at, s.doc.northDeg ?? 0, anchor, anchor, datum, halfM, 10);
      plannerStore.getState().setSatelliteLevels(levels);
      return levels.length
        ? `Added ${levels.length} approximate levels from satellite data (about 30 m accurate across, a few metres up and down). A survey wins where both exist.`
        : 'No satellite heights were found for this location.';
    });

  return (
    <div className="flex flex-col gap-3 text-xs" data-testid="ground-panel">
      <div className="text-muted">Heights count from the road level at the middle of the plot’s road side (±0).</div>

      <div className="flex flex-col gap-1.5">
        <div className="font-medium">Survey</div>
        <div data-testid="survey-count">
          {survey.length
            ? `${survey.filter((el) => el.type === 'level').length} spot levels, ${survey.filter((el) => el.type === 'contour').length} contour lines`
            : 'No levels yet: the ground is flat at ±0.'}
          {approx ? `; ${approx} approximate` : ''}
          {ground.shaped && ground.natural.points.length
            ? `. Ground from ${formatLevel(Math.min(...ground.natural.points.map((p) => p.z)), units)} to ${formatLevel(Math.max(...ground.natural.points.map((p) => p.z)), units)}.`
            : ''}
        </div>
        <label className={`${btn} cursor-pointer text-center`}>
          Import survey (CSV or DXF)…
          <input
            type="file"
            accept=".csv,.txt,.dxf"
            data-testid="survey-file"
            className="hidden"
            onChange={(e) => {
              void openSurvey(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {pending && <SurveyImport pending={pending} onDone={() => setPending(null)} />}
        {survey.length > 0 && (
          <button
            className={btn}
            onClick={() => {
              plannerStore.getState().clearSurvey();
              plannerStore.getState().setSelection([]);
            }}
          >
            Remove the survey
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="font-medium">Finished ground</div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Finished ground">
          <button className={btn} aria-pressed={ground.levelled} onClick={() => setGround({ grade: 'level' })}>
            Level the plot
          </button>
          <button className={btn} aria-pressed={!ground.levelled} onClick={() => setGround({ grade: 'natural' })}>
            Leave it natural
          </button>
        </div>
        {ground.levelled && (
          <LengthField
            id="ground-level-height"
            label="Level the plot to (above road level)"
            mm={ground.levelMm}
            units={units}
            min={-MAX_GROUND_MM}
            onCommit={(mm) => setGround({ levelMm: Math.min(mm, MAX_GROUND_MM) })}
          />
        )}
        {ground.levelled && ground.levelMm > doc.plinthMm - 150 && (
          <div className="text-danger" data-testid="level-above-floor">
            The plot is levelled within {metric ? '150 mm' : '6"'} of the ground floor (
            {formatLevel(doc.plinthMm, units)}) or above it, so the ground would cover the floor. Raise the plinth
            (Settings) or level the plot lower.
          </div>
        )}
        <button className={btn} onClick={() => padUnderHouse()}>
          Level round the house (a pad)
        </button>
        {ground.graded && (
          <div data-testid="earthworks">
            Cut {volume(earth.cutM3)}, fill {volume(earth.fillM3)}
            {earth.cutM3 > earth.fillM3 ? `; ${volume(earth.cutM3 - earth.fillM3)} to cart away` : ''}.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="font-medium">On the plan</div>
        <label className="flex items-center justify-between gap-2">
          Contour every
          <select
            aria-label="Contour interval"
            value={intervals.some((i) => Math.abs(i.mm - interval) < 0.01) ? interval : ''}
            onChange={(e) => setGround({ contourMm: Number(e.target.value) })}
            className="rounded-sm border p-0.5"
          >
            {!intervals.some((i) => Math.abs(i.mm - interval) < 0.01) && <option value="">{interval} mm</option>}
            {intervals.map((i) => (
              <option key={i.mm} value={i.mm}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!doc.layers?.terrain?.hidden}
            onChange={(e) => setLayerFlags('terrain', { hidden: !e.currentTarget.checked })}
          />
          Show ground levels and contours
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={doc.ground?.cutFill !== false}
            onChange={(e) => setGround({ cutFill: e.currentTarget.checked })}
          />
          Show cut (red) and fill (blue)
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="font-medium">Site location (needs the internet)</div>
        <input
          aria-label="Site location"
          value={place}
          placeholder="33.6844, 73.0479 or a Google Maps link"
          onChange={(e) => setPlace(e.target.value)}
          onBlur={(e) => setLocation(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="rounded-sm border p-1"
        />
        <div className="flex flex-wrap gap-1">
          <button className={btn} disabled={!!busy} onClick={fetchSurroundings}>
            {busy === 'context' ? 'Fetching…' : context ? 'Fetch surroundings again' : 'Fetch surroundings'}
          </button>
          <button className={btn} disabled={!!busy} onClick={fetchLevels}>
            {busy === 'levels' ? 'Fetching…' : 'Fetch approximate levels'}
          </button>
        </div>
        {fix && (
          <div className="flex flex-col gap-1 rounded-sm bg-canvas p-1.5" data-testid="north-offer">
            <span>
              {fix.road} is {Math.abs(fix.deg)}° off the plot’s road side. Turn north by {fix.deg}° to line them up?
            </span>
            <button className={btn} onClick={() => turnNorth(fix.deg)}>
              Turn north {fix.deg > 0 ? 'clockwise' : 'anticlockwise'} {Math.abs(fix.deg)}°
            </button>
          </div>
        )}
        {(context > 0 || approx > 0) && (
          <div className="flex flex-wrap gap-1">
            {context > 0 && (
              <button className={btn} onClick={() => plannerStore.getState().setContext([])}>
                Remove surroundings
              </button>
            )}
            {approx > 0 && (
              <button className={btn} onClick={() => plannerStore.getState().setSatelliteLevels([])}>
                Remove approximate levels
              </button>
            )}
          </div>
        )}
        <div className="text-muted">
          Buildings and roads come from OpenStreetMap; approximate levels from satellite data (AWS open data). They are
          kept in the file, so the plan works offline afterwards.
        </div>
      </div>
    </div>
  );
}
