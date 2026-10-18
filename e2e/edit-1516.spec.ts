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

async function load(page: Page, elements: object[]) {
  await page.evaluate((elements) => {
    localStorage.setItem('mimar.plan', JSON.stringify({ version: 21, doc: { elements, rooms: [] } }));
  }, elements);
  await page.reload();
  await ready(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('a chain of walls that closes makes a room, in one undo step', async ({ page }) => {
  await load(page, []);
  await page.keyboard.press('l');
  for (const [x, y] of [
    [8, 3],
    [18, 3],
    [18, 9],
    [8, 9],
    [8, 3],
  ])
    await page.mouse.click(...(await at(page, x, y)));
  await expect.poll(async () => (await saved(page)).rooms.length).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await saved(page)).rooms.length).toBe(0);
  expect((await saved(page)).elements).toHaveLength(3);
});

test('clicking a line end grip then typing a length sets the length', async ({ page }) => {
  await load(page, [{ id: 'l', type: 'line', x1: 8 * FT, y1: 6 * FT, x2: 16 * FT, y2: 6 * FT }]);
  await page.mouse.click(...(await at(page, 12, 6)));
  const grip = page.locator('[data-handle="wall-end"]');
  await expect(grip).toBeVisible();
  const box = (await grip.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.type("12'");
  await page.keyboard.press('Enter');
  await expect.poll(async () => Math.round((await saved(page)).elements[0].x2 / FT)).toBe(20);
  expect(Math.round((await saved(page)).elements[0].x1 / FT)).toBe(8);
});
