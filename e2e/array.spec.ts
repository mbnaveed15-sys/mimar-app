import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers';

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

/** A plan with a column at (2', 2') and a 20' layout line along y = 10'. */
async function load(page: Page) {
  await page.evaluate((FT) => {
    const doc = {
      elements: [
        { id: 'c', type: 'column', x: 2 * FT, y: 2 * FT, w: 30, h: 30 },
        { id: 'l', type: 'line', x1: 0, y1: 10 * FT, x2: 20 * FT, y2: 10 * FT },
      ],
      rooms: [],
    };
    localStorage.setItem('mimar.plan', JSON.stringify({ version: 21, doc }));
  }, FT);
  await page.reload();
  await ready(page);
}

const columns = async (page: Page) =>
  ((await saved(page)).elements as { type: string; x: number; y: number }[])
    .filter((e) => e.type === 'column')
    .map((e) => [Math.round(e.x / FT) + 0, Math.round(e.y / FT) + 0]);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  await load(page);
});

test('Array copies in rows and columns, round a centre and along a line', async ({ page }) => {
  await page.keyboard.press('Shift+I');
  const options = page.getByTestId('array-options');
  await expect(options).toBeVisible();
  await options.getByLabel('Columns').fill('3');
  await options.getByLabel('Rows').fill('2');
  // Click the column (it becomes the selection and the base point), then type one cell: 4' across, 3' down.
  await page.mouse.click(...(await at(page, 2, 2)));
  await page.keyboard.type("@4',-3'");
  await page.keyboard.press('Enter');
  await expect.poll(() => columns(page)).toHaveLength(6);
  expect(await columns(page)).toEqual(
    expect.arrayContaining([
      [10, 2],
      [2, 5],
      [10, 5],
    ]),
  );
  await page.keyboard.press('Control+z');
  await expect.poll(() => columns(page)).toHaveLength(1);

  // Round a centre: 4 in all round (2', 6').
  await options.getByRole('radio', { name: 'Round a centre' }).click();
  await options.getByLabel('How many (in all)').fill('4');
  await page.mouse.click(...(await at(page, 2, 6)));
  await page.keyboard.press('Enter');
  await expect.poll(() => columns(page)).toHaveLength(4);
  expect(await columns(page)).toEqual(
    expect.arrayContaining([
      [6, 6],
      [2, 10],
      [-2, 6],
    ]),
  );
  await page.keyboard.press('Control+z');

  // Along the layout line: 5 spaced from end to end.
  await options.getByRole('radio', { name: 'Along a path' }).click();
  await options.getByLabel('How many (in all)').fill('5');
  await page.mouse.click(...(await at(page, 12, 10)));
  await expect.poll(() => columns(page)).toHaveLength(6);
  expect(await columns(page)).toEqual(
    expect.arrayContaining([
      [0, 10],
      [5, 10],
      [20, 10],
    ]),
  );
});

test('a dragged wall keeps its corners, Esc puts a drag back, and Esc leaves a field', async ({ page }) => {
  // A 10' x 5' room.
  await page.keyboard.press('r');
  await page.mouse.click(...(await at(page, 8, 3)));
  await page.mouse.click(...(await at(page, 18, 8)));
  await page.keyboard.press('Escape');
  const walls = async () =>
    ((await saved(page)).elements as { type: string; x1: number; x2: number }[])
      .filter((e) => e.type === 'wall')
      .map((w) => [Math.round(w.x1 / FT), Math.round(w.x2 / FT)]);
  await expect.poll(walls).toHaveLength(4);
  await page.keyboard.press('Space');
  // Drag the right wall 2' to the right: the top and bottom walls stretch with it.
  await page.mouse.move(...(await at(page, 18, 6)));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, 20, 6)), { steps: 6 });
  await page.mouse.up();
  await expect.poll(walls).toEqual(expect.arrayContaining([[20, 20]]));
  expect((await walls()).filter(([a, b]) => a === 20 || b === 20)).toHaveLength(3);
  // Esc during a drag puts it back.
  const from = await at(page, 20, 6);
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(from[0] + 60, from[1], { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.move(from[0] + 80, from[1], { steps: 3 });
  await page.mouse.up();
  expect((await walls()).filter(([a, b]) => a === 20 || b === 20)).toHaveLength(3);

  // Esc in a panel field leaves it, so tool keys work again.
  await page.keyboard.press('Shift+I');
  await page.getByTestId('array-options').getByLabel('Columns').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('array-options').getByLabel('Columns')).not.toBeFocused();
  // Then Esc drops the selection, and once more goes back to Select.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('array-options')).toHaveCount(0);
});

test('Copy (CO) keeps copying from the same base until Esc', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, 2, 2)));
  await page.keyboard.press('c');
  await page.keyboard.press('o');
  await page.mouse.click(...(await at(page, 2, 2)));
  await page.mouse.click(...(await at(page, 6, 2)));
  await page.mouse.click(...(await at(page, 10, 2)));
  await page.keyboard.press('Escape');
  await expect.poll(() => columns(page)).toHaveLength(3);
  expect(await columns(page)).toEqual(
    expect.arrayContaining([
      [6, 2],
      [10, 2],
    ]),
  );
  // Each copy is its own step to undo.
  await page.keyboard.press('Control+z');
  await expect.poll(() => columns(page)).toHaveLength(2);
});
