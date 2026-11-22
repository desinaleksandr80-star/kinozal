// Кинозал — музыка на компьютере: своя папка, список файлов, отдача звука плееру, слежение за папкой.
// Страница читает звук по адресу kzmusic://… — только из папки музыки (а не любые файлы на диске).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fsp = fs.promises;

const AUDIO = /\.(mp3|flac|ogg|oga|opus|wav|m4a|aac|wma|aiff?|ape|wv|mka)$/i;
const MAX_FILES = 100000;

// до готовности приложения: схема kzmusic: с потоковой отдачей и доступом из Web Audio (эквалайзер и т. п.)
function register(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: 'kzmusic', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }]);
}

function setup({ app, ipcMain, dialog, shell, protocol, getWin, log, tag }) {
  const cfgFile = () => path.join(app.getPath('userData'), 'music.json');
  const hashFile = () => path.join(app.getPath('userData'), 'music-hash.json');
  const defRoot = () => path.join(app.getPath('downloads'), 'Кинозал', 'Музыка' + (tag || ''));   // не «Документы»: их часто синхронизирует OneDrive
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) || {}; } catch (e) {}
  const root = () => (cfg.root && path.isAbsolute(cfg.root)) ? cfg.root : defRoot();
  const saveCfg = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch (e) {} };
  const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
  const ok = p => { p = String(p || ''); return path.isAbsolute(p) && inside(p, root()) ? p : ''; };
  const mkroot = () => fsp.mkdir(root(), { recursive: true }).catch(() => {});

  // звук: kzmusic://f/<путь, закодированный>. Диапазоны (Range) обрабатываем сами: так у плеера сразу известна длина трека
  // и работает перемотка, а чужие файлы и пути с «..» не отдаются вообще
  const MIME = { mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', wma: 'audio/x-ms-wma', aif: 'audio/aiff', aiff: 'audio/aiff', mka: 'audio/x-matroska' };
  protocol.handle('kzmusic', async req => {
    try {
      const u = new URL(req.url), raw = decodeURIComponent(u.pathname.slice(1)), p = ok(raw);
      if (!p || !AUDIO.test(p)) { log('[музыка] отказ в доступе:', raw, '| папка:', root()); return new Response('нет доступа', { status: 403 }); }
      const size = (await fsp.stat(p)).size, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
      let start = 0, end = size - 1, status = 200;
      if (m && (m[1] || m[2])) {
        if (!m[1]) start = Math.max(0, size - +m[2]); else { start = +m[1]; if (m[2]) end = Math.min(size - 1, +m[2]); }
        if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
        status = 206;
      }
      if (!size) return new Response(null, { status: 200, headers: { 'Content-Length': '0' } });
      const headers = { 'Content-Type': MIME[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
      if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
      return new Response(require('stream').Readable.toWeb(fs.createReadStream(p, { start, end })), { status, headers });
    } catch (e) { return new Response('нет файла', { status: 404 }); }
  });

  ipcMain.handle('kz:mroot', async () => { await mkroot(); return { path: root(), def: root() === defRoot() }; });
  ipcMain.handle('kz:mpick', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Где лежит твоя музыка?', properties: ['openDirectory', 'createDirectory'], defaultPath: root() });
    if (r.canceled || !r.filePaths[0]) return '';
    cfg.root = r.filePaths[0]; saveCfg(); rewatch(); return cfg.root;
  });
  ipcMain.handle('kz:mreset', async () => { delete cfg.root; saveCfg(); rewatch(); await mkroot(); return root(); });

  // все звуковые файлы в папке (с вложенными)
  ipcMain.handle('kz:mscan', async () => {
    await mkroot();
    const out = []; let cut = false;
    async function go(d, depth) {
      if (depth > 12) return;
      for (const en of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (out.length >= MAX_FILES) { cut = true; return; }
        if (en.name.startsWith('.') || en.name.startsWith('~$')) continue;
        const f = path.join(d, en.name);
        if (en.isDirectory()) await go(f, depth + 1);
        else if (en.isFile() && AUDIO.test(en.name)) { const st = await fsp.stat(f).catch(() => null); if (st) out.push({ p: f, rel: path.relative(root(), f), size: st.size, mtime: Math.round(st.mtimeMs) }); }
      }
    }
    await go(root(), 0);
    return { root: root(), files: out, cut };
  });

  // начало файла — для тегов и обложки
  ipcMain.handle('kz:mread', async (e, p, off, len) => {
    p = ok(p); if (!p) throw new Error('нет доступа к файлу');
    off = Math.max(0, +off || 0); len = Math.max(0, Math.min(48 << 20, +len || 0));
    const h = await fsp.open(p, 'r');
    try { const b = Buffer.alloc(len); const { bytesRead } = await h.read(b, 0, len, off); return b.subarray(0, bytesRead); } finally { await h.close(); }
  });

  // SHA-256 файла: по нему узнаём один и тот же трек у разных людей и ловим дубликаты
  let hashes = {}; try { hashes = JSON.parse(fs.readFileSync(hashFile(), 'utf8')) || {}; } catch (e) {}
  let hashT = 0;
  const saveHashes = () => { clearTimeout(hashT); hashT = setTimeout(() => { try { fs.writeFileSync(hashFile(), JSON.stringify(hashes)); } catch (e) {} }, 2000); };
  let hashQ = Promise.resolve();
  ipcMain.handle('kz:mhash', (e, p) => {
    p = ok(p); if (!p) return '';
    const run = async () => {
      const st = await fsp.stat(p).catch(() => null); if (!st) return '';
      const key = p + '|' + st.size + '|' + Math.round(st.mtimeMs);
      if (hashes[key]) return hashes[key];
      const h = crypto.createHash('sha256');
      await new Promise((res, rej) => { const s = fs.createReadStream(p); s.on('data', c => h.update(c)); s.on('end', res); s.on('error', rej); }).catch(() => { throw new Error('не прочитался'); });
      const hex = h.digest('hex');
      for (const k of Object.keys(hashes)) if (k.startsWith(p + '|')) delete hashes[k];
      hashes[key] = hex; saveHashes(); return hex;
    };
    return (hashQ = hashQ.then(run, run).catch(() => ''));   // по одному, чтобы не душить диск
  });

  // добавить файлы в библиотеку: копия в папку музыки (с новым именем, если такое есть)
  const freeName = (dir, name) => {
    const ext = path.extname(name), base = path.basename(name, ext); let to = path.join(dir, name), i = 1;
    while (fs.existsSync(to)) to = path.join(dir, base + ' (' + (++i) + ')' + ext);
    return to;
  };
  async function addFiles(list) {
    await mkroot(); let n = 0;
    const one = async p => {
      if (inside(p, root())) return;   // и так уже в библиотеке
      const st = await fsp.stat(p).catch(() => null); if (!st || !st.isFile()) return;
      await fsp.copyFile(p, freeName(root(), path.basename(p))); n++;
    };
    const dir = async (d, depth) => {   // перетащили папку — берём музыку из неё
      if (depth > 6 || inside(d, root()) || n >= 5000) return;
      for (const en of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (en.name.startsWith('.')) continue;
        const f = path.join(d, en.name);
        if (en.isDirectory()) await dir(f, depth + 1); else if (en.isFile() && AUDIO.test(en.name)) await one(f).catch(() => {});
      }
    };
    for (let p of list) {
      p = String(p || ''); if (!path.isAbsolute(p)) continue;
      if (AUDIO.test(p)) await one(p).catch(() => {});
      else { const st = await fsp.stat(p).catch(() => null); if (st && st.isDirectory()) await dir(p, 0); }
    }
    log('[музыка] добавлено файлов', n); return n;
  }
  ipcMain.handle('kz:madd', async (e, list) => addFiles([].concat(list || []).slice(0, 5000)));
  ipcMain.handle('kz:mpickfiles', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Какую музыку добавить?', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Музыка', extensions: ['mp3', 'flac', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'wma', 'aif', 'aiff', 'ape', 'wv', 'mka'] }] });
    if (r.canceled) return 0;
    return addFiles(r.filePaths);
  });
  // текст песни рядом с файлом: «Трек.lrc» (с метками времени) или «Трек.txt»
  ipcMain.handle('kz:mlyrics', async (e, p) => {
    p = ok(p); if (!p) return '';
    const base = p.slice(0, p.length - path.extname(p).length);
    for (const ext of ['.lrc', '.LRC', '.txt']) {
      try {
        const b = await fsp.readFile(base + ext); if (b.length > 300e3) continue;
        let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (er) { s = new TextDecoder('windows-1251').decode(b); }
        return s.replace(/^\uFEFF/, '');
      } catch (er) { /* нет такого файла */ }
    }
    return '';
  });
  // трек, который друг докачивает во время совместного прослушивания: пишем в «Общая от друзей», сверяем SHA-256 и только тогда оставляем
  const saves = new Map();
  const safeName = s => (String(s || 'трек').replace(/[\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 120)) || 'трек';
  ipcMain.handle('kz:msaveopen', async (e, id, name) => {
    id = String(id || ''); if (!/^[\w-]{3,40}$/.test(id) || saves.size > 4) return false;
    let n = safeName(name); if (!AUDIO.test(n)) n += '.mp3';
    const dir = path.join(root(), 'Общая от друзей'); await fsp.mkdir(dir, { recursive: true });
    const to = freeName(dir, n), tmp = to + '.part', h = await fsp.open(tmp, 'w');
    saves.set(id, { h, tmp, to, got: 0 }); return true;
  });
  ipcMain.handle('kz:msavewrite', async (e, id, off, data) => {
    const s = saves.get(String(id)); if (!s) return false;
    const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength); if (s.got + b.length > 400e6) return false;
    await s.h.write(b, 0, b.length, Math.max(0, +off || 0)); s.got += b.length; return true;
  });
  ipcMain.handle('kz:msavedone', async (e, id, want) => {
    id = String(id); const s = saves.get(id); if (!s) return { ok: false };
    saves.delete(id); await s.h.close().catch(() => {});
    const h = crypto.createHash('sha256');
    try { await new Promise((res, rej) => { const st = fs.createReadStream(s.tmp); st.on('data', c => h.update(c)); st.on('end', res); st.on('error', rej); }); } catch (er) { await fsp.unlink(s.tmp).catch(() => {}); return { ok: false }; }
    const hex = h.digest('hex');
    if (want && hex !== String(want)) { await fsp.unlink(s.tmp).catch(() => {}); log('[музыка] докачанный файл не прошёл проверку', s.to); return { ok: false, hash: hex }; }
    await fsp.rename(s.tmp, s.to); const st = await fsp.stat(s.to);
    hashes[s.to + '|' + st.size + '|' + Math.round(st.mtimeMs)] = hex; saveHashes();   // хэш уже известен — второй раз файл читать не надо
    log('[музыка] докачан файл', s.to); return { ok: true, hash: hex, p: s.to };
  });
  ipcMain.handle('kz:msavedrop', async (e, id) => { id = String(id); const s = saves.get(id); if (!s) return false; saves.delete(id); await s.h.close().catch(() => {}); await fsp.unlink(s.tmp).catch(() => {}); return true; });
  ipcMain.handle('kz:mshow', (e, p) => { p = ok(p); if (p) shell.showItemInFolder(p); else shell.openPath(root()); return true; });
  ipcMain.handle('kz:mopen', async () => { await mkroot(); return shell.openPath(root()); });
  ipcMain.handle('kz:mtrash', async (e, p) => { p = ok(p); if (!p) return false; await shell.trashItem(p); log('[музыка] в корзину', p); return true; });

  // слежение: изменили папку в проводнике — страница перечитает список
  let watcher = null, watchT = 0, watching = false;
  function rewatch() {
    try { watcher?.close(); } catch (e) {} watcher = null; if (!watching) return;
    mkroot().then(() => {
      try {
        watcher = fs.watch(root(), { recursive: true }, (ev, f) => {
          if (String(f || '').endsWith('.part')) return;   // файл ещё докачивается
          clearTimeout(watchT); watchT = setTimeout(() => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('kz:mchanged'); }, 800); });
        watcher.on('error', () => {});
      } catch (e) {}
    });
  }
  ipcMain.handle('kz:mwatch', () => { if (!watching) { watching = true; rewatch(); } return true; });
}

module.exports = { register, setup };
