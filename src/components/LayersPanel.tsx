import { LAYERS, layerCounts, type LayerId } from '../lib/layers';
import { usePlanner } from '../store/plannerStore';
import { Icon } from './Icon';

/**
 * Every item is on the layer for its kind. Each layer can be hidden or locked, and exports follow
 * what is shown. Room labels, room colours and dimensions have their own switches.
 */
export function LayersPanel() {
  const doc = usePlanner((s) => s.doc);
  const showFurniture = usePlanner((s) => s.showFurniture);
  const showDimensions = usePlanner((s) => s.showDimensions);
  const setShowDimensions = usePlanner((s) => s.setShowDimensions);
  const showRoomLabels = usePlanner((s) => s.showRoomLabels);
  const showRoomFills = usePlanner((s) => s.showRoomFills);
  const exportLines = usePlanner((s) => s.exportLines);
  const setLayer = usePlanner((s) => s.setLayer);
  const setLayerFlags = usePlanner((s) => s.setLayerFlags);
  const showAllHidden = usePlanner((s) => s.showAllHidden);
  const unlockAll = usePlanner((s) => s.unlockAll);
  const counts = layerCounts(doc);
  const hiddenItems = [...doc.elements, ...doc.rooms].filter((it) => it.hidden).length;
  const lockedItems = [...doc.elements, ...doc.rooms].filter((it) => it.locked).length;
  const anyHidden = hiddenItems > 0 || !showFurniture || Object.values(doc.layers ?? {}).some((f) => f.hidden);
  const anyLocked = lockedItems > 0 || Object.values(doc.layers ?? {}).some((f) => f.locked);

  const hidden = (id: LayerId) => (id === 'furniture' ? !showFurniture : !!doc.layers?.[id]?.hidden);
  const locked = (id: LayerId) => !!doc.layers?.[id]?.locked;
  const btn = 'grid h-6 w-6 place-items-center rounded-sm hover:bg-sunken';
  const sub = (id: string, label: string, checked: boolean, set: (v: boolean) => void) => (
    <label htmlFor={id} className="flex items-center gap-2 pl-8 text-muted">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <fieldset className="text-xs" aria-label="Layers">
      <div className="flex flex-col gap-0.5">
        {LAYERS.map((l) => (
          <div key={l.id}>
            <div
              className={`flex items-center gap-1 ${hidden(l.id) ? 'opacity-55' : ''}`}
              data-testid={`layer-${l.id}`}
            >
              <button
                className={btn}
                aria-label={`${hidden(l.id) ? 'Show' : 'Hide'} ${l.label}`}
                aria-pressed={!hidden(l.id)}
                title={hidden(l.id) ? 'Hidden: click to show' : 'Shown: click to hide'}
                onClick={() => setLayerFlags(l.id, { hidden: !hidden(l.id) })}
              >
                <Icon name={hidden(l.id) ? 'eye-off' : 'eye'} size={15} />
              </button>
              <button
                className={btn}
                aria-label={`${locked(l.id) ? 'Unlock' : 'Lock'} ${l.label}`}
                aria-pressed={locked(l.id)}
                title={
                  locked(l.id) ? 'Locked: click to unlock' : 'Click to lock (it stays visible but cannot be picked)'
                }
                onClick={() => setLayerFlags(l.id, { locked: !locked(l.id) })}
              >
                <Icon name={locked(l.id) ? 'lock' : 'unlock'} size={15} className={locked(l.id) ? '' : 'opacity-40'} />
              </button>
              <span className="flex-1">{l.label}</span>
              <span className="tabular-nums text-muted">{counts[l.id]}</span>
            </div>
            {l.id === 'walls' && sub('layer-dimensions', 'Dimensions', showDimensions, setShowDimensions)}
            {l.id === 'rooms' && (
              <>
                {sub('layer-room-labels', 'Room names & areas', showRoomLabels, (v) => setLayer('showRoomLabels', v))}
                {sub('layer-room-fills', 'Room colours', showRoomFills, (v) => setLayer('showRoomFills', v))}
              </>
            )}
            {l.id === 'lines' &&
              sub('layer-export-lines', 'Include in exports', exportLines, (v) => setLayer('exportLines', v))}
          </div>
        ))}
        {(anyHidden || anyLocked) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {anyHidden && (
              <button className="m-btn" onClick={showAllHidden}>
                Show all hidden{hiddenItems ? ` (${hiddenItems})` : ''}
              </button>
            )}
            {anyLocked && (
              <button className="m-btn" onClick={unlockAll}>
                Unlock all{lockedItems ? ` (${lockedItems})` : ''}
              </button>
            )}
          </div>
        )}
        <p className="mt-1 text-muted">
          Hidden items don&apos;t print or export. Locked items show but can&apos;t be picked.
        </p>
      </div>
    </fieldset>
  );
}
