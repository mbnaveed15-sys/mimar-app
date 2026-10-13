import type { EndMark } from '../../lib/dimStyle';

/** A dimension line's end mark (tick, arrow or dot), in the dimension's colour. */
export function DimEnd({ mark, colour, width }: { mark: EndMark; colour: string; width: number }) {
  if (mark.kind === 'line') return <line x1={mark.a.x} y1={mark.a.y} x2={mark.b.x} y2={mark.b.y} strokeWidth={width} />;
  if (mark.kind === 'dot')
    return <circle cx={mark.c.x} cy={mark.c.y} r={mark.r} style={{ fill: colour }} stroke="none" />;
  return <path d={`M${mark.pts.map((p) => `${p.x} ${p.y}`).join('L')}Z`} style={{ fill: colour }} stroke="none" />;
}
