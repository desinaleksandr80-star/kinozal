// Кинозал — настольное приложение (Electron)
const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell, Tray, Menu, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// отдельный профиль: Kinozal.exe --profile=2 (удобно запустить две копии на одном компе)
const prof = process.argv.find(a => a.startsWith('--profile='));
if (prof) app.setPath('userData', path.join(app.getPath('appData'), 'Kinozal-' + prof.split('=')[1].replace(/[^\w-]/g, '')));

// ---------- журнал: %APPDATA%\Кинозал\logs\kinozal.log ----------
// Пишем запуск, сбои окна и видеокарты, ошибки страницы. Больше 1 МБ — старый уходит в kinozal.old.log.
const logDir = () => path.join(app.getPath('userData'), 'logs');
let logFile = null;
function log(...a) {
  try {
    if (!logFile) {
      fs.mkdirSync(logDir(), { recursive: true });
      logFile = path.join(logDir(), 'kinozal.log');
      try { if (fs.statSync(logFile).size > 1e6) fs.renameSync(logFile, path.join(logDir(), 'kinozal.old.log')); } catch (e) {}
    }
    const line = a.map(x => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })()).join(' ');
    fs.appendFileSync(logFile, new Date().toISOString() + ' ' + line.slice(0, 4000) + '\n');
  } catch (e) {}
}
process.on('uncaughtException', e => log('[main] ошибка:', e?.stack || String(e)));
process.on('unhandledRejection', e => log('[main] ошибка (promise):', e?.stack || String(e)));

// режим совместимости: без ускорения видеокарты — спасает, если окно чёрное из-за драйвера
const noGpuFlag = () => path.join(app.getPath('userData'), 'no-gpu');
const noGpu = (() => { try { return fs.existsSync(noGpuFlag()); } catch (e) { return false; } })();
if (noGpu) app.disableHardwareAcceleration();

// только одно окно: повторный запуск (двойной клик, ярлык после установщика) показывает уже открытое
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => showWin());
function showWin() {
  if (!win || win.isDestroyed()) return;
  const wasHidden = !win.isVisible() || win.isMinimized();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); win.flashFrame(false);
  if (wasHidden) repaint('show');
}
// На части видеокарт окно, которое достали из трея, остаётся чёрным, пока его не перерисовать.
// Поэтому после показа просим страницу перерисоваться и чуть «шевелим» размер окна.
function repaint(why) {
  if (!win || win.isDestroyed()) return;
  log('[окно] перерисовка:', why);
  try { win.webContents.invalidate(); } catch (e) {}
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    try { win.webContents.invalidate(); } catch (e) {}
    if (win.isMaximized() || win.isFullScreen() || win.isMinimized()) return;
    const [w, h] = win.getSize(); win.setSize(w + 1, h); setTimeout(() => { if (!win.isDestroyed()) win.setSize(w, h); }, 80);
  }, 200);
}
function setNoGpu(on) {
  try { if (on) fs.writeFileSync(noGpuFlag(), 'Кинозал без ускорения видеокарты. Удалите файл, чтобы вернуть как было.'); else fs.rmSync(noGpuFlag(), { force: true }); } catch (e) {}
  log('[gpu] режим совместимости:', on ? 'вкл' : 'выкл', '— перезапуск');
  quitting = true; app.relaunch(); app.exit(0);
}
if (process.platform === 'win32') app.setAppUserModelId('local.kinozal.app'); // без этого Windows не показывает уведомления

