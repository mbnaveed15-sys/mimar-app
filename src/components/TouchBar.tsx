import { useEffect, useState } from 'react';
import { canCopy, canTransform } from '../commands';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { cancel } from '../tools/controller';
import { finishStep } from '../tools/finish';
import { flipOpeningHand, OPENING_TOOLS } from '../tools/openingTool';
import type { IconName } from '../theme/icons';
import { Icon } from './Icon';
import { usePhone } from './useCompact';

const COARSE_QUERY = '(pointer: coarse)';
const coarseNow = () => typeof window !== 'undefined' && !!window.matchMedia?.(COARSE_QUERY).matches;

/** Whether the screen is mainly worked with a finger (a tablet or a phone). */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(coarseNow);
  useEffect(() => {
    const query = window.matchMedia?.(COARSE_QUERY);
    if (!query) return;
    const onChange = () => setCoarse(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return coarse;
}

const BAR =
  'absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] divide-x divide-line overflow-x-auto rounded-md border border-line bg-raised text-ink shadow-popover';
const BTN =
  'flex h-11 min-w-11 flex-none items-center justify-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap hover:bg-sunken active:bg-sunken disabled:opacity-35 phone:px-2.5';

/**
 * Buttons over the bottom-left corner of the plan. While something is drawn on a touch screen: the
 * keys a step needs (Enter to finish, Esc to cancel, V to flip a door). While something is selected:
 * the selection bar (Delete, Duplicate, Rotate 90°, Mirror, Properties), always on a tablet or a
 * phone, and with a mouse when View > Selection bar is on.
 */
export function TouchBar({ onProperties }: { onProperties: () => void }) {
  const touchInput = usePlanner((s) => s.touchInput);
  const drawing = usePlanner((s) => !!s.draft && s.draft.type !== 'opening');
  const opening = usePlanner((s) => OPENING_TOOLS.includes(s.tool));
  const selected = usePlanner((s) => s.selectedIds.length > 0);
  const copyable = usePlanner(canCopy);
  const turnable = usePlanner(canTransform);
  const wanted = usePlanner((s) => s.selectionBar);
  const phone = usePhone();
  const coarse = useCoarsePointer();

  if (touchInput && (drawing || opening))
    return (
      <div role="toolbar" aria-label="Touch actions" className={BAR}>
        {drawing && (
          <button className={BTN} onClick={() => finishStep(plannerStore) || cancel(plannerStore)}>
            <Icon name="check" size={18} /> Done
          </button>
        )}
        {drawing && (
          <button className={BTN} onClick={() => cancel(plannerStore)}>
            <Icon name="close" size={18} /> Cancel
          </button>
        )}
        {opening && (
          <button className={BTN} onClick={() => flipOpeningHand(plannerStore)}>
            <Icon name="mirror" size={18} /> Flip hinge
          </button>
        )}
      </div>
    );

  if (!selected || drawing || !(touchInput || phone || coarse || wanted)) return null;
  const st = () => plannerStore.getState();
  // On a phone or an upright tablet the buttons are icons only (each keeps its name for a screen reader and on hover).
  const action = (label: string, icon: IconName, run: () => void, enabled = true) => (
    <button key={label} className={BTN} onClick={run} disabled={!enabled} title={label} aria-label={label}>
      <Icon name={icon} size={18} /> <span className="max-lg:hidden phone:hidden">{label}</span>
    </button>
  );
  return (
    <div role="toolbar" aria-label="Selection actions" data-testid="selection-bar" className={BAR}>
      {action('Delete', 'erase', () => st().deleteSelected())}
      {action('Duplicate', 'duplicate', () => st().duplicateSelected(), copyable)}
      {action('Rotate 90°', 'rotate', () => st().rotateSelected(90), turnable)}
      {action('Mirror', 'mirror', () => st().setTool('mirror'), turnable)}
      {action('Properties', 'settings', onProperties)}
      {action('Deselect', 'close', () => st().select(null))}
    </div>
  );
}
