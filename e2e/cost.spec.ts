import { expect, test } from '@playwright/test';
import { at, menu, openSection, ready } from './helpers';

const FT = 30.48;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('quantities and cost: measured, priced at rates you can change, exported to CSV and the PDF', async ({ page }) => {
  await page.keyboard.press('r');
  await page.mouse.move(...(await at(page, 5 * FT, 5 * FT)));
  await page.mouse.click(...(await at(page, 5 * FT, 5 * FT)));
  await page.keyboard.type(`12',10'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await openSection(page, 'Quantities & cost');
  const panel = page.getByTestId('cost-panel');
  await expect(panel).toBeVisible();
  const total = page.getByTestId('cost-total');
  await expect(total).toContainText('Rs ');
  const before = await total.textContent();
  await expect(panel.locator('[data-cost-line="brickwork"]')).toContainText('cft');

  // A dearer brickwork rate raises the total, and is remembered.
  const rate = page.getByLabel(/^Rate for Brickwork in 1:6 \(walls and plinth\)/);
  await rate.fill('600');
  await rate.press('Enter');
  await expect(total).not.toHaveText(before!);
  await page.reload();
  await ready(page);
  await expect(page.getByLabel(/^Rate for Brickwork in 1:6 \(walls and plinth\)/)).toHaveValue('600');

  // CSV for Excel.
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV (Excel)' }).click();
  expect((await csv).suggestedFilename()).toMatch(/quantities\.csv$/);

  // Starter rates put it back.
  await page.getByRole('button', { name: 'Starter rates' }).click();
  await expect(page.getByLabel(/^Rate for Brickwork in 1:6 \(walls and plinth\)/)).toHaveValue('420');

  // Added to the PDF.
  await page.getByLabel('Add to the PDF').check();
  const pdf = page.waitForEvent('download');
  await menu(page, 'File', 'Export PDF');
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
});
