import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { at, menu, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

async function drawRoom(page: Page) {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  await page.keyboard.press('r');
  await click(2, 2);
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`20',16'`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('a');
  await click(10, 8);
  return click;
}

test('picks materials from the library and paints with them', async ({ page }) => {
  const click = await drawRoom(page);
  await page.getByText('Floors', { exact: true }).click();
  await page.getByRole('button', { name: /Botticino marble/ }).click();
  const plan = page.getByRole('complementary', { name: 'Properties' });
  await expect(plan.getByRole('button', { name: 'Botticino marble', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('b');
  await click(10, 8);
  await page.getByLabel('Search materials').fill('brick');
  await expect(page.getByRole('button', { name: /Exposed red brick/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Oak wooden floor/ })).toHaveCount(0);
  await page.getByLabel('Search materials').blur();
  await page.keyboard.press('Control+2');
  await expect(page.getByTestId('plan-3d')).toHaveAttribute('data-floors', '1');
});

test('exports DXF for AutoCAD and 3D models for SketchUp and Twinmotion', async ({ page }) => {
  await drawRoom(page);
  const save = async (item: string) => {
    const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', item)]);
    return { name: download.suggestedFilename(), data: readFileSync((await download.path())!) };
  };
  const dxf = await save('Export DXF (AutoCAD)');
  expect(dxf.name).toBe('Untitled.dxf');
  expect(dxf.data.toString()).toContain('A-WALL');
  const glb = await save('Export 3D: GLB (Twinmotion)');
  expect(glb.data.subarray(0, 4).toString()).toBe('glTF');
  const dae = await save('Export 3D: DAE (SketchUp)');
  expect(dae.data.toString()).toContain('<COLLADA');
  const obj = await save('Export 3D: OBJ (other 3D apps)');
  expect(obj.name).toBe('Untitled (OBJ).zip');
  expect(obj.data.readUInt32LE(0)).toBe(0x04034b50);
});
