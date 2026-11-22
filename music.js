// Кинозал — музыка: библиотека из папки на компьютере, теги и обложки, плеер с очередью,
// плейлисты и «любимое». Звук играет прямо с диска (kzmusic:// отдаёт только файлы из папки музыки).
// Подключается из messenger.js: window.kzMusic.mount({...}) — после того как построен каркас приложения.
(() => {
'use strict';
const APP = window.kinozalApp;
if (!APP?.music) return;   // только программа для Windows
const MU = APP.music;

const col = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const fmt = s => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 15 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
const svg = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const IC = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.2v13.6a1 1 0 0 0 1.5.9l9-6.8a1 1 0 0 0 0-1.8l-9-6.8A1 1 0 0 0 5 5.2zM17.5 5h2v14h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5.2v13.6a1 1 0 0 1-1.5.9l-9-6.8a1 1 0 0 1 0-1.8l9-6.8A1 1 0 0 1 19 5.2zM4.5 5h2v14h-2z"/></svg>',
  shuffle: svg('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>'),
  queue: svg('<path d="M3 6h13M3 12h13M3 18h9M19 14v6l4-3z"/>'),
  heart: svg('<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 22l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  note: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  vol: svg('<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};

// ---------- хранилище: теги и обложки кэшируются, чтобы не читать файлы каждый раз ----------
const idb = new Promise((res, rej) => {
  const r = indexedDB.open('kinozal-music', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('tracks', { keyPath: 'rel' }); r.result.createObjectStore('covers'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (name, mode, f) => { const db = await idb; return new Promise((res, rej) => { const t = db.transaction(name, mode), r = f(t.objectStore(name)); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); };

// ---------- библиотека ----------
const lib = new Map();     // rel → трек {rel, p, size, mtime, title, artist, album, year, track, cv, h, tagged}
let libRoot = '', scanning = false, again = false, hashIdx = null;
const cleanName = n => n.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
function fromName(rel) {
  let n = cleanName(rel.split(/[\\/]/).pop()), artist = '', title = n;
  n = n.replace(/^\d{1,3}\s*[-.)]\s*/, '');
  const i = n.indexOf(' - '); if (i > 0) { artist = n.slice(0, i).trim(); title = n.slice(i + 3).trim(); } else title = n;
  return { title: title || n, artist };
}
const mkTrack = (f, old) => ({ rel: f.rel, p: f.p, size: f.size, mtime: f.mtime, ...fromName(f.rel), album: '', year: '', track: 0, cv: 0, h: old?.h || '', tagged: 0 });
async function loadCache() {
  const all = await tx('tracks', 'readonly', s => s.getAll());
  for (const t of all || []) lib.set(t.rel, t);
}
async function readTags(t) {
  // у MP3 и FLAC метки в начале файла; у M4A — где угодно, поэтому читаем целиком (до 40 МБ)
  const head = async (o, n) => { const b = await MU.read(t.p, o, n); return b instanceof Uint8Array ? b : new Uint8Array(b); };
  let u;
  if (/\.(m4a|mp4|aac|alac)$/i.test(t.rel)) { if (t.size > 40e6) return null; u = await head(0, t.size); }
  else {
    const h10 = await head(0, 10);
    if (h10[0] === 0x49 && h10[1] === 0x44 && h10[2] === 0x33) u = await head(0, Math.min(t.size, 12e6, 10 + ((h10[6] << 21) | (h10[7] << 14) | (h10[8] << 7) | h10[9])));
    else if (h10[0] === 0x66 && h10[1] === 0x4C && h10[2] === 0x61 && h10[3] === 0x43) u = await head(0, Math.min(t.size, 12e6));
    else return null;
  }
  const src = { size: u.length, read: async (o, l) => u.subarray(o, o + l) };
  return window.kzView?.audioTags(src, t.rel) || null;
}
async function thumb(blob) {
  try {
    const bm = await createImageBitmap(blob), k = Math.min(1, 240 / Math.max(bm.width, bm.height)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bm.width * k)); cv.height = Math.max(1, Math.round(bm.height * k));
    cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height); bm.close?.();
    return await new Promise(r => cv.toBlob(r, 'image/jpeg', .82));
  } catch (e) { return null; }
}
async function tagJob(t) {
  try {
    const g = await readTags(t);
    if (g) {
      if (g.title) t.title = g.title; if (g.artist) t.artist = g.artist; if (g.album) t.album = g.album; if (g.year) t.year = g.year;
      if (g.track) t.track = g.track | 0;
      if (g.cover) { const b = await thumb(g.cover); if (b) { await tx('covers', 'readwrite', s => s.put(b, t.rel)); t.cv = 1; coverUrls.delete(t.rel); } }
    }
  } catch (e) { /* без тегов — останется имя файла */ }
  t.tagged = 1;
  await tx('tracks', 'readwrite', s => s.put(t)).catch(() => {});
}
async function pool(list, n, f) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const x = list[i++]; await f(x); } })); }
let hashing = false;
async function hashAll() {
  if (hashing) return; hashing = true;
  try { for (const t of [...lib.values()]) { if (t.h || !lib.has(t.rel)) continue; const h = await MU.hash(t.p).catch(() => ''); if (h) { t.h = h; hashIdx = null; await tx('tracks', 'readwrite', s => s.put(t)).catch(() => {}); } } } finally { hashing = false; }
}
async function refresh() {
  if (scanning) { again = true; return; }
  scanning = true; paintStatus();
  try {
    const r = await MU.scan(); libRoot = r.root;
    const seen = new Set(), todo = [];
    for (const f of r.files) {
      seen.add(f.rel);
      const old = lib.get(f.rel);
      if (old && old.size === f.size && old.mtime === f.mtime && old.tagged) { old.p = f.p; continue; }
      const t = mkTrack(f, old && old.size === f.size ? old : null); lib.set(f.rel, t); todo.push(t);
    }
    for (const rel of [...lib.keys()]) if (!seen.has(rel)) { lib.delete(rel); tx('tracks', 'readwrite', s => s.delete(rel)).catch(() => {}); tx('covers', 'readwrite', s => s.delete(rel)).catch(() => {}); coverUrls.delete(rel); }
    hashIdx = null; repaint();
    let tick = 0;
    await pool(todo, 3, async t => { await tagJob(t); if (++tick % 8 === 0) repaint(); });
    if (todo.length) repaint();
    cleanQueue();
  } catch (e) { console.warn('[музыка] список не прочитался', e); }
  finally { scanning = false; paintStatus(); if (again) { again = false; refresh(); } else hashAll(); }
}
const byHash = h => { if (!h) return null; if (!hashIdx) { hashIdx = new Map(); for (const t of lib.values()) if (t.h) hashIdx.set(t.h, t); } return hashIdx.get(h) || null; };

