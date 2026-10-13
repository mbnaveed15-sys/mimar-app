import { expect, test } from '@playwright/test';
import { at, drag, menu, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('a shop under DHA Islamabad: its area’s limits in the plan check, and the area picker on the plot', async ({
  page,
}) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await menu(page, 'File', 'New');
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByText('Building', { exact: true }).click();
  await dialog.getByLabel('Building use').selectOption('shop');
  await dialog.getByRole('button', { name: 'Start' }).click();

  await page.keyboard.press('Shift+P');
  await page.getByLabel('Bylaws').selectOption('dha-isb');
  await drag(page, P(0, 0), P(30, 60));
  const check = page.getByTestId('plan-check');
  // A shop starts on Sector commercial (basement + G+3), the usual area for it: a row to check.
  await expect(check).toContainText('Sector commercial');
  await expect(check.locator('[data-check="bylaw-area"]')).toHaveAttribute('data-status', 'check');
  await expect(check.locator('[data-check="building-bylaws"]')).toHaveCount(0);

  // Pick Main commercial on the plot: basement + G+5.
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('Space');
  await click(15, 30);
  await page.getByLabel(/^Area \(DHA/).selectOption('dha-main');
  await expect(page.getByTestId('plot-rule')).toContainText('Main commercial');
  await expect(check.locator('[data-check="bylaw-area"]')).toHaveCount(0);
  await expect(check).toContainText('Main commercial');

  // A building on it: its storeys against the area, and a lift always.
  await page.keyboard.press('r');
  await click(2, 2);
  await click(28, 58);
  await page.keyboard.press('Escape');
  await expect(check.locator('[data-check="bylaw-storeys"]')).toContainText('Basement + G+5');
  await expect(check.locator('[data-check="bylaw-lift"]')).toHaveAttribute('data-status', 'fail');
});

test('an LDA shop asks for the road’s width, and its zone follows it', async ({ page }) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await menu(page, 'File', 'New');
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByText('Building', { exact: true }).click();
  await dialog.getByLabel('Building use').selectOption('shop');
  await dialog.getByRole('button', { name: 'Start' }).click();

  await page.keyboard.press('Shift+P');
  await page.getByLabel('Bylaws').selectOption('lda');
  await drag(page, P(0, 0), P(50, 90));
  const check = page.getByTestId('plan-check');
  await expect(check.locator('[data-check="bylaw-road"]')).toBeVisible();
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('Space');
  await click(25, 45);
  const road = page.getByLabel(/^Road width/);
  await road.fill(`30'`);
  await road.press('Enter');
  await expect(check.locator('[data-check="bylaw-road"]')).toHaveCount(0);
  await expect(page.getByTestId('plot-rule')).toContainText(`Low rise, road 30'`);
});
