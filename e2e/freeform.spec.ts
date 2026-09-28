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

test('freer form: an arc wall, a glass wall, a hip roof over the house and a double-height room', async ({ page }) => {
  // The house's back-left corner is at (4', 4').
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x + 4, y + 4))));
  const rectangle = async () => {
    await page.keyboard.press('r');
    await click(0, 0);
    await page.mouse.move(...(await at(page, ...P(9, 9))));
    await page.keyboard.type(`30',20'`);
    await page.keyboard.press('Enter');
  };
  // A 30' × 20' house.
  await rectangle();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);

  // A curved garden wall: its two ends, then a point it passes through.
  await page.keyboard.press('l');
  await page.getByRole('button', { name: 'Arc wall' }).click();
  await click(36, 0);
  await click(36, 20);
  await click(40, 10);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('Space');
  await click(40, 10);
  await expect(page.getByLabel('Radius')).toBeVisible();

  // The front wall made a glass curtain wall.
  await click(15, 0);
  // (The wall's own type, not the Glass material.)
  await page.getByRole('button', { name: 'Glass', exact: true }).and(page.locator(':not([title])')).click();
  await expect(page.getByTestId('curtain-wall')).toHaveCount(1);
  await expect(page.getByTestId('curtain-fields')).toBeVisible();

  // A lounge, and a first floor over the house.
  await page.keyboard.press('a');
  await click(15, 10);
  await page.getByRole('button', { name: /^Floor:/ }).click();
  await page.getByRole('menuitem', { name: 'Add floor above' }).click();
  await expect(page.getByRole('button', { name: 'Floor: First floor' })).toBeVisible();
  await rectangle();

  // A hipped roof over the top floor: a ridge, four hips and an arrow down each slope.
  await page.keyboard.press('Shift+H');
  await page.getByRole('button', { name: 'Hip', exact: true }).click();
  await expect(page.getByTestId('roof-tool-pitch-rise')).toHaveText('30° (6.9 in 12)');
  await page.getByTestId('roof-over-house').click();
  const roof = page.locator('[data-type="roof"]');
  await expect(roof).toHaveCount(1);
  await expect(roof).toHaveAttribute('data-shape', 'hip');
  await expect(roof.locator('[data-kind="ridge"]')).toHaveCount(1);
  await expect(roof.locator('[data-kind="hip"]')).toHaveCount(4);
  await expect(roof.getByTestId('roof-arrow')).toHaveCount(4);
  await expect(page.getByTestId('roof-fields')).toBeVisible();

  // The lounge goes up through both floors.
  await page.keyboard.press('Escape');
  await page.keyboard.press('PageDown');
  await expect(page.getByRole('button', { name: 'Floor: Ground floor' })).toBeVisible();
  await page.keyboard.press('Space');
  await click(15, 10);
  const open = page.getByLabel('Open to above (double height)');
  await open.check();
  await open.blur();
  await page.keyboard.press('PageUp');
  await expect(page.getByRole('button', { name: 'Floor: First floor' })).toBeVisible();
  await expect(page.getByTestId('open-to-below')).toHaveCount(1);

  // In 3D: the roof, the glass and the open floor.
  await page.keyboard.press('Control+2');
  const view = page.getByTestId('plan-3d');
  await expect(view).toHaveAttribute('data-roofs', '1');
  await page.keyboard.press('Control+1');

  // A section across the house cuts the roof.
  await page.keyboard.press('Shift+E');
  await click(15, -2);
  await click(15, 22);
  await click(18, 10);
  await page.keyboard.press('Control+4');
  const drawings = page.getByTestId('drawings-view');
  await drawings.getByTestId('drawing-section-A').click();
  await expect(page.getByTestId('drawing-svg').locator('path[fill="#111"], path[fill="#000"]').first()).toBeVisible();
  await expect(page.getByTestId('drawing-svg')).toContainText('First floor');
  await page.keyboard.press('Control+1');

  // Quantities: the sloping roof and the glass, each at its own rate.
  await openSection(page, 'Quantities & cost');
  const panel = page.getByTestId('cost-panel');
  await expect(panel.locator('[data-cost-line="roof"]')).toContainText('sqft');
  await expect(panel.locator('[data-cost-line="glazing"]')).toContainText('sqft');

  // All of it is saved with the plan.
  await page.reload();
  await ready(page);
  await page.keyboard.press('PageUp');
  await expect(page.getByRole('button', { name: 'Floor: First floor' })).toBeVisible();
  await expect(page.locator('[data-type="roof"]')).toHaveCount(1);
  await expect(page.getByTestId('open-to-below')).toHaveCount(1);
});
