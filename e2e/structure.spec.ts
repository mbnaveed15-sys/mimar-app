import { expect, test, type Page } from '@playwright/test';
import { menu, ready } from './helpers';

const FT = 30.48; // plan units per foot
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('mimar.plan') ?? '{}').doc);

/** A 30' × 20' house with a cross wall, a room each side and a door. */
const HOUSE = (() => {
  const w = (id: string, x1: number, y1: number, x2: number, y2: number) => ({
    id,
    type: 'wall',
    x1: x1 * FT,
    y1: y1 * FT,
    x2: x2 * FT,
    y2: y2 * FT,
  });
  const room = (id: string, name: string, x0: number, x1: number) => ({
    id,
    name,
    points: [
      { x: x0 * FT, y: 0 },
      { x: x1 * FT, y: 0 },
      { x: x1 * FT, y: 20 * FT },
      { x: x0 * FT, y: 20 * FT },
    ],
  });
  return {
    elements: [
      w('s', 0, 0, 30, 0),
      w('e', 30, 0, 30, 20),
      w('n', 30, 20, 0, 20),
      w('w', 0, 20, 0, 0),
      w('m', 15, 0, 15, 20),
      { id: 'd', type: 'door', wallId: 'm', x: 15 * FT, y: 10 * FT, angle: 90, width: 3 * FT },
    ],
    rooms: [room('r1', 'Bedroom', 0, 15), room('r2', 'Lounge', 15, 30)],
    masks: [],
    materials: [],
    groups: [],
    components: [],
    levels: [{ id: 'ground', name: 'Ground floor' }],
    plinthMm: 610,
  };
})();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((doc) => {
    localStorage.clear();
    localStorage.setItem('mimar.plan', JSON.stringify({ version: 22, doc }));
  }, HOUSE);
  await page.reload();
  await ready(page);
});

test('Generate structure adds the frame, the frame-only view shows the footings, and Remove takes it away', async ({
  page,
}) => {
  await menu(page, 'Draw', 'Generate structure…');
  const panel = page.getByTestId('structure-panel');
  await expect(panel).toBeVisible();
  await panel.getByTestId('frame-generate').click();
  await expect(panel.getByTestId('frame-note')).toContainText('9 columns');
  const doc = await saved(page);
  const columns = doc.elements.filter((e: { type: string }) => e.type === 'column');
  expect(columns).toHaveLength(9);
  expect(doc.frame.madeFrom).toBeTruthy();
  // Footings stay off the floor plan until only the structure is shown.
  await expect(page.getByTestId('frame-mark')).toHaveCount(0);
  await panel.getByTestId('frame-view').check();
  await expect(page.getByTestId('frame-mark').first()).toBeVisible();
  await page.keyboard.press('Control+2');
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.keyboard.press('Control+1');
  await panel.getByTestId('frame-view').uncheck();

  await panel.getByRole('button', { name: 'Remove structure' }).click();
  await expect
    .poll(async () => (await saved(page)).elements.filter((e: { type: string }) => e.type === 'column').length)
    .toBe(0);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await saved(page)).elements.filter((e: { type: string }) => e.type === 'column').length)
    .toBe(9);
});
