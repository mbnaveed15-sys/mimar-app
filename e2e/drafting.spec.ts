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

async function clickAt(page: import('@playwright/test').Page, x: number, y: number, opts = {}) {
  const p = await at(page, ...P(x, y));
  await page.mouse.move(...p);
  await page.mouse.click(...p, opts);
}

test('layout lines chain, snap, and turn into walls', async ({ page }) => {
  await page.keyboard.press('Shift+L');
  await clickAt(page, 2, 2);
  await clickAt(page, 20, 2);
  await clickAt(page, 20, 14);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="line"]')).toHaveCount(2);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(0);

  await page.keyboard.press('Space');
  await clickAt(page, 10, 2);
  await page.keyboard.down('Shift');
  await clickAt(page, 20, 8);
  await page.keyboard.up('Shift');
  await clickAt(page, 10, 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Turn into walls' }).click();
  await expect(page.locator('[data-type="line"]')).toHaveCount(0);
  await expect(page.locator('[data-type="wall"]')).toHaveCount(2);
});

test('the eraser erases everything it is dragged over; Esc cancels', async ({ page }) => {
  await page.keyboard.press('l');
  for (const x of [4, 8, 12]) {
    const a = await at(page, ...P(x, 2));
    const b = await at(page, ...P(x, 12));
    await page.mouse.move(...a);
    await page.mouse.down();
    await page.mouse.move(...b, { steps: 4 });
    await page.mouse.up();
  }
  await expect(page.locator('[data-type="wall"]')).toHaveCount(3);
  await page.keyboard.press('e');

  // Drag across two walls, press Esc before letting go: nothing is erased.
  await page.mouse.move(...(await at(page, ...P(2, 6))));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...P(10, 6))), { steps: 10 });
  await expect(page.getByTestId('erase-marks')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(3);

  // Drag again and let go: both are gone, in one undo step.
  await page.mouse.move(...(await at(page, ...P(2, 6))));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...P(10, 6))), { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(3);
});

test('layers hide and lock by kind; items can be hidden and locked one by one', async ({ page }) => {
  await page.keyboard.press('l');
  const a = await at(page, ...P(2, 2));
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...P(16, 2))), { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('c');
  await clickAt(page, 20, 8);
  await openSection(page, 'Layers');

  await page.getByRole('button', { name: 'Hide Walls' }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Walls' }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(1);

  // A locked column shows but can't be picked.
  await page.getByRole('button', { name: 'Lock Columns' }).click();
  await page.keyboard.press('Space');
  await clickAt(page, 20, 8);
  await expect(page.getByText('Selected: column')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock Columns' }).click();
  await clickAt(page, 20, 8);
  await expect(page.getByText('Selected: column')).toBeVisible();

  // Hide just this item, then bring it back.
  await page.keyboard.press('Control+h');
  await expect(page.locator('[data-type="column"]')).toHaveCount(0);
  await page.getByRole('button', { name: /Show all hidden/ }).click();
  await expect(page.locator('[data-type="column"]')).toHaveCount(1);
});
