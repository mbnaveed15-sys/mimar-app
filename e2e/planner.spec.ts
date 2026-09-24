import { expect, test, type Page } from '@playwright/test';

/** Screen position of a point in plan (SVG viewBox) coordinates. */
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
  await page.mouse.move(...(await at(page, ...to)), { steps: 5 });
  await page.mouse.up();
}

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
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
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  expect((await download).suggestedFilename()).toBe('Untitled.png');
});
