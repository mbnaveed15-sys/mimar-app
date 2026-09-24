import { usePlanner } from '../store/plannerStore';

export function MaterialsPanel() {
  const materials = usePlanner((s) => s.doc.materials);
  const selectedMat = usePlanner((s) => s.selectedMat);
  const selectMaterial = usePlanner((s) => s.selectMaterial);
  const addMaterial = usePlanner((s) => s.addMaterial);
  const mode = usePlanner((s) => s.mode);
  const activeId = (materials.find((m) => m.id === selectedMat) ?? materials[0])?.id;

  return (
    <div className="m-section">
      <div className="m-heading">Materials</div>
      <div className="flex flex-wrap gap-1.5">
        {materials.map((mat) => (
          <button
            key={mat.id}
            onClick={() => selectMaterial(mat.id)}
            aria-pressed={mat.id === activeId}
            className="m-btn px-1.5 py-1 text-xs"
            title={mat.name}
          >
            <span
              className="inline-block h-4 w-6 rounded-sm border border-line align-middle"
              style={{ background: mat.color }}
            />
            {mat.name}
          </button>
        ))}
      </div>
      {mode === 'pro' && (
        <button onClick={addMaterial} className="m-btn self-start text-xs">
          Add material
        </button>
      )}
    </div>
  );
}
