// Automatic updates from GitHub Releases (free for public repositories).
// - Installed app (NSIS): downloads the new version in the background, then offers "Restart to update".
// - Portable app: can't replace itself, so it tells the user a new version is available and opens
//   the download page.
const OWNER = 'mbnaveed15-sys';
const REPO = 'mimar-app';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Compare "1.10.0" and "v1.9.2" style versions: positive when a is newer. */
function compareVersions(a, b) {
  const parts = (v) =>
    String(v)
      .replace(/^v/i, '')
      .split(/[.-]/)
      .slice(0, 3)
      .map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function setupUpdates(getWindow) {
  const { app, ipcMain, net, shell } = require('electron');
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
  const supported = app.isPackaged && process.platform === 'win32';
  let status = { state: supported ? 'idle' : 'unsupported' };

  const send = (next) => {
    status = next;
    const win = getWindow();
    if (win && !win.isDestroyed())
      win.webContents.send('mimar:update-status', { ...status, version: app.getVersion() });
  };

  ipcMain.handle('mimar:update-status', () => ({ ...status, version: app.getVersion() }));
  ipcMain.handle('mimar:update-open-download', () => shell.openExternal(RELEASES_URL));

  let check = async () => {};
  let install = () => {};
  if (supported && portable) {
    check = async () => {
      send({ state: 'checking' });
      try {
        const res = await net.fetch(LATEST_API, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Mimar' },
        });
        if (res.status === 404) return send({ state: 'up-to-date' }); // no releases yet
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const latest = String((await res.json()).tag_name || '');
        send(
          compareVersions(latest, app.getVersion()) > 0
            ? { state: 'available-portable', latest: latest.replace(/^v/i, '') }
            : { state: 'up-to-date' },
        );
      } catch (e) {
        send({ state: 'error', message: String((e && e.message) || e) });
      }
    };
  } else if (supported) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => send({ state: 'up-to-date' }));
    autoUpdater.on('update-available', (info) => send({ state: 'downloading', latest: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) =>
      send({ state: 'downloading', latest: status.latest, percent: Math.round(p.percent) }),
    );
    autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', latest: info.version }));
    autoUpdater.on('error', (e) => send({ state: 'error', message: String((e && e.message) || e) }));
    check = async () => {
      try {
        await autoUpdater.checkForUpdates();
      } catch {
        // reported through the 'error' event
      }
    };
    install = () => {
      if (status.state === 'ready') autoUpdater.quitAndInstall();
    };
  }

  ipcMain.handle('mimar:update-install', () => install());
  ipcMain.handle('mimar:update-check', async () => {
    await check();
    return { ...status, version: app.getVersion() };
  });

  if (supported) {
    setTimeout(check, 5000);
    setInterval(check, CHECK_EVERY_MS);
  }
}

module.exports = { setupUpdates, compareVersions, RELEASES_URL };
