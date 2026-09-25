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

test('a plot with setbacks and a boundary wall, a gate, and a stair', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('p');
  await click(0, 0);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`25',45'`);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="plot"]')).toHaveCount(1);
  await expect(page.getByTestId('buildable-area')).toHaveCount(1);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  await page.keyboard.press('Shift+Z'); // a 45' plot is taller than the window

  await page.keyboard.press('d');
  await page.getByRole('button', { name: 'Gate', exact: true }).click();
  await click(12, 44.6);
  await expect(page.getByTestId('gate')).toHaveCount(1);

  await page.keyboard.press('u');
  await page.getByRole('button', { name: 'L-shaped' }).click();
  await click(12, 20);
  await expect(page.locator('[data-type="stair"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await click(12, 20);
  await expect(page.getByTestId('stair-risers')).toContainText('risers');

  await page.keyboard.press('Control+2');
  await expect(page.getByTestId('plan-3d')).toHaveAttribute('data-floors', '1');
});

test('raise an item above its floor, by its height or with Alt+arrows, and move it up in 3D', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('c');
  await click(4, 4);
  await page.keyboard.press('Space');
  await click(4, 4);
  const height = page.getByLabel('Height above floor');
  await height.fill(`2'`);
  await height.press('Enter');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`+2' 0"`);

  // Alt+up/down: a grid square at a time.
  await page.getByTestId('plan-canvas').hover();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByTestId('elevation-tag')).not.toHaveText(`+2' 0"`);
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`+2' 0"`);

  // Sunk below the floor.
  await height.fill(`-1'`);
  await height.press('Enter');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`-1' 0"`);

  // In 3D, Move then arrow up locks to the blue axis and takes a typed height.
  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(view).toBeVisible();
  await page.keyboard.press('m');
  const box = (await view.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByText('Blue axis locked (up and down)')).toBeVisible();
  await page.keyboard.type(`3'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`+2' 0"`);
});
