import { expect, test, type Page } from '@playwright/test';
import { menu, ready } from './helpers';

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

test('builds, selects, paints and orbits in the 3D view', async ({ page }) => {
  // Many steps, each drawn by software 3D on test machines: give it room when they are busy.
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();

  // A rectangle of walls, clicked out on the floor.
  await page.keyboard.press('r');
  await clickAt(page, 0.35, 0.4);
  await page.mouse.move(...(await spot(page, 0.6, 0.62)), { steps: 5 });
  await expect(page.getByTestId('tool-hint')).toContainText('opposite corner');
  await clickAt(page, 0.6, 0.62);
  await expect(view).not.toHaveAttribute('data-solids', '0');

  // A wall typed to length: click where it starts, point the way, type 10' and Enter.
  await page.keyboard.press('l');
  await clickAt(page, 0.7, 0.45);
  await page.mouse.move(...(await spot(page, 0.8, 0.45)), { steps: 3 });
  await page.keyboard.type(`10'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  // Click a wall to select it, then paint it brick.
  await page.keyboard.press('Space');
  await clickAt(page, 0.35, 0.4);
  await expect(page.getByText('Selected: wall')).toBeVisible();
  await page.getByRole('button', { name: 'Brick', exact: true }).click();
  await page.keyboard.press('b');
  await clickAt(page, 0.35, 0.4);
  await page.keyboard.press('Space');
  await clickAt(page, 0.35, 0.4);
  await expect(page.getByText('Material: Brick')).toBeVisible();

  // Right-click for the item's menu.
  await page.mouse.click(...(await spot(page, 0.35, 0.4)), { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Middle-drag orbits without drawing or changing anything.
  const solids = await view.getAttribute('data-solids');
  await page.keyboard.press('l');
  await page.mouse.move(...(await spot(page, 0.5, 0.5)));
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(...(await spot(page, 0.6, 0.45)), { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect(view).toHaveAttribute('data-solids', solids!);

  // Back in 2D, everything drawn in 3D is on the plan.
  await menu(page, 'View', '2D plan');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('the Orbit tool opens the 3D view and leaves it on the Select tool when going back', async ({ page }) => {
  await page.keyboard.press('o');
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();
  await expect(page.getByTestId('tool-hint')).toContainText('turn around the building');
  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a selection box in 3D is drawn on screen, picks mixed items, and survives the horizon', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();
  await page.keyboard.press('r');
  await clickAt(page, 0.4, 0.45);
  await page.mouse.move(...(await spot(page, 0.6, 0.6)), { steps: 3 });
  await page.keyboard.type(`12',10'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('c');
  await clickAt(page, 0.3, 0.3);
  await page.keyboard.press('u');
  await clickAt(page, 0.75, 0.75);
  await page.keyboard.press('Space');

  // Left to right over everything: a window selection, drawn as a box on screen.
  await page.mouse.move(...(await spot(page, 0.05, 0.05)));
  await page.mouse.down();
  await page.mouse.move(...(await spot(page, 0.95, 0.95)), { steps: 8 });
  await expect(page.getByTestId('selection-box')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('selection-box')).toHaveCount(0);
  await expect(page.getByText(/4 walls, 1 column, 1 stair, 1 room/)).toBeVisible();

  // Tilt towards the horizon and drag a box up into the sky: nothing breaks.
  await page.mouse.move(...(await spot(page, 0.5, 0.5)));
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(...(await spot(page, 0.5, 0.15)), { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await page.mouse.move(...(await spot(page, 0.9, 0.95)));
  await page.mouse.down();
  await page.mouse.move(...(await spot(page, 0.05, 0.02)), { steps: 10 });
  await page.mouse.up();
  await clickAt(page, 0.5, 0.9);
  await expect(view).not.toHaveAttribute('data-solids', '0');
  expect(errors).toEqual([]);
});

test('a mixed selection in 2D names every kind of item', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const plan = page.getByTestId('plan-canvas');
  const box = (await plan.boundingBox())!;
  const p = (fx: number, fy: number): [number, number] => [box.x + box.width * fx, box.y + box.height * fy];
  await page.keyboard.press('c');
  await page.mouse.click(...p(0.3, 0.3));
  await page.keyboard.press('n');
  await page.mouse.click(...p(0.3, 0.3));
  await page.mouse.click(...p(0.5, 0.3));
  await page.keyboard.press('Escape');
  await page.keyboard.press('u');
  await page.mouse.click(...p(0.6, 0.6));
  await page.keyboard.press('Control+a');
  await expect(page.getByText(/1 column, 1 beam, 1 stair/)).toBeVisible();
  expect(errors).toEqual([]);
});
