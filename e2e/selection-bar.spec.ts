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
