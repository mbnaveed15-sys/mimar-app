import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers';

const FT = 30.48; // plan units per foot
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('mimar.plan') ?? '{}').doc);

async function at(page: Page, xFt: number, yFt: number): Promise<[number, number]> {
  return page.getByTestId('plan-canvas').evaluate(
    (svg, [px, py]) => {
      const pt = new DOMPoint(px, py).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return [pt.x, pt.y] as [number, number];
    },
    [xFt * FT, yFt * FT],
  );
}

test('the Rectangle tool draws a car porch: a room, a roof slab and columns, no walls', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'Car porch' }).click();
  await page.mouse.click(...(await at(page, 8, 3)));
  await page.mouse.click(...(await at(page, 18, 9)));
  await expect.poll(async () => (await saved(page)).rooms.map((r: { name: string }) => r.name)).toEqual(['Car porch']);
  const types = ((await saved(page)).elements as { type: string }[]).map((e) => e.type).sort();
  expect(types).toEqual(['column', 'column', 'column', 'column', 'slab']);
});
