import { expect, test } from '@playwright/test';
import { at, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('columns, beams and slabs on two floors, shown stacked in 3D', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('r');
  await click(2, 2);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`20',16'`);
  await page.keyboard.press('Enter');

  await page.keyboard.press('c');
  for (const [x, y] of [
    [2, 2],
    [22, 2],
  ])
    await click(x, y);
  await expect(page.locator('[data-type="column"]')).toHaveCount(2);

  await page.keyboard.press('n');
  await click(2, 2);
  await click(22, 2);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="beam"]')).toHaveCount(1);

  await page.keyboard.press('Shift+A');
  await click(10, 10); // inside the walls: a slab over the room, out to the wall centres
  await expect(page.locator('[data-type="slab"]')).toHaveCount(1);

  // Add a floor: the ground floor shows faintly, and new walls go on the first floor.
  await page.getByRole('button', { name: /^Floor:/ }).click();
  await page.getByRole('menuitem', { name: 'Add floor above' }).click();
  await expect(page.getByRole('button', { name: 'Floor: First floor' })).toBeVisible();
  await expect(page.getByTestId('level-below')).toBeVisible();
  await page.keyboard.press('l');
  await click(2, 2);
  await click(12, 2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('PageDown');
  await expect(page.getByRole('button', { name: 'Floor: Ground floor' })).toBeVisible();
  await expect(page.getByTestId('level-below')).toHaveCount(0);

  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(view).toHaveAttribute('data-slabs', '1');
});
