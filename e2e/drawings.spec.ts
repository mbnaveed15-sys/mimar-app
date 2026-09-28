import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { at, menu, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('draws a section, shows it with the elevations and sheets, and exports them', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  // A 20' × 16' room.
  await page.keyboard.press('r');
  await click(2, 2);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`20',16'`);
  await page.keyboard.press('Enter');

  // A section across it, looking down the page.
  await page.keyboard.press('Shift+E');
  await click(0, 10);
  await click(24, 10);
  await expect(page.getByTestId('section-draft')).toBeVisible();
  await click(12, 14);
  await expect(page.getByTestId('section-draft')).toHaveCount(0);
  await expect(page.getByTestId('plan-canvas').getByTestId('section')).toHaveCount(1);
  await expect(page.getByTestId('plan-canvas').getByTestId('section')).toContainText('A');

  // The Drawings view, from the menu bar's view buttons.
  await page.keyboard.press('Control+4');
  const view = page.getByTestId('drawings-view');
  await expect(view).toBeVisible();
  await view.getByTestId('drawing-section-A').click();
  await expect(view.getByTestId('drawing-section-A')).toHaveAttribute('aria-pressed', 'true');
  // Walls and slabs cut, filled solid.
  await expect(page.getByTestId('drawing-svg').locator('path[fill="#111"], path[fill="#000"]').first()).toBeVisible();
  await expect(page.getByTestId('drawing-svg')).toContainText('Natural ground');
  await view.getByTestId('drawing-front').click();
  await expect(page.getByTestId('drawing-svg')).toContainText('Ground floor (plinth)');

  // The suggested sheets: the floor plan, the section and the elevations.
  await expect(view.getByTestId('sheet-1')).toHaveText('1. Ground floor plan (A3)');
  await expect(view.getByTestId('sheet-2')).toHaveText('2. Sections (A3)');
  await expect(view.getByTestId('sheet-3')).toHaveText('3. Elevations (A3)');
  await view.getByTestId('sheet-3').click();
  const editor = view.getByTestId('sheet-editor');
  await editor.getByLabel('Sheet name').fill('Elevations and section');
  await editor.getByLabel('Sheet name').press('Enter');
  await editor.getByRole('radio', { name: 'A1' }).click();
  await editor.getByLabel('Add a drawing').selectOption({ label: 'Section A–A' });
  await editor.getByLabel('Scale of Section A–A').selectOption('50');
  await expect(view.getByTestId('sheet-3')).toHaveText('3. Elevations and section (A1)');
  await expect(page.getByTestId('drawing-svg')).toContainText('SECTION A–A');
  await expect(page.getByTestId('drawing-svg')).toContainText('3 of 3');

  // Sheets are saved with the plan.
  await page.reload();
  await ready(page);
  await page.keyboard.press('Control+4');
  await expect(page.getByTestId('sheet-3')).toHaveText('3. Elevations and section (A1)');

  const save = async (run: () => Promise<unknown>) => {
    const [download] = await Promise.all([page.waitForEvent('download'), run()]);
    return { name: download.suggestedFilename(), data: readFileSync((await download.path())!) };
  };
  const pdf = await save(() => page.getByRole('button', { name: 'Export sheets (PDF)' }).click());
  expect(pdf.name).toBe('Untitled - Drawings.pdf');
  expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.data.toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(3);

  const dxf = await save(() => menu(page, 'File', 'Export sections and elevations (DXF)'));
  expect(dxf.name).toBe('Untitled - Sections and elevations.dxf');
  const text = dxf.data.toString();
  for (const layer of ['A-SECT-CUT', 'A-SECT-OUTL', 'A-ANNO-LEVL']) expect(text).toContain(layer);
  expect(text).toContain('SECTION A-A');
  expect(text).toContain('RIGHT SIDE ELEVATION');

  // A drawing tool goes back to the plan.
  await page.keyboard.press('w');
  await expect(page.getByTestId('drawings-view')).toHaveCount(0);
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
});
