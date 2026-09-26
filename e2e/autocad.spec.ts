import { expect, test } from '@playwright/test';
import { at, ready } from './helpers';

const FT = 30.48;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('AutoCAD habits: aliases, @x,y and length<angle, right-click to finish, Enter to repeat', async ({ page }) => {
  const rail = page.getByRole('navigation', { name: 'Tools' });
  const pressed = (name: string) => rail.getByRole('button', { name, exact: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Walls by typed points: 12' right, then 8' at 90° (up the screen).
  await page.keyboard.press('l');
  await page.mouse.click(...(await at(page, 2 * FT, 12 * FT)));
  await page.keyboard.type(`@12',0`);
  await page.keyboard.press('Enter');
  await page.keyboard.type(`8'<90`);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(2);
  const ends = await page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem('mimar.plan') ?? '{}') as {
      doc: { elements: { type: string; x2: number; y2: number }[] };
    };
    return plan.doc.elements.filter((e) => e.type === 'wall').map((e) => [Math.round(e.x2), Math.round(e.y2)]);
  });
  expect(ends).toEqual([
    [Math.round(14 * FT), Math.round(12 * FT)],
    [Math.round(14 * FT), Math.round(4 * FT)],
  ]);

  // A right-click finishes the chain, as Enter does.
  await page.mouse.click(...(await at(page, 20 * FT, 20 * FT)), { button: 'right' });
  await page.mouse.move(...(await at(page, 24 * FT, 22 * FT)));
  await page.mouse.click(...(await at(page, 24 * FT, 22 * FT)));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(2);
  await page.keyboard.press('Escape');

  // Aliases typed quickly: TR is Trim, CO is Move making a copy, REC is Rectangle.
  await page.keyboard.type('tr');
  await expect(pressed('Trim')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('rec');
  await expect(pressed('Rectangle')).toHaveAttribute('aria-pressed', 'true');

  // Space goes to Select; Enter brings back the last tool.
  await page.keyboard.press(' ');
  await expect(pressed('Select')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(pressed('Rectangle')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
