import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, FURNITURE_KINDS, type FurnitureKind } from '../furniture/catalog';
import { FurnitureSymbol } from '../furniture/FurnitureSymbol';
import { formatLength } from '../lib/units';
import { usePlanner } from '../store/plannerStore';

function Thumbnail({ kind }: { kind: FurnitureKind }) {
  const { w, d } = FURNITURE_CATALOG[kind];
  const size = Math.max(w, d) * 1.1;
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="h-10 w-10" aria-hidden="true">
      <FurnitureSymbol kind={kind} w={w} h={d} fill="var(--surface-raised)" stroke="var(--ink)" sw={size / 40} />
    </svg>
  );
}

/** Pick which furniture the Furniture tool places. Shown while that tool is active. */
export function FurnitureLibrary() {
  const selected = usePlanner((s) => s.furnitureKind);
  const setKind = usePlanner((s) => s.setFurnitureKind);
  const units = usePlanner((s) => s.units);

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs"
      aria-label="Furniture library"
    >
      <div className="font-medium">Furniture library</div>
      {FURNITURE_CATEGORIES.map((category) => (
        <div key={category} className="flex flex-col gap-1">
          <div className="m-heading">{category}</div>
          <div className="grid grid-cols-3 gap-1">
            {FURNITURE_KINDS.filter((k) => FURNITURE_CATALOG[k].category === category).map((kind) => {
              const item = FURNITURE_CATALOG[kind];
              return (
                <button
                  key={kind}
                  onClick={() => setKind(kind)}
                  aria-pressed={selected === kind}
                  title={`${item.name}: ${formatLength(item.w, units)} × ${formatLength(item.d, units)}`}
                  className={`flex flex-col items-center gap-0.5 rounded-md border p-1 text-center text-[10px] leading-tight ${
                    selected === kind
                      ? 'border-accent bg-accent-soft ring-1 ring-accent'
                      : 'border-line hover:bg-sunken'
                  }`}
                >
                  <Thumbnail kind={kind} />
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
