const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { setupUpdates } = require('./updater.cjs');
const { pathToFileURL } = require('url');
let mainWindow;
let splash;

const indexHtml = path.join(__dirname, 'dist', 'index.html');

const PLAN_FILTERS = [
  { name: 'Mimar plan', extensions: ['mimar'] },
  { name: 'All files', extensions: ['*'] },
];
const MAX_PLAN_BYTES = 20 * 1024 * 1024;
// The page may only save back to files the user picked in an Open or Save dialog.
const userChosenPaths = new Set();

// Plans opened or saved lately, newest first: [{ name, path, at }], kept in the app's own data folder.
const MAX_RECENT = 8;
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
async function readRecent() {
  try {
    const list = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    return Array.isArray(list)
      ? list.filter((r) => r && typeof r.path === 'string' && typeof r.name === 'string' && Number.isFinite(r.at))
      : [];
  } catch {
    return [];
  }
}
async function noteRecent(filePath) {
  const list = [{ name: path.basename(filePath), path: filePath, at: Date.now() }, ...(await readRecent())];
  const kept = list.filter((r, i) => list.findIndex((q) => q.path === r.path) === i).slice(0, MAX_RECENT);
  try {
    await fs.writeFile(recentFile(), JSON.stringify(kept), 'utf8');
    app.addRecentDocument(filePath);
  } catch {
    // The list is a convenience: a failed write never stops the open or save.
  }
}
async function readPlan(filePath) {
  const { size } = await fs.stat(filePath);
  if (size > MAX_PLAN_BYTES) throw new Error('This file is too large to be a Mimar plan.');
  userChosenPaths.add(filePath);
  await noteRecent(filePath);
  return { name: path.basename(filePath), path: filePath, contents: await fs.readFile(filePath, 'utf8') };
}

ipcMain.handle('mimar:recent-list', async () =>
  (await readRecent()).map((r) => ({ key: r.path, name: r.name, path: r.path, at: r.at })),
);
// Only a path already on the list can be opened this way (the page can't ask for any other file).
ipcMain.handle('mimar:recent-open', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !(await readRecent()).some((r) => r.path === filePath)) return null;
  try {
    return await readPlan(filePath);
  } catch {
    return null;
  }
});
ipcMain.handle('mimar:recent-clear', async () => {
  try {
    await fs.writeFile(recentFile(), '[]', 'utf8');
    app.clearRecentDocuments();
  } catch {
    // Nothing to clear.
  }
});

ipcMain.handle('mimar:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open plan',
    filters: PLAN_FILTERS,
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  return readPlan(filePaths[0]);
});

ipcMain.handle('mimar:save', async (event, request) => {
  if (!request || typeof request.contents !== 'string' || typeof request.suggestedName !== 'string') {
    throw new Error('Invalid save request.');
  }
  let target = typeof request.path === 'string' && userChosenPaths.has(request.path) ? request.path : null;
  if (!target) {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save plan',
      defaultPath: path.join(app.getPath('documents'), path.basename(request.suggestedName)),
      filters: PLAN_FILTERS,
    });
    if (canceled || !filePath) return null;
    target = filePath;
  }
  await fs.writeFile(target, request.contents, 'utf8');
  userChosenPaths.add(target);
  await noteRecent(target);
  return { name: path.basename(target), path: target };
});

function createSplash() {
  splash = new BrowserWindow({
    width: 800,
    height: 450,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#FBF8F3',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, 'branding', 'ui', 'splash.svg'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: path.join(__dirname, 'branding', 'logo', 'mimar-icon.png'),
  });

  // Never open new Electron windows; send http(s) links to the user's browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Keep the window on the app itself.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(indexHtml).href) event.preventDefault();
  });

  mainWindow.loadFile(indexHtml);
  // mainWindow.webContents.openDevTools();
  if (splash) {
    setTimeout(() => {
      try {
        splash.close();
      } catch {
        // splash already closed
      }
    }, 1500);
  }
}

app.whenReady().then(() => {
  // Mimar draws its own menu bar, so drop Electron's default one (File, Edit, View, Window).
  Menu.setApplicationMenu(null);
  setupUpdates(() => mainWindow);
  try {
    createSplash();
  } catch (e) {
    console.log('splash failed', e);
  }
  setTimeout(() => {
    createWindow();
  }, 1200);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
