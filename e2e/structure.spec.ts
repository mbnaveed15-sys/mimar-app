import { expect, test } from '@playwright/test';
import { at, openSection, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('columns, beams and slabs on two floors, shown stacked in 3D', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('r');
  await click(2, 2);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`20',16'`);
  await page.keyboard.press('Enter');

  await page.keyboard.press('c');
  for (const [x, y] of [
    [2, 2],
    [22, 2],
  ])
    await click(x, y);
  await expect(page.locator('[data-type="column"]')).toHaveCount(2);

  await page.keyboard.press('n');
  await click(2, 2);
  await click(22, 2);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="beam"]')).toHaveCount(1);

  await page.keyboard.press('Shift+A');
  await click(10, 10); // inside the walls: a slab over the room, out to the wall centres
  await expect(page.locator('[data-type="slab"]')).toHaveCount(1);

  // Add a floor: the ground floor shows faintly, and new walls go on the first floor.
  await page.getByRole('button', { name: /^Floor:/ }).click();
  await page.getByRole('menuitem', { name: 'Add floor above' }).click();
  await expect(page.getByRole('button', { name: 'Floor: First floor' })).toBeVisible();
  await expect(page.getByTestId('level-below')).toBeVisible();
  await page.keyboard.press('l');
  await click(2, 2);
  await click(12, 2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('PageDown');
  await expect(page.getByRole('button', { name: 'Floor: Ground floor' })).toBeVisible();
  await expect(page.getByTestId('level-below')).toHaveCount(0);

  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(view).toHaveAttribute('data-slabs', '1');
});

test('a plot with setbacks and a boundary wall, a gate, and a stair', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('Shift+P');
  await click(0, 0);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`25',45'`);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="plot"]')).toHaveCount(1);
  await expect(page.getByTestId('buildable-area')).toHaveCount(1);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  await page.keyboard.press('Shift+Z'); // a 45' plot is taller than the window

  await page.keyboard.press('d');
  await page.getByRole('button', { name: 'Gate', exact: true }).click();
  await click(12, 44.6);
  await expect(page.getByTestId('gate')).toHaveCount(1);

  await page.keyboard.press('u');
  await page.getByRole('button', { name: 'L-shaped' }).click();
  await click(12, 20);
  await expect(page.locator('[data-type="stair"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await click(12, 20);
  await expect(page.getByTestId('stair-risers')).toContainText('risers');

  await page.keyboard.press('Control+2');
  await expect(page.getByTestId('plan-3d')).toHaveAttribute('data-floors', '1');
});

test('raise an item above its floor, by its height or with Alt+arrows, and move it up in 3D', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('c');
  await click(4, 4);
  await page.keyboard.press('Space');
  await click(4, 4);
  const height = page.getByLabel('Height above floor');
  await height.fill(`2'`);
  await height.press('Enter');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`+2' 0"`);

  // Alt+up/down: a grid square at a time.
  await page.getByTestId('plan-canvas').hover();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByTestId('elevation-tag')).not.toHaveText(`+2' 0"`);
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`+2' 0"`);

  // Sunk below the floor.
  await height.fill(`-1'`);
  await height.press('Enter');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`-1' 0"`);

  // In 3D, Move then arrow up locks to the blue axis and takes a typed height.
  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(view).toBeVisible();
  await page.keyboard.press('m');
  const box = (await view.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByText('Blue axis locked (up and down)')).toBeVisible();
  await page.keyboard.type(`3'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('elevation-tag')).toHaveText(`+2' 0"`);
});

test('a plot under CDA bylaws: preset size, setbacks from the table, and a live plan check', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('Shift+P');
  await page.getByLabel('Bylaws').selectOption('cda');
  await page.getByRole('button', { name: '50×90' }).click();
  await expect(page.getByTestId('tool-hint')).toContainText("50' × 90'");
  await click(0, 0);
  const check = page.getByTestId('plan-check');
  await expect(check).toContainText('Type C, 400–1000 sq yd');
  await page.keyboard.press('Shift+Z');

  // A house inside the building line passes; one reaching into the 15' front setback doesn't.
  await page.keyboard.press('r');
  await click(6, 12);
  await click(44, 70);
  await expect(page.getByTestId('plan-check-summary')).toHaveText('No problems found');
  await page.keyboard.press('l');
  await click(6, 70);
  await click(6, 82);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('plan-check-summary')).toHaveText('1 rule not met');
  await expect(page.locator('[data-check-mark="fail"]')).toHaveCount(1);
  // Clicking the row selects what breaks it.
  await check.locator('[data-check="setbacks"]').click();
  await expect(page.getByText('Selected: wall')).toBeVisible();

  // The plot shows its bylaws and setbacks; the PDF comes out with its check page.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  // Lock the walls, so a click on the plot line picks the plot rather than its boundary wall.
  await openSection(page, 'Layers');
  await page.getByRole('button', { name: 'Lock Walls' }).click();
  await click(25, 90);
  await expect(page.getByTestId('plot-rule')).toContainText('Type C');
  await expect(page.getByLabel('Front (main road)', { exact: true })).toHaveValue(`15' 0"`);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+p');
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});

