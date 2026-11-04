import { useState } from 'react';
import { exportStructureCsv } from '../lib/exportActions';
import { frameCount, frameFingerprint } from '../lib/structure/generate';
import { FRAME_PARTS, SEISMIC_ZONES, frameRules, type FrameRules } from '../lib/structure/settings';
import { plannerStore, usePlanner } from '../store/plannerStore';
import type { CladdingKind, FramePart, FrameSystem, SeismicZone } from '../types';
import { CLADDING, CLADDING_KINDS } from '../lib/cladding';
import { LengthField } from './LengthField';

/** Generate structure: its settings, Generate / Regenerate, Remove, the frame-only 3D view and the schedule. */
export function StructurePanel() {
  const doc = usePlanner((s) => s.doc);
  const units = usePlanner((s) => s.units);
  const frameView = usePlanner((s) => s.frameView);
  const [note, setNote] = useState<string | null>(null);
  const [cladKind, setCladKind] = useState<CladdingKind>('stone');
  const s = plannerStore.getState();
  const rules = frameRules(doc);
  const count = frameCount(doc);
  const made = !!doc.frame?.madeFrom;
  const stale = made && count > 0 && frameFingerprint(doc) !== doc.frame?.madeFrom;
  const set = (patch: Partial<FrameRules>) => s.setFrameRules({ ...rules, ...patch });
  const togglePart = (part: FramePart, on: boolean) =>
    set({ skip: on ? rules.skip.filter((p) => p !== part) : [...rules.skip, part] });
  const generate = () => {
    const r = s.generateStructure();
    if (!r) return setNote(null);
    const { columns, beams, slabs, footings } = r.counts;
    setNote(
      `Made ${columns} columns, ${beams} beams, ${slabs} slabs and ${footings} footings` +
        (r.kept ? `; kept ${r.kept} you had changed.` : '.'),
    );
  };
  const framed = rules.system === 'framed';
  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="structure-panel">
      <div className="text-muted">
        Columns, beams, lintels, plinth and tie beams, slabs and footings worked out from your walls, doors, windows,
        rooms and stairs on every floor. A preliminary layout for drawing and costing:{' '}
        <strong>sizes must be checked by a structural engineer.</strong>
      </div>
      <label className="flex items-center justify-between gap-2">
        Structure
        <select
          id="frame-system"
          className="rounded-sm border p-1"
          value={rules.system}
          onChange={(e) => set({ system: e.target.value as FrameSystem })}
        >
          <option value="framed">Framed RCC (columns and beams)</option>
          <option value="bearing">Load-bearing brick with RCC bands</option>
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
        {FRAME_PARTS.filter((p) => framed || !p.framedOnly).map((p) => (
          <label key={p.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid={`frame-part-${p.id}`}
              checked={!rules.skip.includes(p.id)}
              onChange={(e) => togglePart(p.id, e.target.checked)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      {framed && (
        <LengthField
          id="frame-span"
          label="Columns at most this far apart"
          mm={rules.maxSpanMm}
          units={units}
          min={1500}
          onCommit={(mm) => set({ maxSpanMm: Math.min(Math.max(mm, 1500), 12000) })}
        />
      )}
      {framed && (
        <LengthField
          id="frame-wide"
          label="A column each side of openings this wide"
          mm={rules.wideOpeningMm}
          units={units}
          min={600}
          onCommit={(mm) => set({ wideOpeningMm: Math.min(Math.max(mm, 600), 12000) })}
        />
      )}
      <LengthField
        id="frame-slab-span"
        label="A beam across rooms wider than"
        mm={rules.slabSpanMm}
        units={units}
        min={1500}
        onCommit={(mm) => set({ slabSpanMm: Math.min(Math.max(mm, 1500), 12000) })}
      />
      <LengthField
        id="frame-bearing"
        label="Lintels sit on the wall past each side"
        mm={rules.bearingMm}
        units={units}
        min={0}
        onCommit={(mm) => set({ bearingMm: Math.min(Math.max(mm, 0), 1000) })}
      />
      <LengthField
        id="frame-footing-depth"
        label="Footings this deep below the ground"
        mm={rules.footingDepthMm}
        units={units}
        min={300}
        onCommit={(mm) => set({ footingDepthMm: Math.min(Math.max(mm, 300), 5000) })}
      />
      <label className="flex items-center justify-between gap-2">
        Soil bearing capacity (tons/sq ft)
        <input
          id="frame-soil"
          type="number"
          className="w-16 rounded-sm border p-1"
          min={0.25}
          max={10}
          step={0.25}
          value={rules.soilTsf}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 0.25 && v <= 10) set({ soilTsf: v });
          }}
        />
      </label>
      <label className="flex items-center justify-between gap-2">
        Seismic zone (Building Code of Pakistan)
        <select
          id="frame-zone"
          className="rounded-sm border p-1"
          value={rules.zone}
          onChange={(e) => set({ zone: e.target.value as SeismicZone })}
        >
          {SEISMIC_ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>
      {!framed && <div className="text-muted">Zone 2B and up adds a continuous lintel band round the walls.</div>}
      <div className="flex flex-wrap gap-2">
        <button className="m-btn m-btn-primary" data-testid="frame-generate" onClick={generate}>
          {made ? 'Regenerate structure' : 'Generate structure'}
        </button>
        {made && (
          <button
            className="m-btn"
            onClick={() => {
              s.removeStructure();
              setNote(null);
            }}
          >
            Remove structure
          </button>
        )}
      </div>
      {stale && (
        <div className="text-danger" data-testid="frame-stale">
          The plan has changed since the structure was generated: Regenerate keeps anything you have moved, resized or
          locked.
        </div>
      )}
      {note && <div data-testid="frame-note">{note}</div>}
      <div className="flex flex-wrap items-center gap-2" data-testid="clad-outside">
        <label className="flex items-center gap-2">
          Clad the outside walls in
          <select
            id="clad-kind"
            className="rounded-sm border p-1"
            value={cladKind}
            onChange={(e) => setCladKind(e.target.value as CladdingKind)}
          >
            {CLADDING_KINDS.map((k) => (
              <option key={k} value={k}>
                {CLADDING[k].name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="m-btn"
          data-testid="clad-all"
          onClick={() => {
            const n = s.cladOutsideWalls(cladKind);
            setNote(
              n
                ? `Clad ${n} outside ${n === 1 ? 'wall' : 'walls'} in ${CLADDING[cladKind].name.toLowerCase()}.`
                : 'There are no outside walls to clad.',
            );
          }}
        >
          Clad all
        </button>
      </div>
      {made && (
        <label className="flex items-center justify-between gap-2">
          Facade
          <select
            id="frame-facade"
            data-testid="frame-facade"
            className="rounded-sm border p-1"
            value={doc.frame?.facade ?? 'plastered'}
            onChange={(e) => s.setFacade(e.target.value as 'plastered' | 'exposed')}
          >
            <option value="plastered">Plastered: walls cover the frame</option>
            <option value="exposed">Exposed: the concrete frame shows</option>
          </select>
        </label>
      )}
      {made && (
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="frame-view"
              checked={frameView}
              onChange={(e) => s.setFrameView(e.target.checked)}
            />
            Only the structure in 3D
          </label>
          <button className="m-btn" onClick={exportStructureCsv}>
            Structure schedule (CSV)
          </button>
        </div>
      )}
    </div>
  );
}
