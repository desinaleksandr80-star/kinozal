const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kinozalApp', {
  getSources: () => ipcRenderer.invoke('kz:sources'),
  pick: (id, audio) => ipcRenderer.invoke('kz:pick', id, audio),
  version: () => ipcRenderer.invoke('kz:version'),
  osInfo: () => ipcRenderer.invoke('kz:os'),
  updState: () => ipcRenderer.invoke('kz:updState'),
  installUpdate: () => ipcRenderer.invoke('kz:install'),
  onUpdate: cb => ipcRenderer.on('kz:update', (e, d) => cb(d))
});
