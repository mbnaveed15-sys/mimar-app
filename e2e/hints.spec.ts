import { expect, test } from '@playwright/test';
import { openSection, ready } from './helpers';

const FT = 30.48;
const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({
  id,
  type: 'wall',
  x1: x1 * FT,
  y1: y1 * FT,
  x2: x2 * FT,
  y2: y2 * FT,
  thickness: 23,
});
const opening = (id: string, type: string, wallId: string, x: number, y: number, w: number, angle = 0) => ({
  id,
  type,
  wallId,
  x: x * FT,
  y: y * FT,
  angle,
  width: w * FT,
});
const room = (id: string, name: string, x: number, y: number, w: number, d: number) => ({
  id,
  name,
  points: [
    { x: x * FT, y: y * FT },
    { x: (x + w) * FT, y: y * FT },
    { x: (x + w) * FT, y: (y + d) * FT },
    { x: x * FT, y: (y + d) * FT },
  ],
});

/** A 30' × 40' house: the lounge off the road, bedroom 1 off the lounge, bedroom 2 only through bedroom 1. */
const PLAN = {
  version: 5,
  doc: {
    elements: [
      wall('top', 0, 0, 30, 0),
      wall('right', 30, 0, 30, 40),
      wall('bottom', 30, 40, 0, 40),
      wall('left', 0, 40, 0, 0),
      wall('mid', 15, 0, 15, 40),
      wall('split', 0, 20, 15, 20),
      opening('front', 'door', 'bottom', 22, 40, 3, 180),
      opening('d1', 'door', 'mid', 15, 10, 3, 90),
      opening('d2', 'door', 'split', 7, 20, 3),
      opening('w1', 'window', 'right', 30, 20, 16, 90),
      opening('w2', 'window', 'left', 0, 10, 8, 270),
    ],
    rooms: [
      room('lounge', 'Lounge', 15, 0, 15, 40),
      room('bed1', 'Bedroom 1', 0, 0, 15, 20),
      room('bed2', 'Bedroom 2', 0, 20, 15, 20),
    ],
    masks: [],
    groups: [],
    components: [],
  },
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((plan) => {
    localStorage.clear();
    localStorage.setItem('mimar.plan', JSON.stringify(plan));
  }, PLAN);
  await page.reload();
  await ready(page);
});

test('plan hints: rooms reached through doors, daylight, marks, and turning them off', async ({ page }) => {
  const hints = page.getByTestId('plan-hints');
  await expect(hints).toContainText('Bedroom 2 is only reached through Bedroom 1.');
  await expect(hints).toContainText('Bedroom 2 has an outside wall but no window.');
  await expect(hints.locator('[data-hint]')).toHaveCount(2);
  await expect(page.locator('[data-check-mark="hint"]')).toHaveCount(2);

  // A hint selects the room it is about.
  await hints.locator('[data-hint="no-window-bed2"]').click();
  await expect(page.getByText('Selected: room')).toBeVisible();
  await page.keyboard.press('Escape');

  // North, and hints in the PDF, are set in Settings; the PDF still comes out.
  await openSection(page, 'Settings');
  await page.getByLabel('North points').selectOption({ label: 'Right' });
  await page.getByLabel('Add the plan hints to PDFs').check();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+p');
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  expect(errors).toEqual([]);

  // Turned off, the hints and their marks go.
  await page.getByLabel('Show plan hints (good-practice advice)').uncheck();
  await expect(hints).toHaveCount(0);
  await expect(page.locator('[data-check-mark="hint"]')).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('plan-hints')).toHaveCount(0);
  await openSection(page, 'Settings');
  await expect(page.getByLabel('North points')).toHaveValue('90');
});
