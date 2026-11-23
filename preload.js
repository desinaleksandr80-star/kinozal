const { contextBridge, ipcRenderer, webUtils } = require('electron');

// большие файлы: путь выбранного файла, чтение кусками, запись полученного сразу на диск
const files = {
  pathOf: async f => { try { const p = webUtils.getPathForFile(f); return p && await ipcRenderer.invoke('kz:fadd', p) ? p : ''; } catch (e) { return ''; } },
  stat: p => ipcRenderer.invoke('kz:fstat', p),
  read: (p, off, len) => ipcRenderer.invoke('kz:fread', p, off, len),
  open: (id, blk) => ipcRenderer.invoke('kz:fopen', id, blk),
  write: (id, off, data) => ipcRenderer.invoke('kz:fwrite', id, off, data),
  done: (id, name, t) => ipcRenderer.invoke('kz:fdone', id, name, t),
  drop: id => ipcRenderer.invoke('kz:fdrop', id),
  show: p => ipcRenderer.invoke('kz:fshow', p),
  dragOut: p => ipcRenderer.send('kz:dragstart', p),
  dragTemp: (name, data) => ipcRenderer.invoke('kz:dragtemp', name, data),
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
  dirDone: (id, name, t) => ipcRenderer.invoke('kz:ddone', id, name, t),
  // раздел «Файлы»
  list: p => ipcRenderer.invoke('kz:flist', p || ''),
  search: q => ipcRenderer.invoke('kz:fsearch', q),
  openPath: p => ipcRenderer.invoke('kz:fopenp', p),
  trash: p => ipcRenderer.invoke('kz:ftrash', p),
  save: (name, data, t) => ipcRenderer.invoke('kz:fsave', name, data, t),
  roots: () => ipcRenderer.invoke('kz:froots'),
  pickRoot: () => ipcRenderer.invoke('kz:fpickroot'),
  dropRoot: p => ipcRenderer.invoke('kz:frootdel', p),
  slice: (p, off, len) => ipcRenderer.invoke('kz:fslice', p, off, len),
  size: p => ipcRenderer.invoke('kz:fsize', p),
  exists: p => ipcRenderer.invoke('kz:fexists', p),
  rawPreview: p => ipcRenderer.invoke('kz:fpreview', p),
  add: p => ipcRenderer.invoke('kz:fadd', p),
  watch: cb => { ipcRenderer.removeAllListeners('kz:fchanged'); ipcRenderer.on('kz:fchanged', () => cb()); return ipcRenderer.invoke('kz:fwatch'); }
};

// File и FileList через contextBridge не доезжают (список «не итерируется»), поэтому пути берём здесь, в мире preload:
// на каждый бросок файлов запоминаем пути — страница спрашивает их через music.droppedPaths()
const pathsOfFiles = fl => { const out = []; try { for (const f of Array.from(fl || [])) { try { const p = webUtils.getPathForFile(f); if (p) out.push(p); } catch (e) {} } } catch (e) {} return out; };
let lastDropped = [];
window.addEventListener('drop', e => { try { lastDropped = pathsOfFiles(e.dataTransfer && e.dataTransfer.files); } catch (er) { lastDropped = []; } }, true);

// музыка: своя папка, список, звук по kzmusic://, слежение
const music = {
  root: () => ipcRenderer.invoke('kz:mroot'),
  pick: () => ipcRenderer.invoke('kz:mpick'),
  reset: () => ipcRenderer.invoke('kz:mreset'),
  scan: () => ipcRenderer.invoke('kz:mscan'),
  read: (p, off, len) => ipcRenderer.invoke('kz:mread', p, off, len),
  hash: p => ipcRenderer.invoke('kz:mhash', p),
  add: list => ipcRenderer.invoke('kz:madd', list),
  addDropped: fl => ipcRenderer.invoke('kz:madd', pathsOfFiles(fl)),
  addPaths: list => ipcRenderer.invoke('kz:maddx', list),
  droppedPaths: () => lastDropped,
  pickFiles: () => ipcRenderer.invoke('kz:mpickfiles'),
  lyrics: p => ipcRenderer.invoke('kz:mlyrics', p),
  saveOpen: (id, name) => ipcRenderer.invoke('kz:msaveopen', id, name),
  saveWrite: (id, off, data) => ipcRenderer.invoke('kz:msavewrite', id, off, data),
  saveDone: (id, want) => ipcRenderer.invoke('kz:msavedone', id, want),
  saveDrop: id => ipcRenderer.invoke('kz:msavedrop', id),
  show: p => ipcRenderer.invoke('kz:mshow', p),
  openDir: () => ipcRenderer.invoke('kz:mopen'),
  trash: p => ipcRenderer.invoke('kz:mtrash', p),
  url: p => 'kzmusic://f/' + encodeURIComponent(p),
  watch: cb => { ipcRenderer.removeAllListeners('kz:mchanged'); ipcRenderer.on('kz:mchanged', () => cb()); return ipcRenderer.invoke('kz:mwatch'); }
};

contextBridge.exposeInMainWorld('kinozalApp', {
  game: { scan: custom => ipcRenderer.invoke('kz:gamescan', custom) },
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
  files,
  music
});
