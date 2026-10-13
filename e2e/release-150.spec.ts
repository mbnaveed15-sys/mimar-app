import { expect, test, type Page } from '@playwright/test';
import { menu, ready, tool } from './helpers';

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

async function wall(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...(await at(page, ...from)));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...to)), { steps: 4 });
  await page.mouse.up();
}

async function drawHouse(page: Page, w = 30, d = 20) {
  await tool(page, 'wall');
  await wall(page, [0, 0], [w, 0]);
  await wall(page, [w, 0], [w, d]);
  await wall(page, [w, d], [0, d]);
  await wall(page, [0, d], [0, 0]);
  await page.keyboard.press('Escape');
}

test.beforeEach(async ({ page }) => {
  // Use the download fallback for saving so no native dialog opens.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('a wall can be divided into equal parts', async ({ page }) => {
  await tool(page, 'wall');
  await wall(page, [0, 0], [30, 0]);
  await page.keyboard.press('Escape');
  await tool(page, 'select');
  await page.mouse.click(...(await at(page, 10, 0)));
  await page.getByLabel('Number of parts').fill('3');
  await page.getByTestId('divide-btn').click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(3);
});

test('the North arrow tool puts an arrow on the plan and turns north; the sun can follow a date', async ({ page }) => {
  await page.keyboard.press('Shift+N');
  await page.mouse.click(...(await at(page, 5, 5)));
  await expect(page.getByTestId('north-draft')).toBeVisible();
  await page.mouse.click(...(await at(page, 15, 5)));
  await expect(page.getByTestId('north-arrow')).toBeVisible();
  await expect.poll(async () => (await saved(page)).northDeg).toBe(90);

  await page.keyboard.press('Control+3');
  await page.getByTestId('sun-button').click();
  const panel = page.getByTestId('sun-panel');
  await panel.getByText('The real sun, for a date and time').click();
  await panel.getByLabel('Month').selectOption('12');
  await panel.getByLabel('Shadows').uncheck();
  await expect(page.getByTestId('sun-button')).toContainText('Dec 21');
  await expect.poll(async () => (await saved(page)).sun).toMatchObject({ timed: true, month: 12, shadows: false });
  await expect(panel.getByLabel('North angle')).toHaveValue('90');
  await panel.getByRole('button', { name: 'Take the north arrow off the plan' }).click();
  await expect.poll(async () => (await saved(page)).northArrow).toBeUndefined();
});

test('a saved plan is listed under Open recent and opens from there', async ({ page }) => {
  await drawHouse(page);
  const download = page.waitForEvent('download');
  await menu(page, 'File', 'Save');
  await download;
  await menu(page, 'File', 'New');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+O');
  const list = page.getByTestId('recent-list');
  await list.getByRole('button', { name: /Untitled/ }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
});

test('skylights and dormers go on a roof slope', async ({ page }) => {
  await drawHouse(page, 40, 30);
  await tool(page, 'roof');
  await page.locator('button', { hasText: 'Roof over the house' }).click();
  await page.keyboard.press('Shift+K');
  await page.mouse.click(...(await at(page, 6, 15)));
  await page.keyboard.press('Shift+Y');
  await page.mouse.click(...(await at(page, 20, 25)));
  await expect(page.getByTestId('roof-skylight-plan')).toHaveCount(1);
  await expect
    .poll(async () => {
      const roof = (await saved(page)).elements.find((el: { type: string }) => el.type === 'roof');
      return [roof?.skylights?.length, roof?.dormers?.length];
    })
    .toEqual([1, 1]);
});
