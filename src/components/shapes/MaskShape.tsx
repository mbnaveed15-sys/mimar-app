import type { Mask } from '../../types';

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
      fill={color ?? 'rgba(255,255,255,0.2)'}
      stroke="#666"
      strokeDasharray="4 4"
    />
  );
}
