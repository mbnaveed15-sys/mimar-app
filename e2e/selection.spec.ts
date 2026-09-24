import { expect, test, type Page } from '@playwright/test';
import { at, openSection, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

async function dragFt(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...(await at(page, ...P(...from))));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...P(...to))), { steps: 6 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  // A 8' × 6' room with a bed in it.
  await page.keyboard.press('r');
  await page.mouse.click(...(await at(page, ...P(2, 2))));
  await page.mouse.move(...(await at(page, ...P(4, 4))));
  await page.keyboard.type(`8',6'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('k');
  await page.mouse.click(...(await at(page, ...P(5, 5))));
  await page.keyboard.press(' ');
});

test('window and crossing selection boxes, Shift+click and moving several items', async ({ page }) => {
  const panel = page.getByTestId('selection-panel');
  await dragFt(page, [1, 1], [11, 9]); // left to right around everything
  await expect(panel).toContainText('6 selected');

  await page.keyboard.press('Escape');
  await dragFt(page, [12, 0.5], [8, 2.2]); // right to left, touching the top and right walls
  await expect(panel).toContainText('2 walls');

  await page.keyboard.down('Shift');
  await page.mouse.click(...(await at(page, ...P(5, 5))));
  await page.keyboard.up('Shift');
  await expect(panel).toContainText('1 item');

  // Dragging one of them moves them all.
  const before = await page.locator('[data-type="wall"]').first().boundingBox();
  await dragFt(page, [10, 4], [10, 10]);
  const after = await page.locator('[data-type="wall"]').first().boundingBox();
  expect(after!.y).toBeGreaterThan(before!.y + 50);
});

test('groups move together; component copies follow edits to one copy', async ({ page }) => {
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('group-box')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+g');
  await expect(page.getByTestId('group-box')).toHaveCount(0);

  await page.keyboard.press('Control+a');
  await page.keyboard.press('g');
  await expect(page.getByTestId('selection-panel')).toContainText('Component');
  await page.keyboard.press('Control+d');
  await expect(page.locator('[data-type="furniture"]')).toHaveCount(2);

  // Edit the first copy: make the bed narrower, close it, and both beds change.
  await page.mouse.dblclick(...(await at(page, ...P(5, 5))));
  await expect(page.getByTestId('open-group')).toHaveCount(1);
  await page.getByLabel('Width').fill('3ft');
  await page.getByLabel('Width').press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('open-group')).toHaveCount(0);
  const widths = await page
    .locator('[data-type="furniture"]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(widths[0]).toBe(widths[1]);

  await openSection(page, 'Components');
  await expect(page.getByRole('list', { name: 'Components' })).toContainText('2 copies');
});
