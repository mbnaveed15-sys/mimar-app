import { usePlanner } from '../store/plannerStore';

/** Show or hide parts of the plan. Exports follow the same settings. */
export function LayersPanel() {
  const showDimensions = usePlanner((s) => s.showDimensions);
  const setShowDimensions = usePlanner((s) => s.setShowDimensions);
  const showFurniture = usePlanner((s) => s.showFurniture);
  const showRoomLabels = usePlanner((s) => s.showRoomLabels);
  const showRoomFills = usePlanner((s) => s.showRoomFills);
  const setLayer = usePlanner((s) => s.setLayer);

  const layers = [
    { id: 'layer-dimensions', label: 'Dimensions', checked: showDimensions, set: setShowDimensions },
    {
      id: 'layer-furniture',
      label: 'Furniture',
      checked: showFurniture,
      set: (v: boolean) => setLayer('showFurniture', v),
    },
    {
      id: 'layer-room-labels',
      label: 'Room names & areas',
      checked: showRoomLabels,
      set: (v: boolean) => setLayer('showRoomLabels', v),
    },
    {
      id: 'layer-room-fills',
      label: 'Room colours',
      checked: showRoomFills,
      set: (v: boolean) => setLayer('showRoomFills', v),
    },
  ];

  return (
    <fieldset className="m-section text-xs">
      <legend className="float-left m-heading">Layers</legend>
      <div className="clear-both flex flex-col gap-1">
        {layers.map((l) => (
          <label key={l.id} htmlFor={l.id} className="flex items-center gap-2">
            <input id={l.id} type="checkbox" checked={l.checked} onChange={(e) => l.set(e.target.checked)} />
            {l.label}
          </label>
        ))}
        <p className="text-muted">PDF and PNG exports show the same layers.</p>
      </div>
    </fieldset>
  );
}