// ---------- обложки ----------
const coverUrls = new Map();   // rel → адрес картинки ('' — нет)
async function coverOf(t) {
  if (!t?.cv) return '';
  if (coverUrls.has(t.rel)) return coverUrls.get(t.rel);
  const b = await tx('covers', 'readonly', s => s.get(t.rel)).catch(() => null);
  const u = b ? URL.createObjectURL(b) : ''; coverUrls.set(t.rel, u); return u;
}
function coverEl(ts, cls) {   // ts — трек или список (берётся первая найденная обложка)
  const d = document.createElement('div'); d.className = 'mu-cv ' + (cls || ''); d.innerHTML = IC.note;
  const t = Array.isArray(ts) ? ts.find(x => x.cv) : ts;
  if (t?.cv) coverOf(t).then(u => { if (u) { d.style.backgroundImage = 'url("' + u + '")'; d.classList.add('has'); } });
  return d;
}

// ---------- плейлисты и «любимое» ----------
let PL = { fav: [], lists: [] };
let H = null;   // помощники из messenger.js
const loadPL = () => { try { const j = JSON.parse(H.store.get('musicPl', '{}')); PL = { fav: Array.isArray(j.fav) ? j.fav : [], lists: Array.isArray(j.lists) ? j.lists : [] }; } catch (e) { PL = { fav: [], lists: [] }; } };
const savePL = () => H.store.set('musicPl', JSON.stringify(PL));
const item = t => ({ r: t.rel, h: t.h || '' });
const resolve = it => lib.get(it.r) || byHash(it.h);
const plTracks = arr => arr.map(resolve).filter(Boolean);
const isFav = t => PL.fav.some(i => i.r === t.rel || (t.h && i.h === t.h));
function toggleFav(t) {
  const i = PL.fav.findIndex(x => x.r === t.rel || (t.h && x.h === t.h));
  if (i >= 0) PL.fav.splice(i, 1); else PL.fav.unshift(item(t));
  savePL(); repaint(); player.sync();
}
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- плеер ----------
const au = new Audio(); au.preload = 'auto';
const player = {
  orig: [], queue: [], qi: -1, shuffle: false, repeat: 'off', bars: new Set(), vol: 1, errs: 0,
  get cur() { return lib.get(this.queue[this.qi]) || null; },
  sync() { for (const b of this.bars) b.sync(); mediaMeta(); markRows(); }
};
function reshuffle(keep) {
  const rest = player.orig.filter(r => r !== keep);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  player.queue = keep ? [keep, ...rest] : rest; player.qi = keep ? 0 : -1;
}
function setQueue(list, start) {   // list — треки, start — с какого начать
  player.orig = list.map(t => t.rel);
  const first = list[start]?.rel;
  if (player.shuffle) reshuffle(first); else { player.queue = player.orig.slice(); player.qi = Math.max(0, start); }
  play();
}
function play() {
  const t = player.cur; if (!t) { au.pause(); player.sync(); return; }
  au.src = MU.url(t.p); au.play().catch(() => {}); player.sync();
}
function cleanQueue() {   // файл удалили — выкидываем из очереди
  const cur = player.queue[player.qi];
  player.orig = player.orig.filter(r => lib.has(r)); player.queue = player.queue.filter(r => lib.has(r));
  player.qi = cur && lib.has(cur) ? player.queue.indexOf(cur) : Math.min(player.qi, player.queue.length - 1);
}
function next(auto) {
  if (!player.queue.length) return;
  if (auto && player.repeat === 'one') { au.currentTime = 0; au.play().catch(() => {}); return; }
  if (player.qi + 1 < player.queue.length) { player.qi++; play(); return; }
  if (player.repeat === 'all' || (!auto && player.repeat !== 'off')) { if (player.shuffle) reshuffle(null); else player.qi = 0; play(); return; }
  if (!auto) { player.qi = 0; play(); return; }
  au.pause(); au.currentTime = 0; player.sync();   // дошли до конца очереди
}
function prev() {
  if (au.currentTime > 3 || player.qi <= 0) { au.currentTime = 0; return; }
  player.qi--; play();
}
const toggle = () => { if (!player.cur) return; au.paused ? au.play().catch(() => {}) : au.pause(); };
function enqueue(t, nextUp) {
  if (!player.queue.length) { setQueue([t], 0); return; }
  const at = nextUp ? player.qi + 1 : player.queue.length;
  player.queue.splice(at, 0, t.rel);
  if (nextUp) { const oi = player.orig.indexOf(player.queue[player.qi]); player.orig.splice(oi + 1, 0, t.rel); } else player.orig.push(t.rel);
  H.toast(nextUp ? 'Сыграет следующим' : 'Добавлено в очередь'); player.sync(); queuePaint?.();
}
au.addEventListener('ended', () => next(true));
au.addEventListener('play', () => player.sync());
au.addEventListener('pause', () => player.sync());
au.addEventListener('playing', () => { player.errs = 0; });
au.addEventListener('error', () => {
  const t = player.cur; if (!t) return;
  H.toast('Не получилось сыграть «' + t.title + '»');
  if (++player.errs < 5 && player.qi + 1 < player.queue.length) { player.qi++; play(); } else { player.errs = 0; player.sync(); }
});
au.addEventListener('timeupdate', () => { for (const b of player.bars) b.tick(); });
au.addEventListener('durationchange', () => { for (const b of player.bars) b.tick(); });
function seekTo(f) { if (isFinite(au.duration)) au.currentTime = Math.max(0, Math.min(1, f)) * au.duration; }
function setVol(v) { player.vol = Math.max(0, Math.min(1, v)); au.volume = player.vol; H.store.set('musicVol', String(player.vol)); for (const b of player.bars) b.sync(); }

