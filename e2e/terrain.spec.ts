import { expect, test } from '@playwright/test';
import { at, drag, openSection, ready } from './helpers';

const FT = 30.48;
const P = (x: number, y: number): [number, number] => [x * FT, y * FT];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

/** A survey of a plot that falls 2 m from back to front, in metres, easting, northing, level. */
function slopingSurvey(): string {
  const rows = ['E,N,Z'];
  for (let n = 0; n <= 16; n += 4)
    for (let e = 0; e <= 12; e += 4) rows.push(`${100 + e},${200 + n},${(50 + n / 8).toFixed(2)}`);
  return rows.join('\n');
}

test('ground levels: spot levels and a survey give contours, a levelled plot shows cut and fill, and costs them', async ({
  page,
}) => {
  const click = async (x: number, y: number) => page.mouse.click(...(await at(page, ...P(x, y))));
  // A 40' × 50' plot.
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(40, 50));
  await expect(page.locator('[data-type="plot"]')).toHaveCount(1);

  // Two spot levels, each with a typed height.
  await page.keyboard.press('Shift+G');
  await page.mouse.move(...(await at(page, ...P(5, 5))));
  await page.keyboard.type(`2'`);
  await page.keyboard.press('Enter');
  await click(5, 5);
  await page.keyboard.type(`-1'`);
  await page.keyboard.press('Enter');
  await click(35, 25);
  await expect(page.locator('[data-type="level"]')).toHaveCount(2);
  await expect(page.getByTestId('spot-level-text')).toHaveText([`+2'-0"`, `-1'-0"`]);

  // A contour line drawn point by point.
  await page.keyboard.press('Shift+O');
  await page.keyboard.type(`1'`);
  await page.keyboard.press('Enter');
  await click(0, 12);
  await click(20, 15);
  await expect(page.getByTestId('contour-draft')).toHaveCount(1);
  await click(40, 18);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="contour"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Contour lines of the ground at 1', and the plot, levelled at ±0 by default, cut and filled.
  await expect(page.getByTestId('contour-minor').first()).toBeAttached();
  await expect(page.getByTestId('cut-tint')).toBeAttached();
  await expect(page.getByTestId('fill-tint')).toBeAttached();
  await expect(page.getByTestId('daylight-line')).toBeAttached();

  // Import a survey instead: 20 points in metres, placed on the plot.
  await openSection(page, 'Ground and site');
  await page.getByRole('button', { name: 'Remove the survey' }).click();
  await expect(page.locator('[data-type="level"]')).toHaveCount(0);
  await page.getByTestId('survey-file').setInputFiles({
    name: 'survey.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(slopingSurvey()),
  });
  const form = page.getByTestId('survey-import');
  await expect(form).toContainText('20 points, levels 50 to 52');
  await expect(page.getByLabel('Survey datum')).toHaveValue('50');
  await page.getByRole('button', { name: 'Place survey' }).click();
  await expect(page.locator('[data-type="level"]')).toHaveCount(20);
  await expect(page.getByTestId('survey-count')).toContainText('20 spot levels');
  // 2 m of fall at 0.5 m contours in metric, or 1' in feet: majors every fifth line, labelled.
  await expect(page.getByTestId('contour-minor').first()).toBeAttached();
  await expect(page.getByTestId('contour-major').first()).toBeAttached();

  // Everything is above ±0, so levelling the plot there is all cut; raise it and some is fill.
  await expect(page.getByTestId('earthworks')).toContainText('Cut');
  await expect(page.getByTestId('fill-tint')).toHaveCount(0);
  const level = page.getByLabel('Level the plot to (above road level)');
  await level.fill(`3'`);
  await level.press('Enter');
  await expect(page.getByTestId('fill-tint')).toBeAttached();
  await expect(page.getByTestId('earthworks')).toContainText('to cart away');

  // In 3D the lawn and the ground round the plot follow the levels.
  await page.getByRole('radio', { name: '3D view' }).click();
  await expect(page.getByTestId('plan-3d-canvas')).toBeVisible();
  await expect(page.getByTestId('plan-3d')).toHaveAttribute('data-terrain', /^[1-9]/);
  await page.getByRole('radio', { name: '2D plan' }).click();

  // Quantities & cost: cut, fill and carting away, each at its own rate.
  await openSection(page, 'Quantities & cost');
  const panel = page.getByTestId('cost-panel');
  await expect(panel.locator('[data-cost-line="cut"]')).toContainText('cft');
  await expect(panel.locator('[data-cost-line="fill"]')).toContainText('cft');
  await expect(panel.locator('[data-cost-line="cartAway"]')).toContainText('cft');

  // Left natural: nothing to cut or fill.
  await page.getByRole('button', { name: 'Leave it natural' }).click();
  await expect(page.getByTestId('cut-tint')).toHaveCount(0);
  await expect(panel.locator('[data-cost-line="cut"]')).toHaveCount(0);

  // The levels are saved with the plan.
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-type="level"]')).toHaveCount(20);
});

test('a levelled area round the house is drawn, raised, and undone', async ({ page }) => {
  await page.keyboard.press('Shift+P');
  await drag(page, P(0, 0), P(40, 50));
  await page.keyboard.press('r');
  await page.mouse.move(...(await at(page, ...P(10, 5))));
  await page.mouse.click(...(await at(page, ...P(10, 5))));
  await page.keyboard.type(`20',15'`);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type="wall"]')).toHaveCount(8);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+T');
  await page.getByRole('button', { name: 'Level round the house', exact: true }).click();
  await expect(page.locator('[data-type="pad"]')).toHaveCount(1);
  await expect(page.getByTestId('pad-level')).toHaveText('FGL ±0\'-0"');
  const height = page.getByLabel('Finished level (above road level)');
  await height.fill(`1'6"`);
  await height.press('Enter');
  await expect(page.getByTestId('pad-level')).toHaveText(`FGL +1'-6"`);
  await expect(page.getByTestId('fill-tint')).toBeAttached();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-type="pad"]')).toHaveCount(0);
});
