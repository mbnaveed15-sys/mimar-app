import { expect, test, type Page } from '@playwright/test';
import { at, drag, tool, menu } from './helpers';

const count = (page: Page, type: string) => page.locator(`[data-type="${type}"]`).count();

test('draw a wall, add a door, undo and redo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  await tool(page, 'wall');
  await drag(page, [200, 300], [800, 300]);
  expect(await count(page, 'wall')).toBe(1);

  await tool(page, 'door');
  await page.mouse.click(...(await at(page, 400, 302)));
  expect(await count(page, 'door')).toBe(1);

  await page.keyboard.press('Control+z');
  expect(await count(page, 'door')).toBe(0);
  await page.getByRole('button', { name: /Undo/ }).click();
  expect(await count(page, 'wall')).toBe(0);

  await page.keyboard.press('Control+y');
  await page.getByRole('button', { name: /Redo/ }).click();
  expect(await count(page, 'wall')).toBe(1);
  expect(await count(page, 'door')).toBe(1);

  // The plan survives a reload.
  await page.reload();
  expect(await count(page, 'door')).toBe(1);
  expect(errors).toEqual([]);
});

test('opens a plan saved by Mimar 1.x', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('mimar.plan')) return;
    localStorage.setItem(
      'planner.elements',
      JSON.stringify([{ id: 1700000000001, type: 'wall', x1: 100, y1: 100, x2: 500, y2: 100, material: 'mat_brick' }]),
    );
  });
  await page.goto('/');
  expect(await count(page, 'wall')).toBe(1);
});

test('exports a PNG', async ({ page }) => {
  await page.goto('/');
  // An empty plan has nothing to export, so draw a wall first.
  await tool(page, 'wall');
  await drag(page, [100, 100], [500, 100]);
  const download = page.waitForEvent('download');
  await menu(page, 'File', 'Export PNG');
  expect((await download).suggestedFilename()).toBe('Untitled.png');
});
