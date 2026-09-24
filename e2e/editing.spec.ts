import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function at(page: Page, x: number, y: number): Promise<[number, number]> {
  return page.getByTestId('plan-canvas').evaluate(
    (svg, [px, py]) => {
      const pt = new DOMPoint(px, py).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return [pt.x, pt.y] as [number, number];
    },
    [x, y],
  );
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...(await at(page, ...from)));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...to)), { steps: 6 });
  await page.mouse.up();
}

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const furnitureTransform = (page: Page) => page.locator('[data-type="furniture"]').getAttribute('transform');

test.beforeEach(async ({ page }) => {
  // Use the download fallback for saving so no native dialog opens.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
});

test('zoom buttons, keyboard and fit change the zoom level', async ({ page }) => {
  const level = page.getByTestId('zoom-level');
  const start = await level.textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await level.textContent()).not.toBe(start);
  await page.keyboard.press('0');
  expect(await level.textContent()).toBe(start);
});

test('walls show real dimensions in feet and inches or metric', async ({ page }) => {
  await tool(page, 'wall');
  // 30.48 plan units = 1 ft; draw 10 ft.
  await drag(page, [304.8, 304.8], [609.6, 304.8]);
  await expect(page.locator('[data-type="dimension"] text')).toHaveText(`10' 0"`);
  await page.getByLabel('Units').selectOption('metric');
  await expect(page.locator('[data-type="dimension"] text')).toHaveText('3.05 m');
});

test('select, drag to move, edit in inspector, and undo the move', async ({ page }) => {
  await tool(page, 'furniture');
  await page.mouse.click(...(await at(page, 304.8, 304.8)));
  const placed = await furnitureTransform(page);

  await tool(page, 'select');
  await drag(page, [304.8, 304.8], [609.6, 304.8]);
  const moved = await furnitureTransform(page);
  expect(moved).not.toBe(placed);

  const width = page.getByLabel('Width');
  await width.fill('6ft');
  await width.press('Enter');
  await expect(page.getByLabel('Width')).toHaveValue(`6' 0"`);

  await page.keyboard.press('r');
  expect(await furnitureTransform(page)).toContain('rotate(90)');

  await page.keyboard.press('Control+z'); // rotation
  await page.keyboard.press('Control+z'); // width
  await page.keyboard.press('Control+z'); // move
  expect(await furnitureTransform(page)).toBe(placed);
});

test('doors slide along their wall and can be flipped', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, [304.8, 304.8], [914.4, 304.8]);
  await tool(page, 'door');
  await page.mouse.click(...(await at(page, 450, 305)));
  const door = page.locator('[data-type="door"]');
  const before = await door.getAttribute('transform');

  await tool(page, 'select');
  await drag(page, [450, 305], [700, 330]);
  const after = await door.getAttribute('transform');
  expect(after).not.toBe(before);
  expect(after).toContain(',304.8)'); // still on the wall

  await page.getByRole('button', { name: 'Flip swing' }).click();
  expect(await door.getAttribute('transform')).toContain('scale(1,-1)');
});

test('save a plan to a file, start a new one, and open it again', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, [304.8, 304.8], [609.6, 304.8]);
  await expect(page.getByTestId('file-name')).toContainText('unsaved');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Untitled.mimar');
  await expect(page.getByTestId('file-name')).not.toContainText('unsaved');
  const saved = await readFile(await file.path());

  await page.getByRole('button', { name: 'New' }).click();
  expect(await page.locator('[data-type="wall"]').count()).toBe(0);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…' }).click();
  await (await chooser).setFiles({ name: 'House.mimar', mimeType: 'application/json', buffer: saved });
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
  await expect(page.getByTestId('file-name')).toHaveText('House');
});

test('asks before discarding unsaved changes', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, [304.8, 304.8], [609.6, 304.8]);
  await page.getByRole('button', { name: 'New' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.locator('[data-type="wall"]').count()).toBe(1);
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('button', { name: 'Discard and start new' }).click();
  expect(await page.locator('[data-type="wall"]').count()).toBe(0);
});

test('opening a file that is not a plan shows a clear message', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…' }).click();
  await (await chooser).setFiles({ name: 'notes.mimar', mimeType: 'application/json', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert')).toContainText('not a Mimar plan');
});
