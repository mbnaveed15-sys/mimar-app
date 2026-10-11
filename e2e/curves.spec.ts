import { expect, test } from '@playwright/test';
import { at, ready, tool } from './helpers';

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
