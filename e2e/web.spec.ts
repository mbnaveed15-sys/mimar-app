import { expect, test } from '@playwright/test';
import { ready } from './helpers';

test('the web version installs as an app and opens offline', async ({ page, context }) => {
  await page.goto('/');
  await ready(page);
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')!.getAttribute('href')!;
    return (await fetch(href)).json();
  });
  expect(manifest.short_name).toBe('Mimar');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);

  // The service worker keeps a copy of every file.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('mimar-'))))
    .toBe(true);
  await page.reload();
  await ready(page);

  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get the Windows app' })).toBeVisible();
  await context.setOffline(false);
});
