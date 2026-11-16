const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kinozalApp', {
  getSources: () => ipcRenderer.invoke('kz:sources'),
  pick: (id, audio) => ipcRenderer.invoke('kz:pick', id, audio),
  version: () => ipcRenderer.invoke('kz:version'),
  osInfo: () => ipcRenderer.invoke('kz:os'),
  updState: () => ipcRenderer.invoke('kz:updState'),
  installUpdate: () => ipcRenderer.invoke('kz:install'),
  onUpdate: cb => ipcRenderer.on('kz:update', (e, d) => cb(d)),
  show: () => ipcRenderer.invoke('kz:show'),
  focused: () => ipcRenderer.invoke('kz:focused'),
  flash: on => ipcRenderer.invoke('kz:flash', on),
  unread: n => ipcRenderer.invoke('kz:unread', n),
  notify: o => ipcRenderer.invoke('kz:notify', o),
  autostart: on => ipcRenderer.invoke('kz:autostart', on),
  onOpenChat: cb => ipcRenderer.on('kz:openChat', (e, id) => cb(id)),
  readLog: () => ipcRenderer.invoke('kz:readLog'),
  crashed: () => ipcRenderer.invoke('kz:crashed'),
  log: (...a) => ipcRenderer.send('kz:log', ...a)
});
