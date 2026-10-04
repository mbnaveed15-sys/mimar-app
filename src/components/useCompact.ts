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
