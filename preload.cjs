// Exposes a small, fixed file API to the app. The page never gets direct access to Node or the disk.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mimarFiles', {
  open: () => ipcRenderer.invoke('mimar:open'),
  save: (request) => ipcRenderer.invoke('mimar:save', request),
});

// Update status and actions; see updater.cjs.
contextBridge.exposeInMainWorld('mimarUpdates', {
  getStatus: () => ipcRenderer.invoke('mimar:update-status'),
  check: () => ipcRenderer.invoke('mimar:update-check'),
  install: () => ipcRenderer.invoke('mimar:update-install'),
  openDownload: () => ipcRenderer.invoke('mimar:update-open-download'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('mimar:update-status', listener);
    return () => ipcRenderer.removeListener('mimar:update-status', listener);
  },
});
