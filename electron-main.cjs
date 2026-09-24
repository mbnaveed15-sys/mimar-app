const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
let mainWindow;
let splash;

const indexHtml = path.join(__dirname, 'dist', 'index.html');

function createSplash() {
  splash = new BrowserWindow({
    width: 800,
    height: 450,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#0b0b0b',
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
