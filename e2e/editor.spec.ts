import { expect, test } from '@playwright/test';
import { at, menu, ready } from './helpers';

const FT = 30.48;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('SketchUp keys pick tools, and typed lengths draw exact walls', async ({ page }) => {
  const rail = page.getByRole('navigation', { name: 'Tools' });
  await page.keyboard.press('l');
  await expect(rail.getByRole('button', { name: 'Wall' })).toHaveAttribute('aria-pressed', 'true');

  await page.mouse.click(...(await at(page, 2 * FT, 2 * FT)));
  await page.mouse.move(...(await at(page, 8 * FT, 2 * FT)), { steps: 3 });
  await page.keyboard.type(`12'6`);
  await expect(page.getByLabel('Measurements')).toHaveValue(`12'6`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
  await expect(page.locator('[data-type="dimension"] text')).toHaveText(`12' 6"`);

  await page.keyboard.press('r');
  await expect(rail.getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(...(await at(page, 2 * FT, 10 * FT)));
  await page.mouse.move(...(await at(page, 5 * FT, 13 * FT)), { steps: 3 });
  await page.keyboard.type(`10',8'`);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);
  await expect(page.locator('[data-type="room"]')).toHaveCount(1);

  await page.keyboard.press(' ');
  await expect(rail.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
});

test('menus, search, the shortcut list and the right-click menu', async ({ page }) => {
  await menu(page, 'View', 'Pro mode');
  await expect(page.getByRole('radio', { name: 'Pro' })).toHaveAttribute('aria-checked', 'true');

  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Search actions' });
  await search.getByRole('textbox').fill('rectangle');
  await page.keyboard.press('Enter');
  await expect(search).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Rectangle' }),
  ).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);

  // Draw a wall, then right-click it to rotate it.
  await page.keyboard.press('l');
  await page.mouse.click(...(await at(page, 2 * FT, 2 * FT)));
  await page.mouse.click(...(await at(page, 12 * FT, 2 * FT)));
  await page.keyboard.press('Escape');
  await page.mouse.click(...(await at(page, 7 * FT, 2 * FT)), { button: 'right' });
  const context = page.getByRole('menu', { name: 'Context menu' });
  await context.getByRole('menuitem', { name: 'Rotate 90°' }).click();
  const wall = page.locator('[data-type="wall"]');
  const box = await wall.boundingBox();
  expect(box!.height).toBeGreaterThan(box!.width);
});
