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

test('furniture use zones: a hint when a wall is in the way, shown round the selected item', async ({ page }) => {
  // A king bed against bedroom 1's side wall, and a WC in the lounge.
  const furniture = [
    { id: 'bed', type: 'furniture', kind: 'bed-king', x: 3.5 * FT, y: 3.7 * FT, w: 183, h: 198 },
    { id: 'wc', type: 'furniture', kind: 'wc', x: 20 * FT, y: 10 * FT, w: 40, h: 70 },
  ];
  await page.evaluate(
    ([plan, extra]) => {
      const p = plan as typeof PLAN;
      localStorage.setItem(
        'mimar.plan',
        JSON.stringify({ ...p, doc: { ...p.doc, elements: [...p.doc.elements, ...(extra as object[])] } }),
      );
    },
    [PLAN, furniture] as const,
  );
  await page.reload();
  await ready(page);
  const hints = page.getByTestId('plan-hints');
  await expect(hints).toContainText(`King bed needs more free space at one side (2' 0").`);
  await expect(hints.locator('[data-hint]')).toHaveCount(3);

  // Picking the hint selects the bed: its use zone shows round it, and the side panel says why.
  await hints.locator('[data-hint="zone-bed"]').click();
  await expect(page.getByText('Selected: King bed')).toBeVisible();
  await expect(page.locator('[data-testid="use-zone"]')).toHaveCount(3);
  await expect(page.getByTestId('use-zone-note')).toContainText(`2' 0" at its foot, 2' 0" at each side`);
  await expect(page.getByTestId('use-zone-note')).toContainText('General practice');
  await page.keyboard.press('Escape');

  // The wheelchair setting gives the WC the larger ADA space.
  await openSection(page, 'Settings');
  await page.getByLabel('Wheelchair space round WCs, basins, showers and cars (ADA)').check();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const [x, y] = await page.getByTestId('plan-canvas').evaluate(
    (svg, [px, py]) => {
      const pt = new DOMPoint(px, py).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return [pt.x, pt.y];
    },
    [20 * FT, 10 * FT],
  );
  await page.mouse.click(x, y);
  await expect(page.getByTestId('use-zone-note')).toContainText(`2' 4" in front, 2' 10" at one side`);
  await expect(page.getByTestId('use-zone-note')).toContainText('Wheelchair space');
});
