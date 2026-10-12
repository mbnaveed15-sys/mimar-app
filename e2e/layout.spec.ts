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

test('plans from a room list: three to choose from, built as walls and rooms, one undo step', async ({ page }) => {
  // Without a plot, the panel says to draw one.
  await menu(page, 'Draw', 'Generate layout from a room list…');
  const panel = page.getByTestId('layout-panel');
  await expect(page.getByText('Draw a plot first')).toBeVisible();

  // A 10-marla plot (35' × 65'), and a wall already drawn inside it.
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(35, 65));
  await page.keyboard.press('Shift+Z');
  await page.keyboard.press('l');
  await page.mouse.click(...(await at(page, ...P(10, 20))));
  await page.mouse.click(...(await at(page, ...P(20, 20))));
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('layout-budget')).toContainText('sq ft');

  await page.getByRole('button', { name: 'Make plans' }).click();
  await expect(page.getByTestId('layout-plan')).toHaveCount(3);
  const first = page.getByTestId('layout-plan').first();
  await first.getByRole('button', { name: 'Mirror' }).click();
  await expect(first.getByRole('button', { name: 'Mirror' })).toHaveAttribute('aria-pressed', 'true');

  // The wall already there: it asks first.
  await first.getByRole('button', { name: 'Use this plan' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Replace this floor?' })).toContainText('1 walls');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.locator('[data-type="room"]').first()).toBeVisible();
  const rooms = await page.locator('[data-type="room"]').count();
  expect(rooms).toBeGreaterThan(10);
  await expect(page.getByTestId('gate')).toHaveCount(0);
  // Every room is reached through doors: no "can't be reached" or "has no door" hints.
  await expect(page.getByText(/can't be reached|has no door/)).toHaveCount(0);

  // One undo step takes it all back, leaving the wall that was there.
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-type="room"]')).toHaveCount(0);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(5);

  // Try again gives other plans.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('layout-plan')).toHaveCount(3);
});

test('a room list too big for the plot says so', async ({ page }) => {
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(15, 30));
  await menu(page, 'Draw', 'Generate layout from a room list…');
  await page.getByLabel('Bedrooms').selectOption('5');
  await page.getByRole('button', { name: 'Make plans' }).click();
  await expect(page.getByTestId('layout-none')).toBeVisible();
  await expect(page.getByTestId('layout-budget')).toHaveClass(/text-danger/);
});

test('a first floor from a room list, over the ground floor and round its stair', async ({ page }) => {
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(35, 65));
  await page.keyboard.press('Shift+Z');
  await menu(page, 'Draw', 'Generate layout from a room list…');
  const pick = page.getByRole('radiogroup', { name: 'Plans for' });
  // Before there is a ground floor, the first floor can't be planned.
  await pick.getByRole('radio', { name: 'First floor' }).click();
  await expect(page.getByTestId('layout-upper-problem')).toContainText('ground floor first');

  // The ground floor from its list, stair and all.
  await pick.getByRole('radio', { name: 'Ground floor' }).click();
  await page.getByRole('button', { name: 'Make plans' }).click();
  await page.getByTestId('layout-plan').first().getByRole('button', { name: 'Use this plan' }).click();
  await expect(page.locator('[data-type="stair"]')).toHaveCount(1);

  // Then the first floor: bedrooms, a TV lounge and a terrace, on a new First floor.
  await pick.getByRole('radio', { name: 'First floor' }).click();
  await expect(page.getByTestId('layout-budget')).toContainText('terrace');
  await page.getByRole('button', { name: 'Make plans' }).click();
  const plan = page.getByTestId('layout-plan').first();
  await expect(plan).toBeVisible();
  await expect(plan.getByRole('button', { name: 'Mirror' })).toHaveCount(0);
  await plan.getByRole('button', { name: 'Use this plan' }).click();
  await expect(page.getByRole('button', { name: 'Floor: First floor' })).toBeVisible();
  const plan2d = page.getByRole('main');
  await expect(plan2d.getByText('TV lounge', { exact: true })).toHaveCount(1);
  await expect(plan2d.getByText('Terrace', { exact: true })).toHaveCount(1);
  // The stair's room below shows as open, the stair well.
  await expect(plan2d.getByText('Open to below')).toBeVisible();
  await expect(page.getByText(/can't be reached|has no door/)).toHaveCount(0);
  // The panel now plans the first floor; one undo takes the floor back.
  await expect(pick.getByRole('radio', { name: 'First floor' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Control+z');
  await expect(plan2d.getByText('TV lounge', { exact: true })).toHaveCount(0);
});
