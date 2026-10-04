const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nativeBio', {
  available: () => ipcRenderer.invoke('bio:available'),
  verify: (reason) => ipcRenderer.invoke('bio:verify', reason)
});
