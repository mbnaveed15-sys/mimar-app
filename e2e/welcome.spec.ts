import { expect, test } from '@playwright/test';
import { menu, ready } from './helpers';

test('first run: welcome, the tour, and a sample house to explore', async ({ page }) => {
  await page.goto('/?welcome');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const welcome = page.getByRole('dialog', { name: 'Welcome to Mimar' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: /sample 5-marla/ }).click();

  // The tour walks through six parts of the screen.
  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`Step ${i} of 6`)).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByText('Step 6 of 6')).toBeVisible();
  await page.getByRole('button', { name: 'Start drawing' }).click();
  await expect(page.getByTestId('tour')).toHaveCount(0);

  await expect(page.locator('[data-type="room-label"]')).toHaveCount(8);
  await expect(page.getByText('Master bedroom').first()).toBeVisible();
  await expect(page.locator('[data-type="plot"]')).toHaveCount(1);

  // Seen once, it stays away; Help › Getting started brings it back.
  await page.goto('/');
  await ready(page);
  await expect(page.getByRole('dialog', { name: 'Welcome to Mimar' })).toHaveCount(0);
  await menu(page, 'Help', 'Getting started');
  await expect(page.getByRole('dialog', { name: 'Welcome to Mimar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Welcome to Mimar' })).toHaveCount(0);
});
