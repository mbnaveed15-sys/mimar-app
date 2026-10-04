import { expect, test, type Page } from '@playwright/test';
import { at, ready } from './helpers';

// An iPad held upright: narrow enough for the compact layout, and touch.
test.use({ viewport: { width: 810, height: 1080 }, hasTouch: true });

const FT = 30.48;

async function tap(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tapPlan(page: Page, x: number, y: number) {
  const [px, py] = await at(page, x * FT, y * FT);
  await tap(page, px, py);
  await page.waitForTimeout(80);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('the top bar fits, with the menus behind one Menu button', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(810);
  const bar = page.getByRole('menubar');
  await expect(bar.getByRole('button', { name: 'File', exact: true })).toHaveCount(0);
  await bar.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menu', { name: 'Menus' }).getByRole('menuitem', { name: 'Draw' }).click();
  await page.getByRole('menu').getByLabel('Wall', { exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Wall', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('the side panel opens over the plan as a drawer and closes again', async ({ page }) => {
  const content = page.getByTestId('panel-content');
  await expect(content).toHaveCount(0);
  await page.getByRole('tablist', { name: 'Panels' }).getByRole('tab', { name: 'Materials' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Materials' })).toBeVisible();
  // It covers the plan rather than squeezing it.
  const plan = (await page.getByTestId('plan-canvas').boundingBox())!;
  expect(plan.width).toBeGreaterThan(500);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(content).toHaveCount(0);
});

test('on-screen buttons finish a wall chain and delete the selection', async ({ page }) => {
  const touchBar = page.getByRole('toolbar', { name: 'Touch actions' });
  await page.keyboard.press('w');
  await tapPlan(page, 4, 4);
  await tapPlan(page, 16, 4);
  await tapPlan(page, 16, 12);
  await touchBar.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(2);
  await expect(touchBar.getByRole('button', { name: 'Done' })).toHaveCount(0);

  await page.keyboard.press('Space');
  const wall = (await page.locator('[data-type="wall"]').first().boundingBox())!;
  await tap(page, wall.x + wall.width / 2, wall.y + wall.height / 2);
  await touchBar.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
});