// управление из системы: клавиши с мультимедиа, экран блокировки, значок громкости Windows
let lastMeta = '';
async function mediaMeta() {
  if (!('mediaSession' in navigator)) return;
  const t = player.cur; navigator.mediaSession.playbackState = !t ? 'none' : au.paused ? 'paused' : 'playing';
  if (!t) { navigator.mediaSession.metadata = null; lastMeta = ''; return; }
  if (lastMeta === t.rel) return; lastMeta = t.rel;
  const u = await coverOf(t);
  try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork: u ? [{ src: u, sizes: '240x240', type: 'image/jpeg' }] : [] }); } catch (e) {}
}
if ('mediaSession' in navigator) {
  const set = (n, f) => { try { navigator.mediaSession.setActionHandler(n, f); } catch (e) {} };
  set('play', () => au.play().catch(() => {})); set('pause', () => au.pause());
  set('previoustrack', prev); set('nexttrack', () => next(false));
  set('seekto', d => { if (isFinite(d.seekTime)) au.currentTime = d.seekTime; });
  set('seekbackward', d => { au.currentTime = Math.max(0, au.currentTime - (d.seekOffset || 10)); });
  set('seekforward', d => { au.currentTime = Math.min(au.duration || 1e9, au.currentTime + (d.seekOffset || 10)); });
  setInterval(() => { try { if (player.cur && isFinite(au.duration) && !au.paused) navigator.mediaSession.setPositionState({ duration: au.duration, position: Math.min(au.currentTime, au.duration), playbackRate: au.playbackRate }); } catch (e) {} }, 1000);
}

// ---------- интерфейс ----------
let shown = false, view = { tab: 'tracks', detail: null }, query = '', sortBy = 'title', limit = 200, queuePaint = null;
let host = null;   // контейнер раздела (#mxMain)
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ibtn = (icon, title, f, cls) => { const b = el('button', 'mu-ib' + (cls ? ' ' + cls : '')); b.innerHTML = icon; b.title = title; b.setAttribute('aria-label', title); b.onclick = e => { e.stopPropagation(); f(e); }; return b; };

