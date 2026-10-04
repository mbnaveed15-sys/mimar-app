import { plannerStore, usePlanner } from '../store/plannerStore';
import { cancel } from '../tools/controller';
import { finishStep } from '../tools/finish';
import { flipOpeningHand, OPENING_TOOLS } from '../tools/openingTool';
import { Icon } from './Icon';

/**
 * On a touch screen there is no keyboard to hand: the keys a step needs (Enter to finish, Esc to
 * cancel, V to flip a door, Delete) as buttons over the bottom-left corner of the plan. Shown once
 * the plan has been touched, while something is being drawn or is selected.
 */
export function TouchBar() {
  const touchInput = usePlanner((s) => s.touchInput);
  const drawing = usePlanner((s) => !!s.draft && s.draft.type !== 'opening');
  const opening = usePlanner((s) => OPENING_TOOLS.includes(s.tool));
  const selected = usePlanner((s) => s.selectedIds.length > 0);
  if (!touchInput || (!drawing && !opening && !selected)) return null;

  const btn =
    'flex h-11 min-w-11 items-center justify-center gap-1.5 px-3 text-sm font-medium hover:bg-sunken active:bg-sunken';
  return (
    <div
      role="toolbar"
      aria-label="Touch actions"
      className="absolute bottom-3 left-3 z-20 flex divide-x divide-line overflow-hidden rounded-md border border-line bg-raised text-ink shadow-popover"
    >
      {drawing && (
        <button className={btn} onClick={() => finishStep(plannerStore) || cancel(plannerStore)}>
          <Icon name="check" size={18} /> Done
        </button>
      )}
      {drawing && (
        <button className={btn} onClick={() => cancel(plannerStore)}>
          <Icon name="close" size={18} /> Cancel
        </button>
      )}
      {opening && (
        <button className={btn} onClick={() => flipOpeningHand(plannerStore)}>
          <Icon name="mirror" size={18} /> Flip hinge
        </button>
      )}
      {selected && !drawing && (
        <button className={btn} onClick={() => plannerStore.getState().deleteSelected()}>
          <Icon name="erase" size={18} /> Delete
        </button>
      )}
      {selected && !drawing && (
        <button className={btn} onClick={() => plannerStore.getState().select(null)}>
          <Icon name="close" size={18} /> Deselect
        </button>
      )}
    </div>
  );
}
