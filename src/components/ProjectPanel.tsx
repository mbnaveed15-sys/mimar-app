import { BUILDING_USES, PANEL_NAMES, PROJECT_TYPES, projectOf, shows } from '../lib/project';
import { DEFAULT_SLAB_MM } from '../lib/levels';
import { usePlanner } from '../store/plannerStore';
import type { BuildingUse, ProjectPanel, ProjectType, Units } from '../types';
import { LengthField } from './LengthField';

const PANELS: ProjectPanel[] = ['bylaws', 'hints', 'roomList', 'cost'];

/**
 * The project: what kind it is (and a building's use), its units, the usual floor height and slab,
 * and which sections of the side panel it shows.
 */
export function ProjectPanel() {
  const doc = usePlanner((s) => s.doc);
  const units = usePlanner((s) => s.units);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const setProject = usePlanner((s) => s.setProject);
  const setUnits = usePlanner((s) => s.setUnits);
  const setWallHeightMm = usePlanner((s) => s.setWallHeightMm);
  const project = projectOf(doc);

  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="project-panel">
      <label className="flex flex-col gap-0.5">
        <span className="text-muted">Kind of project</span>
        <select
          aria-label="Kind of project"
          value={project.type}
          onChange={(e) => {
            const type = e.target.value as ProjectType;
            setProject({ type, ...(type === 'building' && !project.use ? { use: 'other' } : {}), units });
          }}
          className="rounded-sm border p-1"
        >
          {PROJECT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {project.type === 'building' && (
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">What it is for</span>
          <select
            aria-label="Building use"
            value={project.use ?? 'other'}
            onChange={(e) => setProject({ use: e.target.value as BuildingUse })}
            className="rounded-sm border p-1"
          >
            {BUILDING_USES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-0.5">
        <span className="text-muted">Units</span>
        <select
          aria-label="Project units"
          value={units}
          onChange={(e) => {
            const u = e.target.value as Units;
            setUnits(u);
            // A project from before 1.33 keeps its units too, from now on.
            if (!doc.project) setProject({ units: u });
          }}
          className="rounded-sm border p-1"
        >
          <option value="imperial">Feet and inches</option>
          <option value="metric">Metric (mm, m)</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          id="project-wall-height"
          label="Usual wall height"
          mm={wallHeightMm}
          units={units}
          min={2000}
          onCommit={(mm) => {
            setWallHeightMm(mm);
            if (!doc.project) setProject({ wallHeightMm: mm });
          }}
        />
        <LengthField
          id="project-slab"
          label="Floor slab"
          mm={project.slabMm ?? DEFAULT_SLAB_MM}
          units={units}
          min={50}
          onCommit={(mm) => setProject({ slabMm: Math.min(mm, 600) })}
        />
      </div>
      <div className="text-muted">A floor can have its own wall height: set it in the floor switcher at the top.</div>
      <div className="mt-1 font-medium">Show</div>
      {PANELS.map((panel) => (
        <label key={panel} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shows(doc, panel)}
            onChange={(e) => setProject({ panels: { ...project.panels, [panel]: e.target.checked } })}
          />
          {PANEL_NAMES[panel]}
        </label>
      ))}
    </div>
  );
}
