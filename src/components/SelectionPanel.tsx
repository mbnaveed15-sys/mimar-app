import { itemById } from '../lib/selection';
import { plannerStore, usePlanner } from '../store/plannerStore';

const NAMES: Record<string, [string, string]> = {
  wall: ['wall', 'walls'],
  door: ['door', 'doors'],
  window: ['window', 'windows'],
  furniture: ['item', 'items'],
  room: ['room', 'rooms'],
};

/** Properties for several items, a group or a component copy. */
export function SelectionPanel() {
  const doc = usePlanner((s) => s.doc);
  const selectedIds = usePlanner((s) => s.selectedIds);
  const group = usePlanner((s) => s.selectedGroup());
  const s = plannerStore.getState();
  const component = group?.componentId ? doc.components.find((c) => c.id === group.componentId) : undefined;
  const copies = component ? doc.groups.filter((g) => g.componentId === component.id).length : 0;

  const counts = new Map<string, number>();
  for (const id of selectedIds) {
    const it = itemById(doc, id);
    const kind = it ? ('type' in it ? it.type : 'room') : null;
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const summary = [...counts].map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(', ');

  function applyMaterial() {
    s.beginBatch();
    for (const id of selectedIds) s.applyMaterial(id);
    s.endBatch();
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs"
      data-testid="selection-panel"
    >
      {group ? (
        <>
          <div className="font-medium">{component ? 'Component' : 'Group'}</div>
          <label htmlFor="group-name" className="text-muted">
            Name
          </label>
          <input
            key={group.name}
            id="group-name"
            defaultValue={group.name}
            onBlur={(e) => s.renameGroup(group.id, e.currentTarget.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="rounded-sm border p-1"
          />
          {component && (
            <div className="text-muted">
              {copies === 1 ? 'The only copy.' : `${copies} copies; editing one updates them all.`}
            </div>
          )}
        </>
      ) : (
        <div className="font-medium">{selectedIds.length} selected</div>
      )}
      <div className="text-muted">{summary}</div>
      <div className="flex flex-wrap gap-1.5">
        {group ? (
          <>
            <button className="m-btn" onClick={() => s.openGroup(group.id)} title="Or double-click it">
              Edit {component ? 'component' : 'group'}
            </button>
            <button className="m-btn" onClick={() => s.ungroupSelected()} title="Ctrl+Shift+G">
              {component ? 'Explode' : 'Ungroup'}
            </button>
            {component && copies > 1 && (
              <button className="m-btn" onClick={() => s.makeSelectedUnique()}>
                Make unique
              </button>
            )}
          </>
        ) : (
          <button className="m-btn" onClick={() => s.groupSelected()} title="Ctrl+G">
            Make group
          </button>
        )}
        {!component && (
          <button className="m-btn" onClick={() => s.makeComponentFromSelection()} title="G">
            Make component
          </button>
        )}
        <button className="m-btn" onClick={applyMaterial}>
          Apply selected material
        </button>
        <button className="m-btn" onClick={() => s.rotateSelected(90)}>
          Rotate 90°
        </button>
        <button className="m-btn m-btn-danger" onClick={() => s.deleteSelected()}>
          Delete
        </button>
      </div>
    </div>
  );
}