// фильм и показ экрана не должны тормозить, когда окно свёрнуто или закрыто игрой
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// окно, перекрытое игрой, Windows считает «невидимым» и режет ему кадры — нам это не нужно
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const TITLE = 'Кинозал';
let win = null;
let picked = null; // что выбрали в окне «Что показать?»: {id, audio}
// мессенджер работает в фоне: крестик прячет окно в трей, выход — через меню значка
let tray = null, quitting = false, trayHinted = false;
const startHidden = process.argv.includes('--hidden'); // автозапуск с Windows — сразу в трей
app.on('before-quit', () => { quitting = true; log('[выход]'); });
function setupTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip(TITLE);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Кинозал', click: showWin },
    { label: 'Перезагрузить окно', click: () => { log('[окно] перезагрузка из трея'); showWin(); win?.webContents.reload(); } },
    { type: 'separator' },
    { label: 'Чёрный экран? Режим без видеокарты', type: 'checkbox', checked: noGpu, click: i => setNoGpu(i.checked) },
    { label: 'Открыть журнал ошибок', click: () => { log('[журнал] открыт'); shell.openPath(logDir()); } },
    { type: 'separator' },
    { label: 'Выйти', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWin);
}

// ---------- автообновление из релизов GitHub ----------
// Проверяем при запуске и раз в 4 часа, качаем в фоне, ставим по кнопке или при выходе из программы.
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (e) {}
let updState = null;
function sendUpd(type, data) {
  updState = { type, ...data };
  if (win && !win.isDestroyed()) win.webContents.send('kz:update', updState);
}
function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', i => sendUpd('available', { version: i.version }));
  autoUpdater.on('download-progress', p => sendUpd('progress', { version: updState?.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => sendUpd('downloaded', { version: i.version }));
  autoUpdater.on('error', e => { log('[обновление] ошибка:', e?.message || String(e)); if (updState?.type !== 'downloaded') updState = null; });
  autoUpdater.on('update-downloaded', i => log('[обновление] скачана', i.version));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 4000);
  setInterval(check, 4 * 3600 * 1000);
}

