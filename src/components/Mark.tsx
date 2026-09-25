/**
 * The Mimar mark, in a 96 × 96 box: an M with depth, like a block seen from a corner. The same
 * shape is written into the logo files by scripts/logo.mjs; keep the two in step.
 */
export const MARK_M = 'M20 77V27H32L46 47L60 27H72V77H61V47L46 67L31 47V77Z';
const DEPTH_STEPS = 6;
const STEP = [0.9, -0.75] as const;

/** The Mimar mark in the current theme, on a rounded tile (or on its own). */
export function Mark({ size = 28, bare = false }: { size?: number; bare?: boolean }) {
  const ink = bare ? 'var(--ink)' : 'var(--mark-ink)';
  // The side of the M: a darker tile colour on the tile, the ink faded on its own.
  const side = bare ? 'var(--ink)' : 'color-mix(in srgb, var(--mark-tile) 55%, black)';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Mimar" className="block flex-none">
      {!bare && <rect width="96" height="96" rx="22" style={{ fill: 'var(--mark-tile)' }} />}
      {Array.from({ length: DEPTH_STEPS }, (_, i) => {
        const k = DEPTH_STEPS - i;
        return (
          <path
            key={k}
            d={MARK_M}
            transform={`translate(${STEP[0] * k} ${STEP[1] * k})`}
            style={{ fill: side }}
            fillOpacity={bare ? 0.35 : 1}
          />
        );
      })}
      <path d={MARK_M} style={{ fill: ink }} />
    </svg>
  );
}
