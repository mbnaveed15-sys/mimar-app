/** The arches of the Mimar mark, in a 96 × 96 box. */
export const MARK_PATH =
  'M26 74V46A22 22 0 0 1 37 26.95A22 22 0 0 1 48 46A22 22 0 0 1 59 26.95A22 22 0 0 1 70 46V74M48 46V74';

/** The Mimar mark in the current theme: two arches on a ground line, on a rounded tile. */
export function Mark({ size = 28, bare = false }: { size?: number; bare?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Mimar" className="block flex-none">
      {!bare && <rect width="96" height="96" rx="22" style={{ fill: 'var(--mark-tile)' }} />}
      <g transform="translate(0 -2)" fill="none" style={{ stroke: bare ? 'var(--ink)' : 'var(--mark-ink)' }}>
        <path d={MARK_PATH} strokeWidth={8} strokeMiterlimit={10} />
        <path d="M20 83.5H76" strokeWidth={3.5} strokeLinecap="round" />
      </g>
    </svg>
  );
}
