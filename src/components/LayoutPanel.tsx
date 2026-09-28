import { useMemo, useState } from 'react';
import { plotMeasures, plotRule } from '../lib/bylaws';
import { newId } from '../lib/ids';
import { basementOutline, buildLayout, layoutSite } from '../lib/layoutBuild';
import {
  DEFAULT_PROGRAM,
  generateLayouts,
  mirrorLayout,
  programArea,
  ROOM_NAMES,
  sizeOf,
  type Layout,
  type Program,
  type RoomKind,
  type SizedKind,
} from '../lib/layoutGen';
import { browserStorage } from '../lib/storage';
import { formatLength, MM_PER_FOOT } from '../lib/units';
import { MM_PER_UNIT, RETAINING_MM, usePlanner, plannerStore } from '../store/plannerStore';
import { SLAB_MM } from '../three/model';
import { isBasement, levelWallMm } from '../lib/levels';
import { GROUND_LEVEL, levelOf, type Plot, type Stair } from '../types';
import { LengthField } from './LengthField';

const PROGRAM_KEY = 'mimar.roomList';
const BASEMENT_KEY = 'mimar.basementList';

/** A basement's usual list: a hall, a servant room with its bath, a store and a stair. */
const BASEMENT_PROGRAM: Program = {
  ...DEFAULT_PROGRAM,
  basement: true,
  bedrooms: 0,
  attachedBaths: 0,
  drawing: false,
  dining: false,
  porch: false,
  prayer: false,
  gym: true,
  servant: true,
  store: true,
  laundry: true,
  powder: true,
  stair: true,
};

function loadProgram(basement: boolean): Program {
  const base = basement ? BASEMENT_PROGRAM : DEFAULT_PROGRAM;
  try {
    const saved = JSON.parse(browserStorage()?.getItem(basement ? BASEMENT_KEY : PROGRAM_KEY) ?? 'null');
    return saved && typeof saved === 'object' ? { ...base, ...saved, basement } : base;
  } catch {
    return base;
  }
}

function saveProgram(p: Program) {
  try {
    browserStorage()?.setItem(p.basement ? BASEMENT_KEY : PROGRAM_KEY, JSON.stringify(p));
  } catch {
    // Only a convenience.
  }
}

const BASEMENT_OPTIONAL: { key: keyof Program; label: string }[] = [
  { key: 'gym', label: 'Gym' },
  { key: 'servant', label: 'Servant room and bath' },
  { key: 'store', label: 'Store' },
  { key: 'laundry', label: 'Laundry' },
  { key: 'powder', label: 'Guest bath' },
  { key: 'stair', label: 'Stair up' },
];

const OPTIONAL: { key: keyof Program & SizedKind; label: string }[] = [
  { key: 'drawing', label: 'Drawing room' },
  { key: 'dining', label: 'Dining' },
  { key: 'porch', label: 'Car porch' },
  { key: 'stair', label: 'Stair (for a first floor)' },
  { key: 'powder', label: 'Guest bath' },
  { key: 'prayer', label: 'Prayer room' },
  { key: 'store', label: 'Store' },
  { key: 'laundry', label: 'Laundry' },
  { key: 'servant', label: 'Servant room' },
];

/** Soft colours for the room kinds in the small plan drawings. */
const FILL: Partial<Record<RoomKind, string>> = {
  master: '#dbeafe',
  bed: '#dbeafe',
  bath: '#cffafe',
  powder: '#cffafe',
  drawing: '#fde68a',
  lounge: '#fef3c7',
  dining: '#fef3c7',
  kitchen: '#fed7aa',
  porch: '#d9f99d',
  stair: '#e5e7eb',
  passage: '#f5f5f4',
};

const SHORT: Partial<Record<RoomKind, string>> = {
  master: 'Master',
  bed: 'Bed',
  bath: 'Bath',
  powder: 'Bath',
  drawing: 'Drawing',
  lounge: 'Lounge',
  dining: 'Dining',
  kitchen: 'Kitchen',
  porch: 'Porch',
  stair: 'Stair',
  passage: '',
  prayer: 'Prayer',
  store: 'Store',
  laundry: 'Laundry',
  servant: 'Servant',
};

