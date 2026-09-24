import { expect, test, type Page } from '@playwright/test';
import { tool } from './helpers';

const FT = 30.48;

async function at(page: Page, xFt: number, yFt: number): Promise<[number, number]> {
  return page.getByTestId('plan-canvas').evaluate(
    (svg, [px, py]) => {
      const pt = new DOMPoint(px, py).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return [pt.x, pt.y] as [number, number];
    },
    [xFt * FT, yFt * FT],
  );
}

async function wall(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...(await at(page, ...from)));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...to)), { steps: 4 });
  await page.mouse.up();
}

test('shows the plan in 3D, follows edits, and switches back to 2D', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  await page.getByRole('radio', { name: '3D view' }).click();
  await expect(page.getByText('Draw some walls in the 2D plan')).toBeVisible();
  await page.getByRole('radio', { name: '2D plan' }).click();

  await tool(page, 'wall');
  await wall(page, [0, 0], [20, 0]);
  await wall(page, [20, 0], [20, 15]);
  await wall(page, [20, 15], [0, 15]);
  await wall(page, [0, 15], [0, 0]);
  await tool(page, 'door');
  await page.mouse.click(...(await at(page, 10, 15)));
  await tool(page, 'room');
  await page.mouse.click(...(await at(page, 10, 7)));

  await page.getByRole('radio', { name: '3D view' }).click();
  const view = page.getByTestId('plan-3d');
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();
  // 3 plain walls + 3 pieces around the door + the door leaf.
  await expect(view).toHaveAttribute('data-solids', '7');
  await expect(view).toHaveAttribute('data-floors', '1');

  // The wall height slider goes from 8 ft to 15 ft and is remembered.
  await page.getByLabel('Wall height').fill('2438.4');
  await expect(page.getByText(`8' 0"`)).toBeVisible();
  await expect(view).toHaveAttribute('data-solids', '7');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image' }).click();
  expect((await download).suggestedFilename()).toBe('Untitled 3D.png');

  await page.getByRole('radio', { name: '2D plan' }).click();
  await expect(page.locator('[data-type="wall"]')).toHaveCount(4);
  expect(errors).toEqual([]);
});
