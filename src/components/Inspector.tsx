import { wallLength } from '../geometry';
import { usePlanner } from '../store/plannerStore';

export function Inspector() {
  const doc = usePlanner((s) => s.doc);
  const selectedId = usePlanner((s) => s.selectedId);
  const tool = usePlanner((s) => s.tool);
  const scale = usePlanner((s) => s.scaleMMperPx);
  const applyMaterial = usePlanner((s) => s.applyMaterial);
  const deleteElement = usePlanner((s) => s.deleteElement);

  const el = doc.elements.find((e) => e.id === selectedId);
  const mm = (px: number) => Math.round(px * scale);
  const materialName = (id?: string) => doc.materials.find((m) => m.id === id)?.name;

  return (
    <aside className="flex w-80 flex-col gap-3 border-l bg-white p-3">
      <h3 className="font-semibold">Inspector</h3>
      <div className="flex-1 overflow-auto">
        {el ? (
          <div className="mb-3 flex flex-col gap-1 rounded border p-2 text-xs">
            <div className="font-medium capitalize">Selected: {el.type}</div>
            {el.type === 'wall' && <div>Length: {mm(wallLength(el))} mm</div>}
            {(el.type === 'door' || el.type === 'window') && <div>Width: {mm(el.width)} mm</div>}
            {el.type === 'furniture' && (
              <div>
                Size: {mm(el.w)} × {mm(el.h)} mm
              </div>
            )}
            <div>Material: {materialName(el.material) ?? '—'}</div>
            <div className="mt-1 flex gap-2">
              <button onClick={() => applyMaterial(el.id)} className="rounded border p-1">
                Apply selected material
              </button>
              <button onClick={() => deleteElement(el.id)} className="rounded border p-1 text-red-700">
                Delete
              </button>
            </div>
          </div>
        ) : (
          tool === 'select' && <div className="mb-3 text-xs text-gray-500">Click an element to select it.</div>
        )}
        <div className="text-xs text-gray-600">Materials count: {doc.materials.length}</div>
        <div className="pt-2">
          <div className="text-xs font-medium">Masks</div>
          <ul className="mt-2 text-xs">
            {doc.masks.map((m) => (
              <li key={m.id} className="rounded border p-1">
                {m.name} — material: {materialName(m.material) ?? m.material}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
