import { expect, test, type Page } from '@playwright/test';
import { at, menu, ready, tool } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

const panel = (page: Page) => page.locator('aside[aria-label="Properties"]');
/** The section headings in the stacked view, in order. */
const headings = (page: Page) =>
  panel(page)
    .locator('[data-panel-item]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.panelItem));

async function dragBy(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 6);
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('sections move up and down by their grip or its menu, and the order is kept', async ({ page }) => {
  const before = await headings(page);
  expect(before[0]).toBe('project');

  // Drag the Ground and site grip above Project.
  const grip = (await panel(page).locator('[data-panel-grip="ground"]').boundingBox())!;
  const top = (await panel(page).locator('[data-panel-item="project"]').boundingBox())!;
  await dragBy(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, { x: grip.x, y: top.y + 3 });
  expect((await headings(page)).slice(0, 2)).toEqual(['ground', 'project']);

  // Right-click Settings' grip: Move to top.
  await panel(page).locator('[data-panel-grip="settings"]').click({ button: 'right' });
  await page.getByRole('menu', { name: 'Panel' }).getByRole('menuitem', { name: 'Move to top' }).click();
  expect((await headings(page)).slice(0, 2)).toEqual(['settings', 'ground']);
  // Clicking a grip doesn't open or close its section.
  await panel(page).locator('[data-panel-grip="grid"]').click();
  await expect(panel(page).locator('#section-grid')).not.toHaveAttribute('open');

  await page.reload();
  await ready(page);
  expect((await headings(page)).slice(0, 2)).toEqual(['settings', 'ground']);

  await menu(page, 'View', 'Reset panels');
  expect(await headings(page)).toEqual(before);
});

test('the tabs view shows one panel at a time, folds, and brings properties forward on a selection', async ({
  page,
}) => {
  await panel(page).getByRole('button', { name: 'Tabs', exact: true }).click();
  const tabs = panel(page).getByRole('tablist', { name: 'Panels' });
  await expect(tabs.getByRole('tab')).toHaveCount(await tabs.getByRole('tab').count());
  await expect(tabs.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: /Layers/ }).click();
  await expect(panel(page).getByRole('tabpanel', { name: 'Layers' })).toBeVisible();
  await expect(panel(page).locator('details')).toHaveCount(0);

  // Clicking the open tab again folds the panel to its tab strip.
  const wide = (await panel(page).boundingBox())!.width;
  await tabs.getByRole('tab', { name: /Layers/ }).click();
  await expect(panel(page).getByRole('tabpanel')).toHaveCount(0);
  expect((await panel(page).boundingBox())!.width).toBeLessThan(wide / 3);

  // A menu command that opens a section opens its tab.
  await menu(page, 'View', 'Grid settings…');
  await expect(panel(page).getByRole('tabpanel', { name: 'Grid' })).toBeVisible();

  // Drawing a wall selects it, and its properties come forward.
  await tool(page, 'Wall');
  const a = await at(page, 0, 0);
  const b = await at(page, 300, 0);
  await page.mouse.click(...a);
  await page.mouse.dblclick(...b);
  await page.keyboard.press('Escape');
  await tool(page, 'Select');
  const mid = await at(page, 150, 0);
  await page.mouse.click(...mid);
  await expect(tabs.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page).getByRole('heading', { name: 'Properties' })).toBeVisible();
});

test('the panels dock at either side and can be made wider', async ({ page }) => {
  const canvas = page.getByTestId('plan-canvas');
  const right = (await panel(page).boundingBox())!;
  expect(right.x).toBeGreaterThan((await canvas.boundingBox())!.x);

  await panel(page).getByRole('button', { name: 'Dock panels left' }).click();
  await expect(panel(page)).toHaveAttribute('data-side', 'left');
  expect((await panel(page).boundingBox())!.x).toBe(0);

  // Drag its heading back to the right half.
  const handle = (await page.getByTestId('panel-handle').boundingBox())!;
  const vw = page.viewportSize()!.width;
  await dragBy(page, { x: handle.x + 10, y: handle.y + handle.height / 2 }, { x: vw - 50, y: handle.y + 20 });
  await expect(panel(page)).toHaveAttribute('data-side', 'right');

  // Widen it by its inner edge.
  const edge = (await panel(page).getByRole('separator', { name: 'Resize panels' }).boundingBox())!;
  const before = (await panel(page).boundingBox())!.width;
  await dragBy(page, { x: edge.x + edge.width / 2, y: edge.y + 200 }, { x: edge.x - 100, y: edge.y + 200 });
  expect((await panel(page).boundingBox())!.width).toBeGreaterThan(before + 80);

  await page.reload();
  await ready(page);
  expect((await panel(page).boundingBox())!.width).toBeGreaterThan(before + 80);
});
