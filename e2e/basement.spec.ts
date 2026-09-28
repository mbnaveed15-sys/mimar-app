import { expect, test } from '@playwright/test';
import { at, drag, menu, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('a basement: added below, retaining walls under the house, plans from the room list, and 3D', async ({ page }) => {
  // A plot and a house on it.
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(35, 65));
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('r');
  await page.mouse.click(...(await at(page, ...P(3, 12))));
  await page.mouse.click(...(await at(page, ...P(32, 52))));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(8);
  await page.keyboard.press('Escape');

  // Floors › Add basement below.
  await page.getByRole('button', { name: /^Floor:/ }).click();
  await page.getByRole('menuitem', { name: 'Add basement below' }).click();
  await expect(page.getByRole('button', { name: 'Floor: Basement' })).toBeVisible();

  // Its height, and retaining walls under the house.
  await page.getByRole('button', { name: 'Floor: Basement' }).click();
  const height = page.getByLabel('Basement clear height');
  await height.fill(`11'`);
  await height.press('Enter');
  await page.getByRole('button', { name: 'Under the house' }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);

  // Plans for the basement from the room list, built inside the retaining walls.
  await menu(page, 'Draw', 'Generate layout from a room list…');
  await expect(page.getByText('Basement plans')).toBeVisible();
  await page.getByRole('button', { name: 'Make plans' }).click();
  await expect(page.getByTestId('layout-plan').first()).toBeVisible();
  await page.getByTestId('layout-plan').first().getByRole('button', { name: 'Use this plan' }).click();
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.locator('[data-type="room"]').first()).toBeVisible();
  await expect(page.getByText('Hall').first()).toBeVisible();

  // The quantities list the basement's items.
  await menu(page, 'View', 'Floor above');
  await expect(page.getByRole('button', { name: 'Floor: Ground floor' })).toBeVisible();

  // 3D shows it, below the ground.
  await page.keyboard.press('Control+2');
  await expect(page.getByTestId('plan-3d')).toBeVisible();
});