test('walls drawn on the building line sit inside it, touching it with their outer face', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('Shift+P');
  await page.getByLabel('Bylaws').selectOption('cda');
  await page.getByRole('button', { name: '50×90' }).click();
  await click(0, 0);
  await page.keyboard.press('Shift+Z');
  // The building line runs 5' in from the sides, 10' from the rear and 15' from the road.
  await page.keyboard.press('r');
  await page.mouse.move(...(await at(page, ...P(5, 10))));
  await expect(page.getByText('On building line').first()).toBeVisible();
  await click(5, 10);
  await click(45, 75);
  // Centred on the line, the walls would reach 4½" into the setbacks and fail the check.
  await expect(page.getByTestId('plan-check-summary')).toHaveText('No problems found');
});

test('duplicate a floor above, and set how strongly the floor below shows', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('r');
  await click(2, 2);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`20',16'`);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);

  await page.getByRole('button', { name: /^Floor:/ }).click();
  await page.getByRole('menuitem', { name: 'Duplicate this floor above' }).click();
  await expect(page.getByRole('button', { name: 'Floor: First floor' })).toBeVisible();
  // The copies are on the first floor, over the ground floor's faint walls.
  const below = page.getByTestId('level-below');
  await expect(below.locator('[data-type="wall"]')).toHaveCount(4);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(8);
  await expect(below).toHaveAttribute('opacity', '0.22');

  await page.getByRole('button', { name: /^Floor:/ }).click();
  const slider = page.getByLabel('Floor below: how strongly it shows');
  await slider.fill('50');
  await expect(below).toHaveAttribute('opacity', '0.5');
  await slider.fill('0');
  await expect(below).toHaveCount(0);
});

test('Ground (site): draw your own plinth under the ground floor, at the lawn', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  const room = async () => {
    await page.keyboard.press('r');
    await click(2, 2);
    await page.mouse.move(...(await at(page, ...P(5, 5))));
    await page.keyboard.type(`20',16'`);
    await page.keyboard.press('Enter');
  };
  await room();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);

  // It is listed under the ground floor, and added when picked.
  await page.getByRole('button', { name: /^Floor:/ }).click();
  const floors = page.getByRole('menuitemradio');
  await expect(floors).toHaveText([/Ground floor/, /Ground \(site\)/]);
  await page.getByRole('menuitemradio', { name: 'Ground (site)' }).click();
  await expect(page.getByRole('button', { name: 'Floor: Ground (site)' })).toBeVisible();
  // The ground floor shows faintly over it, to draw the plinth under its walls.
  const faint = page.getByTestId('level-below');
  await expect(faint.locator('[data-type="wall"]')).toHaveCount(4);

  await page.getByRole('button', { name: /^Floor:/ }).click();
  await expect(page.getByTestId('site-heights')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Duplicate this floor above' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Delete this floor' })).toHaveCount(0);
  await expect(page.getByLabel('Ground floor: how strongly it shows')).toBeVisible();
  const own = page.getByRole('group', { name: 'Plinth' }).getByRole('button', { name: 'Draw my own' });
  await own.click();
  await expect(own).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  // The plinth walls, drawn on the lawn.
  await room();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(8);

  // Back on the ground floor, the plinth shows faintly under it.
  await page.getByRole('button', { name: /^Floor:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Ground floor' }).click();
  await expect(faint.locator('[data-type="wall"]')).toHaveCount(4);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('mimar.plan') ?? '{}').doc);
  await expect.poll(async () => (await saved())?.ownPlinth).toBe(true);
  expect((await saved()).levels.map((l: { id: string }) => l.id)).toEqual(['site', 'ground']);
});

test('freeform slabs: corner by corner, over rooms picked, and following the walls', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  const room = async (x: number, y: number, size: string) => {
    await page.keyboard.press('r');
    await click(x, y);
    await page.mouse.move(...(await at(page, ...P(x + 3, y + 3))));
    await page.keyboard.type(size);
    await page.keyboard.press('Enter');
  };
  // An L-shaped house: a 20' × 16' room with a 10' × 10' one beside it.
  await room(2, 2, `20',16'`);
  await room(22, 2, `10',10'`);
  const slabs = page.locator('[data-type="slab"]');
  const corners = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem('mimar.plan') ?? '{}')
        .doc.elements.filter((el: { type: string }) => el.type === 'slab')
        .map((el: { points: unknown[] }) => el.points.length),
    );

  await page.keyboard.press('Shift+A');
  const shape = page.getByRole('group', { name: 'Slab shape' });
  await shape.getByRole('button', { name: 'Follow the walls' }).click();
  await click(10, 10);
  await expect(slabs).toHaveCount(1);
  await expect.poll(corners).toEqual([6]);
  await page.keyboard.press('Control+z');
  await expect(slabs).toHaveCount(0);

  await shape.getByRole('button', { name: 'Rooms' }).click();
  await click(10, 10);
  await click(26, 6);
  await expect(page.getByTestId('slab-room-picked')).toHaveCount(2);
  // Clicked again, a room is dropped; and picked again.
  await click(26, 6);
  await expect(page.getByTestId('slab-room-picked')).toHaveCount(1);
  await click(26, 6);
  await page.keyboard.press('Enter');
  await expect(slabs).toHaveCount(1);
  await expect.poll(corners).toEqual([6]);
  await page.keyboard.press('Control+z');
  await expect(slabs).toHaveCount(0);

  await shape.getByRole('button', { name: 'Corner by corner' }).click();
  for (const [x, y] of [
    [2, 2],
    [32, 2],
    [32, 12],
    [22, 18],
    [2, 18],
  ])
    await click(x, y);
  await expect(page.getByTestId('slab-draft')).toBeVisible();
  await click(2, 2);
  await expect(slabs).toHaveCount(1);
  await expect.poll(corners).toEqual([5]);
});
