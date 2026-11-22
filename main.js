// Кинозал — настольное приложение (Electron)
const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell, Tray, Menu, nativeImage, Notification, screen, dialog, protocol, net } = require('electron');
const kzMusic = require('./music-main.js');
kzMusic.register(protocol);   // схему kzmusic: надо объявить до готовности приложения
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
  kzMusic.setup({ app, ipcMain, dialog, shell, protocol, getWin: () => win, log, tag: prof ? '-' + prof.split('=')[1].replace(/[^\w-]/g, '') : '' });
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
  const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
  const open = new Map();   // id -> FileHandle недокачанного файла
  const handle = async id => { let h = open.get(id); if (!h) { await fsp.mkdir(partDir(), { recursive: true }); h = await fsp.open(partOf(id), 'r+').catch(() => fsp.open(partOf(id), 'w+')); open.set(id, h); } return h; };
  const shut = async id => { const h = open.get(id); open.delete(id); if (h) await h.close().catch(() => {}); };
  const safeName = s => (String(s || 'файл').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 120)) || 'файл';

  // отправка: страница отдаёт путь файла, выбранного человеком, — запоминаем, что его можно читать
  ipcMain.handle('kz:fadd', (e, p) => { p = String(p || ''); if (!path.isAbsolute(p)) return false; try { if (!fs.statSync(p).isFile()) return false; } catch (er) { return false; } sends.add(p); saveSends(); return true; });
  ipcMain.handle('kz:fstat', async (e, p) => { p = String(p || ''); if (!sends.has(p) && !inRoots(p)) return null; try { const s = await fsp.stat(p); return { size: s.size, mtime: s.mtimeMs }; } catch (er) { return null; } });
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
  // ---------- маршруты: корневые папки, куда разрешено класть полученное ----------
  // «Полученные» есть всегда; остальные человек выбирает сам в окне Windows (их список — userData\roots.json).
  // Страница просит «корень + подпапки» (по человеку, месяцу…), а не произвольный путь.
  const rootsFile = () => path.join(app.getPath('userData'), 'roots.json');
  let roots = new Set();
  try { roots = new Set(JSON.parse(fs.readFileSync(rootsFile(), 'utf8')).filter(r => path.isAbsolute(r))); } catch (e) {}
  const saveRoots = () => { try { fs.writeFileSync(rootsFile(), JSON.stringify([...roots])); } catch (e) {} };
  const allRoots = () => [recvDir(), ...roots];
  const inRoots = p => allRoots().some(r => p === r || inside(p, r));
  function target(t) {   // {root, sub: ['Максим', '2026-11']} → папка внутри корня
    let dir = recvDir();
    if (t && t.root && allRoots().includes(String(t.root))) dir = String(t.root);
    for (const s of [].concat(t?.sub || []).slice(0, 4)) { const seg = safeName(s); if (seg) dir = path.join(dir, seg); }
    if (dir !== recvDir() && !allRoots().some(r => dir === r || inside(dir, r))) dir = recvDir();
    return dir;
  }
  const freeName = (dir, nm, isDir) => {
    const ext = isDir ? '' : path.extname(nm), base = ext ? nm.slice(0, -ext.length) : nm;
    let to = path.join(dir, nm); for (let i = 1; fs.existsSync(to); i++) to = path.join(dir, base + ' (' + i + ')' + ext); return to;
  };
  async function moveTo(from, to) {   // на другой диск rename не умеет — копируем и стираем
    try { await fsp.rename(from, to); }
    catch (er) { if (er.code !== 'EXDEV') throw er; await fsp.cp(from, to, { recursive: true, errorOnExist: true }); await fsp.rm(from, { recursive: true, force: true }); }
  }
  ipcMain.handle('kz:fdone', async (e, id, name, t) => {
    if (!okId(id)) throw new Error('плохой id');
    await shut(id);
    const dir = target(t); await fsp.mkdir(dir, { recursive: true });
    const to = freeName(dir, safeName(name));
    await moveTo(partOf(id), to);
    log('[файлы] получен', to);
    return to;
  });
  ipcMain.handle('kz:fdrop', async (e, id) => {
    if (!okId(id)) return false; await shut(id);
    for (const p of [partOf(id), dpartOf(id), dmanOf(id)]) await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
    dman.delete(id); madeDirs.clear(); return true;
  });

  // ---------- папки целиком: без архива ----------
  // Папка передаётся как один склеенный поток: все её файлы подряд в порядке описи (путь + размер).
  // Куски, хэши, докачка и скорость — те же, что у одного файла; здесь поток раскладывается по файлам.
  // Опись отправленной папки хранится в userData\sends\<id>.json — по ней отдаём, даже если в папке что-то появилось.
  // Получаемая папка собирается в .докачка\<id>\, её опись — рядом, в <id>.json; готовая переезжает в «Полученные».
  const sendDir = () => path.join(app.getPath('userData'), 'sends');
  const smanOf = id => path.join(sendDir(), id + '.json');
  const dpartOf = id => path.join(partDir(), id);
  const dmanOf = id => path.join(partDir(), id + '.json');
  const MAXF = 50000;
  const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
  // путь внутри папки от собеседника: только вниз, без «..», без запрещённых в Windows имён
  function safeRel(p) {
    const parts = String(p || '').split('/').map(s => s.replace(/[\\:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 120)).filter(Boolean);
    if (!parts.length || parts.length > 40) return null;
    return parts.map(s => RESERVED.test(s) ? '_' + s : s).join('/');
  }
  // проверить опись: целые размеры, уникальные пути, файл не может быть одновременно папкой, сумма сходится
  function cleanMan(man, size) {
    if (!man || !Array.isArray(man.files) || man.files.length > MAXF) throw new Error('плохая опись папки');
    const files = [], seen = new Set(); let total = 0;
    for (const f of man.files) {
      const p = safeRel(f?.p), s = Number(f?.s);
      if (!p || !Number.isSafeInteger(s) || s < 0 || seen.has(p.toLowerCase())) throw new Error('плохая опись папки');
      seen.add(p.toLowerCase()); files.push({ p, s }); total += s;
    }
    for (const f of files) { const a = f.p.toLowerCase().split('/'); for (let i = 1; i < a.length; i++) if (seen.has(a.slice(0, i).join('/'))) throw new Error('плохая опись папки'); }
    if (total !== size) throw new Error('опись не сходится с размером');
    const dirs = [].concat(man.dirs || []).slice(0, MAXF).map(safeRel).filter(d => d && !seen.has(d.toLowerCase()));
    return { files, dirs };
  }
  // где в склеенном потоке начинается каждый файл
  const withStarts = man => { let o = 0; man.starts = man.files.map(f => { const s = o; o += f.s; return s; }); man.size = o; return man; };
  const firstAt = (man, off) => { let lo = 0, hi = man.files.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (man.starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; };
  // пройти по файлам, которые задевает отрезок [off, off+len): fn(файл, позиция в файле, позиция в отрезке, сколько)
  async function spans(man, off, len, fn) {
    for (let i = firstAt(man, off), pos = off; i < man.files.length && pos < off + len; i++) {
      const f = man.files[i], st = man.starts[i]; if (st + f.s <= pos) continue;
      const n = Math.min(st + f.s, off + len) - pos; if (n <= 0) continue;
      await fn(f, pos - st, pos - off, n); pos += n;
    }
  }
  async function walk(root) {
    const files = [], dirs = [];
    async function go(rel) {
      const ents = await fsp.readdir(rel ? path.join(root, rel) : root, { withFileTypes: true });
      ents.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      if (!ents.length && rel) dirs.push(rel);
      for (const en of ents) {
        const r = rel ? rel + '/' + en.name : en.name;
        if (en.isSymbolicLink()) continue;
        if (en.isDirectory()) await go(r);
        else if (en.isFile()) { files.push({ p: r, s: (await fsp.stat(path.join(root, r))).size }); if (files.length > MAXF) throw new Error('в папке больше ' + MAXF + ' файлов'); }
      }
    }
    await go(''); return { files, dirs };
  }
  const sman = new Map(), dman = new Map();   // кэш описей: отправляемых и получаемых
  async function sendMan(id) {
    if (!okId(id)) throw new Error('плохой id');
    let m = sman.get(id); if (m) return m;
    m = withStarts(JSON.parse(await fsp.readFile(smanOf(id), 'utf8'))); sman.set(id, m); return m;
  }
  ipcMain.handle('kz:fkind', (e, p) => { p = String(p || ''); if (!path.isAbsolute(p)) return ''; try { const s = fs.statSync(p); return s.isDirectory() ? 'dir' : s.isFile() ? 'file' : ''; } catch (er) { return ''; } });
  ipcMain.handle('kz:fpickdir', async () => { const r = await dialog.showOpenDialog(win, { title: 'Какую папку отправить?', properties: ['openDirectory'] }); return r.canceled ? '' : r.filePaths[0] || ''; });
  ipcMain.handle('kz:dadd', async (e, id, root) => {
    if (!okId(id)) throw new Error('плохой id');
    root = String(root || ''); if (!path.isAbsolute(root) || !fs.statSync(root).isDirectory()) throw new Error('это не папка');
    const w = await walk(root), man = { root, files: w.files, dirs: w.dirs };
    await fsp.mkdir(sendDir(), { recursive: true }); await fsp.writeFile(smanOf(id), JSON.stringify(man));
    sends.add(root); saveSends(); sman.set(id, withStarts(man));
    log('[файлы] папка к отправке', root, man.files.length, 'файлов', man.size);
    return { size: man.size, n: man.files.length };
  });
  ipcMain.handle('kz:dman', async (e, id) => { const m = await sendMan(id); return { files: m.files, dirs: m.dirs }; });
  // всё ли в отправленной папке на месте: те же файлы тех же размеров
  ipcMain.handle('kz:dstat', async (e, id) => {
    try { const m = await sendMan(id); for (const f of m.files) { const s = await fsp.stat(path.join(m.root, f.p)); if (!s.isFile() || s.size !== f.s) return 'changed'; } return 'ok'; }
    catch (er) { return 'gone'; }
  });
  ipcMain.handle('kz:dread', async (e, id, off, len) => {
    const m = await sendMan(id);
    off = Math.max(0, +off || 0); len = Math.max(0, Math.min(8 << 20, +len || 0, m.size - off));
    const b = Buffer.alloc(len);
    await spans(m, off, len, async (f, fo, bo, n) => {
      const h = await fsp.open(path.join(m.root, f.p), 'r');
      try { const { bytesRead } = await h.read(b, bo, n, fo); if (bytesRead !== n) throw new Error('файл «' + f.p + '» изменился'); } finally { await h.close(); }
    });
    return b;
  });
  // приём папки: опись (при первом запуске — от отправителя), сколько уже есть, запись, готово
  async function recvMan(id) {
    let m = dman.get(id); if (m) return m;
    try { m = withStarts(JSON.parse(await fsp.readFile(dmanOf(id), 'utf8'))); } catch (er) { return null; }
    dman.set(id, m); return m;
  }
  ipcMain.handle('kz:dopen', async (e, id, blk, man, size) => {
    if (!okId(id)) throw new Error('плохой id');
    let m = await recvMan(id);
    if (!m) {
      if (!man) return -1;   // описи ещё нет — пусть попросят у отправителя
      m = withStarts(cleanMan(man, +size)); await fsp.mkdir(partDir(), { recursive: true });
      await fsp.writeFile(dmanOf(id), JSON.stringify({ files: m.files, dirs: m.dirs })); dman.set(id, m);
    }
    // уже скачано = файлы подряд, пока они полные; обрезаем до целых кусков и подравниваем файлы на диске
    let have = 0;
    for (const f of m.files) { let s = 0; try { s = (await fsp.stat(path.join(dpartOf(id), f.p))).size; } catch (er) {} have += Math.min(s, f.s); if (s < f.s) break; }
    have = Math.floor(have / Math.max(1, +blk || 1)) * Math.max(1, +blk || 1);
    for (let i = 0; i < m.files.length; i++) {
      const f = m.files[i], keep = Math.max(0, Math.min(f.s, have - m.starts[i])), fp = path.join(dpartOf(id), f.p);
      let s = -1; try { s = (await fsp.stat(fp)).size; } catch (er) {}
      if (s > keep) { if (keep) await fsp.truncate(fp, keep); else await fsp.rm(fp, { force: true }); }
    }
    return have;
  });
  const madeDirs = new Set();
  const mkdirFor = async fp => { const d = path.dirname(fp); if (!madeDirs.has(d)) { await fsp.mkdir(d, { recursive: true }); madeDirs.add(d); } };
  ipcMain.handle('kz:dwrite', async (e, id, off, data) => {
    const m = await recvMan(id); if (!m) throw new Error('нет описи папки');
    const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength), base = dpartOf(id);
    await spans(m, +off || 0, b.length, async (f, fo, bo, n) => {
      const fp = path.join(base, f.p); if (!inside(fp, base)) throw new Error('путь за пределами папки');
      await mkdirFor(fp);
      const h = await fsp.open(fp, 'r+').catch(() => fsp.open(fp, 'w+'));
      try { let w = 0; while (w < n) { const { bytesWritten } = await h.write(b, bo + w, n - w, fo + w); w += bytesWritten; } } finally { await h.close(); }
    });
    return true;
  });
  ipcMain.handle('kz:ddone', async (e, id, name, t) => {
    const m = await recvMan(id); if (!m) throw new Error('нет описи папки');
    const base = dpartOf(id);
    // пустые файлы и пустые папки потоком не приходят — создаём сами
    for (const f of m.files) if (!f.s) { const fp = path.join(base, f.p); if (inside(fp, base)) { await mkdirFor(fp); await fsp.writeFile(fp, ''); } }
    for (const d of m.dirs) { const dp = path.join(base, d); if (inside(dp, base)) await fsp.mkdir(dp, { recursive: true }); }
    await fsp.mkdir(base, { recursive: true });
    const dir = target(t); await fsp.mkdir(dir, { recursive: true });
    const to = freeName(dir, safeName(name), true);
    await moveTo(base, to); await fsp.rm(dmanOf(id), { force: true }).catch(() => {}); dman.delete(id); madeDirs.clear();
    log('[файлы] получена папка', to, m.files.length, 'файлов');
    return to;
  });
  ipcMain.handle('kz:fshow', (e, p) => {
    p = String(p || '');
    if (!sends.has(p) && !inRoots(p)) return false;
    if (fs.existsSync(p)) shell.showItemInFolder(p); else { fs.mkdirSync(recvDir(), { recursive: true }); shell.openPath(recvDir()); }
    return true;
  });
  ipcMain.handle('kz:fdir', () => { fs.mkdirSync(recvDir(), { recursive: true }); shell.openPath(recvDir()); return recvDir(); });

  // ---------- раздел «Файлы»: что лежит в «Полученных», поиск, открыть, в корзину, слежение ----------
  const hidden = n => n === '.докачка' || n.startsWith('~$') || n === 'desktop.ini' || n === 'Thumbs.db';
  const inRecv = inRoots;
  async function dirSize(p, budget) {   // размер папки; на огромных — приблизительно (не больше budget записей)
    let s = 0;
    for (const en of await fsp.readdir(p, { withFileTypes: true }).catch(() => [])) {
      if (budget.n-- <= 0) { budget.cut = true; break; }
      const f = path.join(p, en.name);
      if (en.isDirectory()) s += await dirSize(f, budget); else if (en.isFile()) s += (await fsp.stat(f).catch(() => ({ size: 0 }))).size;
    }
    return s;
  }
  async function item(p, name) {
    const st = await fsp.stat(p).catch(() => null); if (!st) return null;
    const it = { name, path: p, dir: st.isDirectory(), mtime: st.mtimeMs, size: st.size };
    if (it.dir) { const b = { n: 20000 }; it.size = await dirSize(p, b); it.approx = !!b.cut; it.count = (await fsp.readdir(p).catch(() => [])).filter(n => !hidden(n)).length; }
    return it;
  }
  ipcMain.handle('kz:flist', async (e, p) => {
    await fsp.mkdir(recvDir(), { recursive: true });
    p = p ? String(p) : recvDir(); if (!inRecv(p)) p = recvDir();
    const root = allRoots().filter(r => p === r || inside(p, r)).sort((a, b) => b.length - a.length)[0] || recvDir();
    const items = [];
    for (const n of await fsp.readdir(p).catch(() => [])) { if (hidden(n)) continue; const it = await item(path.join(p, n), n); if (it) items.push(it); }
    return { root, path: p, items };
  });
  ipcMain.handle('kz:froots', async () => allRoots().map(r => ({ path: r, def: r === recvDir(), ok: fs.existsSync(r) })));
  ipcMain.handle('kz:fpickroot', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Куда складывать файлы по этому маршруту?', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return '';
    const p = r.filePaths[0]; if (p !== recvDir()) { roots.add(p); saveRoots(); rewatch(); }
    return p;
  });
  ipcMain.handle('kz:frootdel', (e, p) => { roots.delete(String(p || '')); saveRoots(); rewatch(); return true; });
  // кусок файла с диска — для просмотра архивов, документов, звука (только из корней маршрутов и своих отправленных)
  ipcMain.handle('kz:fslice', async (e, p, off, len) => {
    p = String(p || ''); if (!allowed(p)) throw new Error('нет доступа к файлу');
    off = Math.max(0, +off || 0); len = Math.max(0, Math.min(64 << 20, +len || 0));
    const h = await fsp.open(p, 'r');
    try { const b = Buffer.alloc(len); const { bytesRead } = await h.read(b, 0, len, off); return b.subarray(0, bytesRead); } finally { await h.close(); }
  });
  ipcMain.handle('kz:fsize', async (e, p) => { p = String(p || ''); if (!allowed(p)) return -1; const st = await fsp.stat(p).catch(() => null); return st && st.isFile() ? st.size : -1; });
  ipcMain.handle('kz:fsearch', async (e, q) => {
    q = String(q || '').toLowerCase().trim(); const out = []; if (!q) return out;
    let budget = 50000, root = '';
    async function go(d) {
      for (const en of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (out.length >= 300 || budget-- <= 0) return; if (hidden(en.name)) continue;
        const f = path.join(d, en.name);
        if (en.name.toLowerCase().includes(q)) { const it = await item(f, en.name); if (it) { const rel = path.relative(root, d); it.where = path.basename(root) + (rel ? '\\' + rel : ''); out.push(it); } }
        if (en.isDirectory()) await go(f);
      }
    }
    for (const r of allRoots()) { root = r; await go(r); }
    return out;
  });
  const allowed = p => inRecv(p) || sends.has(p) || [...sends].some(s => inside(p, s));
  ipcMain.handle('kz:fopenp', async (e, p) => { p = String(p || ''); if (!allowed(p) || !fs.existsSync(p)) return 'нет такого файла'; return shell.openPath(p); });
  ipcMain.handle('kz:ftrash', async (e, p) => {
    p = String(p || ''); if (!inRecv(p) || allRoots().includes(p)) return false;   // удаляем только полученное (не сами корни) и только в корзину
    await shell.trashItem(p); log('[файлы] в корзину', p); return true;
  });
  // небольшой файл из чата (он хранится в переписке) — сохранить в «Полученные», чтобы он был в разделе «Файлы»
  ipcMain.handle('kz:fsave', async (e, name, data, t) => {
    const dir = target(t); await fsp.mkdir(dir, { recursive: true });
    const to = freeName(dir, safeName(name));
    await fsp.writeFile(to, Buffer.from(data.buffer, data.byteOffset, data.byteLength)); return to;
  });
  // RAW с диска (полученный или свой отправленный): встроенная картинка и данные снимка
  const kzRaw = require('./rawprev.js');
  ipcMain.handle('kz:fpreview', async (e, p) => {
    p = String(p || ''); if (!allowed(p)) return null;
    const st = await fsp.stat(p).catch(() => null); if (!st || !st.isFile() || st.size > 400e6) return null;
    const u = new Uint8Array(await fsp.readFile(p)), pr = kzRaw.preview(u); if (!pr) return null;
    const info = kzRaw.info(u, pr.jpeg);
    return { jpeg: Buffer.from(pr.jpeg), w: pr.w, h: pr.h, orient: info.orient || 1, ex: kzRaw.summary(info) };
  });
  ipcMain.handle('kz:fexists', (e, p) => { p = String(p || ''); return allowed(p) && fs.existsSync(p); });
  // что-то поменяли в «Полученных» (в том числе через обычный проводник) — раздел «Файлы» перерисуется
  let watchers = [], watchT = 0, watching = false;
  function rewatch() {
    for (const w of watchers) try { w.close(); } catch (er) {}
    watchers = []; if (!watching) return;
    try { fs.mkdirSync(recvDir(), { recursive: true }); } catch (er) {}
    for (const r of allRoots()) try {
      const w = fs.watch(r, { recursive: true }, (ev, f) => {
        if (String(f || '').startsWith('.докачка')) return;
        clearTimeout(watchT); watchT = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('kz:fchanged'); }, 400);
      });
      w.on('error', () => {}); watchers.push(w);
    } catch (er) {}
  }
  ipcMain.handle('kz:fwatch', () => { if (!watching) { watching = true; rewatch(); } return true; });
}
