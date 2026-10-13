import { chromium } from '@playwright/test';
const [,, out, zoom] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5173/?welcome');
await page.getByRole('dialog', { name: 'Welcome to Mimar' }).getByRole('button', { name: /sample 5-marla/ }).click({ timeout: 60000 });
for (let i = 1; i <= 5; i++) await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Start drawing' }).click();
if (zoom) { const c = page.getByTestId('plan-canvas'); const b = await c.boundingBox(); await page.mouse.move(b.x + b.width/2, b.y + b.height/2); for (let i = 0; i < Number(zoom); i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(100);} }
if (process.env.SETUP) await eval(process.env.SETUP);
await page.waitForTimeout(500);
await page.screenshot({ path: out });
if (process.env.AFTER) console.log(await eval(process.env.AFTER));
await browser.close();
