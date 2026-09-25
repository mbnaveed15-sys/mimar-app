import { expect, test } from '@playwright/test';
import { menu, openSection } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('switches between the five themes and remembers the choice', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'brick');
  await openSection(page, 'Theme');
  const themes = page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio');
  await expect(themes).toHaveCount(5);

  const canvasColor = () => page.getByTestId('plan-canvas').evaluate((el) => getComputedStyle(el).backgroundColor);
  const brick = await canvasColor();
  await page.getByRole('radio', { name: 'Black & gold' }).click();
  await expect(html).toHaveAttribute('data-theme', 'gold');
  expect(await canvasColor()).not.toBe(brick);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'gold');
  await expect(page.getByRole('radio', { name: 'Black & gold' })).toHaveAttribute('aria-checked', 'true');
});

test("the grid can be restyled, hidden with Ctrl+' and its snapping turned off", async ({ page }) => {
  const grid = page.getByTestId('plan-grid');
  await openSection(page, 'Grid');
  await expect(grid).toBeVisible();
  await expect(grid.locator('pattern')).toHaveCount(2); // minor and major lines

  // Sliders with stops: the first major stop is Off.
  await page.getByLabel('Major grid size').fill('0');
  await expect(grid.locator('pattern')).toHaveCount(1);
  await page.getByRole('group', { name: 'Grid style' }).getByRole('button', { name: 'Dots' }).click();
  await expect(grid.locator('pattern circle')).toHaveCount(1);

  await page.getByLabel('Minor grid size').fill('5'); // 1", 2", 3", 6", 1', 2'
  await expect(page.getByLabel('Custom spacing')).toHaveValue(`2' 0"`);
  await page.getByLabel('Major grid size').fill('4'); // every 5
  await expect(page.getByLabel('Major grid size')).toHaveAttribute('aria-valuetext', `10' 0" (every 5)`);

  await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(`Control+'`);
  await expect(grid).toHaveCount(0);
  await expect(page.getByLabel('Show')).not.toBeChecked();
  await page.keyboard.press(`Control+'`);
  await expect(grid).toBeVisible();

  await page.getByLabel('Snap to grid').uncheck();
  await page.reload();
  await expect(page.getByLabel('Snap to grid')).not.toBeChecked();
  await expect(page.getByTestId('plan-grid').locator('pattern circle')).toHaveCount(2); // minor and major dots
});

test('tool bars dock at any side, next to each other, wrap instead of scrolling, and are remembered', async ({
  page,
}) => {
  const left = page.getByRole('navigation', { name: 'Tools', exact: true });
  const top = page.getByRole('navigation', { name: 'Tools (top)' });
  // Drag the Draw bar by its grip up under the menu bar.
  const grip = (await page.locator('[data-grip="draw"]').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  const menubar = (await page.getByRole('menubar').boundingBox())!;
  await page.mouse.move(500, menubar.y + menubar.height + 6, { steps: 8 });
  await expect(page.getByTestId('dock-indicator')).toBeVisible();
  await page.mouse.up();
  await expect(top.getByRole('button', { name: 'Wall', exact: true })).toBeVisible();
  await expect(left.getByRole('button', { name: 'Wall', exact: true })).toHaveCount(0);

  // Right-click a grip to dock it elsewhere; next to another bar by dragging onto it.
  await page.locator('[data-grip="change"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Dock top' }).click();
  await expect(top.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
  const wall = (await top.getByRole('button', { name: 'Wall', exact: true }).boundingBox())!;
  const moveGrip = (await page.locator('[data-grip="change"]').boundingBox())!;
  await page.mouse.move(moveGrip.x + 2, moveGrip.y + 5);
  await page.mouse.down();
  await page.mouse.move(wall.x - 20, wall.y + wall.height / 2, { steps: 8 });
  await page.mouse.up();
  const order = await top.locator('[data-bar]').evaluateAll((els) => els.map((el) => el.getAttribute('data-bar')));
  expect(order).toEqual(['change', 'draw']);

  // Remembered after a reload; View › Reset tool bars puts them back.
  await page.reload();
  await expect(top.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
  await menu(page, 'View', 'Reset tool bars');
  await expect(top).toHaveCount(0);
  await expect(left.getByRole('button', { name: 'Wall', exact: true })).toBeVisible();

  // A short window: the bars wrap into more columns rather than scroll.
  await page.getByRole('radio', { name: 'Pro' }).click();
  await page.setViewportSize({ width: 1200, height: 520 });
  await expect(left.locator('[data-bar]').first()).toBeVisible();
  const scrolls = await left.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(scrolls).toBe(false);
  await expect(left.getByRole('button', { name: 'Scale', exact: true })).toBeInViewport();
});
