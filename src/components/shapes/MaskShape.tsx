import type { Mask } from '../../types';
import { PLAN } from '../../theme/plan';

interface Props {
  mask: Mask;
  color?: string;
}

export function MaskShape({ mask, color }: Props) {
  return (
    <polygon
      data-type="mask"
      data-id={mask.id}
      points={mask.points.map((p) => `${p.x},${p.y}`).join(' ')}
      style={{ fill: color ?? 'transparent', stroke: PLAN.inkMuted }}
      strokeDasharray="4 4"
    />
  );
}
