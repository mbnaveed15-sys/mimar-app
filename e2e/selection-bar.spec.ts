import { expect, test } from '@playwright/test';
import { at, menu, ready } from './helpers';

const FT = 30.48;

test('with a mouse the selection bar is off until View > Selection bar turns it on', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  await page.keyboard.press('w');
  await page.mouse.click(...(await at(page, 4 * FT, 4 * FT)));
  await page.mouse.click(...(await at(page, 20 * FT, 4 * FT)));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  const wall = (await page.locator('[data-type="wall"]').first().boundingBox())!;
  await page.mouse.click(wall.x + wall.width / 2, wall.y + wall.height / 2);
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(bar).toHaveCount(0);

  await menu(page, 'View', 'Selection bar');
  await bar.getByRole('button', { name: 'Rotate 90°' }).click();
  const turned = (await page.locator('[data-type="wall"]').first().boundingBox())!;
  expect(turned.height).toBeGreaterThan(turned.width);
  // It is remembered.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mimar.prefs') ?? '{}').selectionBar)).toBe(true);
});
