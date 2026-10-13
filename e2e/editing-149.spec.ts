import { expect, test, type Page } from '@playwright/test';
import { ready, tool } from './helpers';

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
  await page.keyboard.press('Escape');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('a room corner grip moves the walls that meet there', async ({ page }) => {
  await drawHouse(page);
  await tool(page, 'room');
  await page.mouse.click(...(await at(page, 5, 10)));
  await tool(page, 'select');
  const grips = page.locator('[data-handle^="room-corner-"]');
  await expect(grips).toHaveCount(4);
  // The top-left corner: the grip nearest the top left of the screen.
  const boxes = await grips.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  const corner = boxes.reduce((a, b) => (b.x + b.y < a.x + a.y ? b : a));
  const to = await at(page, -4, -4);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const doc = await saved(page);
      // Either end of each wall that met at the corner.
      const moved = (w: { x1: number; y1: number; x2: number; y2: number }) =>
        (w.x1 < -2 * FT && w.y1 < -2 * FT) || (w.x2 < -2 * FT && w.y2 < -2 * FT);
      return doc?.elements?.filter(moved).length;
    })
    .toBe(2);
});

test('several walls change thickness together, and the plinth shows on the plan', async ({ page }) => {
  await drawHouse(page);
  await tool(page, 'select');
  await page.mouse.click(...(await at(page, 20, 0)));
  await page.keyboard.down('Shift');
  await page.mouse.click(...(await at(page, 30, 10)));
  await page.keyboard.up('Shift');
  const shared = page.getByTestId('shared-panel');
  await expect(shared).toBeVisible();
  const thickness = shared.getByLabel('Thickness');
  await thickness.fill(`13.5"`);
  await thickness.press('Enter');
  await expect
    .poll(async () => {
      const doc = await saved(page);
      return doc?.elements?.filter((w: { thickness?: number }) => Math.abs((w.thickness ?? 0) - 34.29) < 0.1).length;
    })
    .toBe(2);

  // The plinth standing out 12" past the walls is outlined on the plan, and a click there picks it.
  await page.mouse.click(...(await at(page, 20, 10)));
  await page.mouse.click(...(await at(page, 20, 0)));
  await page.getByTestId('wall-plinth').getByRole('button', { name: 'Plinth settings' }).click();
  const out = page.getByTestId('plinth-panel').getByLabel('Stands out past the wall faces');
  await out.fill(`12"`);
  await out.press('Enter');
  await expect(page.locator('[data-type="plinth"]').first()).toBeAttached();
  await page.keyboard.press('Escape');
  // Past the top wall's outside face (13.5" thick: 6.75" out), within the plinth.
  await page.mouse.click(...(await at(page, 20, -1.3)));
  await expect(page.getByTestId('plinth-panel')).toBeVisible();
});