// окно не больше экрана: на ноутбуке с крупным масштабом 1440×900 не помещается, и низ (поле ввода) уходит за край
function fitToScreen() {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
  const wa = screen.getDisplayMatching(win.getBounds()).workArea, b = win.getBounds();
  const w = Math.min(b.width, wa.width), h = Math.min(b.height, wa.height);
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - w), y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - h);
  if (w !== b.width || h !== b.height || x !== b.x || y !== b.y) { log('[окно] подгоняю под экран', JSON.stringify({ was: b, wa })); win.setBounds({ x, y, width: w, height: h }); }
}
let lastCrash = null;
function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const W = Math.min(1440, wa.width), H = Math.min(900, wa.height);
  win = new BrowserWindow({
    width: W, height: H, minWidth: Math.min(900, wa.width), minHeight: Math.min(600, wa.height), center: true,
    backgroundColor: '#0e1416', title: TITLE, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  const wc = win.webContents;
  // ошибки страницы — в журнал
  wc.on('console-message', (e, ...old) => {
    const [level, message, line, source] = old;
    const lv = e?.level ?? level, msg = e?.message ?? message, ln = e?.lineNumber ?? line, src = e?.sourceId ?? source;
    if (lv === 'warning' || lv === 'error' || lv === 2 || lv === 3) log('[страница]', lv === 'error' || lv === 3 ? 'ОШИБКА' : 'предупр.', String(msg), '@' + String(src || '').split('/').pop() + ':' + ln);
  });
  wc.on('did-fail-load', (e, code, desc) => log('[окно] не загрузилось:', code, desc));
  // страница упала — поднимаем заново, а не оставляем чёрное окно
  wc.on('render-process-gone', (e, d) => {
    const hex = '0x' + ((d.exitCode >>> 0).toString(16).toUpperCase());
    const what = { '0xC000001D': 'аварийная проверка Chromium (CHECK)', '0xC0000005': 'обращение к чужой памяти', '0xE0000008': 'не хватило памяти', '0xC00000FD': 'переполнение стека' }[hex] || '';
    lastCrash = { at: Date.now(), reason: d.reason, code: hex };
    log('[окно] страница упала:', d.reason, d.exitCode, hex, what);
    if (!quitting && d.reason !== 'clean-exit') setTimeout(() => { if (!win.isDestroyed()) { log('[окно] перезагружаю'); wc.reload(); } }, 1000);
  });
  // зависла дольше 20 секунд — тоже перезагружаем
  let hang = 0;
  wc.on('unresponsive', () => { log('[окно] не отвечает'); clearTimeout(hang); hang = setTimeout(() => { log('[окно] зависла — перезагружаю'); try { wc.forcefullyCrashRenderer(); } catch (e) {} setTimeout(() => !win.isDestroyed() && wc.reload(), 500); }, 20000); });
  wc.on('responsive', () => { if (hang) log('[окно] снова отвечает'); clearTimeout(hang); hang = 0; });
  wc.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r'))) { log('[окно] перезагрузка клавишей'); wc.reload(); e.preventDefault(); } });
  win.on('restore', () => repaint('restore'));
  win.on('show', () => log('[окно] показано'));
  win.on('hide', () => log('[окно] спрятано в трей'));
  win.on('close', e => {
    log('[окно] закрытие', quitting ? '(выход)' : tray ? '(в трей)' : '(без трея)');
    if (quitting || !tray) return;
    e.preventDefault(); win.hide();
    if (!trayHinted && Notification.isSupported()) {
      trayHinted = true;
      new Notification({ title: TITLE, body: 'Кинозал работает в фоне — сообщения и звонки будут приходить. Выйти: правый клик по значку у часов.', silent: true }).show();
    }
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
  if (wa.width < 1300 || wa.height < 820) win.once('ready-to-show', () => { if (!startHidden) win.maximize(); });  // небольшой экран — сразу на весь
  win.on('show', fitToScreen); win.on('restore', fitToScreen);
  screen.on('display-metrics-changed', fitToScreen); screen.on('display-removed', fitToScreen);
  if (startHidden) win.once('ready-to-show', () => win.hide());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
  log('==== запуск Кинозал', app.getVersion(), '| Windows', os.release(), process.arch, '| Electron', process.versions.electron,
    '| без видеокарты:', noGpu, '| скрыто:', startHidden, '| GPU:', app.getGPUFeatureStatus?.());
  // видеокарта: процесс GPU падает раз за разом — включаем режим совместимости сами
  let gpuCrashes = 0;
  app.on('child-process-gone', (e, d) => {
    log('[процесс] упал:', d.type, d.reason, d.exitCode, d.name || '');
    // служба звука: поднимется сама, но уже игравший звук останется немым — страница переподключит его
    if (/audio/i.test(d.name || d.serviceName || '') && d.reason !== 'clean-exit' && win && !win.isDestroyed()) win.webContents.send('kz:audioCrash');
    if (d.type === 'GPU' && d.reason !== 'clean-exit' && ++gpuCrashes >= 3 && !noGpu) {
      log('[gpu] видеокарта падает — включаю режим совместимости');
      if (Notification.isSupported()) new Notification({ title: TITLE, body: 'Видеокарта сбоит — перезапускаю Кинозал в режиме совместимости.' }).show();
      setTimeout(() => setNoGpu(true), 1500);
    }
  });
  setTimeout(() => log('[gpu] через 15 с:', app.getGPUFeatureStatus?.()), 15000);
  app.getGPUInfo?.('basic').then(i => log('[gpu]', (i?.gpuDevice || []).map(g => (g.active ? '*' : '') + g.vendorId + ':' + g.deviceId + ' ' + (g.driverVersion || '')).join(' | '))).catch(() => {});
  const ses = session.defaultSession;
  const allowed = ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'clipboard-read'];
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.includes(perm)));
  ses.setPermissionCheckHandler((wc, perm) => allowed.includes(perm));

  // getDisplayMedia в странице → отдаём выбранный экран/окно и системный звук
  ses.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const want = picked; picked = null;
      const src = (want && sources.find(s => s.id === want.id)) || sources.find(s => s.id.startsWith('screen:')) || sources[0];
      if (!src) return cb({});
      const res = { video: src };
      if (process.platform === 'win32' && (!want || want.audio)) res.audio = 'loopback';
      cb(res);
    } catch (e) { cb({}); }
  });

  ipcMain.handle('kz:sources', async () => {
    const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 384, height: 216 } });
    return list
      .filter(s => s.name !== TITLE) // своё окно не показываем — иначе бесконечный туннель
      .map(s => ({ id: s.id, name: s.name, screen: s.id.startsWith('screen:'), thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL() }));
  });
  ipcMain.handle('kz:pick', (e, id, audio) => { picked = { id: String(id), audio: !!audio }; return true; });
  ipcMain.handle('kz:version', () => app.getVersion());
  // сборка Windows: «звук компьютера без звука Кинозала» Windows умеет только с 11-й (сборка 20348+)
  ipcMain.handle('kz:os', () => ({ platform: process.platform, release: os.release() }));
  ipcMain.handle('kz:updState', () => updState);
  ipcMain.handle('kz:install', () => { if (updState?.type === 'downloaded') { quitting = true; setImmediate(() => autoUpdater.quitAndInstall(true, true)); } });
  // мессенджер: показать окно, мигнуть в панели задач, уведомление Windows, счётчик в трее, автозапуск
  ipcMain.handle('kz:show', () => showWin());
  ipcMain.handle('kz:focused', () => !!(win && win.isVisible() && win.isFocused()));
  ipcMain.handle('kz:flash', (e, on) => { if (win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(!!on); });
  ipcMain.handle('kz:unread', (e, n) => { n = Math.max(0, n | 0); tray?.setToolTip(n ? TITLE + ' — непрочитанных: ' + n : TITLE); });
  ipcMain.handle('kz:notify', (e, o) => {
    if (!Notification.isSupported() || !o) return;
    const n = new Notification({ title: String(o.title || TITLE).slice(0, 80), body: String(o.body || '').slice(0, 200), silent: true,
      icon: path.join(__dirname, 'build', 'icon.png') });
    n.on('click', () => { showWin(); if (o.chat) win?.webContents.send('kz:openChat', String(o.chat)); });
    n.show();
  });
  // журнал — чтобы отправить его в чат (например, разработчику)
  ipcMain.handle('kz:crashed', () => lastCrash);
  ipcMain.handle('kz:readLog', () => {
    let s = '';
    for (const f of ['kinozal.old.log', 'kinozal.log']) try { s += fs.readFileSync(path.join(logDir(), f), 'utf8'); } catch (e) {}
    return s.slice(-1.5e6);
  });
  ipcMain.on('kz:log', (e, ...a) => log('[страница]', ...a.map(x => String(x).slice(0, 2000))));
  ipcMain.handle('kz:autostart', (e, on) => {
    if (!app.isPackaged) return false;
    if (typeof on === 'boolean') app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
    return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  });

  setupFiles();
  createWindow();
  setupTray();
  setupUpdates();
});

