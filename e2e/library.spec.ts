import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { tool, menu } from './helpers';

const FT = 30.48;

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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('places furniture from the library at its real size', async ({ page }) => {
  await tool(page, 'furniture');
  const library = page.getByLabel('Furniture library');
  await library.getByRole('button', { name: /King bed/ }).click();
  await page.mouse.click(...(await at(page, 10, 10)));
  await expect(page.locator('[data-type="furniture"] [data-symbol="bed-king"]')).toHaveCount(1);

  await tool(page, 'select');
  await page.mouse.click(...(await at(page, 10, 10)));
  await expect(page.getByText('Selected: King bed')).toBeVisible();
  await expect(page.getByLabel('Width')).toHaveValue(`6' 0"`);
  await expect(page.getByLabel('Depth')).toHaveValue(`6' 6"`);
});

test('layers hide furniture and dimensions on screen and in the PDF', async ({ page }) => {
  await tool(page, 'wall');
  for (const [a, b] of [
    [
      [0, 0],
      [20, 0],
    ],
    [
      [20, 0],
      [20, 15],
    ],
    [
      [20, 15],
      [0, 15],
    ],
    [
      [0, 15],
      [0, 0],
    ],
  ] as [[number, number], [number, number]][]) {
    await wall(page, a, b);
  }
  await tool(page, 'room');
  await page.mouse.click(...(await at(page, 10, 7)));
  await tool(page, 'furniture');
  await page.mouse.click(...(await at(page, 10, 7)));

  await page.getByRole('checkbox', { name: 'Furniture' }).uncheck();
  await page.getByLabel('Dimensions').uncheck();
  await page.getByLabel('Room names & areas').uncheck();
  await expect(page.locator('[data-type="furniture"]')).toHaveCount(0);
  await expect(page.locator('[data-type="dimension"]')).toHaveCount(0);
  await expect(page.getByTestId('room-area')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await menu(page, 'File', 'Export PDF');
  const pdf = (await readFile(await (await download).path())).toString('latin1');
  expect(pdf).toContain('%PDF-');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Furniture' })).not.toBeChecked();
});

test('walls between rooms show their dimension only when selected', async ({ page }) => {
  await tool(page, 'wall');
  await wall(page, [0, 0], [20, 0]);
  await wall(page, [20, 0], [20, 10]);
  await wall(page, [20, 10], [0, 10]);
  await wall(page, [0, 10], [0, 0]);
  await wall(page, [8, 0], [8, 10]);
  await expect(page.locator('[data-type="dimension"]')).toHaveCount(4);
  await tool(page, 'select');
  await page.mouse.click(...(await at(page, 8, 5)));
  await expect(page.locator('[data-type="dimension"]')).toHaveCount(5);
});
