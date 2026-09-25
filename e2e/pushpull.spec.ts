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

test('shapes on the floor and a wall, pushed and pulled in 3D: a block and an opening', async ({ page }) => {
  test.slow(); // software 3D on test machines
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  // A 20' × 16' room, and a flat rectangle on its floor drawn in 2D.
  await page.keyboard.press('r');
  await click(0, 0);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`20',16'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+R');
  await click(3, 3);
  await click(7, 6);
  await expect(page.locator('[data-type="block"][data-flat]')).toHaveCount(1);
  // Push/Pull only works in 3D.
  await page.keyboard.press('p');
  await expect(page.getByTestId('tool-hint')).toContainText('3D view');

  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(view).toHaveAttribute('data-shapes', '1');

  // A rectangle on the front wall's face (the view is the same every time: 1400 × 900).
  await page.keyboard.press('Shift+R');
  await page.mouse.move(430, 470);
  await page.mouse.click(430, 470);
  await page.mouse.move(540, 560, { steps: 4 });
  await page.mouse.click(540, 560);
  await expect(view).toHaveAttribute('data-shapes', '2');
  await expect(page.getByText('Selected: shape on a wall')).toBeVisible();

  // Push it through the wall: an open hole.
  await page.keyboard.press('p');
  await page.mouse.move(485, 515);
  await page.mouse.click(485, 515);
  await page.keyboard.type(`9"`);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Selected: opening')).toBeVisible();
  await expect(view).toHaveAttribute('data-shapes', '1');

  // Pull the floor shape up into a 3' block.
  await page.mouse.move(545, 405);
  await page.mouse.click(545, 405);
  await page.keyboard.type(`3'`);
  await page.keyboard.press('Enter');
  await expect(view).toHaveAttribute('data-blocks', '1');
  await expect(page.getByLabel('Height', { exact: true })).toHaveValue(`3' 0"`);

  // Undo takes the block back to a flat shape; the plan shows the hole as an open gap.
  await page.keyboard.press('Control+z');
  await expect(view).toHaveAttribute('data-blocks', '0');
  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('open-hole')).toHaveCount(1);
  expect(errors).toEqual([]);
});
