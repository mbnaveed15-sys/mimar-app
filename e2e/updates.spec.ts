import { expect, test } from '@playwright/test';

type Status = { state: string; version?: string; latest?: string; percent?: number };

/** Pretend to be the desktop app, starting in the given update state. */
async function fakeDesktop(page: import('@playwright/test').Page, initial: Status) {
  await page.addInitScript((start: Status) => {
    const calls: string[] = [];
    let listener: ((s: Status) => void) | null = null;
    (window as unknown as Record<string, unknown>).__updateCalls = calls;
    (window as unknown as Record<string, unknown>).__pushStatus = (s: Status) => listener?.(s);
    (window as unknown as Record<string, unknown>).mimarUpdates = {
      getStatus: async () => start,
      check: async () => {
        calls.push('check');
        return { state: 'up-to-date', version: start.version };
      },
      install: async () => void calls.push('install'),
      openDownload: async () => void calls.push('download'),
      onStatus: (cb: (s: Status) => void) => {
        listener = cb;
        return () => (listener = null);
      },
    };
  }, initial);
}

const calls = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __updateCalls: string[] }).__updateCalls);

test('in the browser there are no updates, just the version', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByTestId('update-panel');
  await expect(panel).toContainText(/Mimar \d+\.\d+\.\d+/);
  await expect(panel.getByRole('button')).toHaveCount(0);
});

test('installed app: shows download progress, then Restart to update', async ({ page }) => {
  await fakeDesktop(page, { state: 'idle', version: '1.7.0' });
  await page.goto('/');
  const panel = page.getByTestId('update-panel');
  await page.evaluate(() =>
    (window as unknown as { __pushStatus: (s: object) => void }).__pushStatus({
      state: 'downloading',
      version: '1.7.0',
      latest: '1.8.0',
      percent: 42,
    }),
  );
  await expect(panel).toContainText('Downloading Mimar 1.8.0 (42%)');
  await page.evaluate(() =>
    (window as unknown as { __pushStatus: (s: object) => void }).__pushStatus({
      state: 'ready',
      version: '1.7.0',
      latest: '1.8.0',
    }),
  );
  await panel.getByRole('button', { name: 'Restart to update' }).click();
  expect(await calls(page)).toEqual(['install']);
});

test('portable app: offers the download page', async ({ page }) => {
  await fakeDesktop(page, { state: 'available-portable', version: '1.7.0', latest: '1.8.0' });
  await page.goto('/');
  const panel = page.getByTestId('update-panel');
  await expect(panel).toContainText('Mimar 1.8.0 is available.');
  await panel.getByRole('button', { name: 'Download Mimar 1.8.0' }).click();
  await panel.getByRole('button', { name: 'Check for updates' }).click();
  await expect(panel).toContainText('You have the latest version.');
  expect(await calls(page)).toEqual(['download', 'check']);
});
