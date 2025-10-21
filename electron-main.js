const { app, BrowserWindow } = require('electron');
const path = require('path');
let mainWindow;
let splash;

function createSplash() {
  splash = new BrowserWindow({
    width: 800,
    height: 450,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#0b0b0b'
  });
  splash.loadFile(path.join(__dirname, 'branding', 'ui', 'splash.svg'));
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'branding', 'logo', 'mimar-emblem.svg')
  });

  const indexHtml = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadFile(indexHtml);
  // mainWindow.webContents.openDevTools();
  if (splash) {
    setTimeout(() => { try { splash.close(); } catch(e){} }, 1500);
  }
}

app.whenReady().then(() => {
  try { createSplash(); } catch(e) { console.log('splash failed', e); }
  setTimeout(()=>{ createWindow(); }, 1200);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