/** A small drawing of a plan, the road at the bottom. */
function Thumb({ plan }: { plan: Layout }) {
  const { W, D } = plan;
  const font = Math.min(W, D) / 16;
  return (
    <svg viewBox={`${-W * 0.02} ${-D * 0.02} ${W * 1.04} ${D * 1.12}`} className="w-full" role="img" aria-label="Plan">
      {plan.rooms.map((room, i) =>
        room.rects.map((r, j) => (
          <rect
            key={`${i}-${j}`}
            x={r.x0}
            y={D - r.y1}
            width={r.x1 - r.x0}
            height={r.y1 - r.y0}
            fill={FILL[room.kind] ?? '#ede9fe'}
            stroke={j === 0 ? '#57534e' : 'none'}
            strokeWidth={Math.min(W, D) / 150}
          />
        )),
      )}
      {plan.rooms.map((room, i) => {
        const r = room.rects[0];
        // A basement's hall is its lounge.
        const label = room.kind === 'lounge' ? room.name : (SHORT[room.kind] ?? '');
        if (!label || r.x1 - r.x0 < font * label.length * 0.5) return null;
        return (
          <text
            key={`t${i}`}
            x={(r.x0 + r.x1) / 2}
            y={D - (r.y0 + r.y1) / 2}
            fontSize={font}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#292524"
          >
            {label}
          </text>
        );
      })}
      <text
        x={W / 2}
        y={D + font * 1.4}
        fontSize={font * 0.9}
        textAnchor="middle"
        fill="#78716c"
        letterSpacing={font / 5}
      >
        ROAD
      </text>
    </svg>
  );
}

/**
 * Plans from a room list: the rooms wanted, the area they need against what the plot allows, the
 * best three plans as small drawings with what could be better, and "Use this plan" to build one
 * on the floor being viewed.
 */