// панель плеера: в разделе (подробная) и мини в боковой колонке
function playerBar(mini) {
  const bar = el('div', 'mu-bar' + (mini ? ' mini' : '')), cv = el('div', 'mu-cvh'), info = el('div', 'mu-info'), tt = el('b'), ar = el('span');
  info.append(tt, ar);
  const bPrev = ibtn(IC.prev, 'Предыдущий', prev), bPlay = ibtn(IC.play, 'Играть / пауза', toggle, 'big'), bNext = ibtn(IC.next, 'Следующий', () => next(false));
  const ctl = el('div', 'mu-ctl'); ctl.append(bPrev, bPlay, bNext);
  const seek = el('input', 'mu-seek'); seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0; seek.title = 'Перемотка';
  const tcur = el('span', 'mu-t', '0:00'), tall = el('span', 'mu-t', '0:00');
  let dragging = false;
  seek.oninput = () => { dragging = true; tcur.textContent = fmt(seek.value / 1000 * (au.duration || 0)); };
  seek.onchange = () => { seekTo(seek.value / 1000); dragging = false; };
  const open = () => { if (mini) H.openSelf(); };
  let shuf, rep, que, vol, fav;
  if (mini) { bar.append(cv, info, ctl); bar.onclick = open; }
  else {
    shuf = ibtn(IC.shuffle, 'Перемешать', () => { player.shuffle = !player.shuffle; H.store.set('musicShuffle', player.shuffle ? '1' : '0'); const c = player.queue[player.qi]; if (player.queue.length) { if (player.shuffle) reshuffle(c); else { player.queue = player.orig.slice(); player.qi = Math.max(0, player.queue.indexOf(c)); } } player.sync(); queuePaint?.(); });
    rep = ibtn(IC.repeat, 'Повтор: выкл', () => { player.repeat = { off: 'all', all: 'one', one: 'off' }[player.repeat]; H.store.set('musicRepeat', player.repeat); player.sync(); });
    que = ibtn(IC.queue, 'Очередь', () => queueDlg());
    fav = ibtn(IC.heart, 'В любимое', () => { const t = player.cur; if (t) toggleFav(t); }, 'fav');
    vol = el('input', 'mu-vol'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.title = 'Громкость'; vol.oninput = () => setVol(vol.value / 100);
    const mid = el('div', 'mu-mid'), line = el('div', 'mu-line'); line.append(tcur, seek, tall); mid.append(ctl, line);
    const vi = el('span', 'mu-vi'); vi.innerHTML = IC.vol;
    const right = el('div', 'mu-right'); right.append(fav, shuf, rep, que, vi, vol);
    bar.append(cv, info, mid, right);
  }
  bar.sync = () => {
    const t = player.cur; bar.classList.toggle('idle', !t);
    cv.textContent = ''; cv.append(coverEl(t || null));
    tt.textContent = t ? t.title : 'Ничего не играет'; ar.textContent = t ? [t.artist, t.album].filter(Boolean).join(' · ') : '';
    bPlay.innerHTML = au.paused ? IC.play : IC.pause;
    if (!mini) {
      shuf.classList.toggle('on', player.shuffle);
      rep.classList.toggle('on', player.repeat !== 'off'); rep.title = 'Повтор: ' + { off: 'выкл', all: 'очередь', one: 'один трек' }[player.repeat]; rep.dataset.one = player.repeat === 'one' ? '1' : '';
      vol.value = Math.round(player.vol * 100);
      fav.classList.toggle('on', !!t && isFav(t));
    }
    bar.tick();
  };
  bar.tick = () => {
    const d = au.duration, c = au.currentTime;
    if (mini) return;
    tall.textContent = isFinite(d) ? fmt(d) : '0:00';
    if (!dragging) { seek.value = isFinite(d) && d ? Math.round(c / d * 1000) : 0; tcur.textContent = fmt(c); }
    seek.style.setProperty('--p', (seek.value / 10) + '%');
  };
  bar.mini = mini; player.bars.add(bar); bar.sync();
  return bar;
}

// список всех звуковых файлов, отфильтрованный поиском
const text = t => (t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.rel).toLowerCase();
const matches = t => !query || query.toLowerCase().split(/\s+/).every(w => text(t).includes(w));
const sorters = {
  title: (a, b) => col.compare(a.title, b.title),
  artist: (a, b) => col.compare(a.artist || '￿', b.artist || '￿') || col.compare(a.album, b.album) || (a.track - b.track) || col.compare(a.title, b.title),
  date: (a, b) => b.mtime - a.mtime,
  album: (a, b) => col.compare(a.album || '￿', b.album || '￿') || (a.track - b.track) || col.compare(a.rel, b.rel)
};
const allTracks = () => [...lib.values()];
const albumsOf = list => {
  const m = new Map();
  for (const t of list) { const k = (t.album || 'Без альбома') + '\u0001' + (t.album ? (t.artist || '') : ''); let a = m.get(k); if (!a) m.set(k, a = { key: k, name: t.album || 'Без альбома', artist: t.album ? t.artist : '', tracks: [] }); a.tracks.push(t); }
  return [...m.values()].sort((a, b) => col.compare(a.name, b.name));
};
const artistsOf = list => {
  const m = new Map();
  for (const t of list) { const n = t.artist || 'Без исполнителя'; let a = m.get(n); if (!a) m.set(n, a = { name: n, tracks: [] }); a.tracks.push(t); }
  return [...m.values()].sort((a, b) => col.compare(a.name, b.name));
};

function trackRow(t, list, i, extra) {
  const r = el('div', 'mu-row'), cur = player.cur?.rel === t.rel;
  r.dataset.rel = t.rel; if (cur) r.classList.add('cur', au.paused ? 'paused' : 'playing');
  const tx = el('div', 'mu-tx'); tx.append(el('b', '', t.title), el('span', '', [t.artist, t.album].filter(Boolean).join(' · ') || t.rel));
  const play1 = el('div', 'mu-pl'); play1.innerHTML = cur && !au.paused ? IC.pause : IC.play;
  const cv = coverEl(t, 'sm'); cv.append(play1);
  r.append(cv, tx);
  if (extra) r.append(extra);
  const fav = ibtn(IC.heart, isFav(t) ? 'Убрать из любимого' : 'В любимое', () => toggleFav(t), 'fav' + (isFav(t) ? ' on' : ''));
  const more = ibtn(IC.more, 'Ещё', e => trackMenu(t, e.clientX, e.clientY, list));
  r.append(fav, more);
  r.onclick = () => { if (cur) toggle(); else setQueue(list, i); };
  r.oncontextmenu = e => { e.preventDefault(); trackMenu(t, e.clientX, e.clientY, list); };
  return r;
}
// какой трек играет сейчас — подсвечиваем в списке без перерисовки
function markRows() {
  if (!host) return; const c = player.cur?.rel;
  for (const r of host.querySelectorAll('.mu-row[data-rel]')) {
    const on = r.dataset.rel === c; r.classList.toggle('cur', on); r.classList.toggle('playing', on && !au.paused); r.classList.toggle('paused', on && au.paused);
    const p = r.querySelector('.mu-pl'); if (p) p.innerHTML = on && !au.paused ? IC.pause : IC.play;
  }
}
function menuAt(x, y, items) {
  document.querySelectorAll('.mx-pop').forEach(n => n.remove());
  const mn = el('div', 'menu fabmenu mx-pop mu-menu');
  Object.assign(mn.style, { position: 'fixed', left: Math.max(8, Math.min(x, innerWidth - 260)) + 'px', top: Math.max(8, Math.min(y, innerHeight - items.length * 44 - 20)) + 'px', bottom: 'auto', zIndex: 60 });
  for (const [ic, t, f, cls] of items) { const b = el('button', cls || ''); const i = el('i'); i.textContent = ic; b.append(i, document.createTextNode(t)); b.onclick = () => { mn.remove(); f(); }; mn.append(b); }
  document.body.append(mn); mn.addEventListener('click', e => e.stopPropagation());
}
function trackMenu(t, x, y, list) {
  const items = [
    ['▶', 'Играть', () => setQueue(list, Math.max(0, list.indexOf(t)))],
    ['⏭', 'Играть следующим', () => enqueue(t, true)],
    ['➕', 'В очередь', () => enqueue(t, false)],
    ['📋', 'В плейлист…', () => addToPlaylistDlg(t)],
    [isFav(t) ? '💔' : '♥', isFav(t) ? 'Убрать из любимого' : 'В любимое', () => toggleFav(t)],
    ['📂', 'Показать в папке', () => MU.show(t.p)]
  ];
  if (view.detail?.type === 'pl') items.push(['➖', 'Убрать из этого плейлиста', () => plRemove(view.detail.id, t)]);
  items.push(['🗑', 'В корзину', async () => { if (confirm('Переместить «' + t.title + '» в корзину? Файл удалится с компьютера.')) { if (await MU.trash(t.p)) { lib.delete(t.rel); cleanQueue(); repaint(); player.sync(); refresh(); } } }, 'danger']);
  menuAt(x, y, items);
}

function addToPlaylistDlg(t) {
  H.modal((card, close) => {
    card.append(el('h2', '', 'В плейлист'), el('p', '', '«' + t.title + '»'));
    const box = el('div', 'mu-pick');
    const add = (name, f, n) => { const b = el('button', 'mu-prow'); b.append(el('b', '', name), el('span', '', n != null ? n + ' ' + plural(n, 'трек', 'трека', 'треков') : '')); b.onclick = () => { f(); close(); }; box.append(b); };
    add('♥ Любимое', () => { if (!isFav(t)) toggleFav(t); H.toast('В любимом'); }, PL.fav.length);
    for (const l of PL.lists) add('📋 ' + l.name, () => { if (!l.items.some(i => i.r === t.rel)) { l.items.push(item(t)); savePL(); repaint(); } H.toast('Добавлено в «' + l.name + '»'); }, l.items.length);
    const nw = el('input'); nw.type = 'text'; nw.maxLength = 60; nw.placeholder = 'Новый плейлист — название';
    const mk = H.btnEl('Создать и добавить', 'pri', () => { const n = nw.value.trim().slice(0, 60); if (!n) { nw.focus(); return; } PL.lists.push({ id: uid(), name: n, items: [item(t)] }); savePL(); repaint(); H.toast('Создан плейлист «' + n + '»'); close(); });
    nw.addEventListener('keydown', e => { if (e.key === 'Enter') mk.click(); });
    const row = el('div', 'row'); row.append(H.btnEl('Отмена', '', close));
    card.append(box, nw, mk, row);
    setTimeout(() => nw.focus(), 50);
  });
}
function plRemove(id, t) { const l = PL.lists.find(x => x.id === id); if (!l) return; l.items = l.items.filter(i => i.r !== t.rel && (!t.h || i.h !== t.h)); savePL(); repaint(); }
function newPlaylistDlg(then) {
  H.modal((card, close) => {
    const nw = el('input'); nw.type = 'text'; nw.maxLength = 60; nw.placeholder = 'Название плейлиста';
    const ok = H.btnEl('Создать', 'pri', () => { const n = nw.value.trim().slice(0, 60); if (!n) { nw.focus(); return; } const l = { id: uid(), name: n, items: [] }; PL.lists.push(l); savePL(); close(); then ? then(l) : repaint(); });
    nw.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    const row = el('div', 'row'); row.append(H.btnEl('Отмена', '', close), ok);
    card.append(el('h2', '', 'Новый плейлист'), nw, row); setTimeout(() => nw.focus(), 50);
  });
}
function renameDlg(l) {
  H.modal((card, close) => {
    const nw = el('input'); nw.type = 'text'; nw.maxLength = 60; nw.value = l.name;
    const ok = H.btnEl('Сохранить', 'pri', () => { const n = nw.value.trim().slice(0, 60); if (!n) return; l.name = n; savePL(); close(); repaint(); });
    nw.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    const row = el('div', 'row'); row.append(H.btnEl('Отмена', '', close), ok);
    card.append(el('h2', '', 'Название плейлиста'), nw, row); setTimeout(() => { nw.focus(); nw.select(); }, 50);
  });
}
function queueDlg() {
  H.modal((card, close) => {
    const list = el('div', 'mu-queue');
    const paint = () => {
      if (!card.isConnected) { queuePaint = null; return; }
      list.textContent = '';
      if (!player.queue.length) { list.append(el('p', '', 'Очередь пуста — включи любой трек.')); return; }
      player.queue.forEach((rel, i) => {
        const t = lib.get(rel); if (!t) return;
        const r = el('div', 'mu-row sm' + (i === player.qi ? ' cur' : '') + (i < player.qi ? ' done' : ''));
        const tx = el('div', 'mu-tx'); tx.append(el('b', '', t.title), el('span', '', t.artist || ''));
        r.append(coverEl(t, 'sm'), tx);
        if (i !== player.qi) r.append(ibtn('✕', 'Убрать из очереди', () => { player.queue.splice(i, 1); player.orig = player.orig.filter(x => x !== rel); if (i < player.qi) player.qi--; player.sync(); paint(); }));
        r.onclick = () => { player.qi = i; play(); paint(); };
        list.append(r);
      });
      list.querySelector('.cur')?.scrollIntoView({ block: 'center' });
    };
    queuePaint = paint;
    const row = el('div', 'row'); row.append(H.btnEl('Очистить', '', () => { au.pause(); au.removeAttribute('src'); player.orig = []; player.queue = []; player.qi = -1; player.sync(); paint(); }), H.btnEl('Готово', 'pri', close));
    card.append(el('h2', '', 'Очередь'), list, row); card.classList.add('mu-qcard'); paint();
  });
}
function settingsDlg() {
  H.modal(async (card, close) => {
    const r = await MU.root();
    const row = el('div', 'row');
    row.append(
      H.btnEl('Открыть папку', '', () => MU.openDir()),
      H.btnEl('Сменить папку…', '', async () => { const p = await MU.pick(); if (p) { close(); lib.clear(); hashIdx = null; for (const s of ['tracks', 'covers']) tx(s, 'readwrite', st => st.clear()).catch(() => {}); coverUrls.clear(); repaint(); refresh(); } }),
      ...(r.def ? [] : [H.btnEl('Вернуть обычную', '', async () => { await MU.reset(); close(); lib.clear(); hashIdx = null; for (const s of ['tracks', 'covers']) tx(s, 'readwrite', st => st.clear()).catch(() => {}); coverUrls.clear(); repaint(); refresh(); })]),
      H.btnEl('Готово', 'pri', close));
    const code = el('code', 'mu-path', r.path);
    card.append(el('h2', '', 'Папка с музыкой'), el('p', '', 'Положи музыку в эту папку (можно по подпапкам) или перетащи файлы в окно — они появятся в списке сами. Правки в проводнике видны сразу.'), code, el('p', '', 'Тег и обложки читаются из файлов один раз и запоминаются. Сам звук с диска не уходит никуда.'), row);
  });
}

function head(title, back) {
  const hd = el('header', 'mx-chead mu-head');
  const b = el('button', 'ib back'); b.innerHTML = IC.back; b.title = 'К чатам'; b.onclick = () => H.close(); hd.append(b);
  if (back) { const bb = ibtn(IC.back, 'Назад', back, 'mu-back'); hd.append(bb); }
  hd.append(el('h2', '', title));
  return hd;
}
function statusText() {
  const n = lib.size; const pend = allTracks().filter(t => !t.tagged).length;
  return scanning ? 'Читаю папку…' + (pend ? ' (' + pend + ')' : '') : n + ' ' + plural(n, 'трек', 'трека', 'треков');
}
let statusEl = null;
function paintStatus() { if (statusEl) statusEl.textContent = statusText(); }

function emptyView() {
  const e = el('div', 'fempty mu-empty'); e.append(el('div', 'big', '🎵'), el('b', '', 'Здесь пока нет музыки'), el('span', '', 'Положи файлы в папку Кинозала или перетащи их в это окно. Подойдут MP3, FLAC, M4A, OGG, WAV и другие.'));
  const row = el('div', 'row'); row.style.justifyContent = 'center';
  row.append(H.btnEl('Добавить файлы…', 'pri', async () => { const n = await MU.pickFiles(); if (n) { H.toast('Добавлено: ' + n); refresh(); } }), H.btnEl('Открыть папку', '', () => MU.openDir()));
  e.append(row); return e;
}
const sortTracks = (list, k = sortBy) => list.slice().sort(sorters[k] || sorters.title);

function listView(tracks, opts = {}) {
  const wrap = el('div', 'mu-list');
  if (!tracks.length) { wrap.append(el('div', 'fempty', '')); wrap.firstChild.append(el('b', '', opts.empty || 'Ничего не нашлось')); return wrap; }
  const shown = tracks.slice(0, limit);
  shown.forEach((t, i) => wrap.append(trackRow(t, tracks, i, opts.extra?.(t))));
  if (tracks.length > shown.length) { const more = H.btnEl('Показать ещё ' + Math.min(200, tracks.length - shown.length), '', () => { limit += 200; repaint(); }); more.classList.add('mu-more'); wrap.append(more); }
  return wrap;
}
function groupCards(groups, kind) {
  const g = el('div', 'mu-grid');
  for (const a of groups.slice(0, 600)) {
    const c = el('button', 'mu-card'); c.append(coverEl(a.tracks, 'lg'), el('b', '', a.name), el('span', '', (a.artist ? a.artist + ' · ' : '') + a.tracks.length + ' ' + plural(a.tracks.length, 'трек', 'трека', 'треков')));
    c.onclick = () => { view.detail = { type: kind, key: a.key || a.name }; limit = 200; repaint(); };
    g.append(c);
  }
  return g;
}
const actions = (tracks, extra) => {
  const bar = el('div', 'mu-act');
  bar.append(H.btnEl('▶ Играть', 'pri', () => tracks.length && setQueue(tracks, 0)), H.btnEl('🔀 Вперемешку', '', () => { if (!tracks.length) return; player.shuffle = true; H.store.set('musicShuffle', '1'); setQueue(tracks, Math.floor(Math.random() * tracks.length)); }));
  for (const b of extra || []) bar.append(b);
  return bar;
};

function body() {
  const all = allTracks(), tabs = view.tab, d = view.detail, wrap = el('div', 'mu-body');
  if (!all.length && !scanning && !d) { wrap.append(emptyView()); return wrap; }
  if (d) {
    if (d.type === 'album') { const a = albumsOf(all).find(x => x.key === d.key); if (a) { const ts = a.tracks.slice().sort(sorters.album); wrap.append(el('h3', 'mu-h', a.name + (a.artist ? ' — ' + a.artist : '')), actions(ts), listView(ts)); return wrap; } }
    else if (d.type === 'artist') { const a = artistsOf(all).find(x => x.name === d.key); if (a) { const ts = a.tracks.slice().sort(sorters.artist); wrap.append(el('h3', 'mu-h', a.name), actions(ts), listView(ts)); return wrap; } }
    else if (d.type === 'pl') {
      const fav = d.id === 'fav', l = fav ? { id: 'fav', name: '♥ Любимое', items: PL.fav } : PL.lists.find(x => x.id === d.id);
      if (l) {
        const ts = plTracks(l.items); const ex = [];
        if (!fav) ex.push(H.btnEl('Переименовать', '', () => renameDlg(l)), H.btnEl('Удалить', '', () => { if (confirm('Удалить плейлист «' + l.name + '»? Сами файлы останутся.')) { PL.lists = PL.lists.filter(x => x !== l); savePL(); view.detail = null; repaint(); } }));
        wrap.append(el('h3', 'mu-h', l.name + ' · ' + ts.length), actions(ts, ex), listView(ts, { empty: 'Здесь пока пусто — добавь треки через «⋯ → В плейлист»' })); return wrap;
      }
    }
    view.detail = null;
  }
  if (tabs === 'tracks') {
    const ts = sortTracks(all.filter(matches));
    wrap.append(actions(ts, [sortSel()]), listView(ts));
  } else if (tabs === 'albums') {
    wrap.append(groupCards(albumsOf(all.filter(matches)), 'album'));
  } else if (tabs === 'artists') {
    wrap.append(groupCards(artistsOf(all.filter(matches)), 'artist'));
  } else {
    const g = el('div', 'mu-grid pl');
    const mkc = (id, name, tracks, n) => { const c = el('button', 'mu-card'); c.append(coverEl(tracks, 'lg'), el('b', '', name), el('span', '', n + ' ' + plural(n, 'трек', 'трека', 'треков'))); c.onclick = () => { view.detail = { type: 'pl', id }; limit = 200; repaint(); }; g.append(c); };
    mkc('fav', '♥ Любимое', plTracks(PL.fav), plTracks(PL.fav).length);
    for (const l of PL.lists) { const ts = plTracks(l.items); mkc(l.id, l.name, ts, ts.length); }
    const nw = el('button', 'mu-card new'); nw.append(el('div', 'mu-cv lg add', '＋'), el('b', '', 'Новый плейлист')); nw.onclick = () => newPlaylistDlg(); g.append(nw);
    wrap.append(g);
  }
  return wrap;
}
function sortSel() {
  const s = el('select', 'mu-sort'); for (const [k, t] of [['title', 'По названию'], ['artist', 'По исполнителю'], ['album', 'По альбому'], ['date', 'Сначала новые']]) { const o = el('option', '', t); o.value = k; s.append(o); }
  s.value = sortBy; s.onchange = () => { sortBy = s.value; H.store.set('musicSort', sortBy); repaint(); }; return s;
}

let gen = 0, paintT = 0;
function repaint() { if (!shown) return; clearTimeout(paintT); paintT = setTimeout(paint, 60); }
function paint() {
  if (!shown || !host) return; gen++;
  for (const b of [...player.bars]) if (!b.mini) player.bars.delete(b);   // панели прошлой отрисовки
  const keepTop = host.querySelector('.mu-scroll')?.scrollTop || 0, hadQ = document.activeElement?.classList.contains('mu-q');
  const sec = el('section', 'mx-files mu');
  const d = view.detail;
  const hd = head(d ? '' : 'Музыка', d ? () => { view.detail = null; limit = 200; repaint(); } : null);
  if (d) { hd.querySelector('h2').remove(); hd.append(el('h2', '', d.type === 'pl' ? 'Плейлист' : d.type === 'album' ? 'Альбом' : 'Исполнитель')); }
  const tabs = el('div', 'ftabs');
  for (const [k, t] of [['tracks', 'Треки'], ['albums', 'Альбомы'], ['artists', 'Исполнители'], ['pl', 'Плейлисты']]) { const b = el('button', 'ftab' + (view.tab === k && !d ? ' on' : ''), t); b.onclick = () => { view = { tab: k, detail: null }; limit = 200; repaint(); }; tabs.append(b); }
  hd.append(tabs);
  const bar = el('div', 'fbar mu-tool');
  const q = el('input', 'mu-q'); q.type = 'search'; q.placeholder = 'Поиск по названию, исполнителю, альбому'; q.value = query; q.autocomplete = 'off';
  q.oninput = () => { query = q.value; limit = 200; if (view.detail) view.detail = null; repaint(); };
  statusEl = el('span', 'mu-stat', statusText());
  const tools = el('div', 'mu-tools');
  tools.append(H.btnEl('＋ Добавить', '', async () => { const n = await MU.pickFiles(); if (n) { H.toast('Добавлено: ' + n); refresh(); } }), ibtn(IC.cog, 'Папка с музыкой', settingsDlg));
  bar.append(q, statusEl, tools);
  const scroll = el('div', 'mu-scroll'); scroll.append(body());
  sec.append(hd, bar, scroll, playerBar(false));
  // перетащили файлы из проводника — копируем в папку
  sec.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); sec.classList.add('drop'); } });
  sec.addEventListener('dragleave', e => { if (e.target === sec) sec.classList.remove('drop'); });
  sec.addEventListener('drop', async e => { e.preventDefault(); sec.classList.remove('drop'); const n = await MU.addDropped(e.dataTransfer.files); H.toast(n ? 'Добавлено: ' + n : 'Подходящей музыки не нашлось'); refresh(); });
  host.textContent = ''; host.append(sec); scroll.scrollTop = keepTop;
  if (hadQ) { const q2 = sec.querySelector('.mu-q'); q2?.focus(); q2?.setSelectionRange(q2.value.length, q2.value.length); }
}

