import { expect, test } from '@playwright/test';
import { at, menu, openSection, ready } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('a new building: metric and round, its own sections, room types and floor heights', async ({ page }) => {
  await menu(page, 'File', 'New');
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByText('Building', { exact: true }).click();
  await dialog.getByLabel('Building use').selectOption('school');
  await dialog.getByRole('button', { name: 'Start' }).click();
  await expect(dialog).toHaveCount(0);

  // The house's sections are off; the Project section says what it is.
  await expect(page.locator('summary', { hasText: 'Quantities & cost' })).toHaveCount(0);
  await expect(page.locator('summary', { hasText: 'Layout from a room list' })).toHaveCount(0);
  await openSection(page, 'Project');
  await expect(page.getByLabel('Kind of project')).toHaveValue('building');
  await expect(page.getByLabel('Building use', { exact: true })).toHaveValue('school');
  await expect(page.getByLabel('Project units')).toHaveValue('metric');
  await page.getByRole('checkbox', { name: 'Quantities & cost' }).check();
  await expect(page.locator('summary', { hasText: 'Quantities & cost' })).toHaveCount(1);

  // Round metric walls, 200 mm to start.
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: '200 mm', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(...(await at(page, 0, 0)));
  await page.mouse.click(...(await at(page, 900, 700)));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  await page.keyboard.press('Escape');

  // A room, named from the school's room types; no marla on a building.
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('a');
  await page.mouse.click(...(await at(page, 450, 350)));
  await expect(page.locator('[data-type="room"]')).toHaveCount(1);
  await expect(page.locator('#room-names option[value="Classroom"]')).toHaveCount(1);
  await expect(page.getByTestId('room-area').first()).not.toContainText('marla');

  // The ground floor gets its own wall height.
  await page.getByRole('button', { name: /^Floor:/ }).click();
  const height = page.getByLabel('Wall height of the ground floor');
  await expect(height).toHaveValue(/3000|3\.0|3 m/);
  await height.fill('4500');
  await height.press('Enter');
  await expect(page.getByRole('button', { name: 'Use the usual height' })).toBeVisible();
});

test('a free project hides the room list command; Esc on the dialog keeps a house', async ({ page }) => {
  await menu(page, 'File', 'New');
  await page.getByRole('dialog', { name: 'New project' }).getByText('Free project', { exact: true }).click();
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menubar').getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(page.getByRole('menu').getByLabel('Generate layout from a room list…', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await menu(page, 'File', 'New');
  await page.keyboard.press('Escape');
  await openSection(page, 'Project');
  await expect(page.getByLabel('Kind of project')).toHaveValue('house');
  await expect(page.locator('summary', { hasText: 'Quantities & cost' })).toHaveCount(1);
});