export function LayoutPanel() {
  const elements = usePlanner((s) => s.doc.elements);
  const selectedId = usePlanner((s) => s.selectedId);
  const units = usePlanner((s) => s.units);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const levels = usePlanner((s) => s.doc.levels);
  const activeLevel = usePlanner((s) => s.activeLevel);
  const inBasement = usePlanner((s) => isBasement(s.doc, s.activeLevel));
  const [programs, setPrograms] = useState<{ house: Program; basement: Program }>(() => ({
    house: loadProgram(false),
    basement: loadProgram(true),
  }));
  const program = inBasement ? programs.basement : programs.house;
  const [seed, setSeed] = useState(1);
  const [plans, setPlans] = useState<Layout[] | null>(null);
  const [mirrored, setMirrored] = useState<boolean[]>([]);
  const [confirm, setConfirm] = useState<number | null>(null);

  const setProgram = (p: Program) => {
    setPrograms((all) => (p.basement ? { ...all, basement: p } : { ...all, house: p }));
    saveProgram(p);
    setPlans(null);
    setConfirm(null);
  };

  // The selected plot, or the first one on this floor (plots are on the ground floor).
  const plots = elements.filter((el): el is Plot => el.type === 'plot' && !el.hidden);
  const plot = plots.find((p) => p.id === selectedId) ?? plots[0];
  // A stair already on the ground floor: the basement's goes under it.
  const groundStair = elements.find((el): el is Stair => el.type === 'stair' && levelOf(el) === GROUND_LEVEL);
  const plan = inBasement && groundStair ? { ...program, stair: false } : program;
  const need = programArea(plan);
  const coverage = useMemo(() => {
    if (!plot || inBasement) return undefined;
    const pct = plotRule(plot)?.rule?.coveragePct;
    return pct ? (plotMeasures(plot).areaSqFt * pct) / 100 : undefined;
  }, [plot, inBasement]);
  // A basement fills the outside of its walls; with none yet, what its bylaws allow.
  const doc = usePlanner((s) => s.doc);
  const within = useMemo(() => (plot && inBasement ? basementOutline(doc, plot) : undefined), [plot, inBasement, doc]);
  const outer = inBasement ? RETAINING_MM / MM_PER_UNIT : undefined;
  const room = useMemo(
    () => (plot ? layoutSite(plot, { maxAreaSqFt: coverage, within, outer }) : null),
    [plot, coverage, within, outer],
  );
  const site = useMemo(
    () =>
      plot ? layoutSite(plot, { maxAreaSqFt: coverage, needSqFt: inBasement ? undefined : need, within, outer }) : null,
    [plot, coverage, need, within, outer, inBasement],
  );
  const ft = (units: number) => (units * 10) / MM_PER_FOOT;
  const len = (u: number) => formatLength(u * 10, units);

  if (!plot)
    return (
      <div className="text-xs text-muted">
        Draw a plot first (Shift+P): the plans fit inside its building line, with the road side at the front.
      </div>
    );
  if (!room || !site)
    return <div className="text-xs text-danger">The setbacks leave no room to build on this plot.</div>;

  const canSqFt = Math.round(ft(room.fullW) * ft(room.fullD));
  const make = (s: number) => {
    const found = generateLayouts(plan, site.W, site.D, { seed: s });
    setSeed(s);
    setPlans(found);
    setMirrored(found.map(() => false));
    setConfirm(null);
  };
  const shown = (i: number) => (plans && mirrored[i] ? mirrorLayout(plans[i]) : plans?.[i]);
  const use = (i: number, sure = false) => {
    const plan = shown(i);
    if (!plan) return;
    const s = plannerStore.getState();
    const clash = s.layoutClash(inBasement);
    if (!sure && clash.walls + clash.rooms + clash.other > 0) {
      setConfirm(i);
      return;
    }
    const levelMm = levelWallMm(plannerStore.getState().doc, activeLevel, wallHeightMm);
    const riseMm = levelMm + SLAB_MM;
    const basementOpts = inBasement
      ? {
          outer: { thickness: RETAINING_MM / MM_PER_UNIT, kind: 'retaining' as const, heightMm: levelMm + SLAB_MM },
          noWindows: true,
          ...(groundStair ? { stairAt: { x: groundStair.x, y: groundStair.y, rotation: groundStair.rotation } } : {}),
        }
      : {};
    s.placeLayout(buildLayout(plan, site.frame, { newId, riseMm, ...basementOpts }), inBasement);
    s.fitToPlan();
    setConfirm(null);
  };
  const clash = confirm !== null ? plannerStore.getState().layoutClash(inBasement) : null;
  const floorName = levels.find((l) => l.id === activeLevel)?.name ?? 'this floor';
  const sizeKinds: SizedKind[] = inBasement
    ? [
        'lounge',
        ...(['gym', 'servant', 'store', 'laundry', 'powder', 'stair'] as const).filter((k) => plan[k]),
        ...(plan.servant ? (['bath'] as const) : []),
      ]
    : [
        ...(program.bedrooms > 0 ? (['master'] as const) : []),
        ...(program.bedrooms > 1 ? (['bed'] as const) : []),
        ...(program.attachedBaths > 0 ? (['bath'] as const) : []),
        'lounge',
        'kitchen',
        ...OPTIONAL.filter((o) => program[o.key]).map((o) => o.key),
      ];

  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="layout-panel">
      {inBasement && (
        <>
          <div className="font-medium">Basement plans</div>
          <div className="text-muted">
            A hall, with the rooms you tick, inside 12" retaining walls
            {groundStair ? ', the stair under the ground floor’s' : ''}. No windows: plan air shafts or fans.
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {BASEMENT_OPTIONAL.map((o) => (
              <label key={o.key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!program[o.key]}
                  disabled={o.key === 'stair' && !!groundStair}
                  onChange={(e) => setProgram({ ...program, [o.key]: e.target.checked })}
                />
                {o.label}
              </label>
            ))}
          </div>
        </>
      )}
      {!inBasement && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-muted">Bedrooms</span>
              <select
                aria-label="Bedrooms"
                value={program.bedrooms}
                onChange={(e) => {
                  const bedrooms = Number(e.target.value);
                  setProgram({ ...program, bedrooms, attachedBaths: Math.min(program.attachedBaths, bedrooms) });
                }}
                className="rounded-sm border p-1"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted">With their own bath</span>
              <select
                aria-label="Attached baths"
                value={program.attachedBaths}
                onChange={(e) => setProgram({ ...program, attachedBaths: Number(e.target.value) })}
                className="rounded-sm border p-1"
              >
                {Array.from({ length: program.bedrooms + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-muted">Always: lounge and kitchen. Also:</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {OPTIONAL.map((o) => (
              <label key={o.key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!program[o.key]}
                  onChange={(e) => setProgram({ ...program, [o.key]: e.target.checked })}
                />
                {o.label}
              </label>
            ))}
          </div>
        </>
      )}
      <details>
        <summary className="cursor-pointer text-muted">Room sizes</summary>
        <div className="mt-1 flex flex-col gap-1">
          {sizeKinds.map((kind) => {
            const size = sizeOf(program, kind);
            const setSize = (patch: Partial<{ w: number; d: number }>) =>
              setProgram({
                ...program,
                sizes: { ...program.sizes, [kind]: { w: size.w, d: size.d, ...patch } },
              });
            return (
              <div key={kind} className="grid grid-cols-[1fr_5rem_5rem] items-end gap-1">
                <span className="pb-1">
                  {kind === 'bed'
                    ? 'Other bedrooms'
                    : kind === 'bath'
                      ? inBasement
                        ? 'Servant bath'
                        : 'Their baths'
                      : kind === 'lounge' && inBasement
                        ? 'Hall'
                        : ROOM_NAMES[kind]}
                </span>
                <LengthField
                  id={`size-${kind}-w`}
                  label="Width"
                  mm={size.w * MM_PER_FOOT}
                  units={units}
                  min={600}
                  onCommit={(mm) => setSize({ w: mm / MM_PER_FOOT })}
                />
                <LengthField
                  id={`size-${kind}-d`}
                  label="Depth"
                  mm={size.d * MM_PER_FOOT}
                  units={units}
                  min={600}
                  onCommit={(mm) => setSize({ d: mm / MM_PER_FOOT })}
                />
              </div>
            );
          })}
          {program.sizes && (
            <button
              className="m-btn self-start px-2 py-0.5"
              onClick={() => setProgram({ ...program, sizes: undefined })}
            >
              Usual sizes
            </button>
          )}
        </div>
      </details>

      <div data-testid="layout-budget" className={Math.round(need) > canSqFt ? 'text-danger' : 'text-muted'}>
        Your rooms need about {Math.round(need).toLocaleString('en-US')} sq ft; you can build about{' '}
        {canSqFt.toLocaleString('en-US')} sq ft here ({len(room.fullW)} × {len(room.fullD)}
        {coverage ? ', within the bylaws’ coverage' : ''}).
      </div>
      <div className="flex gap-1">
        <button className="m-btn px-2 py-0.5 font-medium" onClick={() => make(seed)}>
          Make plans
        </button>
        {plans && (
          <button className="m-btn px-2 py-0.5" onClick={() => make(seed + 1)}>
            Try again
          </button>
        )}
      </div>

      {plans && !plans.length && (
        <div className="text-danger" data-testid="layout-none">
          These rooms don’t fit side by side on this plot ({len(site.W)} wide inside the walls). Try fewer rooms,
          smaller sizes, or leave out the drawing room or the stair.
        </div>
      )}
      {plans?.map((_, i) => {
        const plan = shown(i)!;
        return (
          <div key={i} className="flex flex-col gap-1 rounded-sm border border-line p-1.5" data-testid="layout-plan">
            <div className="flex items-center justify-between">
              <span className="font-medium">Plan {String.fromCharCode(65 + i)}</span>
              <span className="text-muted">{plan.rooms.filter((r) => r.kind !== 'passage').length} rooms</span>
            </div>
            <Thumb plan={plan} />
            {plan.notes.length ? (
              <ul className="list-disc pl-4 text-muted">
                {plan.notes.slice(0, 3).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <div className="text-muted">
                {inBasement
                  ? 'Every room reached, with good sizes.'
                  : 'Every room reached, with daylight and good sizes.'}
              </div>
            )}
            {confirm === i && clash ? (
              <div
                className="flex flex-col gap-1 rounded-sm bg-sunken p-1.5"
                role="alertdialog"
                aria-label="Replace this floor?"
              >
                <span>
                  This replaces what is drawn on the {floorName}: {clash.walls} walls, {clash.rooms} rooms and{' '}
                  {clash.other} other items (boundary walls stay). Ctrl+Z takes it back.
                </span>
                <div className="flex gap-1">
                  <button className="m-btn px-2 py-0.5 font-medium" onClick={() => use(i, true)}>
                    Replace
                  </button>
                  <button className="m-btn px-2 py-0.5" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1">
                <button className="m-btn px-2 py-0.5 font-medium" onClick={() => use(i)}>
                  Use this plan
                </button>
                <button
                  className="m-btn px-2 py-0.5"
                  aria-pressed={!!mirrored[i]}
                  onClick={() => setMirrored(mirrored.map((m, j) => (j === i ? !m : m)))}
                >
                  Mirror
                </button>
              </div>
            )}
          </div>
        );
      })}
      {plans && plans.length > 0 && (
        <div className="text-muted">
          The plan is built from ordinary walls, rooms, doors and windows: change anything afterwards. Plans go on the
          floor you are viewing{levelOf({}) === activeLevel ? '' : ` (${floorName})`}.
        </div>
      )}
    </div>
  );
}
