import { expect, test, type Page } from '@playwright/test';
import { at, ready } from './helpers';

test.use({ hasTouch: true });

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

type Finger = { x: number; y: number; id: number };

/** Real touch events through Chromium, so the page sees pointerType "touch". */
async function touchApi(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: Finger[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  return {
    start: (pts: Finger[]) => send('touchStart', pts),
    move: (pts: Finger[]) => send('touchMove', pts),
    end: () => send('touchEnd', []),
    async tap(x: number, y: number) {
      await send('touchStart', [{ x, y, id: 0 }]);
      await send('touchEnd', []);
    },
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('draws walls with taps, pinches to zoom, and long-presses for the menu', async ({ page }) => {
  const touch = await touchApi(page);
  const point = async (x: number, y: number) => {
    const [px, py] = await at(page, ...P(x, y));
    return { x: px, y: py };
  };

  await page.keyboard.press('l');
  for (const [x, y] of [
    [4, 4],
    [20, 4],
  ]) {
    const p = await point(x, y);
    await touch.tap(p.x, p.y);
    await page.waitForTimeout(80);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);

  // Two fingers spread apart: zoom in.
  const zoom = page.getByTestId('zoom-level');
  const before = Number((await zoom.textContent())?.replace('%', ''));
  await touch.start([
    { x: 500, y: 400, id: 1 },
    { x: 560, y: 400, id: 2 },
  ]);
  for (let i = 1; i <= 5; i++)
    await touch.move([
      { x: 500 - i * 20, y: 400, id: 1 },
      { x: 560 + i * 20, y: 400, id: 2 },
    ]);
  await touch.end();
  const after = Number((await zoom.textContent())?.replace('%', ''));
  expect(after).toBeGreaterThan(before * 1.5);
  // The pinch did not draw or select anything.
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);

  // Long press on the wall with Select: its menu opens.
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+Z'); // the zoom may have pushed the wall off screen
  const wall = page.locator('[data-type="wall"]').first();
  const box = (await wall.boundingBox())!;
  await touch.start([{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 3 }]);
  await page.waitForTimeout(800);
  await touch.end();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
});

test('a two-finger tap undoes, a three-finger tap redoes; the selection bar acts on the selection', async ({
  page,
}) => {
  const touch = await touchApi(page);
  await page.keyboard.press('w');
  for (const [x, y] of [
    [4, 4],
    [20, 4],
  ]) {
    const [px, py] = await at(page, ...P(x, y));
    await touch.tap(px, py);
    await page.waitForTimeout(80);
  }
  await page.keyboard.press('Escape');
  const walls = page.locator('[data-type="wall"]');
  await expect(walls).toHaveCount(1);

  await touch.start([
    { x: 500, y: 400, id: 1 },
    { x: 560, y: 400, id: 2 },
  ]);
  await touch.end();
  await expect(walls).toHaveCount(0);
  await touch.start([
    { x: 500, y: 400, id: 1 },
    { x: 560, y: 400, id: 2 },
    { x: 620, y: 400, id: 3 },
  ]);
  await touch.end();
  await expect(walls).toHaveCount(1);

  // Tap the wall with Select: the bar offers what can be done to it.
  await page.keyboard.press('Space');
  const box = (await walls.first().boundingBox())!;
  await touch.tap(box.x + box.width / 2, box.y + box.height / 2);
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  await bar.getByRole('button', { name: 'Duplicate' }).click();
  await expect(walls).toHaveCount(2);
  await bar.getByRole('button', { name: 'Delete' }).click();
  await expect(walls).toHaveCount(1);
});
