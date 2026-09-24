import { usePlanner } from '../store/plannerStore';

export function MaterialsPanel() {
  const materials = usePlanner((s) => s.doc.materials);
  const selectedMat = usePlanner((s) => s.selectedMat);
  const selectMaterial = usePlanner((s) => s.selectMaterial);
  const addMaterial = usePlanner((s) => s.addMaterial);
  const activeId = (materials.find((m) => m.id === selectedMat) ?? materials[0])?.id;

  return (
    <div className="mt-2 border-t pt-2">
      <div className="text-xs font-medium">Materials</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {materials.map((mat) => (
          <button
            key={mat.id}
            onClick={() => selectMaterial(mat.id)}
            aria-pressed={mat.id === activeId}
            className={`rounded border p-1 text-xs ${mat.id === activeId ? 'border-blue-600 ring-2 ring-blue-600' : ''}`}
            title={mat.name}
          >
            <span className="inline-block h-4 w-6 rounded-sm align-middle" style={{ background: mat.color }} />{' '}
            {mat.name}
          </button>
        ))}
      </div>
      <button onClick={addMaterial} className="mt-2 rounded border p-1 text-xs">
        Add material
      </button>
    </div>
  );
}
