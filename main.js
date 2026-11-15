// Кинозал — настольное приложение (Electron)
const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell } = require('electron');
const path = require('path');

// отдельный профиль: Kinozal.exe --profile=2 (удобно запустить две копии на одном компе)
const prof = process.argv.find(a => a.startsWith('--profile='));
if (prof) app.setPath('userData', path.join(app.getPath('appData'), 'Kinozal-' + prof.split('=')[1].replace(/[^\w-]/g, '')));

// только одно окно: повторный запуск (двойной клик, ярлык после установщика) показывает уже открытое
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});

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
  win.on('page-title-updated', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
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
  ipcMain.handle('kz:updState', () => updState);
  ipcMain.handle('kz:install', () => { if (updState?.type === 'downloaded') setImmediate(() => autoUpdater.quitAndInstall(true, true)); });

  createWindow();
  setupUpdates();
});

app.on('window-all-closed', () => app.quit());
