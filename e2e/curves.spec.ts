import { expect, test } from '@playwright/test';
import { at, drag, ready, tool } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('curves: a round room, an oval, a three-point arc, a curved layout line and a rounded corner', async ({
  page,
}) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  const walls = page.locator('[data-type="wall"]');

  // The Curve tool sits on the Draw tool bar (Shift+V too).
  await tool(page, 'curve');
  await expect(page.getByTestId('curve-options')).toBeVisible();

  // A round room: its centre, then a typed radius. Two half-circle walls and the room inside.
  await page.getByRole('button', { name: 'Circle', exact: true }).click();
  await click(10, 10);
  await page.mouse.move(...(await at(page, ...P(14, 10))));
  await page.keyboard.type(`6'`);
  await page.keyboard.press('Enter');
  await expect(walls).toHaveCount(2);
  await expect(page.locator('[data-type="room"]')).toHaveCount(1);

  // An oval in a 16' × 10' box.
  await page.keyboard.press('Shift+V');
  await page.getByRole('button', { name: 'Oval', exact: true }).click();
  await click(24, 4);
  await page.mouse.move(...(await at(page, ...P(30, 10))));
  await page.keyboard.type(`16',10'`);
  await page.keyboard.press('Enter');
  await expect(walls).toHaveCount(6);
  await expect(page.locator('[data-type="room"]')).toHaveCount(2);

  // A garden wall through three points.
  await page.getByRole('button', { name: 'Arc: 3 points' }).click();
  await click(0, 24);
  await click(10, 20);
  await click(20, 24);
  await page.keyboard.press('Escape');
  await expect(walls).toHaveCount(7);

  // A curved layout line: drawn the same way, as a line.
  await page.getByTestId('curve-options').getByRole('button', { name: 'Layout lines' }).click();
  await click(0, 30);
  await click(10, 27);
  await click(20, 30);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="line"][data-arc]')).toHaveCount(1);

  // A rectangle with rounded corners: four sides and four quarter circles.
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'Rounded' }).click();
  await click(30, 20);
  await page.mouse.move(...(await at(page, ...P(40, 30))));
  await page.keyboard.type(`12',8'`);
  await page.keyboard.press('Enter');
  await expect(walls).toHaveCount(15);
});

test('curves: a slab edge and a plot side bent by their middle grips', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  const pull = async (handle: string, to: [number, number]) => {
    const box = (await page.locator(`[data-handle="${handle}"]`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const [x, y] = await at(page, ...to);
    await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.up();
  };

  // A plot: its road side (the bottom) pulled out into a curve, with its wall curved too.
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(30, 40));
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('Space');
  await click(15, 20);
  await expect(page.getByTestId('plot-sides')).toBeVisible();
  await expect(page.locator('[data-handle^="plot-bend-"]')).toHaveCount(4);
  const roadWall = await page.locator('[data-type="wall"]').evaluateAll((els) => els.map((e) => e.outerHTML).join());
  await pull('plot-bend-2', P(15, 44));
  await expect(page.getByTestId('plot-side-1')).toContainText('curved');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  expect(await page.locator('[data-type="wall"]').evaluateAll((els) => els.map((e) => e.outerHTML).join())).not.toBe(
    roadWall,
  );
  await page.getByTestId('plot-side-1').getByRole('button', { name: 'Make straight' }).click();
  await expect(page.getByTestId('plot-side-1')).not.toContainText('curved');

  // A slab: one edge bent out, then straight again from its panel.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+A');
  await drag(page, P(5, 5), P(15, 15));
  await expect(page.locator('[data-type="slab"]')).toHaveCount(1);
  await page.keyboard.press('Space');
  await click(10, 5);
  await expect(page.locator('[data-handle^="edge-bend-"]')).toHaveCount(4);
  await pull('edge-bend-0', P(10, 2));
  await expect(page.getByTestId('curved-edges')).toHaveText('1 curved edge');
  await page.getByRole('button', { name: 'Make edges straight' }).click();
  await expect(page.getByTestId('curved-edges')).toHaveCount(0);
});

test('curves: a curved path of a set width', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('Shift+V');
  await page.getByRole('button', { name: 'Path or driveway' }).click();
  await expect(page.getByLabel('Width')).toBeVisible();
  await page.getByRole('button', { name: 'Arc: 3 points' }).click();
  await click(2, 10);
  await click(10, 16);
  await click(20, 12);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(0);
  await expect(page.locator('[data-type="block"]')).toHaveCount(1);
  await page.keyboard.press('Space');
  await click(10, 16);
  await expect(page.getByText('Selected: path')).toBeVisible();
});

test('curves: a slab void’s edge bent by its middle grip', async ({ page }) => {
  const sq = (x0: number, y0: number, s: number) =>
    [
      [x0, y0],
      [x0 + s, y0],
      [x0 + s, y0 + s],
      [x0, y0 + s],
    ].map(([x, y]) => ({ x: x * FT, y: y * FT }));
  const plan = {
    version: 15,
    doc: { elements: [{ id: 's', type: 'slab', thickness: 15, points: sq(0, 0, 20), holes: [sq(6, 6, 8)] }] },
  };
  await page.evaluate((p) => localStorage.setItem('mimar.plan', JSON.stringify(p)), plan);
  await page.reload();
  await ready(page);
  await page.keyboard.press('Shift+Z');
  await page.mouse.click(...(await at(page, ...P(10, 0))));
  await expect(page.locator('[data-handle^="void-bend-"]')).toHaveCount(4);
  await expect(page.getByText('Drag the round grip in the middle of a void’s edge to curve it.')).toBeVisible();
  const box = (await page.locator('[data-handle="void-bend-0-0"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...P(10, 3))), { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('curved-void-edges')).toHaveText('1 curved void edge');
  await expect(page.getByTestId('slab-voids')).toHaveText('1 void');
  // Undo puts it straight; so does the panel's button.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('curved-void-edges')).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('curved-void-edges')).toHaveText('1 curved void edge');
  await page.getByRole('button', { name: 'Make voids straight' }).click();
  await expect(page.getByTestId('curved-void-edges')).toHaveCount(0);
});
