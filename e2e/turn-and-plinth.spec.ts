import { expect, test, type Page } from '@playwright/test';
import { at, ready, tool } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('mimar.plan') ?? '{}').doc);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('furniture is turned before it is placed, and its size can be reset', async ({ page }) => {
  await tool(page, 'furniture');
  const library = page.getByLabel('Furniture library');
  await library.getByRole('button', { name: /King bed/ }).click();
  await page.mouse.move(...(await at(page, ...P(30, 30))));
  await expect(page.getByTestId('furniture-ghost')).toBeVisible();
  // V turns it a quarter, the buttons turn it either way, and the Angle box shows where it is.
  await page.keyboard.press('v');
  await expect(page.getByLabel('Angle (°)')).toHaveValue('90');
  await library.getByRole('button', { name: 'Turn right' }).click();
  await library.getByRole('button', { name: 'Turn left' }).click();
  await expect(page.getByLabel('Angle (°)')).toHaveValue('90');
  await page.mouse.click(...(await at(page, ...P(30, 30))));
  await expect.poll(async () => (await saved(page))?.elements?.[0]?.rotation).toBe(90);
  // The next one is turned the same way.
  await expect(page.getByLabel('Angle (°)')).toHaveValue('90');

  await tool(page, 'select');
  await page.mouse.click(...(await at(page, ...P(30, 30))));
  await expect(page.getByText('Selected: King bed')).toBeVisible();
  const width = page.getByLabel('Width');
  await width.fill(`8'`);
  await width.press('Enter');
  await expect(width).toHaveValue(`8' 0"`);
  await page.getByRole('button', { name: 'Reset size' }).click();
  await expect(width).toHaveValue(`6' 0"`);
});

test('the plinth under a wall has its own settings, and can be left off', async ({ page }) => {
  await tool(page, 'wall');
  await page.mouse.move(...(await at(page, ...P(2, 2))));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...P(20, 2))), { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Escape');

  await tool(page, 'select');
  await page.mouse.click(...(await at(page, ...P(10, 2))));
  const row = page.getByTestId('wall-plinth');
  await expect(row.getByLabel('Plinth')).toHaveValue('rest');
  await row.getByRole('button', { name: 'Plinth settings' }).click();

  const panel = page.getByTestId('plinth-panel');
  await expect(panel).toBeVisible();
  const out = panel.getByLabel('Stands out past the wall faces');
  await out.fill(`3"`);
  await out.press('Enter');
  await expect.poll(async () => (await saved(page))?.plinth?.projectMm).toBeCloseTo(76.2, 0);

  await panel.getByRole('button', { name: 'Leave off under this wall' }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(async () => (await saved(page))?.elements?.[0]?.noPlinth).toBe(true);
  await page.mouse.click(...(await at(page, ...P(10, 2))));
  await expect(page.getByTestId('wall-plinth').getByLabel('Plinth')).toHaveValue('none');
});
