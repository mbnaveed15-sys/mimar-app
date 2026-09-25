// Puts the Mimar mark (an extruded M) into every logo file, then redraws the PNG icons.
//   node scripts/logo.mjs
// The same shape is drawn in the app by src/components/Mark.tsx; keep the two in step.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

export const M = 'M20 77V27H32L46 47L60 27H72V77H61V47L46 67L31 47V77Z';
/** The M is pushed back up and to the right, one step at a time, to give it depth. */
export const DEPTH_STEPS = 6;
export const STEP = [0.9, -0.75];

const TILE = '#A63D26';
const TILE_DEPTH = '#6B2416';
const root = new URL('../', import.meta.url);

function markGroup(ink, depth, depthOpacity = 1) {
  const back = Array.from({ length: DEPTH_STEPS }, (_, i) => {
    const k = DEPTH_STEPS - i;
    return `<path d="${M}" transform="translate(${(STEP[0] * k).toFixed(2)} ${(STEP[1] * k).toFixed(2)})" fill="${depth}"${depthOpacity < 1 ? ` fill-opacity="${depthOpacity}"` : ''}/>`;
  }).join('');
  return `<g>${back}<path d="${M}" fill="${ink}"/></g>`;
}

// The old mark: a group of two stroked paths.
const OLD = /<g fill="none" stroke="(#[0-9A-Fa-f]{6})">.*?<\/g>/s;
const files = [
  'public/favicon.svg',
  'branding/logo/mimar-emblem.svg',
  'branding/logo/mimar-logo.svg',
  'branding/ui/splash.svg',
  'branding/ui/watermark.svg',
];
for (const f of files) {
  const url = new URL(f, root);
  const svg = readFileSync(url, 'utf8');
  const m = svg.match(OLD);
  if (!m) {
    console.log(`${f}: already updated`);
    continue;
  }
  const ink = m[1];
  // On the brick tile the side is dark brick; on its own the side is the ink, faded.
  const onTile = svg.includes(`fill="${TILE}"`);
  writeFileSync(url, svg.replace(OLD, onTile ? markGroup(ink, TILE_DEPTH) : markGroup(ink, ink, 0.35)));
  console.log(`${f}: updated`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, out, width, height) {
  const svg = readFileSync(new URL(file, root), 'utf8').replace(
    '<svg ',
    `<svg style="width:${width}px;height:${height}px;display:block" `,
  );
  await page.setViewportSize({ width, height });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: new URL(out, root).pathname, omitBackground: true });
  console.log(`${out}: drawn`);
}
await render('public/favicon.svg', 'build/icon.png', 512, 512);
await render('public/favicon.svg', 'branding/logo/mimar-icon.png', 256, 256);
await render('branding/logo/mimar-logo.svg', 'branding/logo/mimar-logo.png', 870, 288);
await browser.close();
