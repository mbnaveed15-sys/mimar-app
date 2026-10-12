import { expect, test } from '@playwright/test';
import { at, menu, ready, tool } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('the furniture library: groups, folding headings, search and recent picks', async ({ page }) => {
  await tool(page, 'furniture');
  const library = page.getByLabel('Furniture library');
  // A house opens on Home.
  await expect(library.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await library.getByRole('button', { name: 'Office', exact: true }).click();
  await library.getByRole('button', { name: 'Desk', exact: true }).click();
  await page.mouse.click(...(await at(page, 300, 300)));
  await expect(page.locator('[data-type="furniture"] [data-symbol="office-desk"]')).toHaveCount(1);
  // It is in the Recent row now.
  await expect(library.getByText('Recent')).toBeVisible();

  // A heading folds its items away.
  await library.getByRole('button', { name: 'Meeting', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Meeting table (6)' })).toHaveCount(0);

  // Search finds an item in any group.
  await library.getByLabel('Search furniture').fill('urinal');
  await expect(library.getByRole('button', { name: 'Urinal' })).toBeVisible();
});

test('a building is checked from the start: its use, and its plot by its own setbacks', async ({ page }) => {
  await menu(page, 'File', 'New');
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByText('Building', { exact: true }).click();
  await dialog.getByLabel('Building use').selectOption('hospital');
  await dialog.getByRole('button', { name: 'Start' }).click();
  const check = page.getByTestId('plan-check');
  await expect(check.locator('[data-check="local-bylaws"]')).toBeVisible();
  await expect(check.locator('[data-check="use-people"]')).toBeVisible();

  // The library opens on the building's own group.
  await tool(page, 'furniture');
  await expect(
    page.getByLabel('Furniture library').getByRole('button', { name: 'Health', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('the Plot tool takes left and right side setbacks', async ({ page }) => {
  await page.keyboard.press('Shift+P');
  await expect(page.getByLabel('Left side')).toBeVisible();
  await expect(page.getByLabel('Right side')).toBeVisible();
});