app.on('window-all-closed', () => app.quit());

// ---------- большие файлы: читаем отправляемое с диска и пишем полученное сразу на диск ----------
// Полученное — в «Загрузки\Кинозал\Полученные». Пока файл качается, он лежит там же
// в скрытой папке .докачка как <id сообщения>.part: после обрыва или перезапуска докачивается с того же места.
// Читать странице можно только файлы, которые человек сам выбрал для отправки (список в userData\sends.json).
function setupFiles() {
  const fsp = fs.promises;
  const tag = prof ? '-' + prof.split('=')[1].replace(/[^\w-]/g, '') : '';   // у тестовых копий — свои папки
  const recvDir = () => path.join(app.getPath('downloads'), 'Кинозал', 'Полученные' + tag);   // не «Документы»: их часто синхронизирует OneDrive
  const partDir = () => path.join(recvDir(), '.докачка');
  const sendsFile = () => path.join(app.getPath('userData'), 'sends.json');
  let sends = new Set();
  try { sends = new Set(JSON.parse(fs.readFileSync(sendsFile(), 'utf8'))); } catch (e) {}
  const saveSends = () => { try { fs.writeFileSync(sendsFile(), JSON.stringify([...sends].slice(-2000))); } catch (e) {} };
  const okId = id => /^[\w-]{1,60}$/.test(String(id || ''));
  const partOf = id => path.join(partDir(), id + '.part');
  const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
  const open = new Map();   // id -> FileHandle недокачанного файла
  const handle = async id => { let h = open.get(id); if (!h) { await fsp.mkdir(partDir(), { recursive: true }); h = await fsp.open(partOf(id), 'r+').catch(() => fsp.open(partOf(id), 'w+')); open.set(id, h); } return h; };
  const shut = async id => { const h = open.get(id); open.delete(id); if (h) await h.close().catch(() => {}); };
  const safeName = s => (String(s || 'файл').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 120)) || 'файл';

  // отправка: страница отдаёт путь файла, выбранного человеком, — запоминаем, что его можно читать
  ipcMain.handle('kz:fadd', (e, p) => { p = String(p || ''); if (!path.isAbsolute(p)) return false; try { if (!fs.statSync(p).isFile()) return false; } catch (er) { return false; } sends.add(p); saveSends(); return true; });
  ipcMain.handle('kz:fstat', async (e, p) => { p = String(p || ''); if (!sends.has(p) && !inside(p, recvDir())) return null; try { const s = await fsp.stat(p); return { size: s.size, mtime: s.mtimeMs }; } catch (er) { return null; } });
  ipcMain.handle('kz:fread', async (e, p, off, len) => {
    p = String(p || ''); if (!sends.has(p)) throw new Error('нет доступа к файлу');
    off = Math.max(0, +off || 0); len = Math.max(0, Math.min(8 << 20, +len || 0));
    const h = await fsp.open(p, 'r');
    try { const b = Buffer.alloc(len); const { bytesRead } = await h.read(b, 0, len, off); return bytesRead === len ? b : b.subarray(0, bytesRead); } finally { await h.close(); }
  });
  // приём: сколько уже скачано (обрезаем до целых кусков), запись куска, готово, удалить
  ipcMain.handle('kz:fopen', async (e, id, blk) => {
    if (!okId(id)) throw new Error('плохой id');
    blk = Math.max(1, +blk || 1);
    const h = await handle(id); const { size } = await h.stat(); const have = Math.floor(size / blk) * blk;
    if (have !== size) await h.truncate(have);
    return have;
  });
  ipcMain.handle('kz:fwrite', async (e, id, off, data) => {
    if (!okId(id)) throw new Error('плохой id');
    const h = await handle(id), b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    let done = 0; while (done < b.length) { const { bytesWritten } = await h.write(b, done, b.length - done, (+off || 0) + done); done += bytesWritten; }
    return true;
  });
  ipcMain.handle('kz:fdone', async (e, id, name) => {
    if (!okId(id)) throw new Error('плохой id');
    await shut(id);
    const dir = recvDir(); await fsp.mkdir(dir, { recursive: true });
    const nm = safeName(name), ext = path.extname(nm), base = ext ? nm.slice(0, -ext.length) : nm;
    let to = path.join(dir, nm);
    for (let i = 1; fs.existsSync(to); i++) to = path.join(dir, base + ' (' + i + ')' + ext);
    await fsp.rename(partOf(id), to);
    log('[файлы] получен', to);
    return to;
  });
  ipcMain.handle('kz:fdrop', async (e, id) => { if (!okId(id)) return false; await shut(id); await fsp.rm(partOf(id), { force: true }).catch(() => {}); return true; });
  ipcMain.handle('kz:fshow', (e, p) => {
    p = String(p || '');
    if (!sends.has(p) && !inside(p, recvDir())) return false;
    if (fs.existsSync(p)) shell.showItemInFolder(p); else { fs.mkdirSync(recvDir(), { recursive: true }); shell.openPath(recvDir()); }
    return true;
  });
  ipcMain.handle('kz:fdir', () => { fs.mkdirSync(recvDir(), { recursive: true }); shell.openPath(recvDir()); return recvDir(); });
}
