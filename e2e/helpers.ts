import type { Page } from '@playwright/test';

/** Screen position of a point in plan (SVG viewBox) coordinates. */
export async function at(page: Page, x: number, y: number): Promise<[number, number]> {
  return page.getByTestId('plan-canvas').evaluate(
    (svg, [px, py]) => {
      const pt = new DOMPoint(px, py).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return [pt.x, pt.y] as [number, number];
    },
    [x, y],
  );
}

export async function drag(page: Page, from: [number, number], to: [number, number], steps = 6) {
  await page.mouse.move(...(await at(page, ...from)));
  await page.mouse.down();
  await page.mouse.move(...(await at(page, ...to)), { steps });
  await page.mouse.up();
}

const TOOL_LABELS: Record<string, string> = { tape: 'Tape measure', erase: 'Eraser' };

/** Pick a tool on the tool rail by its id, e.g. 'wall'. */
export function tool(page: Page, id: string) {
  const name = TOOL_LABELS[id] ?? id[0].toUpperCase() + id.slice(1);
  return page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name, exact: true }).click();
}

/** Run a menu command, e.g. menu(page, 'File', 'Save'). */
export async function menu(page: Page, menuName: string, item: string) {
  await page.getByRole('menubar').getByRole('button', { name: menuName, exact: true }).click();
  await page.getByRole('menu').getByLabel(item, { exact: true }).click();
}

/** Open a section of the side panel, e.g. 'Settings'. */
export async function openSection(page: Page, title: string) {
  const summary = page.locator('summary', { hasText: title });
  const details = page.locator('details', { has: summary });
  if ((await details.getAttribute('open')) === null) await summary.click();
}

/** Wait until the app is ready for keyboard shortcuts. */
export async function ready(page: Page) {
  await page.getByTestId('plan-canvas').waitFor();
  await page.waitForFunction(() => document.title.includes('Mimar'));
}
