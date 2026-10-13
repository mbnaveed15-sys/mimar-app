import { expect, test, type Page } from '@playwright/test';
import { menu, ready } from './helpers';

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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('Services places a switch and a light; a lighting run joins them and follows the light', async ({ page }) => {
  await page.keyboard.press('Shift+Q');
  const lib = page.getByLabel('Services library');
  await expect(lib).toBeVisible();
  await lib.getByLabel('Search services').fill('one-way');
  await lib
    .getByRole('button', { name: /switch/i })
    .first()
    .click();
  await page.mouse.click(...(await at(page, 2, 2)));
  await lib.getByLabel('Search services').fill('ceiling light');
  await lib
    .getByRole('button', { name: /Ceiling light/ })
    .first()
    .click();
  await page.mouse.click(...(await at(page, 12, 8)));
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await saved(page)).elements.filter((e: { type: string }) => e.type === 'furniture').length)
    .toBe(2);
  // Service points are on their own layer.
  const kinds = (await saved(page)).elements.map((e: { kind?: string }) => e.kind);
  expect(kinds).toEqual(expect.arrayContaining(['light-ceiling']));

  await page.keyboard.press('Shift+U');
  await expect(page.getByRole('radiogroup', { name: 'What it carries' })).toBeVisible();
  await page.mouse.click(...(await at(page, 2.2, 2.1)));
  await expect(page.getByTestId('run-draft')).toBeVisible();
  await page.mouse.click(...(await at(page, 12, 2)));
  await page.mouse.click(...(await at(page, 12.1, 8.1)));
  await expect(page.locator('[data-type="run"]')).toHaveCount(1);
  const run = async () =>
    (await saved(page)).elements.find((e: { type: string }) => e.type === 'run') as {
      system: string;
      from?: string;
      to?: string;
      points: { x: number; y: number }[];
    };
  await expect.poll(async () => (await run())?.system).toBe('lighting');
  const r = await run();
  expect(r.from).toBeTruthy();
  expect(r.to).toBeTruthy();
  expect(r.points).toHaveLength(3);
  expect(r.points[2].x).toBeCloseTo(12 * FT, 0);

  // Moving the light drags the run's end with it.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, 12.4, 8.4)));
  await expect(page.getByText('Selected: Ceiling light')).toBeVisible();
  await page.keyboard.press('m');
  await page.mouse.click(...(await at(page, 12, 8)));
  await page.mouse.click(...(await at(page, 16, 8)));
  await expect.poll(async () => (await run()).points[2].x).toBeCloseTo(16 * FT, 0);
  expect((await run()).points[1].x).toBeCloseTo(12 * FT, 0);
});

test('a plan view and its paper go on a sheet', async ({ page }) => {
  await page.keyboard.press('r');
  await page.mouse.click(...(await at(page, 0, 0)));
  await page.mouse.click(...(await at(page, 20, 15)));
  await page.keyboard.press('Escape');
  await menu(page, 'View', 'Save plan view');
  await expect.poll(async () => (await saved(page)).views?.[0]?.name).toBe('View 1');

  await page.keyboard.press('Control+4');
  await page.getByTestId('saved-view-View 1').click();
  await expect(page.getByTestId('view-editor')).toBeVisible();
  await page.getByLabel('View name').fill('Living area');
  await page.getByLabel('View name').press('Enter');
  await expect.poll(async () => (await saved(page)).views[0].name).toBe('Living area');

  await page.getByRole('button', { name: 'Add sheet' }).click();
  const editor = page.getByTestId('sheet-editor');
  await editor.getByLabel('Add a drawing').selectOption({ label: 'Living area' });
  await editor.getByLabel('Paper', { exact: true }).selectOption('A2');
  await editor.getByLabel('Portrait').check();
  await expect(page.getByTestId('sheet-plan')).toBeVisible();
  await expect(page.getByTestId('drawing-svg')).toHaveAttribute('viewBox', '0 0 420 594');
  await editor.getByLabel('Paper', { exact: true }).selectOption('custom');
  await editor.getByLabel('Paper width (mm)').fill('900');
  await editor.getByLabel('Paper width (mm)').press('Enter');
  await expect(page.getByTestId('drawing-svg')).toHaveAttribute('viewBox', '0 0 900 297');
  const sheet = (await saved(page)).sheets.at(-1);
  expect(sheet).toMatchObject({ paper: 'custom', customMm: { w: 900, h: 297 } });
  expect(sheet.items[0].drawing.kind).toBe('view');
});