// ---------- подключение к приложению ----------
let ready = false;
async function init() {
  if (ready) return; ready = true;
  loadPL();
  player.vol = Math.max(0, Math.min(1, +H.store.get('musicVol', '1') || 1)); au.volume = player.vol;
  player.shuffle = H.store.get('musicShuffle', '0') === '1'; player.repeat = ['off', 'all', 'one'].includes(H.store.get('musicRepeat', 'off')) ? H.store.get('musicRepeat', 'off') : 'off';
  sortBy = sorters[H.store.get('musicSort', 'title')] ? H.store.get('musicSort', 'title') : 'title';
  await loadCache().catch(() => {});
  MU.watch(() => { refresh(); });
  refresh();
}
window.kzMusic = {
  debug: () => ({ q: player.queue, qi: player.qi, paused: au.paused, err: au.error && au.error.message, code: au.error && au.error.code, src: au.src, t: au.currentTime, dur: au.duration, ready: au.readyState }),
  // H: {store, toast, modal, btnEl, host(): контейнер раздела, side: боковая колонка, openSelf(), close()}
  mount(h) {
    H = h; init();
    const mini = playerBar(true); mini.mini = true; const wrap = el('div', 'mu-mini'); wrap.append(mini); h.side.append(wrap);
    const upd = () => { wrap.hidden = !player.cur || shown; };
    const old = mini.sync; mini.sync = () => { old(); upd(); };
    mini.sync();
    return {
      show() { shown = true; host = H.host(); init(); paint(); upd(); refresh(); },
      hide() { shown = false; host = null; statusEl = null; queuePaint = null; upd(); },
      get shown() { return shown; }
    };
  }
};
})();
