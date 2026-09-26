import { expect, test, type Page } from '@playwright/test';
import { at, ready } from './helpers';

const FT = 30.48;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

/** A point in the 3D side, as fractions of its width and height. */
async function spot(page: Page, fx: number, fy: number): Promise<[number, number]> {
  const box = (await page.getByTestId('plan-3d').boundingBox())!;
  return [box.x + box.width * fx, box.y + box.height * fy];
}

test('split view: draw on the plan and see it in 3D, draw in 3D and see it on the plan', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.keyboard.press('Control+3');
  await expect(page.getByRole('radio', { name: 'Split' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();

  // A room drawn on the plan side shows in 3D.
  await page.keyboard.press('r');
  await page.mouse.move(...(await at(page, 5 * FT, 5 * FT)));
  await page.mouse.click(...(await at(page, 5 * FT, 5 * FT)));
  await page.keyboard.type(`12',10'`);
  await page.keyboard.press('Enter');
  const view = page.getByTestId('plan-3d');
  await expect(view).not.toHaveAttribute('data-solids', '0');

  // A wall drawn on the 3D side shows on the plan.
  await page.keyboard.press('l');
  await page.mouse.move(...(await spot(page, 0.2, 0.8)));
  await page.mouse.click(...(await spot(page, 0.2, 0.8)));
  await page.mouse.move(...(await spot(page, 0.35, 0.8)), { steps: 3 });
  await page.keyboard.type(`8'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);

  // The 3D camera shows on the plan.
  await expect(page.getByTestId('camera-eye')).toHaveCount(1);

  // Back to one view.
  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('split-view')).toHaveCount(0);
  await expect(page.getByTestId('camera-eye')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the divider drags, takes arrow keys and is remembered; narrow windows stack the sides', async ({ page }) => {
  await page.keyboard.press('Control+3');
  const divider = page.getByRole('separator', { name: /Divider/ });
  await expect(divider).toHaveAttribute('aria-valuenow', '50');
  const box = (await divider.boundingBox())!;
  const split = (await page.getByTestId('split-view').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(split.x + split.width * 0.3, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', '30');
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '35');

  await page.reload();
  await ready(page);
  await page.keyboard.press('Control+3');
  await expect(page.getByRole('separator', { name: /Divider/ })).toHaveAttribute('aria-valuenow', '35');

  await page.setViewportSize({ width: 1024, height: 760 });
  await expect(page.getByRole('separator', { name: /Divider/ })).toHaveAttribute('aria-orientation', 'horizontal');
  const plan = (await page.getByTestId('split-2d').boundingBox())!;
  const model = (await page.getByTestId('split-3d').boundingBox())!;
  expect(model.y).toBeGreaterThan(plan.y + plan.height - 2);
});
