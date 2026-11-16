// Кинозал — настольное приложение (Electron)
const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const os = require('os');

// отдельный профиль: Kinozal.exe --profile=2 (удобно запустить две копии на одном компе)
const prof = process.argv.find(a => a.startsWith('--profile='));
if (prof) app.setPath('userData', path.join(app.getPath('appData'), 'Kinozal-' + prof.split('=')[1].replace(/[^\w-]/g, '')));

// только одно окно: повторный запуск (двойной клик, ярлык после установщика) показывает уже открытое
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => showWin());
function showWin() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); win.flashFrame(false);
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
app.on('before-quit', () => { quitting = true; });
function setupTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip(TITLE);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Кинозал', click: showWin },
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
  autoUpdater.on('error', e => { console.error('update:', e?.message || e); if (updState?.type !== 'downloaded') updState = null; });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 4000);
  setInterval(check, 4 * 3600 * 1000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0e1416', title: TITLE, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.on('close', e => {
    if (quitting || !tray) return;
    e.preventDefault(); win.hide();
    if (!trayHinted && Notification.isSupported()) {
      trayHinted = true;
      new Notification({ title: TITLE, body: 'Кинозал работает в фоне — сообщения и звонки будут приходить. Выйти: правый клик по значку у часов.', silent: true }).show();
    }
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
  if (startHidden) win.once('ready-to-show', () => win.hide());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
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
  ipcMain.handle('kz:autostart', (e, on) => {
    if (!app.isPackaged) return false;
    if (typeof on === 'boolean') app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
    return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  });

  createWindow();
  setupTray();
  setupUpdates();
});

app.on('window-all-closed', () => app.quit());
