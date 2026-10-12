import { useEffect, useState } from 'react';

/** Below this window width (an iPad held upright, a small laptop window) the layout makes room for the plan. */
export const COMPACT_BELOW_PX = 1024;

const compactNow = () => typeof window !== 'undefined' && window.innerWidth < COMPACT_BELOW_PX;

/** Whether the window is narrow: the top bar drops its words and the side panel slides over the plan. */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(compactNow);
  useEffect(() => {
    const onResize = () => setCompact(compactNow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
}

/**
 * A phone: a narrow window, or a short one on a touch screen (a phone turned on its side). The same
 * query is the `phone:` variant in index.css.
 */
export const PHONE_QUERY = '(max-width: 639px), (max-height: 499px) and (pointer: coarse)';

const phoneNow = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;

/** Whether the screen is a phone's: the plan fills it, tools run along the bottom, the panel is a sheet. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(phoneNow);
  useEffect(() => {
    const query = window.matchMedia?.(PHONE_QUERY);
    if (!query) return;
    const onChange = () => setPhone(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return phone;
}
