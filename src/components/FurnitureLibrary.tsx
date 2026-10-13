import { useState } from 'react';
import {
  categoriesOf,
  FURNITURE_CATALOG,
  FURNITURE_GROUPS,
  FURNITURE_KINDS,
  groupForProject,
  isFurnitureKind,
  type FurnitureGroup,
  type FurnitureKind,
} from '../furniture/catalog';
import { FurnitureSymbol } from '../furniture/FurnitureSymbol';
import { projectOf } from '../lib/project';
import { formatLength } from '../lib/units';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { turnFurniture } from '../tools/furnitureTool';

const RECENT_KEY = 'mimar.furniture.recent';
const RECENT_MAX = 6;

/** The items last picked, newest first (none when the browser keeps nothing). */
function readRecent(): FurnitureKind[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isFurnitureKind).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: FurnitureKind[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Nothing kept: the row just starts empty next time.
  }
}

function Thumbnail({ kind }: { kind: FurnitureKind }) {
  const { w, d } = FURNITURE_CATALOG[kind];
  const size = Math.max(w, d) * 1.1;
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="h-10 w-10" aria-hidden="true">
      <FurnitureSymbol kind={kind} w={w} h={d} fill="var(--surface-raised)" stroke="var(--ink)" sw={size / 40} />
    </svg>
  );
}

function Items({ kinds, onPick }: { kinds: FurnitureKind[]; onPick: (kind: FurnitureKind) => void }) {
  const selected = usePlanner((s) => s.furnitureKind);
  const units = usePlanner((s) => s.units);
  return (
    <div className="grid grid-cols-3 gap-1">
      {kinds.map((kind) => {
        const item = FURNITURE_CATALOG[kind];
        return (
          <button
            key={kind}
            onClick={() => onPick(kind)}
            aria-pressed={selected === kind}
            title={`${item.name}: ${formatLength(item.w, units)} × ${formatLength(item.d, units)}`}
            className={`flex flex-col items-center gap-0.5 rounded-md border p-1 text-center text-[10px] leading-tight ${
              selected === kind ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line hover:bg-sunken'
            }`}
          >
            <Thumbnail kind={kind} />
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

/** Turn the next item before it is placed: a quarter turn either way, or any angle typed. */
function TurnRow() {
  const angle = usePlanner((s) => s.furnitureAngle);
  const turn = (deg: number) => turnFurniture(plannerStore, deg);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Turn before placing">
      <button className="m-btn px-2 py-0.5" title="Turn left 90°" aria-label="Turn left" onClick={() => turn(-90)}>
        ↺
      </button>
      <button className="m-btn px-2 py-0.5" title="Turn right 90° (V)" aria-label="Turn right" onClick={() => turn(90)}>
        ↻
      </button>
      <label htmlFor="furniture-angle" className="ml-1 text-muted">
        Angle (°)
      </label>
      <input
        key={angle}
        id="furniture-angle"
        type="number"
        step={15}
        defaultValue={Math.round(angle)}
        onBlur={(e) => {
          const deg = Number(e.currentTarget.value);
          if (Number.isFinite(deg)) turn(deg - angle);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-14 rounded-sm border p-1 tabular-nums"
      />
    </div>
  );
}

/**
 * Pick which furniture the Furniture tool places. Shown while that tool is active. Items sit in groups
 * (Home, Office…), the project's own group open first, with folding categories, a search across all of
 * them and the last few picked.
 */
export function FurnitureLibrary() {
  const setKind = usePlanner((s) => s.setFurnitureKind);
  const project = usePlanner((s) => projectOf(s.doc));
  const [group, setGroup] = useState<FurnitureGroup>(() => groupForProject(project.type, project.use));
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  /** Categories folded away (all open to start). */
  const [folded, setFolded] = useState<Set<string>>(() => new Set());

  const pick = (kind: FurnitureKind) => {
    setKind(kind);
    const next = [kind, ...recent.filter((k) => k !== kind)].slice(0, RECENT_MAX);
    setRecent(next);
    saveRecent(next);
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length
    ? FURNITURE_KINDS.filter((k) => {
        const { name, category, group: g } = FURNITURE_CATALOG[k];
        const text = `${name} ${category} ${g}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
    : [];

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs"
      aria-label="Furniture library"
    >
      <div className="font-medium">Furniture library</div>
      <TurnRow />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search, e.g. desk, bed, urinal"
        aria-label="Search furniture"
        className="rounded-sm border p-1 text-xs"
      />
      {words.length ? (
        found.length ? (
          <Items kinds={found} onPick={pick} />
        ) : (
          <div className="text-muted">Nothing matches “{query.trim()}”.</div>
        )
      ) : (
        <>
          {recent.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="m-heading">Recent</div>
              <Items kinds={recent} onPick={pick} />
            </div>
          )}
          <div className="flex flex-wrap gap-1" role="group" aria-label="Furniture groups">
            {FURNITURE_GROUPS.map((g) => (
              <button key={g} className="m-btn px-2 py-0.5" aria-pressed={group === g} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
          {categoriesOf(group).map((category) => {
            const open = !folded.has(category);
            return (
              <div key={`${group}-${category}`} className="flex flex-col gap-1">
                <button
                  className="m-heading flex items-center gap-1 text-left"
                  aria-expanded={open}
                  onClick={() =>
                    setFolded((f) => {
                      const next = new Set(f);
                      if (open) next.add(category);
                      else next.delete(category);
                      return next;
                    })
                  }
                >
                  <span aria-hidden>{open ? '▾' : '▸'}</span>
                  {category}
                </button>
                {open && (
                  <Items
                    kinds={FURNITURE_KINDS.filter(
                      (k) => FURNITURE_CATALOG[k].group === group && FURNITURE_CATALOG[k].category === category,
                    )}
                    onPick={pick}
                  />
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
