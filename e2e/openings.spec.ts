import { expect, test, type Page } from '@playwright/test';
import { at, drag, openSection, ready, tool } from './helpers';

const FT = 30.48;
/** A new single door: 900 mm, in feet. */
const W = 900 / 304.8;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

/** A 20' × 12' room (outside corners 2,2 and 22,14) split by a partition at 12'. */
async function room(page: Page) {
  await tool(page, 'rectangle');
  await page.mouse.click(...(await at(page, ...P(2, 2))));
  await page.mouse.click(...(await at(page, ...P(22, 14))));
  await tool(page, 'wall');
  await drag(page, P(12, 2), P(12, 14));
  await page.keyboard.press('Escape');
}

const doors = (page: Page) => page.getByTestId('plan-canvas').locator('[data-type="door"]');
/** A door's centre along x, in feet. */
const doorX = async (page: Page, i = 0) => {
  const t = (await doors(page).nth(i).getAttribute('transform')) ?? '';
  return Number(/translate\(([-\d.]+)/.exec(t)![1]) / FT;
};

test('a door previews on the wall, snaps to the middle of its piece and keeps clear of corners', async ({ page }) => {
  await room(page);
  await page.keyboard.press('d');
  // The left piece of the top wall runs from the left wall's face (2'4.5") to the partition's (11'7.5").
  await page.mouse.move(...(await at(page, ...P(7.2, 2.4))), { steps: 3 });
  await expect(page.getByTestId('opening-ghost')).toBeVisible();
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-snap', 'wall-centre');
  await expect(page.getByTestId('opening-dim')).toHaveCount(2);
  await page.mouse.click(...(await at(page, ...P(7.2, 2.4))));
  expect(await doorX(page)).toBeCloseTo((2 + 4.5 / 12 + 12 - 4.5 / 12) / 2, 2);

  // Pushed into the corner, it stops 6" from the wall's face.
  await page.mouse.click(...(await at(page, ...P(12.5, 2.4))));
  expect(await doorX(page, 1)).toBeCloseTo(12 + 4.5 / 12 + 0.5 + W / 2, 2);

  // A typed distance from the nearer corner: 2' from the right wall's face.
  await page.mouse.move(...(await at(page, ...P(20.5, 2.4))), { steps: 2 });
  await page.keyboard.type(`2'`);
  await page.keyboard.press('Enter');
  expect(await doorX(page, 2)).toBeCloseTo(22 - 4.5 / 12 - 2 - W / 2, 2);
});

test('a wall too short for the door says so and places nothing', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, P(4, 4), P(7, 4));
  await drag(page, P(4, 2), P(4, 8));
  await drag(page, P(7, 2), P(7, 8));
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await page.mouse.move(...(await at(page, ...P(5.5, 4.2))), { steps: 2 });
  await expect(page.getByTestId('opening-error')).toContainText('with its gaps');
  await page.mouse.click(...(await at(page, ...P(5.5, 4.2))));
  await expect(doors(page)).toHaveCount(0);
});

test('set up a door before placing, pick one up with Alt-click, flip its hinge with V', async ({ page }) => {
  await room(page);
  await page.keyboard.press('d');
  await page.getByRole('group', { name: 'Door type' }).getByRole('button', { name: 'Double' }).click();
  await page.getByLabel('Width', { exact: true }).fill(`4'6`);
  await page.getByLabel('Width', { exact: true }).press('Enter');
  await page.mouse.click(...(await at(page, ...P(7, 2.4))));
  await expect(doors(page)).toHaveAttribute('data-kind', 'double');

  // Back to a single door, then pick up the double: the next one copies it.
  await page.getByRole('group', { name: 'Door type' }).getByRole('button', { name: 'Single' }).click();
  await page.keyboard.down('Alt');
  await page.mouse.click(...(await at(page, ...P(7, 2))));
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('picked-up')).toBeVisible();
  await page.mouse.move(...(await at(page, ...P(17, 2.4))), { steps: 2 });
  const before = await page.getByTestId('opening-ghost').locator('g').first().getAttribute('transform');
  await page.keyboard.press('v');
  const after = await page.getByTestId('opening-ghost').locator('g').first().getAttribute('transform');
  expect(after).not.toBe(before);
  await page.mouse.click(...(await at(page, ...P(17, 2.4))));
  await expect(doors(page)).toHaveCount(2);
  await expect(doors(page).nth(1)).toHaveAttribute('data-kind', 'double');
});

test('copy a door on its own: duplicate beside it, paste onto another wall', async ({ page }) => {
  await room(page);
  await page.keyboard.press('d');
  await page.mouse.click(...(await at(page, ...P(5, 2.4))));
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, ...P(5, 2))));
  await page.keyboard.press('Control+d');
  await expect(doors(page)).toHaveCount(2);

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  // Pasted doors go down with a click on any wall: here the bottom one.
  await page.mouse.click(...(await at(page, ...P(17, 13.6))));
  await expect(doors(page)).toHaveCount(3);
});

test('change several doors at once from the selection', async ({ page }) => {
  await room(page);
  await page.keyboard.press('d');
  await page.mouse.click(...(await at(page, ...P(7, 2.4))));
  await page.mouse.click(...(await at(page, ...P(17, 2.4))));
  await page.keyboard.press('Space');
  await page.mouse.click(...(await at(page, ...P(7, 2))));
  await page.keyboard.down('Shift');
  await page.mouse.click(...(await at(page, ...P(17, 2))));
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('openings-panel')).toBeVisible();
  await page.getByTestId('openings-panel').getByLabel('Door type').selectOption('sliding');
  await expect(doors(page).nth(0)).toHaveAttribute('data-kind', 'sliding');
  await expect(doors(page).nth(1)).toHaveAttribute('data-kind', 'sliding');
});

test('a bigger gap in Settings flags doors too near a corner, and one click moves them', async ({ page }) => {
  await room(page);
  await page.keyboard.press('d');
  await page.mouse.click(...(await at(page, ...P(2.5, 2.4))));
  await openSection(page, 'Settings');
  await page.getByLabel('Doors and windows: gap from wall corners').fill(`1'6`);
  await page.getByLabel('Doors and windows: gap from wall corners').press('Enter');
  const hint = page.locator('[data-hint="opening-gaps"]');
  await expect(hint).toBeVisible();
  await page.getByRole('button', { name: 'Move them off the corners' }).click();
  await expect(hint).toHaveCount(0);
  expect(await doorX(page)).toBeCloseTo(2 + 4.5 / 12 + 1.5 + W / 2, 2);
});

test('drawing lines up with the ends of other walls, with a dotted guide', async ({ page }) => {
  await tool(page, 'wall');
  await drag(page, P(4, 4), P(10, 4));
  await page.keyboard.press('Escape');
  // Straight below the wall's end at 10', away from anything else.
  await page.mouse.move(...(await at(page, ...P(10.1, 9.4))), { steps: 3 });
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-snap', 'aligned');
  await expect(page.getByTestId('snap-guide')).toHaveCount(1);
});
