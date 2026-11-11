import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers';

const wall = (id: string, y: number) => ({ id, type: 'wall', x1: 100, y1: y, x2: 500, y2: y, thickness: 23 });
const plan = (name: string, walls: number) => ({
  name: `${name}.mimar`,
  path: `C:\\Plans\\${name}.mimar`,
  contents: JSON.stringify({
    format: 'mimar-plan',
    version: 1,
    doc: { elements: Array.from({ length: walls }, (_, i) => wall(`w${i}`, 100 + i * 150)) },
  }),
});

/** Pretend to be the desktop app, started by a double-click on the given plan (or plain). */
async function fakeDesktop(page: Page, started: object | null) {
  await page.addInitScript((first) => {
    const w = window as unknown as Record<string, unknown>;
    let listener: ((file: object) => void) | null = null;
    let waiting: object | null = first;
    w.__handOver = (file: object) => listener?.(file);
    w.mimarFiles = {
      open: async () => null,
      save: async () => null,
      launchFile: async () => {
        const file = waiting;
        waiting = null;
        return file;
      },
      onOpenFile: (cb: (file: object) => void) => {
        listener = cb;
        return () => (listener = null);
      },
    };
  }, started);
}
const handOver = (page: Page, file: object) =>
  page.evaluate((f) => (window as unknown as { __handOver: (file: object) => void }).__handOver(f), file);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('a double-clicked plan opens when the app starts, and another while it runs', async ({ page }) => {
  await fakeDesktop(page, plan('Corner house', 2));
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(2);
  await expect(page).toHaveTitle('Corner house — MIMAR');

  await handOver(page, plan('Shop', 3));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(3);
  await expect(page).toHaveTitle('Shop — MIMAR');
});

test('unsaved changes are asked about first, and a file that cannot be read says so', async ({ page }) => {
  await fakeDesktop(page, null);
  await page.reload();
  await ready(page);
  await page.keyboard.press('w');
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 200);
  await page.mouse.click(box.x + 400, box.y + 200);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);

  await handOver(page, plan('Shop', 3));
  await expect(page.getByText('Save the changes to this plan first?')).toBeVisible();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
  await page.getByRole('button', { name: /Don.t save/ }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(3);

  await handOver(page, { name: 'Gone.mimar', error: 'The file was not found.' });
  await expect(page.getByText('Gone.mimar couldn’t be opened. The file was not found.')).toBeVisible();
});
