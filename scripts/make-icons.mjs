// Draws the web app icons from public/favicon.svg. Run again after changing the logo:
//   node scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const TILE = '#A63D26';
const icons = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
  // Maskable icons may be cropped to a circle: keep the logo inside the middle 80%.
  { file: 'maskable-512.png', size: 512, pad: 0.12 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, pad } of icons) {
  const inner = Math.round(size * (1 - 2 * pad));
  const logo = svg.replace('<svg ', `<svg style="width:${inner}px;height:${inner}px;display:block" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${pad ? TILE : 'transparent'}">${logo}</body>`,
  );
  await page.screenshot({
    path: new URL(`../public/icons/${file}`, import.meta.url).pathname,
    omitBackground: !pad,
  });
}
await browser.close();
console.log('Icons written to public/icons');
