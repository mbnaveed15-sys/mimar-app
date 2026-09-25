import { expect, test } from '@playwright/test';
import { openSection } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('switches between the five themes and remembers the choice', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'brick');
  await openSection(page, 'Theme');
  const themes = page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio');
  await expect(themes).toHaveCount(5);

  const canvasColor = () => page.getByTestId('plan-canvas').evaluate((el) => getComputedStyle(el).backgroundColor);
  const brick = await canvasColor();
  await page.getByRole('radio', { name: 'Black & gold' }).click();
  await expect(html).toHaveAttribute('data-theme', 'gold');
  expect(await canvasColor()).not.toBe(brick);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'gold');
  await expect(page.getByRole('radio', { name: 'Black & gold' })).toHaveAttribute('aria-checked', 'true');
});

test("the grid can be restyled, hidden with Ctrl+' and its snapping turned off", async ({ page }) => {
  const grid = page.getByTestId('plan-grid');
  await openSection(page, 'Grid');
  await expect(grid).toBeVisible();
  await expect(grid.locator('pattern')).toHaveCount(2); // minor and major lines

  // Sliders with stops: the first major stop is Off.
  await page.getByLabel('Major grid size').fill('0');
  await expect(grid.locator('pattern')).toHaveCount(1);
  await page.getByRole('group', { name: 'Grid style' }).getByRole('button', { name: 'Dots' }).click();
  await expect(grid.locator('pattern circle')).toHaveCount(1);

  await page.getByLabel('Minor grid size').fill('5'); // 1", 2", 3", 6", 1', 2'
  await expect(page.getByLabel('Custom spacing')).toHaveValue(`2' 0"`);
  await page.getByLabel('Major grid size').fill('4'); // every 5
  await expect(page.getByLabel('Major grid size')).toHaveAttribute('aria-valuetext', `10' 0" (every 5)`);

  await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(`Control+'`);
  await expect(grid).toHaveCount(0);
  await expect(page.getByLabel('Show')).not.toBeChecked();
  await page.keyboard.press(`Control+'`);
  await expect(grid).toBeVisible();

  await page.getByLabel('Snap to grid').uncheck();
  await page.reload();
  await expect(page.getByLabel('Snap to grid')).not.toBeChecked();
  await expect(page.getByTestId('plan-grid').locator('pattern circle')).toHaveCount(2); // minor and major dots
});
