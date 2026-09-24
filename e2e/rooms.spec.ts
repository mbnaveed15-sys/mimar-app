import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { tool, menu, openSection } from './helpers';

const FT = 30.48; // plan units per foot

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

/** A 30 x 20 ft house split into a 12 ft and an 18 ft room. */
async function drawHouse(page: Page) {
  await tool(page, 'wall');
  await wall(page, [0, 0], [30, 0]);
  await wall(page, [30, 0], [30, 20]);
  await wall(page, [30, 20], [0, 20]);
  await wall(page, [0, 20], [0, 0]);
  await wall(page, [12, 0], [12, 20]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('rooms show their area in sq ft and marla, and the covered area adds up', async ({ page }) => {
  await drawHouse(page);
  await tool(page, 'room');
  await page.mouse.click(...(await at(page, 5, 10)));
  await expect(page.getByTestId('selected-room-area')).toHaveText('Area: 240 sq ft · 1.07 marla');

  await page.getByLabel('Name', { exact: true }).fill('Drawing room');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.locator('[data-type="room"] text').first()).toHaveText('Drawing room');

  await page.mouse.click(...(await at(page, 20, 10)));
  await expect(page.getByTestId('area-summary')).toContainText('Covered area600 sq ft · 2.67 marla');

  await (await openSection(page, 'Settings'), page.getByLabel('Marla size')).selectOption('272.25');
  await expect(page.getByTestId('area-summary')).toContainText('2.20 marla');
});

test('clicking outside closed walls explains what to do', async ({ page }) => {
  await tool(page, 'wall');
  await wall(page, [0, 0], [30, 0]);
  await tool(page, 'room');
  await page.mouse.click(...(await at(page, 10, 10)));
  await expect(page.getByRole('alert')).toContainText('closed on all sides');
});

test('wall thickness can be chosen for new walls and changed later', async ({ page }) => {
  await tool(page, 'wall');
  await page.getByRole('button', { name: '4½" partition' }).click();
  await wall(page, [0, 0], [10, 0]);
  await tool(page, 'select');
  await page.mouse.click(...(await at(page, 5, 0)));
  await expect(page.getByLabel('Thickness')).toHaveValue('5"'); // 4.5" rounds to the nearest inch
  await page.getByLabel('Thickness').fill('9"');
  await page.getByLabel('Thickness').press('Enter');
  await expect(page.getByLabel('Thickness')).toHaveValue('9"');
});

test('Simple mode shows the main tools; Pro mode shows all of them', async ({ page }) => {
  const rail = page.getByRole('navigation', { name: 'Tools' });
  await expect(rail.getByRole('button', { name: 'Brush', exact: true })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Pro' }).click();
  await expect(rail.getByRole('button', { name: 'Brush', exact: true })).toBeVisible();
  await tool(page, 'brush');
  await expect(page.getByLabel('Brush size (px)')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Pro' })).toHaveAttribute('aria-checked', 'true');
});

test('exports a PDF', async ({ page }) => {
  await drawHouse(page);
  const download = page.waitForEvent('download');
  await menu(page, 'File', 'Export PDF');
  const file = await download;
  expect(file.suggestedFilename()).toBe('Untitled.pdf');
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.toString('latin1')).toContain('Scale 1:50 on A4');
});
