import { expect, test } from '@playwright/test';
import { at, drag, tool } from './helpers';

const FT = 30.48; // plan units per foot

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('places a dimension on a wall, which keeps measuring as the wall changes', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, [10 * FT, 10 * FT], [30 * FT, 10 * FT]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+D');
  await expect(page.getByTestId('dimension-options')).toBeVisible();
  for (const [x, y] of [
    [10 * FT, 10 * FT],
    [30 * FT, 10 * FT],
    [20 * FT, 7 * FT],
  ])
    await page.mouse.click(...(await at(page, x, y)));
  const placed = page.getByTestId('placed-dimension');
  await expect(placed).toHaveCount(1);
  await expect(placed.locator('text')).toHaveText(`20' 0"`);
  // Drag the wall's end further: the dimension follows.
  await tool(page, 'select');
  await page.mouse.click(...(await at(page, 20 * FT, 10 * FT)));
  await drag(page, [30 * FT, 10 * FT], [35 * FT, 10 * FT]);
  await expect(placed.locator('text')).toHaveText(`25' 0"`);
  // Undo puts it back.
  await page.keyboard.press('Control+z');
  await expect(placed.locator('text')).toHaveText(`20' 0"`);
});

test('the Zoom tool zooms to a window, and Zoom previous goes back', async ({ page }) => {
  const level = page.getByTestId('zoom-level');
  const start = await level.textContent();
  const back = page.getByRole('button', { name: 'Zoom previous' });
  await expect(back).toBeDisabled();
  await tool(page, 'zoom');
  await drag(page, [100, 100], [300, 200]);
  await expect(page.getByTestId('zoom-box')).toHaveCount(0);
  expect(await level.textContent()).not.toBe(start);
  await back.click();
  await expect(level).toHaveText(start!);
});
