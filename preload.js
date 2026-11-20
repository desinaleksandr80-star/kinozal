const { contextBridge, ipcRenderer, webUtils } = require('electron');

// большие файлы: путь выбранного файла, чтение кусками, запись полученного сразу на диск
const files = {
  pathOf: async f => { try { const p = webUtils.getPathForFile(f); return p && await ipcRenderer.invoke('kz:fadd', p) ? p : ''; } catch (e) { return ''; } },
  stat: p => ipcRenderer.invoke('kz:fstat', p),
  read: (p, off, len) => ipcRenderer.invoke('kz:fread', p, off, len),
  open: (id, blk) => ipcRenderer.invoke('kz:fopen', id, blk),
  write: (id, off, data) => ipcRenderer.invoke('kz:fwrite', id, off, data),
  done: (id, name) => ipcRenderer.invoke('kz:fdone', id, name),
  drop: id => ipcRenderer.invoke('kz:fdrop', id),
  show: p => ipcRenderer.invoke('kz:fshow', p),
  dir: () => ipcRenderer.invoke('kz:fdir'),
  // папки: что это — файл или папка, выбрать папку, опись, чтение и запись склеенного потока
  kind: f => { try { return ipcRenderer.invoke('kz:fkind', webUtils.getPathForFile(f)); } catch (e) { return Promise.resolve(''); } },
  pathOfAny: f => { try { return webUtils.getPathForFile(f) || ''; } catch (e) { return ''; } },
  pickDir: () => ipcRenderer.invoke('kz:fpickdir'),
  dirAdd: (id, root) => ipcRenderer.invoke('kz:dadd', id, root),
  dirMan: id => ipcRenderer.invoke('kz:dman', id),
  dirStat: id => ipcRenderer.invoke('kz:dstat', id),
  dirRead: (id, off, len) => ipcRenderer.invoke('kz:dread', id, off, len),
  dirOpen: (id, blk, man, size) => ipcRenderer.invoke('kz:dopen', id, blk, man, size),
  dirWrite: (id, off, data) => ipcRenderer.invoke('kz:dwrite', id, off, data),
  dirDone: (id, name) => ipcRenderer.invoke('kz:ddone', id, name),
  // раздел «Файлы»
  list: p => ipcRenderer.invoke('kz:flist', p || ''),
  search: q => ipcRenderer.invoke('kz:fsearch', q),
  openPath: p => ipcRenderer.invoke('kz:fopenp', p),
  trash: p => ipcRenderer.invoke('kz:ftrash', p),
  save: (name, data) => ipcRenderer.invoke('kz:fsave', name, data),
  exists: p => ipcRenderer.invoke('kz:fexists', p),
  rawPreview: p => ipcRenderer.invoke('kz:fpreview', p),
  add: p => ipcRenderer.invoke('kz:fadd', p),
  watch: cb => { ipcRenderer.removeAllListeners('kz:fchanged'); ipcRenderer.on('kz:fchanged', () => cb()); return ipcRenderer.invoke('kz:fwatch'); }
};

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
  onAudioCrash: cb => ipcRenderer.on('kz:audioCrash', () => cb()),
  onOpenChat: cb => ipcRenderer.on('kz:openChat', (e, id) => cb(id)),
  readLog: () => ipcRenderer.invoke('kz:readLog'),
  crashed: () => ipcRenderer.invoke('kz:crashed'),
  log: (...a) => ipcRenderer.send('kz:log', ...a),
  files
});
