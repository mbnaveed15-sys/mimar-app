/** The Mimar mark, in a 96 × 96 box: one pointed mehrab arch standing on a plinth line. */
export const MARK_PATH = 'M30 78V48C30 36 38 28 48 17C58 28 66 36 66 48V78';
export const MARK_GROUND = 'M20 83.5H76';

/** The Mimar mark in the current theme, on a rounded tile. */
export function Mark({ size = 28, bare = false }: { size?: number; bare?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Mimar" className="block flex-none">
      {!bare && <rect width="96" height="96" rx="22" style={{ fill: 'var(--mark-tile)' }} />}
      <g fill="none" style={{ stroke: bare ? 'var(--ink)' : 'var(--mark-ink)' }}>
        <path d={MARK_PATH} strokeWidth={8} strokeMiterlimit={10} />
        <path d={MARK_GROUND} strokeWidth={3.5} strokeLinecap="round" />
      </g>
    </svg>
  );
}
