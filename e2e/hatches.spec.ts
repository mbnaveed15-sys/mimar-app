import { expect, test } from '@playwright/test';

test('hatches on the plan zoom with the drawing, at a fixed size on the building', async ({ page }) => {
  await page.goto('/?welcome');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /sample 5-marla/ }).click();
  await page.keyboard.press('Escape');
  const brick = page.locator('[data-testid="plan-canvas"] pattern[id*="-hatch-brick-"]').first();
  const width = async () => Number(await brick.getAttribute('width'));
  const before = await width();
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
  await expect(page.getByText('44%')).toHaveCount(0);
  expect(await width()).toBe(before);
});
