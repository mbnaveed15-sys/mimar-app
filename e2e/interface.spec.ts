import { expect, test } from '@playwright/test';
import { at, drag, menu, ready, tool } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('the top bar fits a 1024 px window', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  for (const name of ['2D plan', '3D view']) {
    const box = (await page.getByRole('radio', { name }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1024);
    expect(box.height).toBeLessThan(40);
  }
  await page.getByRole('radio', { name: '3D view' }).click();
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();
});

test('a click inside a plot (off the house) picks the plot, even with its boundary wall on the edge', async ({
  page,
}) => {
  await page.keyboard.press('Shift+P');
  await page.mouse.click(...(await at(page, ...P(0, 0))));
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`25',45'`);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, ...P(3, 40))));
  await expect(page.getByText('Selected: plot')).toBeVisible();
});

test('empty plans say so instead of exporting blank files', async ({ page }) => {
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await menu(page, 'File', 'Export PDF');
  await expect(page.getByRole('alert')).toContainText('nothing to export');
  await menu(page, 'File', 'Export DXF (AutoCAD)');
  await expect(page.getByRole('alert')).toContainText('nothing to export');
  expect(downloads).toEqual([]);
});

test('paste hangs the copy on the pointer; a click puts it down; one undo takes it back', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, P(2, 2), P(12, 2));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, ...P(7, 2))));
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('tool-hint')).toContainText('Pasted');
  await page.mouse.move(...(await at(page, ...P(4, 12))), { steps: 4 });
  await page.mouse.click(...(await at(page, ...P(4, 12))));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
  // Esc while placing takes the paste back.
  await page.keyboard.press('Control+v');
  await page.mouse.move(...(await at(page, ...P(6, 14))), { steps: 4 });
  await expect(page.locator('[data-type="wall"]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
});

test('keyboard: menus keep focus, the right-click menu takes arrow keys, grips open their menu', async ({ page }) => {
  // Esc from a menu leaves focus on its name, and tool keys still work from there.
  await page.getByRole('menubar').getByRole('button', { name: 'File', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menubar').getByRole('button', { name: 'File', exact: true })).toBeFocused();
  await page.keyboard.press('l');
  await expect(
    page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Wall', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  // Right-click on the empty plan: no Paste with nothing copied; arrows move through the items.
  await page.mouse.click(...(await at(page, ...P(5, 5))), { button: 'right' });
  const menuList = page.getByRole('menu', { name: 'Context menu' });
  await expect(menuList.getByRole('menuitem').first()).toBeFocused();
  await expect(menuList.getByRole('menuitem', { name: 'Paste' })).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(menuList.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menuList).toHaveCount(0);

  // A tool bar's grip: Enter opens its menu, Esc closes it and focus goes back to the grip.
  const grip = page.locator('[data-grip]').first();
  await grip.focus();
  await page.keyboard.press('Enter');
  const dock = page.getByRole('menu', { name: 'Tool bar' });
  await expect(dock).toBeVisible();
  // The first place it can go to has focus (where it is now is greyed out).
  await expect(dock.locator('[role="menuitem"]:focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dock).toHaveCount(0);
  await expect(grip).toBeFocused();
});

test('the welcome keeps Tab inside it, and the tour takes the arrow keys', async ({ page }) => {
  await page.goto('/?welcome');
  const welcome = page.getByRole('dialog', { name: 'Welcome to Mimar' });
  await expect(welcome).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await welcome.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await welcome.getByRole('button', { name: /Take the tour/ }).click();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Step 2 of 6')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('a dialog over the welcome takes the keys: Esc closes it, not the welcome', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, P(2, 2), P(12, 2));
  await menu(page, 'Help', 'Getting started');
  await page.getByRole('button', { name: /sample 5-marla/ }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await discard.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(discard).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Welcome to Mimar' })).toBeVisible();
});

test('a length that is too long or too short says so', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, P(2, 2), P(12, 2));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, ...P(7, 2))));
  const length = page.getByLabel('Length', { exact: true });
  await length.fill('99999999');
  await length.press('Enter');
  await expect(page.getByText(/too long: at most/)).toBeVisible();
  await length.fill('0');
  await length.press('Enter');
  await expect(page.getByText(/^At least/)).toBeVisible();
});
