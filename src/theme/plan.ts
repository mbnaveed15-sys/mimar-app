/**
 * Colours of the plan drawing. On screen they follow the theme (CSS variables from themes.css);
 * exports set PRINT_PALETTE on the drawing instead, so plans print the same in every theme.
 * They are applied with `style` rather than SVG attributes, which don't accept CSS variables everywhere.
 */
export const PLAN = {
  paper: 'var(--plan-paper)',
  grid: 'var(--plan-grid)',
  gridMajor: 'var(--plan-grid-major)',
  wall: 'var(--plan-wall)',
  wallEdge: 'var(--plan-wall-edge)',
  room: 'var(--plan-room)',
  dim: 'var(--plan-dim)',
  ink: 'var(--plan-ink)',
  inkMuted: 'var(--plan-ink-muted)',
  furniture: 'var(--plan-furniture)',
  furnitureEdge: 'var(--plan-furniture-edge)',
  glass: 'var(--plan-glass)',
  selection: 'var(--plan-selection)',
  selectedWall: 'var(--plan-selected-wall)',
  draft: 'var(--plan-draft)',
} as const;

/** Print colours: white paper, grey walls with near-black edges, dark grey dimensions. */
export const PRINT_PALETTE: Record<string, string> = {
  '--plan-paper': '#FFFFFF',
  '--plan-grid': '#E6E6E6',
  '--plan-grid-major': '#CFCFCF',
  '--plan-wall': '#D9D6D0',
  '--plan-wall-edge': '#1A1A1A',
  '--plan-room': '#F4F4F2',
  '--plan-dim': '#333333',
  '--plan-ink': '#1A1A1A',
  '--plan-ink-muted': '#444444',
  '--plan-furniture': '#FFFFFF',
  '--plan-furniture-edge': '#3A3A3A',
  '--plan-glass': '#BFE3F5',
  '--plan-selection': '#1D6FB8',
  '--plan-selected-wall': '#BFD4EA',
  '--plan-draft': '#A63D26',
};
