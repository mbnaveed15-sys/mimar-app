import { expect, test } from '@playwright/test';
import { at, drag, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('an L-shaped plot drawn corner by corner, with typed sides and its walls', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('Shift+P');
  await page.getByRole('button', { name: 'Any shape' }).click();
  // Road side first, along the bottom: then up, in, up, and back across the top.
  await click(0, 20);
  await page.mouse.move(...(await at(page, ...P(5, 20))));
  await page.keyboard.type(`20'`);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('plot-draft')).toHaveCount(1);
  await click(20, 10);
  await click(10, 10);
  await click(10, 0);
  await click(0, 0);
  // A corner that would make the sides cross is refused.
  await click(15, 5);
  await expect(page.getByText('would cross another side')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="plot"]')).toHaveCount(1);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(6);
  await expect(page.getByTestId('road-mark')).toHaveCount(1);

  // Select it: the Sides list, from the road going round, with two back sides.
  await page.keyboard.press('Space');
  await click(5, 15);
  const sides = page.getByTestId('plot-sides');
  await expect(sides).toBeVisible();
  await expect(page.getByTestId('side-number')).toHaveCount(6);
  await expect(page.getByTestId('plot-side-1')).toContainText('main road');
  await expect(page.getByLabel('Side 1 type')).toHaveValue('road');
  // Hovering a row lights up its side.
  await page.getByTestId('plot-side-3').hover();
  await expect(page.getByTestId('face-highlight')).toHaveCount(1);
});

test('a corner plot with a second road, a cut corner, a gate, and a dragged corner', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(40, 50));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('Space');
  await click(20, 25);
  await expect(page.getByTestId('plot-sides')).toBeVisible();

  // Side 2 (going round from the road) becomes a road: a corner plot.
  await page.getByLabel('Side 2 type').selectOption('road');
  await expect(page.getByTestId('road-mark')).toHaveCount(2);
  await expect(page.getByTestId('corner-plot')).toBeVisible();
  await expect(page.getByTestId('plot-side-2')).toContainText('provisional');
  await page.getByLabel('Cut the corner (splay)').check();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);

  // A gate in the middle of the main road's wall.
  await page
    .getByTestId('plot-side-1')
    .getByRole('button', { name: /Add gate/ })
    .click();
  await expect(page.getByTestId('gate')).toHaveCount(1);

  // Drag the back-left corner: the plot and its walls follow; the gate stays.
  await page.keyboard.press('Escape');
  await click(20, 25);
  await drag(page, P(0, 0), P(-5, -5));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);
  await expect(page.getByTestId('gate')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('gate')).toHaveCount(1);

  // It shows in 3D.
  await page.keyboard.press('Control+2');
  await expect(page.getByTestId('plan-3d')).toHaveAttribute('data-floors', '1');
});

test('a plot from before 1.30 gets its walls rebuilt from its sides', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  // A plot with ordinary boundary walls, as older versions made it.
  await page.keyboard.press('Shift+P');
  await page.getByLabel('Boundary wall round the plot').uncheck();
  await drag(page, P(0, 0), P(30, 50));
  await page.keyboard.press('Shift+Z');
  await page.evaluate(() => {
    const raw = localStorage.getItem('mimar.plan');
    if (!raw) throw new Error('no autosave');
  });
  await page.keyboard.press('Space');
  await click(15, 25);
  await expect(page.getByRole('button', { name: 'Rebuild walls from sides' })).toBeVisible();
  await page.getByRole('button', { name: 'Rebuild walls from sides' }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Rebuild walls from sides' })).toHaveCount(0);
});
