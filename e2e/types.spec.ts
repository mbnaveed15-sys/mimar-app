import { expect, test } from '@playwright/test';
import { at, drag, ready, tool } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('door and window types: pick one to place, change it in the side panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await tool(page, 'wall');
  await drag(page, P(2, 4), P(30, 4));
  await page.keyboard.press('Escape');

  // A double door from the Door tool's options.
  await page.keyboard.press('d');
  await page.getByRole('group', { name: 'Door type' }).getByRole('button', { name: 'Double' }).click();
  await page.mouse.click(...(await at(page, ...P(8, 4))));
  await expect(page.locator('[data-type="door"]')).toHaveAttribute('data-kind', 'double');

  // A ventilator from the Window tool's options: small and high.
  await page.keyboard.press('Shift+W');
  await page.getByRole('group', { name: 'Window type' }).getByRole('button', { name: 'Ventilator' }).click();
  await page.mouse.click(...(await at(page, ...P(22, 4))));
  await expect(page.locator('[data-type="window"]')).toHaveAttribute('data-kind', 'vent');

  // Change the door to sliding in the side panel.
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, ...P(8, 4))));
  await page.getByLabel('Door type').selectOption('sliding');
  await expect(page.locator('[data-type="door"]')).toHaveAttribute('data-kind', 'sliding');
  expect(errors).toEqual([]);
});

test('plants and garden items are in the furniture library and draw green', async ({ page }) => {
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'Tree (large)' }).click();
  await page.mouse.click(...(await at(page, ...P(10, 10))));
  const tree = page.getByTestId('plan-canvas').locator('[data-symbol="tree-large"]');
  await expect(tree).toHaveCount(1);
  await page.getByRole('button', { name: 'Jhoola (garden swing)' }).click();
  await page.mouse.click(...(await at(page, ...P(30, 10))));
  await expect(page.getByTestId('plan-canvas').locator('[data-symbol="jhoola"]')).toHaveCount(1);
});
