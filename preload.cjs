// Exposes a small, fixed file API to the app. The page never gets direct access to Node or the disk.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mimarFiles', {
  open: () => ipcRenderer.invoke('mimar:open'),
  save: (request) => ipcRenderer.invoke('mimar:save', request),
});
