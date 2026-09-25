import { useMemo, useState } from 'react';
import { COLLECTIONS, PATTERNS, searchLibrary } from '../lib/materials';
import { swatchUrl } from '../lib/patterns';
import { usePlanner } from '../store/plannerStore';
import type { Material, Pattern } from '../types';

function Swatch({ mat, size = 'h-4 w-6' }: { mat: Pick<Material, 'color' | 'pattern'>; size?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-sm border border-line align-middle ${size}`}
      style={{ background: `${mat.color} url(${swatchUrl(mat)}) center / cover` }}
    />
  );
}

/** Name, colour and pattern of a material the user made. */
function CustomEditor({ mat }: { mat: Material }) {
  const updateMaterial = usePlanner((s) => s.updateMaterial);
  const removeMaterial = usePlanner((s) => s.removeMaterial);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">Name</span>
          <input
            key={mat.id}
            defaultValue={mat.name}
            aria-label="Material name"
            className="rounded-sm border p-1"
            onBlur={(e) => {
              const name = e.currentTarget.value.trim();
              if (name && name !== mat.name) updateMaterial(mat.id, { name });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
        <input
          type="color"
          aria-label="Material colour"
          value={mat.color.length === 7 ? mat.color : '#ffffff'}
          onChange={(e) => updateMaterial(mat.id, { color: e.target.value })}
          className="h-7 w-10 cursor-pointer rounded-sm border"
        />
      </div>
      <label className="flex items-center gap-2">
        <span className="text-muted">Pattern</span>
        <select
          aria-label="Material pattern"
          value={mat.pattern ?? 'plain'}
          onChange={(e) => updateMaterial(mat.id, { pattern: e.target.value as Pattern })}
          className="flex-1 rounded-sm border p-1"
        >
          {PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <button className="m-btn self-start" onClick={() => removeMaterial(mat.id)}>
        Remove from plan
      </button>
    </div>
  );
}

/** Materials in the plan, then the built-in library by collection, with a search box. */
export function MaterialsPanel() {
  const materials = usePlanner((s) => s.doc.materials);
  const selectedMat = usePlanner((s) => s.selectedMat);
  const pickMaterial = usePlanner((s) => s.pickMaterial);
  const addMaterial = usePlanner((s) => s.addMaterial);
  const mode = usePlanner((s) => s.mode);
  const [query, setQuery] = useState('');
  const active = materials.find((m) => m.id === selectedMat) ?? materials[0];
  const found = useMemo(() => searchLibrary(query), [query]);
  const inPlan = new Set(materials.map((m) => m.id));

  const button = (mat: Material) => (
    <button
      key={mat.id}
      onClick={() => pickMaterial(mat.id)}
      aria-pressed={mat.id === active?.id}
      className="m-btn px-1.5 py-1 text-xs"
      title={mat.name}
    >
      <Swatch mat={mat} />
      {mat.name}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted">In this plan</div>
      <div className="flex flex-wrap gap-1.5">{materials.map(button)}</div>
      {active?.id.startsWith('mat_custom_') && <CustomEditor mat={active} />}
      <button onClick={addMaterial} className="m-btn self-start text-xs">
        New colour…
      </button>

      <div className="mt-1 text-xs font-medium text-muted">Library</div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search, e.g. marble, tile, grey"
        aria-label="Search materials"
        className="rounded-sm border p-1 text-xs"
      />
      {query ? (
        <div className="flex flex-col gap-1">
          {found.length ? (
            found.map((mat) => (
              <LibraryRow key={mat.id} mat={mat} added={inPlan.has(mat.id)} active={mat.id === active?.id} />
            ))
          ) : (
            <div className="text-xs text-muted">No materials match.</div>
          )}
        </div>
      ) : (
        COLLECTIONS.map((c) => (
          <details key={c} className="text-xs" open={false}>
            <summary className="cursor-pointer py-0.5">{c}</summary>
            <div className="mt-1 flex flex-col gap-1">
              {found
                .filter((m) => m.collection === c)
                .map((mat) => (
                  <LibraryRow key={mat.id} mat={mat} added={inPlan.has(mat.id)} active={mat.id === active?.id} />
                ))}
            </div>
          </details>
        ))
      )}
      {mode === 'simple' && <div className="text-xs text-muted">Pick a material, then use Paint (B) on the plan.</div>}
    </div>
  );
}

function LibraryRow({ mat, added, active }: { mat: Material; added: boolean; active: boolean }) {
  const pickMaterial = usePlanner((s) => s.pickMaterial);
  return (
    <button
      onClick={() => pickMaterial(mat.id)}
      aria-pressed={active}
      className="m-btn flex items-center gap-2 px-1.5 py-1 text-left text-xs"
    >
      <Swatch mat={mat} size="h-6 w-8" />
      <span className="flex-1">{mat.name}</span>
      {added && <span className="text-muted">in plan</span>}
    </button>
  );
}
