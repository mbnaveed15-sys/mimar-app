import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

/** A point in the 3D view, as fractions of its width and height. */
async function spot(page: Page, fx: number, fy: number): Promise<[number, number]> {
  const box = (await page.getByTestId('plan-3d').boundingBox())!;
  return [box.x + box.width * fx, box.y + box.height * fy];
}

async function clickAt(page: Page, fx: number, fy: number) {
  const p = await spot(page, fx, fy);
  await page.mouse.move(...p);
  await page.mouse.click(...p);
}

/** A 12' by 10' room of walls, drawn in 3D. */
async function room3d(page: Page) {
  await page.keyboard.press('Control+2');
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();
  await page.keyboard.press('r');
  await clickAt(page, 0.4, 0.45);
  await page.mouse.move(...(await spot(page, 0.6, 0.6)), { steps: 3 });
  await page.keyboard.type(`12',10'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
}

test('3D zoom extents keeps the view direction; standard views and parallel projection', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room3d(page);
  const canvas = page.getByTestId('plan-3d-canvas');
  // Keep the pointer off the view so no snap marker is drawn.
  await page.mouse.move(1, 1);
  const shot = () => canvas.screenshot();

  await page.keyboard.press('0');
  const framed = await shot();
  await page.keyboard.press('=');
  await page.keyboard.press('=');
  await page.keyboard.press('=');
  const zoomed = await shot();
  expect(zoomed.equals(framed)).toBe(false);
  await page.keyboard.press('0');
  expect((await shot()).equals(framed)).toBe(true);

  await page.getByLabel('Standard view').selectOption('top');
  const top = await shot();
  expect(top.equals(framed)).toBe(false);
  const projection = page.getByRole('button', { name: /^(Parallel|Perspective)$/ });
  await expect(projection).toHaveAttribute('aria-pressed', 'false');
  await projection.click();
  await expect(projection).toHaveAttribute('aria-pressed', 'true');
  await expect(projection).toHaveText('Parallel');
  expect((await shot()).equals(top)).toBe(false);
  expect(errors).toEqual([]);
});

test('3D: paint one side of a wall, and a drag from a wall draws a selection box', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room3d(page);

  // From the front, the middle of the view is the front wall's outside face.
  await page.getByLabel('Standard view').selectOption('front');
  await page.getByRole('button', { name: 'Brick', exact: true }).click();
  await page.keyboard.press('b');
  await clickAt(page, 0.5, 0.5);
  await page.keyboard.press('Space');
  await clickAt(page, 0.5, 0.5);
  await expect(page.getByText('Selected: wall')).toBeVisible();
  const sides = page.getByTestId('wall-sides');
  await expect(sides).toContainText('Outside side: Brick');
  await expect(sides).toContainText(/Side facing .*: as wall/);
  // The rest of the wall keeps its own material.
  await expect(page.getByText('Material: Brick')).toHaveCount(0);

  // A press on the wall and a drag across the view: a box, as in SketchUp (Move is M).
  await page.getByLabel('Standard view').selectOption('iso');
  await page.mouse.move(...(await spot(page, 0.5, 0.5)));
  await page.mouse.down();
  await page.mouse.move(...(await spot(page, 0.02, 0.02)), { steps: 8 });
  await expect(page.getByTestId('selection-box')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText(/\d+ selected/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('3D: double-click takes a wall with its door, triple-click every joined wall', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await room3d(page);
  await page.getByLabel('Standard view').selectOption('front');
  // A door in the middle of the front wall.
  await page.keyboard.press('d');
  await clickAt(page, 0.5, 0.5);
  await page.keyboard.press('Space');
  // Click the wall beside the door, twice, then three times.
  const p = await spot(page, 0.35, 0.3);
  await page.mouse.move(...p);
  await page.mouse.click(...p);
  await expect(page.getByText('Selected: wall')).toBeVisible();
  // Clicks closer together than half a second count together.
  await page.waitForTimeout(600);
  await page.mouse.click(...p, { clickCount: 2 });
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.waitForTimeout(600);
  await page.mouse.click(...p, { clickCount: 3 });
  await expect(page.getByText('5 selected')).toBeVisible();
  expect(errors).toEqual([]);
});
