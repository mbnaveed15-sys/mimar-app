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

test('length boxes step with their arrows and the Up key, and change when their label is dragged', async ({ page }) => {
  await page.keyboard.press('r');
  await page.mouse.click(...(await at(page, ...P(0, 0))));
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`20',16'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, ...P(20 + 4.5 / 12, 8))));
  const thickness = page.getByLabel('Thickness');
  await expect(thickness).toHaveValue(`9"`);
  const field = thickness.locator('xpath=..');
  await field.getByRole('button', { name: 'Step up' }).click();
  await expect(page.getByLabel('Thickness')).toHaveValue(`10"`);
  await page.getByLabel('Thickness').press('ArrowDown');
  await expect(page.getByLabel('Thickness')).toHaveValue(`9"`);
  // Drag the label 5 steps (4 px each) to the right.
  const box = (await page
    .locator('label', { hasText: /^Thickness$/ })
    .first()
    .boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 15, box.y + box.height / 2, { steps: 3 });
  await page.mouse.move(box.x + 25, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByLabel('Thickness')).toHaveValue(`1' 2"`);
  // One undo step for the whole drag.
  await page.getByLabel('Thickness').blur();
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Thickness')).toHaveValue(`9"`);
});
