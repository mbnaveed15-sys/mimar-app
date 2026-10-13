import { expect, test } from '@playwright/test';
import { at, menu, ready } from './helpers';

const FT = 30.48;

test('with a mouse the selection bar is off until View > Selection bar turns it on', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  await page.keyboard.press('w');
  await page.mouse.click(...(await at(page, 4 * FT, 4 * FT)));
  await page.mouse.click(...(await at(page, 20 * FT, 4 * FT)));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  const wall = (await page.locator('[data-type="wall"]').first().boundingBox())!;
  await page.mouse.click(wall.x + wall.width / 2, wall.y + wall.height / 2);
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(bar).toHaveCount(0);

  await menu(page, 'View', 'Selection bar');
  await bar.getByRole('button', { name: 'Rotate 90°' }).click();
  const turned = (await page.locator('[data-type="wall"]').first().boundingBox())!;
  expect(turned.height).toBeGreaterThan(turned.width);
  // It is remembered.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mimar.prefs') ?? '{}').selectionBar)).toBe(true);
});

test('a selected door shows Flip hinge and Flip swing on the bar', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  await menu(page, 'View', 'Selection bar');
  await page.keyboard.press('w');
  await page.mouse.click(...(await at(page, 2 * FT, 5 * FT)));
  await page.mouse.click(...(await at(page, 14 * FT, 5 * FT)));
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await page.mouse.click(...(await at(page, 8 * FT, 6 * FT)));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  const door = page.locator('[data-type="door"]').first();
  const box = (await door.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 3);
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  const before = (await door.getAttribute('transform'))!;
  const scale = (t: string) =>
    t
      .match(/scale\(([^)]+)\)/)![1]
      .split(',')
      .map(Number);
  await bar.getByRole('button', { name: 'Flip hinge' }).click();
  const hinged = scale((await door.getAttribute('transform'))!);
  expect(hinged[0]).toBe(-scale(before)[0]);
  expect(hinged[1]).toBe(scale(before)[1]);
  await bar.getByRole('button', { name: 'Flip swing' }).click();
  const swung = scale((await door.getAttribute('transform'))!);
  expect(swung[0]).toBe(hinged[0]);
  expect(swung[1]).toBe(-hinged[1]);
  // A wall has no hinge.
  await page.keyboard.press('Escape');
  const wall = (await page.locator('[data-type="wall"]').first().boundingBox())!;
  await page.mouse.click(wall.x + 10, wall.y + wall.height / 2);
  await expect(bar.getByRole('button', { name: 'Flip hinge' })).toHaveCount(0);
});

test('a casement window picks its hinge side and flips its hinge and swing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  await menu(page, 'View', 'Selection bar');
  await page.keyboard.press('w');
  await page.mouse.click(...(await at(page, 2 * FT, 5 * FT)));
  await page.mouse.click(...(await at(page, 14 * FT, 5 * FT)));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+W');
  await page.getByRole('group', { name: 'Window type' }).getByRole('button', { name: 'Casement', exact: true }).click();
  const hand = page.getByRole('group', { name: 'Window hinge side' });
  await hand.getByRole('button', { name: 'Right' }).click();
  await page.mouse.click(...(await at(page, 5 * FT, 6 * FT)));
  await hand.getByRole('button', { name: 'Left' }).click();
  await page.mouse.click(...(await at(page, 10 * FT, 6 * FT)));
  await page.keyboard.press('Escape');
  const windows = page.locator('[data-type="window"]');
  await expect(windows).toHaveCount(2);
  const scale = async (i: number) =>
    (await windows.nth(i).getAttribute('transform'))!
      .match(/scale\(([^)]+)\)/)![1]
      .split(',')
      .map(Number);
  // The two hinge sides are opposite.
  expect((await scale(0))[0]).toBe(-(await scale(1))[0]);

  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, 5 * FT, 5 * FT)));
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(page.getByText('Selected: window')).toBeVisible();
  const before = await scale(0);
  await bar.getByRole('button', { name: 'Flip hinge' }).click();
  expect(await scale(0)).toEqual([-before[0], before[1]]);
  await bar.getByRole('button', { name: 'Flip swing' }).click();
  expect(await scale(0)).toEqual([-before[0], -before[1]]);
  // The same in Properties.
  await page.getByRole('button', { name: 'Flip hinge' }).last().click();
  expect(await scale(0)).toEqual([before[0], -before[1]]);
});
