import { expect, test, type Page } from '@playwright/test';
import { at, ready } from './helpers';

const FT = 30.48;

async function start(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
}

const strip = (page: Page) => page.getByTestId('phone-tools');
const pick = (page: Page, name: string) => strip(page).getByRole('button', { name, exact: true }).click();

// An iPhone SE, and a common Android phone.
for (const [w, h] of [
  [375, 667],
  [412, 915],
] as const)
  test.describe(`a phone held upright (${w} × ${h})`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('nothing runs off the side, and the tools and panel sheet are there', async ({ page }) => {
      await start(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(w);
      for (const part of ['phone-tools', 'phone-sheet', 'plan-canvas']) {
        const box = (await page.getByTestId(part).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(w);
      }
      const header = (await page.getByRole('radiogroup', { name: 'View' }).boundingBox())!;
      expect(header.x + header.width).toBeLessThanOrEqual(w);
    });
  });

test.describe('a phone held upright', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('the plan fills the width; tools run along the bottom a group at a time; Undo is by the menu', async ({
    page,
  }) => {
    await start(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    // No tool rails at the sides, and no split view.
    await expect(page.locator('[data-dock]')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Split' })).toHaveCount(0);
    const plan = (await page.getByTestId('plan-canvas').boundingBox())!;
    expect(plan.width).toBe(375);

    // Groups: Build has the column; Draw has the wall. Select and Pan are in every group.
    const groups = strip(page).getByRole('radiogroup', { name: 'Tool groups' });
    await groups.getByRole('radio', { name: 'Build' }).click();
    await expect(strip(page).getByRole('button', { name: 'Column', exact: true })).toBeVisible();
    await expect(strip(page).getByRole('button', { name: 'Select', exact: true })).toBeVisible();
    // A tool picked another way (its key) brings its group forward.
    await page.keyboard.press('w');
    await expect(groups.getByRole('radio', { name: 'Draw' })).toHaveAttribute('aria-checked', 'true');
    await expect(strip(page).getByRole('button', { name: 'Wall', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Draw a wall, then take it back and put it back from the top bar.
    await pick(page, 'Wall');
    for (const [x, y] of [
      [5, 5],
      [15, 5],
    ])
      await page.mouse.click(...(await at(page, x * FT, y * FT)));
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-type="wall"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-type="wall"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('[data-type="wall"]')).toHaveCount(1);

    // Hold a tool to see its name.
    const door = strip(page).getByRole('button', { name: 'Door', exact: true });
    const box = (await door.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(strip(page).getByRole('status')).toHaveText('Door');
    await page.mouse.up();
  });

  test('the panel is a sheet: peeking, then half or all the way open', async ({ page }) => {
    await start(page);
    const sheet = page.getByTestId('phone-sheet');
    await expect(sheet).toHaveAttribute('data-sheet', 'peek');
    await expect(page.getByText('New wall thickness')).toHaveCount(0);

    // The first tab is the tool's options: tap it to open the sheet half way.
    await pick(page, 'Wall');
    const tabs = sheet.getByRole('tablist', { name: 'Panels' });
    await tabs.getByRole('tab', { name: 'Wall' }).click();
    await expect(sheet).toHaveAttribute('data-sheet', 'half');
    await expect(page.getByText('New wall thickness')).toBeVisible();
    const half = (await sheet.boundingBox())!.height;

    // Drag the handle to the top: all the way open.
    const handle = (await sheet.getByRole('button', { name: 'Panel size' }).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 4);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, 60, { steps: 6 });
    await page.mouse.up();
    await expect(sheet).toHaveAttribute('data-sheet', 'full');
    expect((await sheet.boundingBox())!.height).toBeGreaterThan(half * 1.5);

    // Tapping the open tab puts it away again.
    await tabs.getByRole('tab', { name: 'Wall' }).click();
    await expect(sheet).toHaveAttribute('data-sheet', 'peek');

    // A menu command that shows a panel opens the sheet at it.
    await page.getByRole('menubar').getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menu', { name: 'Menus' }).getByRole('menuitem', { name: 'Draw' }).click();
    await page.getByRole('menu').getByLabel('Generate layout from a room list…', { exact: true }).click();
    await expect(sheet).toHaveAttribute('data-sheet', 'half');
    await expect(tabs.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Draw a plot first')).toBeVisible();
  });

  test('the welcome tour fits on the screen', async ({ page }) => {
    await page.goto('/?welcome');
    await page.getByRole('button', { name: /tour/i }).first().click();
    const tour = page.getByTestId('tour').getByRole('dialog');
    for (let step = 0; step < 6; step++) {
      const box = (await tour.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
      expect(box.y + box.height).toBeLessThanOrEqual(667);
      if (step < 5) await tour.getByRole('button', { name: 'Next' }).click();
    }
  });
});

test.describe('a phone on its side', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test('the groups fold into a list; the plan keeps most of the height', async ({ page }) => {
    await start(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(667);
    await expect(page.getByRole('radiogroup', { name: 'Tool groups' })).toBeHidden();
    await strip(page).getByLabel('Tool group', { exact: true }).selectOption('build');
    await expect(strip(page).getByRole('button', { name: 'Stairs', exact: true })).toBeVisible();
    await expect(page.getByTestId('tool-hint')).toBeHidden();
    const plan = (await page.getByTestId('plan-canvas').boundingBox())!;
    expect(plan.height).toBeGreaterThan(150);
  });
});
