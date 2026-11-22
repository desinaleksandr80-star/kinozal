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
  sliders: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  lyr: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};

// ---------- хранилище: теги и обложки кэшируются, чтобы не читать файлы каждый раз ----------
const idb = new Promise((res, rej) => {
  const r = indexedDB.open('kinozal-music', 2);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'rel' });
    if (!db.objectStoreNames.contains('covers')) db.createObjectStore('covers');
    if (!db.objectStoreNames.contains('plays')) db.createObjectStore('plays', { keyPath: 'id' });   // что и сколько слушал — для «Итогов»
  };
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
  t.busy = 1;
  try {
    const g = await readTags(t);
    if (g) {
      if (g.title) t.title = g.title; if (g.artist) t.artist = g.artist; if (g.album) t.album = g.album; if (g.year) t.year = g.year;
      if (g.track) t.track = g.track | 0;
      if (g.lyrics) t.ly = g.lyrics;
      if (g.cover) { const b = await thumb(g.cover); if (b) { await tx('covers', 'readwrite', s => s.put(b, t.rel)); t.cv = 1; coverUrls.delete(t.rel); } }
    }
  } catch (e) { /* без тегов — останется имя файла */ }
  t.tagged = 1; delete t.busy;
  await tx('tracks', 'readwrite', s => s.put(t)).catch(() => {});
}
async function pool(list, n, f) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const x = list[i++]; await f(x); } })); }
let durBusy = false;
const key = t => t.rel + '|' + t.size + '|' + t.mtime;
async function durAll() {   // длина каждого трека: читаем только заголовок файла, один раз
  if (durBusy) return; durBusy = true;
  const tried = new Set();
  try {
    for (;;) {
      const todo = [...lib.values()].filter(t => !t.dur && !tried.has(key(t)));   // список могли обновить, пока читали, — берём заново
      if (!todo.length) break;
      await pool(todo, 3, t => new Promise(res => {
        tried.add(key(t));
        const a = new Audio(); a.preload = 'metadata';
        const done = () => { clearTimeout(to); a.onloadedmetadata = a.ondurationchange = a.onerror = null; a.removeAttribute('src'); res(); };
        const to = setTimeout(done, 8000);
        const got = () => {   // у некоторых файлов длина известна не сразу — ждём durationchange
          if (!isFinite(a.duration)) return;
          const c = lib.get(t.rel); if (c) { c.dur = Math.max(1, Math.round(a.duration)); tx('tracks', 'readwrite', s => s.put(c)).catch(() => {}); }
          done();
        };
        a.onloadedmetadata = got; a.ondurationchange = got;
        a.onerror = done; a.src = MU.url(t.p);
      }));
      repaint();
    }
  } finally { durBusy = false; }
}
let hashing = false;
async function hashAll() {
  if (hashing) return; hashing = true;
  const tried = new Set();
  try {
    for (;;) {
      const t = [...lib.values()].find(x => !x.h && !tried.has(key(x))); if (!t) break;
      tried.add(key(t));
      const h = await MU.hash(t.p).catch(() => '');
      const c = lib.get(t.rel); if (h && c) { c.h = h; hashIdx = null; healItems(c); await tx('tracks', 'readwrite', s => s.put(c)).catch(() => {}); }
    }
  } finally { hashing = false; }
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
      if (old && old.size === f.size && old.mtime === f.mtime && (old.tagged || old.busy)) { old.p = f.p; continue; }   // уже прочитан или читается прямо сейчас
      const t = mkTrack(f, old && old.size === f.size ? old : null); lib.set(f.rel, t); todo.push(t);
    }
    for (const rel of [...lib.keys()]) if (!seen.has(rel)) { lib.delete(rel); tx('tracks', 'readwrite', s => s.delete(rel)).catch(() => {}); tx('covers', 'readwrite', s => s.delete(rel)).catch(() => {}); coverUrls.delete(rel); }
    hashIdx = null; repaint();
    let tick = 0;
    await pool(todo, 3, async t => { await tagJob(t); if (++tick % 8 === 0) repaint(); });
    if (todo.length) repaint();
    cleanQueue();
  } catch (e) { console.warn('[музыка] список не прочитался', e); }
  finally { scanning = false; paintStatus(); if (again) { again = false; refresh(); } else { durAll(); hashAll(); } }
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

// ---------- плейлисты = реакции ----------
// Плейлист — это «полка» с эмодзи и названием. Реакция на трек — положить его на полку (и убрать обратно).
// Каждую полку можно назвать как хочется («для дороги»), поменять эмодзи, завести свою. Любую полку, и ❤️ Любимое тоже, можно переименовать, переставить, очистить или удалить.
// Реакцию можно поставить на секунду трека — тогда на перемотке появится метка этой полки.
let PL = { lists: [] };   // lists: [{id, emoji, name, items: [{r: имя файла, h: хэш, m: [секунды]}]}]
let FR = {};              // «вайб» друзей: ключ трека → {id друга: [эмодзи]}
let H = null;             // помощники из messenger.js
const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_LISTS = [['fav', '❤️', 'Любимое'], ['fire', '🔥', 'Огонь'], ['night', '🌙', 'Ночное'], ['dance', '💃', 'Танцевать'], ['gym', '🏋️', 'Тренировка'], ['road', '🚗', 'В дорогу'], ['sad', '😢', 'Грустное']];
const savePL = () => H.store.set('musicPl2', JSON.stringify(PL));
const saveFR = () => H.store.set('musicFr', JSON.stringify(FR));
function loadPL() {
  try { FR = JSON.parse(H.store.get('musicFr', '{}')) || {}; } catch (e) { FR = {}; }
  try {
    const j = JSON.parse(H.store.get('musicPl2', 'null'));
    if (j && Array.isArray(j.lists)) {
      PL = { lists: j.lists.filter(l => l && l.id).map(l => ({ id: String(l.id), emoji: String(l.emoji || '🎵').slice(0, 8), name: String(l.name || 'Плейлист').slice(0, 40), items: Array.isArray(l.items) ? l.items.map(i => ({ r: String(i.r || ''), h: String(i.h || ''), m: Array.isArray(i.m) ? i.m.map(Number).filter(Number.isFinite) : [] })) : [] })) };
      return;   // что осталось, то и есть: любую полку, и «Любимое» тоже, можно удалить
    }
  } catch (e) { /* ниже соберём заново */ }
  // первый запуск или переезд со старого устройства хранения: прежние «любимое», плейлисты и реакции становятся полками
  const L = DEFAULT_LISTS.map(([id, emoji, name]) => ({ id, emoji, name, items: [] }));
  let oldPl = {}, oldRx = {};
  try { oldPl = JSON.parse(H.store.get('musicPl', '{}')) || {}; } catch (e) {}
  try { oldRx = JSON.parse(H.store.get('musicRx', '{}')) || {}; } catch (e) {}
  const mk = (r, h, m) => ({ r: String(r || ''), h: String(h || ''), m: m || [] });
  for (const i of oldPl.fav || []) L[0].items.push(mk(i.r, i.h));
  for (const l of oldPl.lists || []) L.push({ id: String(l.id || uid()), emoji: '📋', name: String(l.name || 'Плейлист').slice(0, 40), items: (l.items || []).map(i => mk(i.r, i.h)) });
  const byEmoji = e => { let l = L.find(x => x.emoji === e); if (!l) { l = { id: uid(), emoji: e, name: (oldRx.custom || []).find(c => c.e === e)?.name || e, items: [] }; L.push(l); } return l; };
  for (const [k, o] of Object.entries(oldRx.on || {})) for (const [e, v] of Object.entries(o)) { const hex = /^[0-9a-f]{64}$/.test(k); byEmoji(e).items.push(mk(hex ? '' : k, hex ? k : '', (v.m || []).slice())); }
  if (oldRx.friends && !Object.keys(FR).length) { FR = oldRx.friends; saveFR(); }
  PL = { lists: L }; savePL();
}
const plById = id => PL.lists.find(l => l.id === id);
const favList = () => plById('fav');
const resolve = it => lib.get(it.r) || byHash(it.h);
const itemOf = (l, t) => l.items.find(i => (i.r && i.r === t.rel) || (t.h && i.h && i.h === t.h));
const inList = (l, t) => !!itemOf(l, t);
const listsOf = t => PL.lists.filter(l => inList(l, t));
const plTracks = l => { const seen = new Set(); return l.items.map(resolve).filter(t => t && !seen.has(t.rel) && seen.add(t.rel)); };
const isFav = t => !!favList() && inList(favList(), t);
const rxKey = t => t.h || t.rel;
const rxFriends = t => FR[t.h] || FR[t.rel] || null;
function healItems(t) {   // посчитали хэш — полки и «вайб» друзей запоминают трек по хэшу: переименование и перенос файла их не теряют
  if (!t.h) return; let ch = false;
  for (const l of PL.lists) for (const i of l.items) if (i.r === t.rel && !i.h) { i.h = t.h; ch = true; }
  if (ch) savePL();
  if (FR[t.rel] && t.rel !== t.h) { FR[t.h] = Object.assign(FR[t.h] || {}, FR[t.rel]); delete FR[t.rel]; saveFR(); }
}
function toggleIn(l, t, pos) {   // pos == null — трек целиком; число — ещё и момент трека
  const it = itemOf(l, t);
  if (pos == null) { if (it) l.items = l.items.filter(i => i !== it); else l.items.unshift({ r: t.rel, h: t.h || '', m: [] }); }
  else {
    const p = Math.round(pos);
    if (it) { if (!it.m.includes(p)) it.m.push(p); } else l.items.unshift({ r: t.rel, h: t.h || '', m: [p] });
  }
  savePL(); repaint(); player.sync();
}
const toggleFav = t => { const l = favList() || newList('❤️', 'Любимое', 'fav'); toggleIn(l, t); };   // удалили «Любимое» — сердечко заведёт его заново
function newList(emoji, name, id) { const l = { id: id || uid(), emoji, name, items: [] }; PL.lists.push(l); savePL(); return l; }
function delList(l) { PL.lists = PL.lists.filter(x => x !== l); savePL(); }
function moveList(l, d) { const i = PL.lists.indexOf(l), j = i + d; if (i < 0 || j < 0 || j >= PL.lists.length) return; PL.lists.splice(i, 1); PL.lists.splice(j, 0, l); savePL(); repaint(); }
// меню полки: всё можно изменить — название, эмодзи, порядок, очистить, удалить (и «Любимое» тоже)
function listMenu(x, y, l, play) {
  const items = [];
  if (play) items.push(['▶', 'Играть', () => play()], ['🌙', 'Фоном', () => { const t = plTracks(l); if (t.length) bgStart({ kind: 'pl', id: l.id, emoji: l.emoji, name: l.name, tracks: t }); }]);
  const i = PL.lists.indexOf(l);
  items.push(['✎', 'Название и эмодзи…', () => listDlg(l)]);
  if (i > 0) items.push(['⬅', 'Поставить раньше', () => moveList(l, -1)]);
  if (i < PL.lists.length - 1) items.push(['➡', 'Поставить позже', () => moveList(l, 1)]);
  if (l.items.length) items.push(['🧹', 'Очистить полку', () => { if (confirm('Убрать все треки с полки «' + l.name + '»? Сами файлы останутся.')) { l.items = []; savePL(); repaint(); player.sync(); } }]);
  items.push(['🗑', 'Удалить полку', () => { if (confirm('Удалить полку «' + l.name + '»? Сами треки останутся на месте.')) { delList(l); if (view.detail?.id === l.id) view.detail = null; repaint(); player.sync(); } }, 'danger']);
  menuAt(x, y, items);
}

// окно «Полка»: название и эмодзи (новая или изменить)
const QUICK_EMOJI = ['🔥', '😢', '💃', '🌙', '🏋️', '🚗', '❤️', '😂', '🎸', '🎧', '☕', '🌅', '🧘', '🎉', '🥃', '🌧️', '💪', '🛏️', '🎹', '🕺'];
function listDlg(l, then) {
  H.modal((card, close) => {
    card.classList.add('mu-ldlg');
    const em = el('input', 'mu-emo'), nm = el('input'); em.type = nm.type = 'text'; em.maxLength = 8; nm.maxLength = 40;
    em.value = l?.emoji || '🎵'; nm.value = l?.name || ''; nm.placeholder = 'Название — например «для дороги»';
    const quick = el('div', 'mu-quick');
    for (const e of QUICK_EMOJI) { const b = el('button', ''); b.type = 'button'; b.textContent = e; b.onclick = () => { em.value = e; }; quick.append(b); }
    const save = H.btnEl(l ? 'Сохранить' : 'Создать полку', 'pri', () => {
      const n = nm.value.trim().slice(0, 40), e = [...em.value.trim()].slice(0, 2).join('') || '🎵'; if (!n) { nm.focus(); return; }
      let x = l; if (x) { x.emoji = e; x.name = n; savePL(); } else x = newList(e, n);
      close(); repaint(); player.sync(); then?.(x);
    });
    nm.addEventListener('keydown', e => { if (e.key === 'Enter') save.click(); });
    const row = el('div', 'row');
    if (l) row.append(H.btnEl('Удалить полку', '', () => { if (confirm('Удалить полку «' + l.name + '»? Сами треки останутся на месте.')) { delList(l); close(); if (view.detail?.id === l.id) view.detail = null; repaint(); player.sync(); } }));
    if (l && l.items.length) row.append(H.btnEl('Очистить', '', () => { if (confirm('Убрать все треки с полки «' + l.name + '»? Сами файлы останутся.')) { l.items = []; savePL(); close(); repaint(); player.sync(); } }));
    row.append(H.btnEl('Отмена', '', close), save);
    const top = el('div', 'mu-ltop'); top.append(em, nm);
    card.append(el('h2', '', l ? 'Полка' : 'Новая полка'), el('p', '', 'Полка — это плейлист и реакция сразу: положил трек на «🔥 Огонь» — он оказался в этом плейлисте, а друзья в прослушивании увидят твой огонь.'), top, quick, row);
    setTimeout(() => { nm.focus(); nm.select(); }, 50);
  });
}
// палитра «на какие полки положить трек»: нажатие — положить или убрать, можно сразу на несколько
function fly(e, who) {   // летающая эмодзи — своя и друзей
  const n = el('div', 'mu-fly'); n.textContent = e; if (who) n.append(el('small', '', who));
  n.style.left = (35 + Math.random() * 40) + '%'; document.body.append(n); setTimeout(() => n.remove(), 2800);
}
function shelfPalette(x, y, t, pos) {
  document.querySelectorAll('.mx-pop').forEach(n => n.remove());
  const pal = el('div', 'menu mx-pop mu-pal');
  Object.assign(pal.style, { position: 'fixed', left: Math.max(8, Math.min(x, innerWidth - 340)) + 'px', top: Math.max(8, Math.min(y, innerHeight - 70 - Math.ceil((PL.lists.length + 1) / 4) * 74)) + 'px', zIndex: 60 });
  pal.append(el('div', 'mu-pt', pos != null ? 'Реакция на ' + fmt(pos) + ' — «' + t.title + '»' : 'Куда положить «' + t.title + '»'));
  const grid = el('div', 'mu-pg');
  const paint = () => {
    grid.textContent = '';
    for (const l of PL.lists) {
      const b = el('button', 'mu-pc' + (inList(l, t) ? ' on' : '')); b.append(el('i', '', l.emoji), el('span', '', l.name)); b.title = l.name;
      b.onclick = () => { const was = inList(l, t); toggleIn(l, t, pos); if (pos != null || !was) { fly(l.emoji); netReact(t, l.emoji, pos); } paint(); };
      grid.append(b);
    }
    const add = el('button', 'mu-pc add'); add.append(el('i', '', '＋'), el('span', '', 'Новая')); add.onclick = () => { pal.remove(); listDlg(null, l => { toggleIn(l, t, pos); fly(l.emoji); netReact(t, l.emoji, pos); }); }; grid.append(add);
  };
  paint(); pal.append(grid);
  document.body.append(pal); pal.addEventListener('click', e => e.stopPropagation());
}
function rxChips(t) {   // эмодзи полок, на которых лежит трек, и (бледнее) эмодзи друзей
  const mine = listsOf(t), fr = rxFriends(t); if (!mine.length && !fr) return null;
  const s = el('span', 'mu-rxs'), seen = new Set();
  for (const l of mine) { seen.add(l.emoji); const i = el('i', 'me', l.emoji); i.title = l.name; s.append(i); }
  for (const [uid2, list] of Object.entries(fr || {})) for (const e of list) if (!seen.has(e)) { seen.add(e); const i = el('i', 'fr', e); i.title = H.net.nameOf(uid2) + ': ' + e; s.append(i); }
  return s;
}

// ---------- плеер ----------
// Две «деки» (два <audio>) через Web Audio: пока играет одна, вторая заранее грузит следующий трек.
// Так получаются переход без паузы (gapless) и плавное перетекание (кроссфейд). Дальше звук идёт через эквалайзер.
// эквалайзер из трёх привычных полос: низкие, средние, высокие
const EQ_BANDS = [
  { f: 200, type: 'lowshelf', q: 1, name: 'Низкие', hint: 'бас, до 200 Гц' },
  { f: 1000, type: 'peaking', q: 0.7, name: 'Средние', hint: 'голос, около 1 кГц' },
  { f: 4000, type: 'highshelf', q: 1, name: 'Высокие', hint: 'звон, от 4 кГц' }
];
const EQ_PRESETS = { flat: ['Ровный', [0, 0, 0]], bass: ['Бас', [6, -1, 0]], voice: ['Голос', [-3, 4, 1]], bright: ['Яркий', [-2, 1, 5]], soft: ['Мягкий', [3, 0, -4]] };
const EQ_MAX = 12;
const sleep = { until: 0, endOfTrack: false, t: 0 };
let actx = null, master = null, eqNodes = [], decks = null, deckI = 0, nextT = 0, fadeT = 0;
const idleEl = new Audio();   // пока ничего не играло — на нём читаем «пусто»
const cfg = { xf: 0, rate: 1, eqOn: false, eq: [0, 0, 0] };   // xf — секунд перетекания, 0 = без паузы
const active = () => (decks ? decks[deckI].el : idleEl);
const au = new Proxy({}, {
  get: (t, k) => { const e = active(), v = e[k]; return typeof v === 'function' ? v.bind(e) : v; },
  set: (t, k, v) => { active()[k] = v; return true; }
});
const player = {
  orig: [], queue: [], qi: -1, shuffle: false, repeat: 'off', bars: new Set(), vol: 1, errs: 0, src: null,
  get cur() { return lib.get(this.queue[this.qi]) || null; },
  sync() { for (const b of this.bars) b.sync(); mediaMeta(); markRows(); lyricsSync(); sessSync(); H?.net?.actChanged?.(); }
};
// сколько и что я слушаю — копится на этом компьютере (никуда не уходит) и складывается в «Итоги»
const lis = { rel: '', id: 0, sec: 0, pos: -1, last: 0 };
function listenFlush() {
  const t = lib.get(lis.rel); if (!t || lis.sec < 25) return; lis.last = Date.now();
  tx('plays', 'readwrite', s => s.put({ id: lis.id, ts: lis.id, rel: t.rel, h: t.h || '', title: t.title, artist: t.artist || '', album: t.album || '', sec: Math.round(lis.sec), dur: t.dur || 0 })).catch(() => {});
}
function listenTick(el0) {
  const t = player.cur; if (!t) return;
  if (lis.rel !== t.rel) { listenFlush(); lis.rel = t.rel; lis.id = Date.now(); lis.sec = 0; lis.pos = -1; lis.last = 0; }
  const c = el0.currentTime;
  if (lis.pos >= 0) { const d = c - lis.pos; if (d > 0 && d < 1.6) lis.sec += d; }
  lis.pos = c;
  if (lis.sec >= 30 && Date.now() - lis.last > 30000) listenFlush();
}
function mkDeck() {
  const el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'auto';
  const g = actx.createGain(), src = actx.createMediaElementSource(el); src.connect(g); g.connect(eqNodes[0]);
  const d = { el, g, rel: '', tok: 0 }, mine = () => decks && decks[deckI] === d;
  el.addEventListener('ended', () => { if (mine()) listenFlush(); if (!mine()) return; if (sleep.endOfTrack) { sleep.endOfTrack = false; player.sync(); return; } next(true); });
  el.addEventListener('play', () => { if (mine()) player.sync(); });
  el.addEventListener('pause', () => { if (mine()) { clearTimeout(nextT); listenFlush(); player.sync(); } });
  el.addEventListener('playing', () => { if (mine()) { player.errs = 0; armNext(); } });
  el.addEventListener('seeked', () => { if (mine()) { armNext(); sessSync(); } });
  el.addEventListener('ratechange', () => { if (mine()) { armNext(); sessSync(); } });
  el.addEventListener('error', () => {
    if (!mine() || !d.rel) return;
    const t = player.cur; if (!t) return;
    H.toast('Не получилось сыграть «' + t.title + '»');
    if (++player.errs < 5 && player.qi + 1 < player.queue.length) { player.qi++; play(); } else { player.errs = 0; player.sync(); }
  });
  el.addEventListener('timeupdate', () => { if (mine()) { for (const b of player.bars) b.tick(); lyricsTick(); listenTick(el); } });
  el.addEventListener('durationchange', () => { if (mine()) { for (const b of player.bars) b.tick(); armNext(); const t = player.cur; if (t && !t.dur && isFinite(el.duration)) { t.dur = Math.round(el.duration); tx('tracks', 'readwrite', s => s.put(t)).catch(() => {}); } } });
  return d;
}
function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
  actx = new AudioContext();
  master = actx.createGain(); master.gain.value = player.vol;
  eqNodes = EQ_BANDS.map(x => { const b = actx.createBiquadFilter(); b.type = x.type; b.frequency.value = x.f; b.Q.value = x.q; return b; });
  for (let i = 0; i < eqNodes.length - 1; i++) eqNodes[i].connect(eqNodes[i + 1]);
  eqNodes.at(-1).connect(master); master.connect(actx.destination);
  decks = [mkDeck(), mkDeck()]; deckI = 0; applyEq();
  // страница уже что-то держала на «пустой» деке — переносить нечего
}
function applyEq() { if (!actx) return; eqNodes.forEach((n, i) => { n.gain.setTargetAtTime(cfg.eqOn ? cfg.eq[i] : 0, actx.currentTime, 0.02); }); }
function saveCfg() { H.store.set('musicCfg', JSON.stringify(cfg)); }
function loadCfg() { try { const j = JSON.parse(H.store.get('musicCfg', '{}')); if ([0, 3, 6, 10].includes(j.xf)) cfg.xf = j.xf; if (j.rate >= .5 && j.rate <= 2) cfg.rate = j.rate; cfg.eqOn = !!j.eqOn; cfg.eq = eqFrom(j.eq); } catch (e) {} }
// сохранённые настройки: три полосы как есть; старые пять (60 Гц…14 кГц) — сводим в три
const eqClamp = x => Math.max(-EQ_MAX, Math.min(EQ_MAX, Math.round((+x || 0) * 2) / 2));
function eqFrom(a) {
  if (!Array.isArray(a)) return [0, 0, 0];
  if (a.length === 3) return a.map(eqClamp);
  if (a.length === 5) { const v = a.map(x => +x || 0); return [(v[0] + v[1]) / 2, v[1] * 0.25 + v[2] * 0.5 + v[3] * 0.25, (v[3] + v[4]) / 2].map(eqClamp); }
  return [0, 0, 0];
}
function setRate(r) { cfg.rate = r; saveCfg(); if (decks) for (const d of decks) d.el.playbackRate = r; for (const b of player.bars) b.sync(); }

function reshuffle(keep) {
  const rest = player.orig.filter(r => r !== keep);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  player.queue = keep ? [keep, ...rest] : rest; player.qi = keep ? 0 : -1;
}
function setQueue(list, start) {   // list — треки, start — с какого начать
  if (isGuest() && !sess.internal) { guestBlock(); return; }
  player.orig = list.map(t => t.rel);
  const first = list[start]?.rel;
  if (player.shuffle) reshuffle(first); else { player.queue = player.orig.slice(); player.qi = Math.max(0, start); }
  play();
}
const loadDeck = (d, t) => { d.rel = t.rel; d.el.src = MU.url(t.p); d.el.playbackRate = cfg.rate; };
function silence(d) { d.fading = false; d.tok++; d.g.gain.cancelScheduledValues(0); d.g.gain.value = 0; d.el.pause(); d.rel = ''; }
function play() {   // с самого начала трека player.cur — сразу, без перетекания
  const t = player.cur;
  if (!t) { if (decks) { silence(decks[0]); silence(decks[1]); } player.sync(); return; }
  ensureAudio(); clearTimeout(nextT);
  silence(decks[1 - deckI]);
  const d = decks[deckI]; d.tok++; d.g.gain.cancelScheduledValues(0); d.g.gain.value = 1;
  loadDeck(d, t); d.el.play().catch(() => {}); player.sync();
}
// какой трек будет следующим по естественному ходу (без побочных эффектов); null — дальше только конец или перемешивание заново
function planNext() {
  if (!player.queue.length || player.repeat === 'one') return null;
  if (player.qi + 1 < player.queue.length) return { qi: player.qi + 1, rel: player.queue[player.qi + 1] };
  if (player.repeat === 'all' && !player.shuffle && player.queue.length > 1) return { qi: 0, rel: player.queue[0] };
  return null;
}
// готовим вторую деку и ставим таймер на момент перехода
function armNext() {
  clearTimeout(nextT);
  const d = decks?.[deckI]; if (!d || d.el.paused || !isFinite(d.el.duration) || !d.rel) return;
  if (sleep.endOfTrack) return;   // «после этого трека»: дальше не переходим
  const plan = planNext(); if (!plan || !lib.has(plan.rel)) return;
  const o = decks[1 - deckI]; if (o.fading) { nextT = setTimeout(armNext, 400); return; }   // прошлая дека ещё затихает
  if (o.rel !== plan.rel) { silence(o); loadDeck(o, lib.get(plan.rel)); }
  const dur = d.el.duration, rate = d.el.playbackRate || 1;
  const xf = Math.min(cfg.xf, dur * 0.4, 30);
  const wait = (dur - d.el.currentTime) / rate - xf - 0.06;   // 0,06 с — запас на запуск следующей деки
  nextT = setTimeout(() => goNext(plan, xf), Math.max(0, wait * 1000));
}
function goNext(plan, xf) {
  const cur = decks[deckI], inn = decks[1 - deckI];
  if (planNext()?.rel !== plan.rel || inn.rel !== plan.rel) return armNext();   // очередь поменялась
  player.qi = plan.qi; deckI = 1 - deckI;
  const now = actx.currentTime, tokOut = ++cur.tok, tokIn = ++inn.tok; cur.fading = true;
  inn.g.gain.cancelScheduledValues(now); cur.g.gain.cancelScheduledValues(now);
  if (xf > 0.05) {   // равная мощность: сумма громкостей не проваливается посередине
    const n = 32, up = new Float32Array(n), down = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1); up[i] = Math.sin(x * Math.PI / 2); down[i] = Math.cos(x * Math.PI / 2); }
    inn.g.gain.setValueCurveAtTime(up, now, xf); cur.g.gain.setValueCurveAtTime(down, now, xf);
    setTimeout(() => { if (cur.tok === tokOut) { cur.el.pause(); cur.rel = ''; } cur.fading = false; }, xf * 1000 + 150);
  } else { inn.g.gain.value = 1; cur.g.gain.value = 0; setTimeout(() => { if (cur.tok === tokOut) { cur.el.pause(); cur.rel = ''; } cur.fading = false; }, 200); }
  inn.el.currentTime = 0; inn.el.play().catch(() => {});
  void tokIn; player.sync();
}
function cleanQueue() {   // файл удалили — выкидываем из очереди
  const cur = player.queue[player.qi];
  player.orig = player.orig.filter(r => lib.has(r)); player.queue = player.queue.filter(r => lib.has(r));
  player.qi = cur && lib.has(cur) ? player.queue.indexOf(cur) : Math.min(player.qi, player.queue.length - 1);
}
function next(auto) {
  if (!auto && guestBlock()) return;
  if (!player.queue.length) return;
  if (auto && player.repeat === 'one') { au.currentTime = 0; au.play().catch(() => {}); return; }
  if (player.qi + 1 < player.queue.length) { player.qi++; play(); return; }
  if (player.repeat === 'all' || (!auto && player.repeat !== 'off')) { if (player.shuffle) reshuffle(null); else player.qi = 0; play(); return; }
  if (!auto) { player.qi = 0; play(); return; }
  au.pause(); au.currentTime = 0; player.sync();   // дошли до конца очереди
}
function prev() {
  if (guestBlock()) return;
  if (au.currentTime > 3 || player.qi <= 0) { au.currentTime = 0; return; }
  player.qi--; play();
}
function toggle() {
  if (isGuest()) {   // гость может приглушить себе: пауза у себя ведущему не мешает
    if (sess.mode === 'stream') { sess.userPaused = !sess.userPaused; if (sess.aud) sess.aud.muted = sess.userPaused; sessUi(); player.sync(); return; }
    if (!player.cur) return;
    if (!au.paused) { sess.userPaused = true; au.pause(); } else { sess.userPaused = false; if (sess.hostL) netTo(sess.hostL, { k: 'ping', sid: sess.sid, c: Date.now() }); au.play().catch(() => {}); }
    return;
  }
  if (!player.cur) return;
  if (!decks || !decks[deckI].rel) { play(); return; }
  ensureAudio();
  if (au.paused) au.play().catch(() => {});
  else { for (const d of decks) d.el.pause(); }   // и деку, которая в этот момент затухает
}
function enqueue(t, nextUp) {
  if (guestBlock()) return;
  if (!player.queue.length) { setQueue([t], 0); return; }
  const at = nextUp ? player.qi + 1 : player.queue.length;
  player.queue.splice(at, 0, t.rel);
  if (nextUp) { const oi = player.orig.indexOf(player.queue[player.qi]); player.orig.splice(oi + 1, 0, t.rel); } else player.orig.push(t.rel);
  H.toast(nextUp ? 'Сыграет следующим' : 'Добавлено в очередь'); player.sync(); queuePaint?.(); armNext();
}
function seekTo(f) { if (isFinite(au.duration)) au.currentTime = Math.max(0, Math.min(1, f)) * au.duration; }
function setVol(v) { player.vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = player.vol; H.store.set('musicVol', String(player.vol)); for (const b of player.bars) b.sync(); }

// таймер сна: через заданное время музыка плавно затихает и ставится на паузу
function setSleep(min) {
  clearTimeout(sleep.t); sleep.until = 0; sleep.endOfTrack = false;
  if (min === 'track') { sleep.endOfTrack = true; H.toast('Остановлюсь после этого трека'); }
  else if (min) { sleep.until = Date.now() + min * 60000; sleep.t = setTimeout(sleepNow, min * 60000); H.toast('Таймер сна: ' + min + ' мин'); }
  else H.toast('Таймер сна выключен');
  for (const b of player.bars) b.sync();
}
function sleepNow() {
  sleep.until = 0; sleep.endOfTrack = false;
  if (!decks) return;
  const d = decks[deckI], g = d.g.gain, now = actx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 4);
  setTimeout(() => { for (const x of decks) x.el.pause(); g.cancelScheduledValues(0); g.value = 1; player.sync(); }, 4100);
}

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
// Три режима, у каждого свой экран: «Моя музыка» (слушаю сам), «Вместе» (слушаем с друзьями), «Фон» (тихо играет под разговор или фильм).
// В каждом музыка выбирается карточками-«полками»: плейлисты, альбомы, исполнители.
let lyricsOpen = false, plFilter = new Set();
let shown = false, mode = 'my', view = { tab: 'tracks', detail: null }, query = '', sortBy = 'title', limit = 200, queuePaint = null;
let host = null, inPanel = false;   // контейнер раздела (#mxMain или правая панель в зале)
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ibtn = (icon, title, f, cls) => { const b = el('button', 'mu-ib' + (cls ? ' ' + cls : '')); b.innerHTML = icon; b.title = title; b.setAttribute('aria-label', title); b.onclick = e => { e.stopPropagation(); f(e); }; return b; };
const countText = n => n + ' ' + plural(n, 'трек', 'трека', 'треков');
const totalDur = ts => { const s = ts.reduce((a, t) => a + (t.dur || 0), 0); if (!s) return ''; const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? h + ' ч ' + m + ' мин' : m + ' мин'; };
const EMOJI_HUE = { '❤️': 345, '🔥': 16, '🌙': 255, '💃': 315, '🏋️': 195, '🚗': 32, '😢': 215, '😂': 48, '🎸': 6, '🎧': 265, '☕': 28, '🌅': 24, '🧘': 160, '🎉': 330, '🥃': 34, '🌧️': 208, '💪': 12, '🛏️': 240, '🎹': 275, '🕺': 300, '🎵': 190, '💿': 215, '🎤': 285 };
function hue(name, emoji) { if (EMOJI_HUE[emoji] != null) return EMOJI_HUE[emoji]; let h = 0; for (const c of String(name) + String(emoji)) h = (h * 31 + c.codePointAt(0)) % 360; return h; }

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
  seek.onchange = () => { if (isGuest()) { guestBlock(); dragging = false; bar.tick(); return; } seekTo(seek.value / 1000); dragging = false; };
  let shuf, rep, que, vol, fav, lyr, snd, ticks;
  if (mini) { bar.append(cv, info, ctl); bar.onclick = () => H.openSelf(); }
  else {
    shuf = ibtn(IC.shuffle, 'Перемешать', () => { player.shuffle = !player.shuffle; H.store.set('musicShuffle', player.shuffle ? '1' : '0'); const c = player.queue[player.qi]; if (player.queue.length) { if (player.shuffle) reshuffle(c); else { player.queue = player.orig.slice(); player.qi = Math.max(0, player.queue.indexOf(c)); } } player.sync(); queuePaint?.(); });
    rep = ibtn(IC.repeat, 'Повтор: выкл', () => { player.repeat = { off: 'all', all: 'one', one: 'off' }[player.repeat]; H.store.set('musicRepeat', player.repeat); player.sync(); });
    que = ibtn(IC.queue, 'Очередь', () => queueDlg());
    lyr = ibtn(IC.lyr, 'Текст песни', () => { lyricsOpen = !lyricsOpen; if (lyricsOpen) view.detail = null; repaint(); });
    snd = ibtn(IC.sliders, 'Звук: переход между треками, эквалайзер, скорость, таймер сна', () => soundDlg());
    fav = ibtn(IC.heart, 'В любимое', () => { const t = player.cur; if (t) { toggleFav(t); if (isFav(t)) { fly('❤️'); netReact(t, '❤️', null); } } }, 'fav');
    vol = el('input', 'mu-vol'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.title = 'Громкость'; vol.oninput = () => setVol(vol.value / 100);
    const mid = el('div', 'mu-mid'), line = el('div', 'mu-line'), sk = el('div', 'mu-sk'); ticks = el('div', 'mu-ticks'); sk.append(ticks, seek); line.append(tcur, sk, tall); mid.append(ctl, line);
    const vi = el('span', 'mu-vi'); vi.innerHTML = IC.vol;
    const right = el('div', 'mu-right'); right.append(fav, shuf, rep, que, lyr, snd, vi, vol);
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
      lyr.classList.toggle('on', lyricsOpen); drawTicks();
      snd.classList.toggle('on', !!(cfg.xf || cfg.rate !== 1 || cfg.eqOn || sleep.until || sleep.endOfTrack));
    }
    bar.tick();
  };
  let tickDur = -1;
  const drawTicks = () => {   // реакции на секунды трека — метками полок над перемоткой
    if (!ticks) return; ticks.textContent = ''; const t = player.cur, d = au.duration; tickDur = d; if (!t || !isFinite(d) || !d) return;
    for (const l of listsOf(t)) for (const m of itemOf(l, t)?.m || []) { const i = el('i', 'mu-tick', l.emoji); i.style.left = Math.min(100, m / d * 100) + '%'; i.title = l.name + ' — ' + fmt(m); i.onclick = ev => { ev.stopPropagation(); if (!isGuest()) au.currentTime = Math.max(0, m - 2); }; ticks.append(i); }
  };
  bar.tick = () => {
    const d = au.duration, c = au.currentTime;
    if (mini) return;
    if (d !== tickDur) drawTicks();
    tall.textContent = isFinite(d) ? fmt(d) : '0:00';
    if (!dragging) { seek.value = isFinite(d) && d ? Math.round(c / d * 1000) : 0; tcur.textContent = fmt(c); }
    seek.style.setProperty('--p', (seek.value / 10) + '%');
  };
  bar.mini = mini; player.bars.add(bar); bar.sync();
  return bar;
}

// ---------- подборки ----------
const text = t => (t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.rel).toLowerCase();
const matches = t => !query || query.toLowerCase().split(/\s+/).every(w => text(t).includes(w));
const sorters = {
  title: (a, b) => col.compare(a.title, b.title),
  artist: (a, b) => col.compare(a.artist || '￿', b.artist || '￿') || col.compare(a.album, b.album) || (a.track - b.track) || col.compare(a.title, b.title),
  date: (a, b) => b.mtime - a.mtime,
  album: (a, b) => col.compare(a.album || '￿', b.album || '￿') || (a.track - b.track) || col.compare(a.rel, b.rel)
};
const sortTracks = (list, k = sortBy) => list.slice().sort(sorters[k] || sorters.title);
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
// всё, что можно включить, в одном виде: {kind, id, emoji, name, sub, tracks}
function collections(q) {
  const all = allTracks(), f = t => !q || matches(t);
  return {
    all: { kind: 'all', id: 'all', emoji: '🎵', name: 'Вся музыка', tracks: sortTracks(all.filter(f)) },
    lists: PL.lists.map(l => ({ kind: 'pl', id: l.id, emoji: l.emoji, name: l.name, tracks: plTracks(l).filter(f), ref: l })),
    albums: albumsOf(all.filter(f)).map(a => ({ kind: 'album', id: a.key, emoji: '💿', name: a.name, sub: a.artist, tracks: a.tracks.slice().sort(sorters.album) })),
    artists: artistsOf(all.filter(f)).map(a => ({ kind: 'artist', id: a.name, emoji: '🎤', name: a.name, tracks: a.tracks.slice().sort(sorters.artist) }))
  };
}
function findColl(kind, id) {
  const c = collections(); if (kind === 'all') return c.all;
  return (kind === 'pl' ? c.lists : kind === 'album' ? c.albums : c.artists).find(x => x.id === id) || null;
}
// карточка-«ячейка»: обложка из треков (или эмодзи на цветном фоне), название, число треков, кнопка «играть» при наведении
function tile(c, o = {}) {
  const b = el('div', 'mu-tile' + (o.on ? ' on' : '') + (o.dim ? ' dim' : '')); b.tabIndex = 0; b.setAttribute('role', 'button');
  const art = el('div', 'mu-art'); art.style.setProperty('--h', hue(c.name, c.emoji));
  const covs = c.tracks.filter(t => t.cv).slice(0, 4);
  if (covs.length >= 4) { art.classList.add('mos'); for (const t of covs) art.append(coverEl(t, 'mi')); }
  else if (covs.length) art.append(coverEl(covs[0], 'fill'));
  else { art.classList.add('noc'); art.append(el('span', 'mu-em', c.emoji)); }
  if (covs.length) art.append(el('span', 'mu-badge', c.emoji));
  const go = el('div', 'mu-go'); go.innerHTML = o.on && o.playing ? IC.pause : IC.play; art.append(go);
  if (o.menu) { const m = ibtn(IC.more, 'Ещё', e => o.menu(e)); m.classList.add('mu-tm'); art.append(m); }
  b.append(art, el('b', '', c.name), el('span', '', c.sub ? c.sub + ' · ' + countText(c.tracks.length) : countText(c.tracks.length)));
  if (o.menu) b.oncontextmenu = e => { e.preventDefault(); o.menu(e); };
  b.onclick = e => { if (!o.dim) o.go(e); };
  b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && !o.dim) { e.preventDefault(); o.go(e); } };
  return b;
}
function shelfSection(title, hint, tiles, extra) {
  const s = el('section', 'mu-shelf'), h = el('header'); h.append(el('h3', '', title)); if (hint) h.append(el('span', '', hint)); if (extra) h.append(extra);
  const g = el('div', 'mu-grid'); g.append(...tiles); s.append(h, g); return s;
}
// полки для выбора: «Вся музыка», плейлисты, альбомы, исполнители; go — что делать с нажатой, cur — какая сейчас выбрана
function pickerShelves(go, cur, o = {}) {
  const c = collections(query), wrap = el('div', 'mu-shelves');
  const mk = (x, extra) => tile(x, { on: cur?.kind === x.kind && cur?.id === x.id, playing: o.playing, dim: o.dim || (!x.tracks.length), go: () => go(x), ...(x.ref ? { menu: e => listMenu(e.clientX, e.clientY, x.ref, () => go(x)) } : {}), ...extra });
  const base = [mk(c.all)];
  wrap.append(shelfSection('Моя музыка', '', base));
  wrap.append(shelfSection('Плейлисты', 'они же реакции', c.lists.map(x => mk(x)), H.btnEl('＋ Новая полка', '', () => listDlg(null))));
  if (c.albums.length) wrap.append(shelfSection('Альбомы', '', c.albums.slice(0, 120).map(x => mk(x))));
  if (c.artists.length) wrap.append(shelfSection('Исполнители', '', c.artists.slice(0, 120).map(x => mk(x))));
  return wrap;
}
const srcOf = () => player.src;   // что сейчас играет у меня по «полке» (для подсветки)
function playColl(c, shuffle) {
  if (!c.tracks.length) { H.toast('В «' + c.name + '» пока пусто'); return; }
  if (guestBlock()) return;
  if (shuffle) { player.shuffle = true; H.store.set('musicShuffle', '1'); }
  player.src = { kind: c.kind, id: c.id };
  setQueue(c.tracks, shuffle ? Math.floor(Math.random() * c.tracks.length) : 0);
}

// ---------- строки треков ----------
function trackRow(t, list, i) {
  const r = el('div', 'mu-row'), cur = player.cur?.rel === t.rel;
  r.dataset.rel = t.rel; if (cur) r.classList.add('cur', au.paused ? 'paused' : 'playing');
  const tx = el('div', 'mu-tx'); tx.append(el('b', '', t.title), el('span', '', [t.artist, t.album].filter(Boolean).join(' · ') || t.rel));
  const rc = rxChips(t); if (rc) tx.firstChild.append(rc);
  const play1 = el('div', 'mu-pl'); play1.innerHTML = cur && !au.paused ? IC.pause : IC.play;
  const cv = coverEl(t, 'sm'); cv.append(play1);
  r.append(cv, tx, el('span', 'mu-d', t.dur ? fmt(t.dur) : ''));
  const shelf = ibtn('🏷️', 'На полку', e => shelfPalette(e.clientX - 150, e.clientY + 8, t, null), 'shelf');
  const fav = ibtn(IC.heart, isFav(t) ? 'Убрать из любимого' : 'В любимое', () => { toggleFav(t); if (isFav(t)) { fly('❤️'); netReact(t, '❤️', null); } }, 'fav' + (isFav(t) ? ' on' : ''));
  const more = ibtn(IC.more, 'Ещё', e => trackMenu(t, e.clientX, e.clientY, list));
  r.append(shelf, fav, more);
  r.onclick = () => { if (cur) toggle(); else { if (guestBlock()) return; player.src = null; setQueue(list, i); } };
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
    ['▶', 'Играть', () => { if (guestBlock()) return; setQueue(list, Math.max(0, list.indexOf(t))); }],
    ['⏭', 'Играть следующим', () => enqueue(t, true)],
    ['➕', 'В очередь', () => enqueue(t, false)],
    ['🏷️', 'На полку…', () => shelfPalette(x, y, t, null)],
    [isFav(t) ? '💔' : '❤️', isFav(t) ? 'Убрать из любимого' : 'В любимое', () => toggleFav(t)],
    ['🌙', 'Фоном', () => bgStart({ kind: 'track', id: t.rel, emoji: '🎵', name: t.title, tracks: [t] })],
    ['📂', 'Показать в папке', () => MU.show(t.p)]
  ];
  if (view.detail?.type === 'pl') { const l = plById(view.detail.id); if (l) items.push(['➖', 'Убрать с этой полки', () => { if (inList(l, t)) toggleIn(l, t); }]); }
  items.push(['🗑', 'В корзину', async () => { if (confirm('Переместить «' + t.title + '» в корзину? Файл удалится с компьютера.')) { if (await MU.trash(t.p)) { lib.delete(t.rel); cleanQueue(); repaint(); player.sync(); refresh(); } } }, 'danger']);
  menuAt(x, y, items);
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
        r.onclick = () => { if (guestBlock()) return; player.qi = i; play(); paint(); };
        list.append(r);
      });
      list.querySelector('.cur')?.scrollIntoView({ block: 'center' });
    };
    queuePaint = paint;
    const row = el('div', 'row'); row.append(H.btnEl('Очистить', '', () => { if (guestBlock()) return; if (decks) { silence(decks[0]); silence(decks[1]); } player.orig = []; player.queue = []; player.qi = -1; player.sync(); paint(); }), H.btnEl('Готово', 'pri', close));
    card.append(el('h2', '', 'Очередь'), list, row); card.classList.add('mu-qcard'); paint();
  });
}
function settingsDlg() {
  H.modal(async (card, close) => {
    const r = await MU.root();
    const row = el('div', 'row');
    const reload = () => { lib.clear(); hashIdx = null; for (const s of ['tracks', 'covers']) tx(s, 'readwrite', st => st.clear()).catch(() => {}); coverUrls.clear(); repaint(); refresh(); };
    row.append(
      H.btnEl('Открыть папку', '', () => MU.openDir()),
      H.btnEl('Сменить папку…', '', async () => { const p = await MU.pick(); if (p) { close(); reload(); } }),
      ...(r.def ? [] : [H.btnEl('Вернуть обычную', '', async () => { await MU.reset(); close(); reload(); })]),
      H.btnEl('Готово', 'pri', close));
    const code = el('code', 'mu-path', r.path);
    card.append(el('h2', '', 'Папка с музыкой'), el('p', '', 'Положи музыку в эту папку (можно по подпапкам) или перетащи файлы в окно — они появятся в списке сами. Правки в проводнике видны сразу. Треки, которые докачали друзья, лежат в подпапке «Общая от друзей».'), code, el('p', '', 'Теги и обложки читаются из файлов один раз и запоминаются. Сам звук с диска не уходит никуда, кроме прослушивания вместе с друзьями.'), row);
  });
}

// ---------- шапка, состояние, пустой экран ----------
function statusText() {
  const n = lib.size; const pend = allTracks().filter(t => !t.tagged).length;
  return scanning ? 'Читаю папку…' + (pend ? ' (' + pend + ')' : '') : countText(n);
}
let statusEl = null;
function paintStatus() { if (statusEl) statusEl.textContent = statusText(); }
function emptyView() {
  const e = el('div', 'fempty mu-empty'); e.append(el('div', 'big', '🎵'), el('b', '', 'Здесь пока нет музыки'), el('span', '', 'Положи файлы в папку Кинозала или перетащи их в это окно. Подойдут MP3, FLAC, M4A, OGG, WAV и другие.'));
  const row = el('div', 'row'); row.style.justifyContent = 'center';
  row.append(H.btnEl('Добавить файлы…', 'pri', async () => { const n = await MU.pickFiles(); if (n) { H.toast('Добавлено: ' + n); refresh(); } }), H.btnEl('Открыть папку', '', () => MU.openDir()));
  e.append(row); return e;
}
function listView(tracks, opts = {}) {
  const wrap = el('div', 'mu-list');
  if (!tracks.length) { wrap.append(el('div', 'fempty', '')); wrap.firstChild.append(el('b', '', opts.empty || 'Ничего не нашлось')); return wrap; }
  const shownTs = tracks.slice(0, limit);
  shownTs.forEach((t, i) => wrap.append(trackRow(t, tracks, i)));
  if (tracks.length > shownTs.length) { const more = H.btnEl('Показать ещё ' + Math.min(200, tracks.length - shownTs.length), '', () => { limit += 200; repaint(); }); more.classList.add('mu-more'); wrap.append(more); }
  return wrap;
}
function sortSel() {
  const s = el('select', 'mu-sort'); for (const [k, t] of [['title', 'По названию'], ['artist', 'По исполнителю'], ['album', 'По альбому'], ['date', 'Сначала новые']]) { const o = el('option', '', t); o.value = k; s.append(o); }
  s.value = sortBy; s.onchange = () => { sortBy = s.value; H.store.set('musicSort', sortBy); repaint(); }; return s;
}
// шапка выбранной подборки: большая обложка, название, действия — в том числе «фоном» и «вместе»
function collHead(c) {
  const hd = el('div', 'mu-chead');
  const art = el('div', 'mu-art big'); art.style.setProperty('--h', hue(c.name, c.emoji));
  const covs = c.tracks.filter(t => t.cv).slice(0, 4);
  if (covs.length >= 4) { art.classList.add('mos'); for (const t of covs) art.append(coverEl(t, 'mi')); } else if (covs.length) art.append(coverEl(covs[0], 'fill')); else { art.classList.add('noc'); art.append(el('span', 'mu-em', c.emoji)); }
  const info = el('div', 'mu-cinfo'); info.append(el('small', '', c.kind === 'pl' ? 'Полка · плейлист и реакция' : c.kind === 'album' ? 'Альбом' : c.kind === 'artist' ? 'Исполнитель' : 'Библиотека'), el('h2', '', (c.kind === 'pl' ? c.emoji + ' ' : '') + c.name), el('span', '', [c.sub, countText(c.tracks.length), totalDur(c.tracks)].filter(Boolean).join(' · ')));
  const act = el('div', 'mu-act');
  act.append(H.btnEl('▶ Играть', 'pri', () => playColl(c)), H.btnEl('🔀 Вперемешку', '', () => playColl(c, true)), H.btnEl('🌙 Фоном', '', () => { if (!c.tracks.length) return; bgStart(c); H.toast('Фон: ' + c.name); }), H.btnEl('🎧 Вместе', '', () => { gotoMode('together'); }));
  if (c.kind === 'pl') act.append(H.btnEl('✎ Изменить', '', () => listDlg(c.ref)));
  info.append(act); hd.append(art, info); return hd;
}

// экран «Моя музыка»
function myBody() {
  const wrap = el('div', 'mu-body'), d = view.detail, all = allTracks();
  if (!all.length && !scanning && !d) { wrap.append(emptyView()); return wrap; }
  if (d) {
    const kind = d.type === 'pl' ? 'pl' : d.type; const c = findColl(kind, d.id ?? d.key);
    if (c) { wrap.append(collHead(c), listView(c.tracks, { empty: c.kind === 'pl' ? 'Здесь пока пусто. Нажми 🏷️ у любого трека и положи его на эту полку' : undefined })); return wrap; }
    view.detail = null;
  }
  const c = collections(query);
  if (view.tab === 'tracks') {
    const ts = sortTracks(all.filter(matches).filter(t => [...plFilter].every(id => { const l = plById(id); return l && inList(l, t); })));
    const bar = el('div', 'mu-act'); bar.append(H.btnEl('▶ Играть', 'pri', () => playColl({ kind: 'all', id: 'all', name: 'Вся музыка', tracks: ts })), H.btnEl('🔀 Вперемешку', '', () => playColl({ kind: 'all', id: 'all', name: 'Вся музыка', tracks: ts }, true)), sortSel());
    wrap.append(bar);
    const used = PL.lists.filter(l => l.items.length);
    if (used.length) { const row = el('div', 'fchips'); for (const l of used) { const b = el('button', 'fchip' + (plFilter.has(l.id) ? ' on' : ''), l.emoji + ' ' + l.name); b.onclick = () => { plFilter.has(l.id) ? plFilter.delete(l.id) : plFilter.add(l.id); limit = 200; repaint(); }; row.append(b); } wrap.append(row); }
    wrap.append(listView(ts, { empty: plFilter.size ? 'На такой полке (или сочетании полок) пока нет треков' : undefined }));
  } else if (view.tab === 'lists') {
    wrap.append(el('p', 'fhint', 'Полка — это и плейлист, и реакция. Положил трек на «🔥 Огонь» — он в этом плейлисте, а в прослушивании вместе друзья увидят твой огонь. Назови полки как хочешь.'));
    const sec = shelfSection('', '', [...c.lists.map(x => tile(x, { go: () => { view.detail = { type: 'pl', id: x.id }; limit = 200; repaint(); }, menu: e => listMenu(e.clientX, e.clientY, x.ref, () => playColl(x)) })),
      (() => { const n = el('div', 'mu-tile new'); n.tabIndex = 0; const a = el('div', 'mu-art noc dash'); a.append(el('span', 'mu-em', '＋')); n.append(a, el('b', '', 'Новая полка'), el('span', '', 'эмодзи и своё название')); n.onclick = () => listDlg(null); return n; })()]);
    wrap.append(sec);
  } else if (view.tab === 'stats') {
    wrap.append(statsBody());
  } else if (view.tab === 'albums') {
    wrap.append(shelfSection('', '', c.albums.map(x => tile(x, { go: () => { view.detail = { type: 'album', id: x.id }; limit = 200; repaint(); } }))));
  } else {
    wrap.append(shelfSection('', '', c.artists.map(x => tile(x, { go: () => { view.detail = { type: 'artist', id: x.id }; limit = 200; repaint(); } }))));
  }
  return wrap;
}
// экран «Вместе»
function feedSection() {
  const list = H.net.friendActs();
  const sec = el('section', 'mu-feed'), hd = el('header');
  hd.append(el('h3', '', 'Сейчас у друзей'), H.btnEl('🟢 Мой статус', '', () => H.net.openActDlg()));
  sec.append(hd);
  if (!list.length) { sec.append(el('p', 'fhint', 'Пока никто из друзей ничего не слушает и не смотрит — или не показывает. Свой статус настраивается кнопкой справа.')); return sec; }
  const g = el('div', 'mu-fgrid');
  for (const x of list) {
    const c = el('div', 'mu-fr'), ic = el('div', 'mu-fi', H.net.actIcon(x.a)), tx = el('div'); tx.append(el('b', '', x.name), el('span', '', H.net.actText(x.a)));
    c.append(ic, tx);
    if ((x.a.k === 'music' && x.a.sid) || (x.a.k === 'room' && x.a.code)) c.append(H.btnEl('Присоединиться', 'pri', () => H.net.joinAct(x.id, x.a)));
    g.append(c);
  }
  sec.append(g); return sec;
}
function togetherBody() {
  const wrap = el('div', 'mu-body');
  wrap.append(sessCard(), feedSection());
  const note = isGuest() ? 'Включает ' + H.net.nameOf(sess.hostU) + ' — ты слушаешь вместе с ним' : '';
  const pick = pickerShelves(c => playColl(c), srcOf(), { playing: !au.paused, dim: !!note });
  const intro = el('p', 'fhint', note || 'Выбери, что включить: полка, альбом или исполнитель. Если ты в прослушивании — друзья услышат то же самое.');
  wrap.append(intro, pick); return wrap;
}
// экран «Фон»
function bgBody() {
  const wrap = el('div', 'mu-body'); wrap.append(bgCard());
  wrap.append(el('p', 'fhint', 'Фон играет только у тебя, тихо — под созвон, кино или игру. Когда кто-то говорит, он сам приглушается. Основной плеер ему не мешает.'));
  wrap.append(pickerShelves(c => { if (!c.tracks.length) { H.toast('В «' + c.name + '» пока пусто'); return; } bgStart(c); }, bg.src, { playing: !bgEl.paused }));
  return wrap;
}

let gen = 0, paintT = 0;
function repaint() { if (!shown) return; clearTimeout(paintT); paintT = setTimeout(paint, 60); }
function gotoMode(m) { mode = m; H.store.set('musicMode', m); view.detail = null; lyricsOpen = false; limit = 200; repaint(); }
function paint() {
  if (!shown || !host) return; gen++;
  for (const b of [...player.bars]) if (!b.mini) player.bars.delete(b);   // панели прошлой отрисовки
  for (const b of [...bgBars]) if (!b.perm) bgBars.delete(b);
  const keepTop = host.querySelector('.mu-scroll')?.scrollTop || 0, hadQ = document.activeElement?.classList.contains('mu-q');
  const sec = el('section', 'mx-files mu');
  // шапка: назад + три режима
  const hd = el('header', 'mx-chead mu-head');
  const back = el('button', 'ib back'); back.innerHTML = IC.back; back.title = inPanel ? 'Закрыть' : 'К чатам'; back.onclick = () => H.close(); hd.append(back);
  if (view.detail && mode === 'my') hd.append(ibtn(IC.back, 'Назад', () => { view.detail = null; limit = 200; repaint(); }, 'mu-back'));
  hd.append(el('h2', '', 'Музыка'));
  const seg = el('div', 'mu-modes');
  for (const [k, ic, t] of [['my', '🎵', 'Моя музыка'], ['together', '🎧', 'Вместе'], ['bg', '🌙', 'Фон']]) {
    const b = el('button', 'mu-mode' + (mode === k ? ' on' : '')); b.append(el('i', '', ic), el('span', '', t));
    if (k === 'together' && sess) b.append(el('u', '', sess.host ? String(sess.peers.size) : '●'));
    if (k === 'bg' && bg.queue.length && !bgEl.paused) b.append(el('u', 'live', ''));
    b.title = t; b.onclick = () => gotoMode(k); seg.append(b);
  }
  hd.append(seg);
  sec.append(hd);
  // панель инструментов — только в «Моей музыке»
  if (mode === 'my') {
    const bar = el('div', 'fbar mu-tool');
    const tabs = el('div', 'ftabs');
    for (const [k, t] of [['tracks', 'Все треки'], ['lists', 'Плейлисты'], ['albums', 'Альбомы'], ['artists', 'Исполнители'], ['stats', 'Итоги']]) { const b = el('button', 'ftab' + (view.tab === k && !view.detail ? ' on' : ''), t); b.onclick = () => { view = { tab: k, detail: null }; lyricsOpen = false; limit = 200; repaint(); }; tabs.append(b); }
    const q = el('input', 'mu-q'); q.type = 'search'; q.placeholder = 'Поиск'; q.value = query; q.autocomplete = 'off';
    q.oninput = () => { query = q.value; limit = 200; if (view.detail && view.detail.type !== 'pl') view.detail = null; repaint(); };
    statusEl = el('span', 'mu-stat', statusText());
    const tools = el('div', 'mu-tools');
    tools.append(H.btnEl('＋ Добавить', '', async () => { const n = await MU.pickFiles(); if (n) { H.toast('Добавлено: ' + n); refresh(); } }), ibtn(IC.cog, 'Папка с музыкой', settingsDlg));
    bar.append(tabs, q, statusEl, tools); sec.append(bar);
  } else { statusEl = null; sec.append(el('div', 'mu-gap')); }
  const scroll = el('div', 'mu-scroll');
  if (mode === 'my' && lyricsOpen) { const lv = el('div', 'mu-lyr'); lv.dataset.rel = player.cur?.rel || ''; scroll.append(lv); fillLyrics(lv, player.cur); }
  else scroll.append(mode === 'together' ? togetherBody() : mode === 'bg' ? bgBody() : myBody());
  sec.append(scroll);
  if (mode !== 'bg' || player.cur) sec.append(playerBar(false));
  // перетащили файлы из проводника — копируем в папку
  sec.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); sec.classList.add('drop'); } });
  sec.addEventListener('dragleave', e => { if (e.target === sec) sec.classList.remove('drop'); });
  sec.addEventListener('drop', async e => { e.preventDefault(); sec.classList.remove('drop'); const n = await MU.addDropped(e.dataTransfer.files); H.toast(n ? 'Добавлено: ' + n : 'Подходящей музыки не нашлось'); refresh(); });
  host.textContent = ''; host.append(sec); scroll.scrollTop = keepTop;
  if (hadQ) { const q2 = sec.querySelector('.mu-q'); q2?.focus(); q2?.setSelectionRange(q2.value.length, q2.value.length); }
}

// ---------- текст песни ----------
const lyrCache = new Map();
function parseLrc(text) {
  const timed = [], plain = []; let synced = false;
  for (const raw of text.split(/\r?\n/)) {
    const ms = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)], s = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (ms.length) { synced = true; for (const m of ms) timed.push({ t: +m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3]) : 0), s }); }
    else if (!/^\[(ar|ti|al|by|offset|length|re|ve|au):/i.test(raw.trim())) plain.push({ t: -1, s: raw.trim() });
  }
  return synced ? { synced: true, lines: timed.sort((a, b) => a.t - b.t) } : { synced: false, lines: plain };
}
async function lyricsOf(t) {
  if (lyrCache.has(t.rel)) return lyrCache.get(t.rel);
  let txt = await MU.lyrics(t.p).catch(() => ''); if (!txt && t.ly) txt = t.ly;
  const r = txt && txt.trim() ? parseLrc(txt) : null; lyrCache.set(t.rel, r); return r;
}
let lyrBox = null, lyrLines = [], lyrIdx = -1;
async function fillLyrics(box, t) {
  lyrBox = box; lyrLines = []; lyrIdx = -1;
  if (!t) { box.append(el('p', 'mu-ln dim', 'Включи трек — здесь появится его текст')); return; }
  const head = el('div', 'mu-lh'); head.append(el('b', '', t.title), el('span', '', t.artist || '')); box.append(head);
  const L = await lyricsOf(t); if (lyrBox !== box) return;
  if (!L || !L.lines.length) { box.append(el('p', 'mu-ln dim', 'Текста нет. Положи рядом с файлом «' + cleanName(t.rel.split(/[\\/]/).pop()) + '.lrc» (с метками времени — подсветка идёт как в караоке) или «.txt». Текст из тегов файла тоже подхватывается.')); return; }
  const wrap = el('div', 'mu-lines');
  for (const l of L.lines) { const p = el('p', 'mu-ln' + (l.s ? '' : ' gap'), l.s || (L.synced ? '♪' : '')); if (L.synced) { p.classList.add('syn'); p.onclick = () => { au.currentTime = l.t; }; } wrap.append(p); }
  box.append(wrap);
  lyrLines = L.synced ? L.lines.map((l, i) => ({ t: l.t, e: wrap.children[i] })) : [];
  lyricsTick();
}
function lyricsTick() {
  if (!lyrBox || !lyrLines.length || !lyrBox.isConnected) return;
  const c = au.currentTime + 0.15; let i = lyrLines.length - 1; while (i >= 0 && lyrLines[i].t > c) i--;
  if (i === lyrIdx) return;
  lyrLines[lyrIdx]?.e.classList.remove('on'); lyrIdx = i;
  if (i >= 0) { const e = lyrLines[i].e; e.classList.add('on'); e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
function lyricsSync() {   // сменился трек — обновляем текст
  if (!lyricsOpen || !shown || !host) return;
  const box = host.querySelector('.mu-lyr'); if (!box) return;
  const rel = player.cur?.rel || ''; if (box.dataset.rel === rel) return;
  box.dataset.rel = rel; box.textContent = ''; fillLyrics(box, player.cur);
}

// ---------- «Звук»: переход между треками, скорость, эквалайзер, таймер сна ----------
// Содержимое одно на всех: и окно из «Музыки», и панель в шторке строятся этой функцией.
const sndViews = new Set();   // открытые экземпляры — чтобы правка в одном сразу была видна в другом
function sndRefresh(except) { for (const f of sndViews) if (f !== except) f(); }
function eqSet(eq, on) {
  if (eq) cfg.eq = eq.map(eqClamp);
  if (on != null) cfg.eqOn = on;
  ensureAudio(); applyEq();
}
const eqFmt = g => (g > 0 ? '+' : g < 0 ? '−' : '') + String(Math.abs(g)).replace('.', ',') + ' дБ';

// эквалайзер-круг: три ручки на лучах, дальше от центра — громче
function eqCircle(onChange) {
  const NS = 'http://www.w3.org/2000/svg', W = 300, HH = 274, C = { x: 150, y: 148 }, R0 = 70, K = 3, RMIN = R0 - EQ_MAX * K, RMAX = R0 + EQ_MAX * K;
  const mk = (tag, at, parent) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); if (parent) parent.append(n); return n; };
  const ANG = [150, -90, 30].map(a => a * Math.PI / 180);   // низкие — слева снизу, средние — сверху, высокие — справа снизу
  const dir = ANG.map(a => ({ x: Math.cos(a), y: Math.sin(a) }));
  const pt = (i, g) => { const r = R0 + g * K; return { x: C.x + dir[i].x * r, y: C.y + dir[i].y * r }; };
  const wrap = el('div', 'mu-eqc');
  const svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + HH, class: 'mu-eqsvg', role: 'group', 'aria-label': 'Эквалайзер: низкие, средние и высокие частоты' });
  const gid = 'eqg' + Math.random().toString(36).slice(2, 8), defs = mk('defs', {}, svg);
  const rg = mk('radialGradient', { id: gid, cx: '50%', cy: '50%', r: '50%' }, defs);
  mk('stop', { offset: '0%', 'stop-color': 'var(--acc)', 'stop-opacity': '.08' }, rg); mk('stop', { offset: '100%', 'stop-color': 'var(--acc)', 'stop-opacity': '.42' }, rg);
  mk('circle', { cx: C.x, cy: C.y, r: RMAX + 12, class: 'disc' }, svg);
  for (const g of [-12, -6, 6, 12]) mk('circle', { cx: C.x, cy: C.y, r: R0 + g * K, class: 'ring' + (Math.abs(g) === 12 ? ' edge' : '') }, svg);
  mk('circle', { cx: C.x, cy: C.y, r: R0, class: 'ring zero' }, svg);
  dir.forEach(d => mk('line', { x1: C.x + d.x * RMIN, y1: C.y + d.y * RMIN, x2: C.x + d.x * RMAX, y2: C.y + d.y * RMAX, class: 'spoke' }, svg));
  const z = mk('text', { x: C.x + 4, y: C.y - R0 + 13, class: 'zl' }, svg); z.textContent = '0';
  const poly = mk('polygon', { class: 'area', fill: 'url(#' + gid + ')' }, svg);
  const mid = mk('circle', { cx: C.x, cy: C.y, r: 7, class: 'hub' }, svg);
  mk('title', {}, mid).textContent = 'Двойной щелчок — все полосы на 0 дБ';
  const labs = EQ_BANDS.map((b, i) => {
    const top = i === 1, lr = top ? RMAX + 18 : RMAX + 36, lx = C.x + dir[i].x * (lr + (top ? 0 : 8)), ly = C.y + dir[i].y * lr;
    const g = mk('g', { class: 'lab' }, svg);
    mk('text', { x: lx, y: top ? ly - 14 : ly + 4, class: 'nm' }, g).textContent = b.name;
    return mk('text', { x: lx, y: top ? ly + 1 : ly + 20, class: 'vl' }, g);
  });
  const knobs = EQ_BANDS.map((b, i) => {
    const k = mk('circle', { r: 11, class: 'knob', tabindex: '0', role: 'slider', 'aria-label': b.name + ' частоты (' + b.hint + ')', 'aria-valuemin': -EQ_MAX, 'aria-valuemax': EQ_MAX, 'aria-orientation': 'vertical' }, svg);
    const t = mk('title', {}, k); t.textContent = b.name + ' — ' + b.hint + '. Тяни от центра или к центру; двойной щелчок — 0 дБ';
    return k;
  });
  wrap.append(svg);
  let busy = -1;
  const paint = () => {
    const ps = cfg.eq.map((g, i) => pt(i, g));
    poly.setAttribute('points', ps.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' '));
    knobs.forEach((k, i) => { k.setAttribute('cx', ps[i].x.toFixed(1)); k.setAttribute('cy', ps[i].y.toFixed(1)); k.setAttribute('aria-valuenow', cfg.eq[i]); k.setAttribute('aria-valuetext', eqFmt(cfg.eq[i])); k.classList.toggle('busy', busy === i); });
    labs.forEach((v, i) => { v.textContent = eqFmt(cfg.eq[i]); v.classList.toggle('pos', cfg.eq[i] > 0); v.classList.toggle('neg', cfg.eq[i] < 0); });
    wrap.classList.toggle('off', !cfg.eqOn);
  };
  const setBand = (i, g, final) => {
    g = eqClamp(g); if (g === cfg.eq[i] && cfg.eqOn && !final) return;
    const eq = cfg.eq.slice(); eq[i] = g; eqSet(eq, true); paint(); onChange(final);
  };
  // перетаскивание мышью и пальцем: ловим ближайшую ручку и двигаем её вдоль её луча
  const toSvg = e => { const m = svg.getScreenCTM(); if (!m) return null; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: p.x - C.x, y: p.y - C.y }; };
  const gainAt = (i, p) => (Math.max(RMIN, Math.min(RMAX, p.x * dir[i].x + p.y * dir[i].y)) - R0) / K;
  svg.addEventListener('pointerdown', e => {
    if (e.button) return; const p = toSvg(e); if (!p) return;
    if (e.target === mid) return;   // центр — для двойного щелчка «сброс»
    let best = 0, bd = 1e9;
    cfg.eq.forEach((g, i) => { const q = pt(i, g), d = Math.hypot(q.x - C.x - p.x, q.y - C.y - p.y); if (d < bd) { bd = d; best = i; } });
    if (bd > 30) { const a = Math.atan2(p.y, p.x); best = 0; let ba = 9; ANG.forEach((x, i) => { const da = Math.abs(Math.atan2(Math.sin(a - x), Math.cos(a - x))); if (da < ba) { ba = da; best = i; } }); }
    e.preventDefault(); busy = best; knobs[best].focus({ preventScroll: true });
    try { svg.setPointerCapture(e.pointerId); } catch (er) {}
    setBand(best, gainAt(best, p), false);
  });
  svg.addEventListener('pointermove', e => { if (busy < 0) return; const p = toSvg(e); if (p) setBand(busy, gainAt(busy, p), false); });
  const end = () => { if (busy < 0) return; busy = -1; paint(); onChange(true); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end); svg.addEventListener('lostpointercapture', end);
  svg.addEventListener('dblclick', e => {
    const i = knobs.indexOf(e.target);
    if (i >= 0) setBand(i, 0, true); else if (e.target === mid) { eqSet([0, 0, 0]); paint(); onChange(true); }
  });
  // клавиатура: стрелки ±1 дБ, PageUp/PageDown ±3, Home/End — край, 0 или Delete — ноль
  knobs.forEach((k, i) => k.addEventListener('keydown', e => {
    const g = cfg.eq[i], m = { ArrowUp: g + 1, ArrowRight: g + 1, ArrowDown: g - 1, ArrowLeft: g - 1, PageUp: g + 3, PageDown: g - 3, Home: -EQ_MAX, End: EQ_MAX, Delete: 0, Backspace: 0, 0: 0 }[e.key];
    if (m == null) return; e.preventDefault(); e.stopPropagation(); setBand(i, m, true);
  }));
  wrap.paint = paint; paint();
  return wrap;
}

function soundBody(close) {
  const body = el('div', 'mu-sndb');
  const sel = (opts, val, f) => { const s = el('select', 'mu-sort'); for (const [v, t] of opts) { const o = el('option', '', t); o.value = v; s.append(o); } s.value = String(val); s.onchange = () => f(s.value); return s; };
  const lab = (t, ctl, hint) => { const d = el('div', 'mu-set'); const l = el('div'); l.append(el('b', '', t)); if (hint) l.append(el('span', '', hint)); d.append(l, ctl); return d; };
  const xfSel = sel([[0, 'Без паузы'], [3, 'Плавно, 3 с'], [6, 'Плавно, 6 с'], [10, 'Плавно, 10 с']], cfg.xf, v => { cfg.xf = +v; saveCfg(); armNext(); player.sync(); sndRefresh(paint); });
  const rtSel = sel([[0.75, '×0,75'], [0.9, '×0,9'], [1, 'Обычная'], [1.1, '×1,1'], [1.25, '×1,25'], [1.5, '×1,5'], [2, '×2']], cfg.rate, v => { setRate(+v); sndRefresh(paint); });
  const sets = el('div', 'mu-sndsec');
  sets.append(lab('Переход между треками', xfSel, 'Следующий трек готовится заранее'), lab('Скорость', rtSel, 'Высота голоса не меняется'));
  // эквалайзер
  const eqSec = el('div', 'mu-sndsec eq'), on = el('label', 'switch'), cb = el('input'); cb.type = 'checkbox';
  on.append(el('b', '', 'Эквалайзер'), cb);
  cb.onchange = () => { eqSet(null, cb.checked); saveCfg(); paint(); player.sync(); sndRefresh(paint); };
  const circ = eqCircle(final => { cb.checked = cfg.eqOn; paintChips(); if (final) { saveCfg(); player.sync(); } sndRefresh(paint); });
  const chips = el('div', 'fchips sm mu-eqp'), chipEls = [];
  for (const [k, [name, g]] of Object.entries(EQ_PRESETS)) { const c = el('button', 'fchip', name); c.type = 'button'; c.onclick = () => { eqSet(g, true); saveCfg(); paint(); player.sync(); sndRefresh(paint); }; chips.append(c); chipEls.push([c, g]); }
  const reset = el('button', 'fchip ghost', 'Сброс'); reset.type = 'button'; reset.title = 'Все полосы — на 0 дБ';
  reset.onclick = () => { eqSet([0, 0, 0]); saveCfg(); paint(); player.sync(); sndRefresh(paint); };
  chips.append(reset);
  const paintChips = () => { for (const [c, g] of chipEls) c.classList.toggle('on', cfg.eqOn && g.every((x, i) => x === cfg.eq[i])); reset.disabled = cfg.eq.every(x => !x); };
  eqSec.append(on, circ, chips);
  // таймер сна
  const slSec = el('div', 'mu-sndsec'), sl = el('div', 'fchips sm mu-sleep'), st = el('p', 'fhint', ''), slBtns = [];
  for (const [v, t] of [[15, '15 мин'], [30, '30 мин'], [45, '45 мин'], [60, '1 час'], ['track', 'После трека'], [0, 'Выкл']]) { const b = el('button', 'fchip', t); b.type = 'button'; b.onclick = () => { setSleep(v); paint(); sndRefresh(paint); }; sl.append(b); slBtns.push(b); }
  slSec.append(el('h3', 'mu-h2', 'Таймер сна'), sl, st);
  body.append(sets, eqSec, slSec);
  if (close) { const row = el('div', 'row'); row.append(H.btnEl('Готово', 'pri', close)); body.append(row); }
  function paint() {
    if (!body.isConnected && body.dataset.live) { sndViews.delete(paint); return; }
    xfSel.value = String(cfg.xf); rtSel.value = String(cfg.rate); cb.checked = cfg.eqOn; circ.paint(); paintChips();
    st.textContent = sleep.until ? 'Музыка затихнет через ' + Math.max(1, Math.round((sleep.until - Date.now()) / 60000)) + ' мин' : sleep.endOfTrack ? 'Остановлюсь после этого трека' : 'Таймер сна выключен';
    slBtns.at(-1).classList.toggle('on', !sleep.until && !sleep.endOfTrack); slBtns.at(-2).classList.toggle('on', sleep.endOfTrack);
  }
  paint(); sndViews.add(paint);
  requestAnimationFrame(() => { body.dataset.live = '1'; });
  return body;
}

// окно «Звук» из «Музыки» — всегда одно: повторное нажатие закрывает его, а не открывает второе
let sndDlgClose = null;
function soundDlg() {
  if (sndDlgClose) { sndDlgClose(); return; }
  let ov = null;
  const c = H.modal((card, close) => {
    ov = card.parentElement; card.classList.add('mu-snd');
    card.append(el('h2', '', 'Звук'), soundBody(close));
  }, 'mu-sndov');
  sndDlgClose = c;
  // закрыли кнопкой, щелчком мимо или Esc — окно начинает гаснуть (класс out): забываем его
  if (ov) new MutationObserver((m, o) => { if (ov.classList.contains('out')) { if (sndDlgClose === c) sndDlgClose = null; o.disconnect(); } }).observe(ov, { attributes: true, attributeFilter: ['class'] });
}


// ---------- итоги: что слушал за неделю, месяц, год ----------
let statsPer = 'week';
const PERIODS = [['week', 'Неделя', 7], ['month', 'Месяц', 30], ['year', 'Год', 365], ['all', 'Всё время', 0]];
const hm = sec => { const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60); return h ? h + ' ч ' + m + ' мин' : Math.max(1, m) + ' мин'; };
function statsBody() {
  const wrap = el('div', 'mu-stats'), chips = el('div', 'fchips');
  for (const [k, t] of PERIODS) { const b = el('button', 'fchip' + (statsPer === k ? ' on' : ''), t); b.onclick = () => { statsPer = k; repaint(); }; chips.append(b); }
  const box = el('div', 'mu-sbox'); wrap.append(chips, box);
  tx('plays', 'readonly', s => s.getAll()).then(rows => paintStats(box, rows || [])).catch(() => box.append(el('p', 'fhint', 'Итоги пока не прочитались.')));
  return wrap;
}
function paintStats(box, all) {
  const days = PERIODS.find(x => x[0] === statsPer)[2], from = days ? Date.now() - days * 864e5 : 0, rows = all.filter(x => x.ts >= from);
  box.textContent = '';
  if (!rows.length) { const e = el('div', 'fempty'); e.append(el('div', 'big', '📊'), el('b', '', 'Пока нечего подводить'), el('span', '', 'Слушай музыку в Кинозале — здесь появятся любимые треки и исполнители, сколько часов ты слушал и когда. Считается только то, что звучало хотя бы полминуты.')); box.append(e); return; }
  const total = rows.reduce((a, x) => a + x.sec, 0), key = x => x.h || x.rel;
  const tracks = new Map(), artists = new Map(), wd = Array(7).fill(0), hr = Array(24).fill(0);
  for (const x of rows) {
    const k = key(x); let t = tracks.get(k); if (!t) tracks.set(k, t = { x, n: 0, sec: 0 }); t.n++; t.sec += x.sec;
    const an = x.artist || 'Без исполнителя'; let a = artists.get(an); if (!a) artists.set(an, a = { name: an, n: 0, sec: 0 }); a.n++; a.sec += x.sec;
    const d = new Date(x.ts); wd[(d.getDay() + 6) % 7] += x.sec; hr[d.getHours()] += x.sec;
  }
  const topT = [...tracks.values()].sort((a, b) => b.n - a.n || b.sec - a.sec).slice(0, 8), topA = [...artists.values()].sort((a, b) => b.sec - a.sec).slice(0, 6);
  const dayNames = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'], bestD = wd.indexOf(Math.max(...wd)), bestH = hr.indexOf(Math.max(...hr));
  const hero = el('div', 'mu-hero'), big = el('div', 'mu-hbig'); big.append(el('b', '', hm(total)), el('span', '', 'ты слушал(а) музыку'));
  const kp = el('div', 'mu-hkpi');
  for (const [n, l] of [[rows.length, plural(rows.length, 'прослушивание', 'прослушивания', 'прослушиваний')], [tracks.size, plural(tracks.size, 'разный трек', 'разных трека', 'разных треков')], [topA[0]?.name || '—', 'главный исполнитель']]) { const c = el('div'); c.append(el('b', '', String(n)), el('span', '', l)); kp.append(c); }
  hero.append(big, kp); box.append(hero);
  box.append(el('p', 'fhint', 'Чаще всего ты слушаешь ' + dayNames[bestD] + ', около ' + String(bestH).padStart(2, '0') + ':00.'));
  const grid = el('div', 'mu-sgrid');
  const rank = el('section', 'mu-srank'); rank.append(el('h3', '', 'Любимые треки'));
  topT.forEach((t, i) => { const lt = lib.get(t.x.rel) || byHash(t.x.h); const r0 = el('div', 'mu-rk'); r0.append(el('i', '', String(i + 1)), lt ? coverEl(lt, 'sm') : el('div', 'mu-cv sm'), (() => { const d = el('div'); d.append(el('b', '', t.x.title), el('span', '', t.x.artist || '')); return d; })(), el('u', '', t.n + '×')); if (lt) r0.onclick = () => { if (!guestBlock()) { player.src = null; setQueue([lt], 0); } }; rank.append(r0); });
  const ar = el('section', 'mu-srank'); ar.append(el('h3', '', 'Исполнители'));
  const maxA = topA[0]?.sec || 1;
  topA.forEach((a, i) => { const r0 = el('div', 'mu-rk bar'); const d = el('div'); d.append(el('b', '', a.name), (() => { const bar = el('em'); bar.style.setProperty('--w', Math.round(a.sec / maxA * 100) + '%'); return bar; })()); r0.append(el('i', '', String(i + 1)), d, el('u', '', hm(a.sec))); ar.append(r0); });
  const dw = el('section', 'mu-srank'); dw.append(el('h3', '', 'По дням недели'));
  const maxW = Math.max(...wd) || 1, bars = el('div', 'mu-wd');
  ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach((n, i) => { const c = el('div'); const b = el('i'); b.style.height = Math.max(4, Math.round(wd[i] / maxW * 100)) + '%'; b.title = hm(wd[i]); c.append(b, el('span', '', n)); bars.append(c); });
  dw.append(bars);
  // какие полки собрали больше всего прослушиваний
  const sh = PL.lists.map(l => ({ l, n: rows.filter(x => l.items.some(i => (i.h && i.h === x.h) || (i.r && i.r === x.rel))).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 4);
  const shs = el('section', 'mu-srank'); shs.append(el('h3', '', 'Любимые полки'));
  if (sh.length) for (const x of sh) { const r0 = el('div', 'mu-rk'); r0.append(el('i', '', x.l.emoji), (() => { const d = el('div'); d.append(el('b', '', x.l.name)); return d; })(), el('u', '', x.n + '×')); shs.append(r0); } else shs.append(el('p', 'fhint', 'Положи треки на полки — и здесь увидишь, какие настроения слушаешь чаще.'));
  grid.append(rank, ar, dw, shs); box.append(grid);
}

// ---------- слушать вместе ----------
// Ведущий играет, остальные слышат то же самое секунда в секунду. Два способа, гость выбирает сам:
//  • «У каждого своё» — гость докачивает трек себе (проверка SHA-256), играет его у себя и подтягивается к ведущему: звук без задержек и сжатия;
//  • «Через ведущего» — гость слушает трансляцию того, что играет у ведущего (треки у себя качать не надо).
// Пока трек докачивается, гость слушает трансляцию, а когда докачал — сам переключается на свой. Всё идёт напрямую между компьютерами.
let sess = null;   // {sid, host, hostL, hostU, peers: Map(uid → {L, name, mode, pct, last, call, tx}), track, off, offs, mode, pref, hold, userPaused, aud, dl, lastSt, timers}
const netTo = (to, m) => { try { return H.net.send(to, { t: 'mu', ...m }); } catch (e) { return false; } };
const isGuest = () => !!sess && !sess.host;
const guestBlock = () => { if (isGuest()) { H.toast('Здесь включает ' + H.net.nameOf(sess.hostU)); return true; } return false; };
let streamDest = null;
const sdpHq = sdp => sdp.replace('useinbandfec=1', 'useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=192000');
const baseName = rel => String(rel || '').split(/[\\/]/).pop();
async function ensureHash(t) {
  if (!t.h) { const h = await MU.hash(t.p).catch(() => ''); if (h) { t.h = h; hashIdx = null; healItems(t); tx('tracks', 'readwrite', s => s.put(t)).catch(() => {}); } }
  return t.h || '';
}
async function hostState() {
  const t = player.cur; const base = { sid: sess.sid, k: 'st' };
  if (!t || !decks || !decks[deckI].rel) return { ...base, idle: 1 };
  await ensureHash(t);
  const pn = planNext(), nt = pn && lib.get(pn.rel); if (nt) ensureHash(nt);
  return { ...base, h: t.h || '', title: t.title, artist: t.artist, album: t.album, dur: t.dur || 0, name: baseName(t.rel), size: t.size, playing: !au.paused, pos: au.currentTime, ts: Date.now(), rate: au.playbackRate || 1, nx: nt && nt.h ? { h: nt.h, name: baseName(nt.rel), size: nt.size, title: nt.title } : null };
}
async function bcast(only) {
  if (!sess?.host) return;
  const m = await hostState(); if (!sess?.host) return;
  if (only) netTo(only, m); else for (const p of sess.peers.values()) netTo(p.L, m);
}
function sessSync() { if (!sess?.host) return; clearTimeout(sess.syncT); sess.syncT = setTimeout(() => bcast(), 60); }
function newSess(host, sid) {
  sess = { sid, host, hostL: null, hostU: '', peers: new Map(), track: null, off: 0, offs: [], mode: 'wait', pref: H.store.get('musicPref', 'each') === 'stream' ? 'stream' : 'each', invited: new Set(), hold: 0, userPaused: false, aud: null, dl: null, dlq: [], dlSeen: new Set(), lastSt: null, last: Date.now(), timers: [] };
  sess.timers.push(setInterval(tickSess, 4000));
  sessUi();
}
function dropSess() {
  if (!sess) return;
  for (const t of sess.timers) clearInterval(t); clearTimeout(sess.syncT);
  for (const p of sess.peers.values()) try { p.call?.close(); } catch (e) {}
  dlAbort();
  if (sess.aud) { try { sess.aud.pause(); sess.aud.srcObject = null; } catch (e) {} }
  sess = null; sessUi(); player.sync();
}
function endSess(notify) {
  if (!sess) return;
  if (sess.host) { for (const p of sess.peers.values()) netTo(p.L, { k: 'end', sid: sess.sid }); }
  else if (notify && sess.hostL) netTo(sess.hostL, { k: 'leave', sid: sess.sid });
  dropSess();
}
function tickSess() {
  if (!sess) return;
  if (sess.host) {
    for (const [u, p] of [...sess.peers]) if (Date.now() - p.last > 40000) { try { p.call?.close(); } catch (e) {} sess.peers.delete(u); H.toast(p.name + ' вышел(-ла) из прослушивания'); sessUi(); }
    bcast();
  } else {
    if (Date.now() - sess.last > 25000) { H.toast('Связь с ведущим потеряна — прослушивание закончено'); dropSess(); return; }
    if (sess.hostL) netTo(sess.hostL, { k: 'ping', sid: sess.sid, c: Date.now() });
  }
}
// ведущий: позвать друга
function inviteTo(uid2) {
  if (!sess) newSess(true, uid2.slice(0, 3) + Math.random().toString(36).slice(2, 8));
  sess.invited.add(uid2);
  const t = player.cur;
  netTo(uid2, { k: 'inv', sid: sess.sid, title: t?.title || '', artist: t?.artist || '' });
  H.toast('Позвал(а) ' + H.net.nameOf(uid2));
}
// гость: выбираем способ — по приглашению или нажав «Присоединиться» у статуса друга
function joinChoice(to, uid, sid, title, artist, solo) {
  const who = H.net.nameOf(uid); let dlg = null; const ring = setTimeout(() => dlg?.close?.(), 90000);
  H.modal((card, close) => {
    dlg = { close }; card.classList.add('mu-inv');
    card.append(el('h2', '', '🎧 ' + who + (solo ? ' слушает музыку' : ' зовёт слушать вместе')), el('p', '', title ? 'Сейчас играет: «' + String(title).slice(0, 80) + '»' + (artist ? ' — ' + String(artist).slice(0, 60) : '') : 'Музыка у ' + who + ' скоро начнётся.'));
    const join = pref => {
      clearTimeout(ring); close(); if (sess) return; H.store.set('musicPref', pref);
      newSess(false, sid); sess.pref = pref; sess.hostL = typeof to === 'object' ? to : null; sess.hostU = uid; netTo(to, { k: 'join', sid });
      gotoMode('together'); H.openSelf(); H.toast('Подключаюсь к ' + who + '…');
    };
    const opt = (ic, t, sub, pref) => { const b = el('button', 'mu-opt'); b.append(el('i', '', ic), el('b', '', t), el('span', '', sub)); b.onclick = () => join(pref); return b; };
    card.append(opt('💾', 'У каждого своё', 'Докачаю треки себе (проверю их контрольной суммой) и буду слушать у себя, пока ' + who + ' включает. Лучший звук, без задержки.', 'each'),
      opt('📡', 'Через ' + who, 'Слушаю трансляцию: ничего не качаю, звук идёт от ' + who + ' (чуть сжатый, с небольшой задержкой).', 'stream'));
    const row = el('div', 'row'); row.append(H.btnEl(solo ? 'Отмена' : 'Не сейчас', '', () => { clearTimeout(ring); if (!solo) netTo(to, { k: 'no', sid }); close(); })); card.append(row);
  });
}
function onInvite(L, d) {
  if (sess) { netTo(L, { k: 'busy', sid: String(d.sid || '') }); return; }
  const sid = String(d.sid || '').slice(0, 20); if (!sid) return;
  joinChoice(L, L.uid, sid, d.title, d.artist, false);
}
// статус друга «слушает» → «Присоединиться»
function joinFrom(uid, sid, a) {
  if (sess) { H.toast('Ты уже слушаешь вместе — сначала выйди'); return; }
  if (!sid) return;
  joinChoice(uid, uid, sid === 'solo' ? 'j' + Math.random().toString(36).slice(2, 10) : sid, a?.title, a?.artist, true);
}
function onMusicMsg(L, d) {
  const k = d.k, sid = String(d.sid || '');
  if (k === 'inv') return onInvite(L, d);
  if (k === 'no' || k === 'busy') { if (sess?.host && sess.sid === sid) H.toast(H.net.nameOf(L.uid) + (k === 'no' ? ' пока не может' : ' сейчас слушает другое')); return; }
  if (k === 'rx') { onFriendRx(L, d); relayRx(L, d); return; }
  if (k === 'join' && !sess && /^j[a-z0-9]{6,12}$/.test(sid)) {   // присоединяются к тому, кто просто слушает: сеанс заводим на лету
    if (!H.net.canJoin(L.uid) || !player.cur || au.paused) { netTo(L, { k: 'no', sid }); return; }
    newSess(true, sid); sess.invited.add(L.uid);
  }
  if (!sess || sess.sid !== sid) return;
  if (sess.host) {
    if (k === 'join') {
      if (!sess.invited.has(L.uid) && !H.net.canJoin(L.uid)) { netTo(L, { k: 'no', sid }); return; }   // без приглашения и без разрешения по статусу — нельзя
      sess.peers.set(L.uid, { L, name: H.net.nameOf(L.uid), mode: 'wait', pct: 0, last: Date.now(), call: null, tx: null }); H.toast(H.net.nameOf(L.uid) + ' слушает вместе с тобой'); sessUi(); bcast(L); }
    else if (k === 'leave') { const p = sess.peers.get(L.uid); try { p?.call?.close(); } catch (e) {} sess.peers.delete(L.uid); H.toast(H.net.nameOf(L.uid) + ' вышел(-ла)'); sessUi(); }
    else if (k === 'ping') { const p = sess.peers.get(L.uid); if (p) { p.last = Date.now(); p.L = L; } netTo(L, { k: 'pong', sid, c: d.c, s: Date.now() }); }
    else if (k === 'mode') { const p = sess.peers.get(L.uid); if (p) { p.mode = String(d.m || ''); p.pct = +d.p || 0; sessUi(); } }
    else if (k === 'need') startStreamTo(L);
    else if (k === 'get') serveGet(L, d);
    else if (k === 'ack') serveAck(L, d);
  } else {
    if (L.uid !== sess.hostU) return;
    if (k === 'st') { sess.last = Date.now(); sess.hostL = L; sess.lastSt = d; applySt(d); }
    else if (k === 'pong') { const now = Date.now(), rtt = now - (+d.c || now); sess.offs.push({ rtt, off: (+d.s || now) + rtt / 2 - now }); if (sess.offs.length > 8) sess.offs.shift(); sess.off = sess.offs.reduce((a, b) => b.rtt < a.rtt ? b : a).off; }
    else if (k === 'end') { H.toast(H.net.nameOf(L.uid) + ' закончил(-а) прослушивание'); dropSess(); }
    else if (k === 'chunk') dlChunk(d);
    else if (k === 'nofile') dlFail(String(d.h || ''), 'у ведущего этого файла уже нет');
  }
}
// трансляция: ведущий отдаёт то, что играет у него (после эквалайзера), тем, кто слушает через него
function startStreamTo(L) {
  if (!sess?.host) return; const p = sess.peers.get(L.uid); if (!p || p.call) return;
  ensureAudio();
  if (!streamDest) { streamDest = actx.createMediaStreamDestination(); master.connect(streamDest); }
  const pr = H.net.peer(); if (!pr) return;
  try { const c = pr.call(L.peer, streamDest.stream, { metadata: { mu: sess.sid }, sdpTransform: sdpHq }); p.call = c; c.on('close', () => { if (p.call === c) p.call = null; }); c.on('error', () => { if (p.call === c) p.call = null; }); } catch (e) { console.warn('[музыка] трансляция', e); }
}
function onMusicCall(c) {
  if (!isGuest() || c.metadata?.mu !== sess.sid) { try { c.close(); } catch (e) {} return; }
  c.answer();
  c.on('stream', s => {
    if (!sess) return;
    const a = sess.aud ||= new Audio(); a.srcObject = s; a.volume = player.vol; a.muted = sess.mode !== 'stream' || !!sess.userPaused; a.play().catch(() => {});
  });
}
function setSessMode(m) {
  if (sess.mode === m) return; sess.mode = m; if (sess.aud) sess.aud.muted = m !== 'stream' || !!sess.userPaused;
  reportMode(); sessUi();
}
const reportMode = () => { if (sess?.hostL) netTo(sess.hostL, { k: 'mode', sid: sess.sid, m: sess.mode, p: sess.dl && sess.dl.size ? Math.round(sess.dl.got / sess.dl.size * 100) : 0 }); };

// ---- докачка трека у ведущего ----
const DL_CH = 64 * 1024, DL_WIN = 16, DL_MAX = 400e6;
function serveGet(L, d) {   // ведущий: гость просит файл (с позиции o)
  const p = sess.peers.get(L.uid); const t = byHash(String(d.h || ''));
  if (!p) return;
  if (!t || t.size > DL_MAX) { netTo(L, { k: 'nofile', sid: sess.sid, h: String(d.h || '') }); return; }
  p.tx = { h: t.h, t, o: Math.max(0, +d.o || 0), acked: Math.max(0, +d.o || 0), busy: false };
  servePump(L, p);
}
function serveAck(L, d) { const p = sess.peers.get(L.uid); if (!p?.tx || p.tx.h !== String(d.h || '')) return; p.tx.acked = Math.max(p.tx.acked, +d.o || 0); servePump(L, p); }
async function servePump(L, p) {
  const x = p.tx; if (!x || x.busy) return; x.busy = true;
  try {
    while (sess?.host && p.tx === x && x.o < x.t.size && (x.o - x.acked) < DL_CH * DL_WIN) {
      const len = Math.min(DL_CH, x.t.size - x.o), b = await MU.read(x.t.p, x.o, len); if (p.tx !== x) break;
      const u = b instanceof Uint8Array ? b : new Uint8Array(b);
      if (!netTo(p.L, { k: 'chunk', sid: sess.sid, h: x.h, o: x.o, size: x.t.size, d: u })) break;
      x.o += u.length; if (!u.length) break;
    }
  } catch (e) { console.warn('[музыка] отдача файла', e); } finally { x.busy = false; }
}
function dlWant(info) {   // гость: если у меня такого трека нет — поставить в очередь на докачку
  if (!info?.h || byHash(info.h) || sess.dlSeen.has(info.h) || (info.size || 0) > DL_MAX) return;   // уже качаю, в очереди или только что скачал (список файлов ещё не обновился)
  sess.dlSeen.add(info.h); sess.dlq.push({ h: info.h, name: info.name || info.h.slice(0, 8) + '.mp3', size: info.size || 0, title: info.title || '' }); dlNext();
}
async function dlNext() {
  if (!sess || sess.dl || !sess.dlq.length) return;
  const x = sess.dlq.shift(); const id = 'dl' + Math.random().toString(36).slice(2, 9);
  sess.dl = { ...x, id, got: 0 };
  try { await MU.saveOpen(id, x.name); } catch (e) { sess.dl = null; return; }
  netTo(sess.hostL, { k: 'get', sid: sess.sid, h: x.h, o: 0 }); reportMode(); sessUi();
}
async function dlChunk(d) {
  const x = sess?.dl; if (!x || x.h !== String(d.h || '')) return;
  const u = d.d instanceof Uint8Array ? d.d : new Uint8Array(d.d || []);
  if ((+d.o || 0) !== x.got) { netTo(sess.hostL, { k: 'get', sid: sess.sid, h: x.h, o: x.got }); return; }   // кусок пропустили — просим с нужного места
  x.size = +d.size || x.size; await MU.saveWrite(x.id, x.got, u); x.got += u.length;
  if (x.got >= x.size) { dlDone(x); return; }
  netTo(sess.hostL, { k: 'ack', sid: sess.sid, h: x.h, o: x.got });
  if (x.got % (DL_CH * 8) < DL_CH) { reportMode(); sessUi(); }
}
async function dlDone(x) {
  let res = null; try { res = await MU.saveDone(x.id, x.h); } catch (e) {}
  if (sess?.dl === x) sess.dl = null;
  if (res?.ok) { H.toast('Трек скачан: ' + (x.title || x.name)); await refresh(); if (sess?.lastSt) applySt(sess.lastSt); }   // теперь он свой — переключаемся с трансляции
  else { H.toast('Трек не скачался целиком — проверка не прошла'); sess?.dlSeen.delete(x.h); }
  reportMode(); sessUi(); dlNext();
}
function dlFail(h, why) { if (sess?.dl?.h === h) { MU.saveDrop(sess.dl.id).catch(() => {}); sess.dlSeen.delete(h); sess.dl = null; H.toast('Не удалось скачать трек: ' + why); sessUi(); dlNext(); } }
function dlAbort() { if (sess?.dl) MU.saveDrop(sess.dl.id).catch(() => {}); if (sess) { sess.dl = null; sess.dlq = []; sess.dlSeen.clear(); } }
function setPref(p) {
  if (!isGuest() || sess.pref === p) return; sess.pref = p; H.store.set('musicPref', p);
  if (p === 'stream') dlAbort();
  if (sess.lastSt) applySt(sess.lastSt); sessUi();
}

// гость: подтянуться к состоянию ведущего
function applySt(st) {
  sess.track = st.idle ? null : { h: st.h, title: st.title, artist: st.artist, album: st.album, dur: st.dur };
  if (st.idle) { if (decks) { silence(decks[0]); silence(decks[1]); } setSessMode('wait'); player.sync(); sessUi(); return; }
  const local = byHash(st.h), hostNow = Date.now() + sess.off;
  const target = st.pos + (st.playing ? Math.max(0, hostNow - st.ts) / 1000 * (st.rate || 1) : 0);
  if (sess.pref === 'each') { dlWant(st); if (st.nx) dlWant(st.nx); }
  if (local && sess.pref === 'each') {
    if (sess.aud) sess.aud.muted = true;
    const changed = player.cur?.rel !== local.rel || !decks || !decks[deckI].rel;
    if (changed) {
      setSessMode('local'); sess.internal = true; player.src = null; setQueue([local], 0); sess.internal = false;   // setQueue сам запускает; ниже подгоняем позицию и паузу
      sess.hold = Date.now() + 1500; au.currentTime = target; if (!st.playing || sess.userPaused) au.pause();
    } else {
      setSessMode('local');
      if (au.playbackRate !== (st.rate || 1)) for (const d of decks) d.el.playbackRate = st.rate || 1;
      if (!st.playing) { if (!au.paused) au.pause(); if (Math.abs(au.currentTime - st.pos) > 0.3) au.currentTime = st.pos; }
      else if (!sess.userPaused) {
        if (au.paused) { au.currentTime = target; au.play().catch(() => {}); sess.hold = Date.now() + 1500; }
        else if (Date.now() > sess.hold && Math.abs(au.currentTime - target) > 0.35) { au.currentTime = target; sess.hold = Date.now() + 1500; }
      }
    }
  } else {
    if (decks) { for (const d of decks) { if (!d.el.paused) d.el.pause(); } }
    if (sess.mode !== 'stream') { setSessMode('stream'); netTo(sess.hostL, { k: 'need', sid: sess.sid }); }
    if (sess.aud) sess.aud.muted = !!sess.userPaused;
  }
  sessUi(); player.sync();
}
// чужая реакция: летит эмодзи, запоминаем «вайб» трека
function onFriendRx(L, d) {
  const e = String(d.e || '').slice(0, 8); if (!e) return;
  const who = (sess && !sess.host && L.uid === sess.hostU && d.by) ? String(d.by).slice(0, 12) : L.uid;   // ведущий пересылает чужие реакции и называет автора
  const t = byHash(String(d.h || '')); const key = t ? rxKey(t) : String(d.h || ''); if (!key) return;
  const lst = ((FR[key] ||= {})[who] ||= []); if (!lst.includes(e)) lst.push(e); saveFR();
  fly(e, H.net.nameOf(who)); repaint();
}
function netReact(t, e, pos) {
  if (!sess) return;
  const m = { k: 'rx', sid: sess.sid, h: t.h || '', e, pos: pos == null ? -1 : Math.round(pos) };
  if (sess.host) for (const p of sess.peers.values()) netTo(p.L, m); else if (sess.hostL) netTo(sess.hostL, m);
}
const relayRx = (L, d) => { if (sess?.host && sess.sid === String(d.sid || '')) for (const [u, p] of sess.peers) if (u !== L.uid) netTo(p.L, { k: 'rx', sid: sess.sid, h: d.h, e: d.e, pos: d.pos, by: L.uid }); };

// окно «позвать друга»
function inviteDlg() {
  H.modal((card, close) => {
    card.append(el('h2', '', '🎧 Позвать слушать'));
    const fr = H.net.friends().filter(f => !sess || !sess.peers.has(f.id)); const box = el('div', 'mu-pick');
    for (const f of fr) { const b = el('button', 'mu-prow'); b.append(el('b', '', f.name), el('span', '', 'позвать')); b.onclick = () => { inviteTo(f.id); close(); }; box.append(b); }
    if (!fr.length) box.append(el('p', '', 'Сейчас нет друзей онлайн с новым Кинозалом (1.15 или новее).'));
    const row = el('div', 'row'); row.append(H.btnEl('Готово', 'pri', close)); card.append(box, row);
  });
}
let sessUiT = 0;
function sessUi() { clearTimeout(sessUiT); sessUiT = setTimeout(() => { if (shown) repaint(); for (const b of player.bars) b.sync(); }, 80); }
// что показывать друзьям в статусе «слушает»
function activity(allowJoin) {
  if (sess && !sess.host && sess.track) return { title: sess.track.title || '', artist: sess.track.artist || '', together: true, sid: '' };   // слушаю чужое: присоединиться к нему из моего статуса нельзя
  const t = player.cur; if (!t || !decks || !decks[deckI].rel || au.paused) return null;
  return { title: t.title, artist: t.artist || '', together: !!sess, sid: sess?.host ? sess.sid : (allowJoin ? 'solo' : '') };
}
// карточка состояния на экране «Вместе»
function sessCard() {
  const c = el('div', 'mu-sc');
  const head = el('div', 'mu-sch'), ic = el('div', 'mu-sci', '🎧'), tt = el('div'); head.append(ic, tt);
  if (!sess) {
    tt.append(el('b', '', 'Слушайте вместе'), el('span', '', 'Позови друга — вы услышите одно и то же в одну секунду, где бы ни были.'));
    c.append(head); const act = el('div', 'mu-act'); act.append(H.btnEl('＋ Позвать друга', 'pri', inviteDlg)); c.append(act);
    const how = el('div', 'mu-how');
    for (const [i, t, s] of [['💾', 'У каждого своё', 'Друг докачивает треки себе и слушает у себя. Лучший звук, работает с хорошей связью.'], ['📡', 'Через тебя', 'Друг слушает трансляцию — ничего качать не нужно. Подойдёт, если места мало или нет времени.']]) { const h = el('div'); h.append(el('i', '', i), el('b', '', t), el('span', '', s)); how.append(h); }
    c.append(how); return c;
  }
  if (sess.host) {
    tt.append(el('b', '', 'Ты включаешь для всех'), el('span', '', sess.peers.size ? 'Слушают: ' + sess.peers.size : 'Ждём ответа друзей'));
    c.append(head);
    const peers = el('div', 'mu-peers');
    for (const p of sess.peers.values()) { const x = el('div', 'mu-peer'); x.append(el('b', '', p.name), el('span', '', p.mode === 'stream' ? '📡 по трансляции' + (p.pct ? ' · качает ' + p.pct + '%' : '') : p.mode === 'local' ? '💾 играет у себя' : '… подключается')); peers.append(x); }
    if (sess.peers.size) c.append(peers);
    const act = el('div', 'mu-act'); act.append(H.btnEl('＋ Позвать ещё', '', inviteDlg), H.btnEl('Закончить', '', () => endSess(true))); c.append(act);
    return c;
  }
  tt.append(el('b', '', 'Слушаешь вместе с ' + H.net.nameOf(sess.hostU)), el('span', '', sess.mode === 'stream' ? '📡 по трансляции' : sess.mode === 'local' ? '💾 играет у тебя' : 'подключаюсь…'));
  c.append(head);
  const seg = el('div', 'mu-pref');
  for (const [k, t] of [['each', '💾 У меня'], ['stream', '📡 Через ' + H.net.nameOf(sess.hostU)]]) { const b = el('button', sess.pref === k ? 'on' : '', t); b.onclick = () => setPref(k); seg.append(b); }
  c.append(seg);
  if (sess.dl) { const pr = el('div', 'mu-dl'), pct = sess.dl.size ? Math.round(sess.dl.got / sess.dl.size * 100) : 0; pr.append(el('span', '', 'Докачиваю «' + (sess.dl.title || sess.dl.name) + '» · ' + pct + '%' + (sess.dlq.length ? ' · в очереди ещё ' + sess.dlq.length : '')), el('i')); pr.lastChild.style.setProperty('--p', pct + '%'); c.append(pr); }
  const act = el('div', 'mu-act'); act.append(H.btnEl('Выйти', '', () => endSess(true))); c.append(act);
  return c;
}

// ---------- фоновая музыка ----------
// Свой маленький плеер: играет тихо у тебя одного, своя громкость; когда кто-то говорит в зале, сам приглушается.
const bgEl = new Audio(); bgEl.preload = 'auto';
const bg = { src: null, list: [], queue: [], qi: -1, vol: 0.3, shuffle: true, duck: true, level: 1, until: 0 };
const bgBars = new Set();
const bgCur = () => lib.get(bg.queue[bg.qi]) || null;
function loadBg() {
  try { const j = JSON.parse(H.store.get('musicBg', '{}')); if (j.vol >= 0 && j.vol <= 1) bg.vol = j.vol; bg.shuffle = j.shuffle !== false; bg.duck = j.duck !== false; bg.src = j.src && j.src.kind ? j.src : null; } catch (e) {}
}
const saveBg = () => H.store.set('musicBg', JSON.stringify({ vol: bg.vol, shuffle: bg.shuffle, duck: bg.duck, src: bg.src && { kind: bg.src.kind, id: bg.src.id, name: bg.src.name, emoji: bg.src.emoji } }));
function bgOrder() { const l = bg.list.slice(); if (bg.shuffle) for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } bg.queue = l; }
function bgStart(c) {
  bg.src = { kind: c.kind, id: c.id, name: c.name, emoji: c.emoji }; saveBg();
  bg.list = c.tracks.map(t => t.rel); bgOrder(); bg.qi = 0; bgPlay();
}
function bgPlay() {
  const t = bgCur(); if (!t) { bgEl.pause(); bgSync(); return; }
  bgEl.src = MU.url(t.p); bgEl.play().catch(() => {}); bgSync();
}
function bgNext() { if (!bg.queue.length) return; bg.qi++; if (bg.qi >= bg.queue.length) { bgOrder(); bg.qi = 0; } bgPlay(); }
const bgToggle = () => { if (!bg.queue.length) { if (bg.src) { const c = findColl(bg.src.kind, bg.src.id); if (c?.tracks.length) bgStart(c); } return; } bgEl.paused ? bgEl.play().catch(() => {}) : bgEl.pause(); };
function bgStop() { bgEl.pause(); bgEl.removeAttribute('src'); bg.queue = []; bg.list = []; bg.qi = -1; bgSync(); }
function setBgVol(v) { bg.vol = Math.max(0, Math.min(1, v)); saveBg(); }
let bgErr = 0;
bgEl.addEventListener('ended', bgNext);
bgEl.addEventListener('error', () => { if (bg.queue.length > 1 && ++bgErr < 6) bgNext(); else bgErr = 0; });
bgEl.addEventListener('playing', () => { bgErr = 0; bgSync(); });
bgEl.addEventListener('pause', () => bgSync());
bgEl.addEventListener('play', () => bgSync());
let bgPaintT = 0;
function bgSync() { for (const b of bgBars) b.sync(); mediaMetaBg(); clearTimeout(bgPaintT); bgPaintT = setTimeout(() => { if (shown && mode === 'bg') repaint(); else if (shown) for (const b of player.bars) b.sync(); }, 120); }
const mediaMetaBg = () => {};
// приглушение: ловим голос в зале (свой и чужие) — быстро затихаем, мягко возвращаем громкость
setInterval(() => {
  if (bgEl.paused) { bg.level = 1; return; }
  const lv = typeof window.kzVoiceLevel === 'function' ? window.kzVoiceLevel() : 0, now = Date.now();
  if (bg.duck && lv > 0.02) bg.until = now + 1400;
  const target = bg.duck && now < bg.until ? 0.2 : 1;
  bg.level += (target - bg.level) * (target < bg.level ? 0.6 : 0.12);
  bgEl.volume = Math.max(0, Math.min(1, bg.vol * bg.level));
}, 100);
function bgBarEl(mini) {
  const bar = el('div', 'mu-bar mu-bgbar' + (mini ? ' mini' : '')), cv = el('div', 'mu-cvh'), info = el('div', 'mu-info'), tt = el('b'), ar = el('span'); info.append(tt, ar);
  const bp = ibtn(IC.play, 'Играть / пауза', bgToggle, 'big'), bn = ibtn(IC.next, 'Следующий', bgNext), bx = ibtn('✕', 'Остановить фон', bgStop);
  const ctl = el('div', 'mu-ctl'); ctl.append(bp, bn);
  bar.append(cv, info, ctl, ...(mini ? [bx] : []));
  bar.sync = () => { const t = bgCur(); bar.classList.toggle('idle', !t); cv.textContent = ''; cv.append(coverEl(t || null)); tt.textContent = t ? t.title : 'Фон выключен'; ar.textContent = t ? '🌙 ' + (bg.src?.name || '') : ''; bp.innerHTML = bgEl.paused ? IC.play : IC.pause; if (mini) bar.hidden = !bg.queue.length; };
  bgBars.add(bar); bar.sync(); return bar;
}
function bgCard() {
  const c = el('div', 'mu-sc mu-bgc'), head = el('div', 'mu-sch'), ic = el('div', 'mu-sci', '🌙'), tt = el('div');
  const t = bgCur();
  tt.append(el('b', '', t ? t.title : 'Фоновая музыка'), el('span', '', t ? (bg.src?.emoji || '') + ' ' + (bg.src?.name || '') + (t.artist ? ' · ' + t.artist : '') : 'Выбери полку ниже — заиграет тихо, не мешая разговору'));
  head.append(ic, tt); c.append(head);
  const row = el('div', 'mu-bgrow');
  const ctl = el('div', 'mu-ctl'); ctl.append(ibtn(bgEl.paused ? IC.play : IC.pause, 'Играть / пауза', bgToggle, 'big'), ibtn(IC.next, 'Следующий', bgNext), ibtn('✕', 'Остановить фон', bgStop));
  const vl = el('label', 'mu-bgvol'); const vi = el('span', '', '🔉 Громкость фона'), vin = el('input', 'mu-vol'); vin.type = 'range'; vin.min = 0; vin.max = 100; vin.value = Math.round(bg.vol * 100); vin.oninput = () => setBgVol(vin.value / 100); vl.append(vi, vin);
  row.append(ctl, vl); c.append(row);
  const sw = (label, key, hint) => { const l = el('label', 'switch'), i = el('input'); i.type = 'checkbox'; i.checked = bg[key]; i.onchange = () => { bg[key] = i.checked; saveBg(); if (key === 'shuffle' && bg.list.length) { const cur = bg.queue[bg.qi]; bgOrder(); bg.qi = Math.max(0, bg.queue.indexOf(cur)); } }; l.append(document.createTextNode(label), i); if (hint) l.title = hint; return l; };
  const opts = el('div', 'mu-bgopts'); opts.append(sw('Перемешивать', 'shuffle'), sw('Приглушать, когда кто-то говорит', 'duck', 'Фон тихо отступает, пока в зале говорят, и возвращается сам'));
  c.append(opts); return c;
}


// ---------- «шторка»: маленькая вкладка сверху по центру ----------
// Смысл: сидишь в Кинозале или болтаешь в чате — и за секунду добираешься до музыки: переключил, поменял, подкрутил громкость, закрыл. Без возни.
// Нажми на вкладку или потяни вниз — окошко: что играет, ⏮ ⏯ ⏭, громкость, «дальше» и полоса подборок — нажал на любую, и музыка сменилась.
// Остальное (очередь, поиск, полка, звук) — по одной кнопке, без вкладок и меню. Цвета подстраиваются под обложку.
// Потяни вверх (за вкладку или за ручку внизу), нажми мимо или Esc — свернётся. Пока открыта: пробел — пауза, ← → — перемотка, ↑ ↓ или колесо — громкость.
let shadeApi = null;
const tintCache = new Map();
async function coverTint(t) {   // средний «живой» цвет обложки → оттенок и насыщенность
  const fb = { h: hue(t.title, '🎵'), s: 38 };
  if (!t.cv) return fb;
  if (tintCache.has(t.rel)) return tintCache.get(t.rel);
  const u = await coverOf(t); if (!u) return fb;
  const v = await new Promise(res => {
    const im = new Image(); im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 20; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, 20, 20);
        const d = g.getImageData(0, 0, 20, 20).data; let R = 0, G = 0, B = 0, W = 0;
        for (let i = 0; i < d.length; i += 4) { const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2], mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), sat = mx ? (mx - mn) / mx : 0, w = 0.15 + sat * sat * 3 + (mx > 40 && mx < 235 ? 0.3 : 0); R += r0 * w; G += g0 * w; B += b0 * w; W += w; }
        R /= W; G /= W; B /= W; const mx = Math.max(R, G, B), mn = Math.min(R, G, B), dl = mx - mn;
        let h = 0; if (dl) { h = mx === R ? ((G - B) / dl) % 6 : mx === G ? (B - R) / dl + 2 : (R - G) / dl + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
        res({ h, s: Math.round(Math.max(26, Math.min(70, (mx ? dl / mx : 0) * 100))) });
      } catch (e) { res(fb); }
    }; im.onerror = () => res(fb); im.src = u;
  });
  tintCache.set(t.rel, v); return v;
}
function buildShade() {
  if (shadeApi) return shadeApi;
  const root = el('div', 'mu-shade'); root.id = 'kzShade';
  const handle = el('button', 'mu-sh-h'); handle.type = 'button'; handle.title = 'Музыка — нажми или потяни вниз'; handle.setAttribute('aria-label', 'Музыка');
  const hEq = el('span', 'eq'); hEq.innerHTML = '<i></i><i></i><i></i>';
  const hTt = el('span', 'ttl'), hCh = el('span', 'chev'); hCh.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  handle.append(hEq, hTt, hCh);
  const sheet = el('div', 'mu-sh-s'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Музыка'); sheet.tabIndex = -1;
  const back = el('div', 'mu-sh-bgimg');
  const sess1 = el('div', 'mu-sh-sess'); sess1.hidden = true;
  const panes = el('div', 'mu-sh-panes');
  const grab = el('button', 'mu-sh-grab'); grab.type = 'button'; grab.title = 'Потяни вверх — свернуть'; grab.setAttribute('aria-label', 'Свернуть'); grab.append(el('i'));
  sheet.append(back, sess1, panes, grab); root.append(sheet, handle);
  let pane = 'main';

  // ===== главное: что играет, управление, громкость, подборки =====
  const main = el('section', 'mu-sh-pane main');
  const top = el('div', 'mu-sh-top'), cv = el('div', 'mu-sh-cv'), info = el('div', 'mu-sh-info'), tt = el('b'), ar = el('span'), al = el('small');
  info.append(tt, ar, al);
  const full = ibtn('⤢', 'Открыть «Музыку» целиком', () => openFull(), 'mu-sh-full');
  top.append(cv, info, full);
  const seek = el('input', 'mu-seek'); seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0; seek.setAttribute('aria-label', 'Перемотка');
  const tcur = el('span', 'mu-t', '0:00'), tall = el('span', 'mu-t', '0:00'), line = el('div', 'mu-line'); line.append(tcur, seek, tall);
  let dragging = false;
  seek.oninput = () => { dragging = true; tcur.textContent = fmt(seek.value / 1000 * (au.duration || 0)); };
  seek.onchange = () => { if (isGuest()) { guestBlock(); dragging = false; return; } seekTo(seek.value / 1000); dragging = false; };
  const shuf = ibtn(IC.shuffle, 'Перемешать', () => { player.shuffle = !player.shuffle; H.store.set('musicShuffle', player.shuffle ? '1' : '0'); const c = player.queue[player.qi]; if (player.queue.length) { if (player.shuffle) reshuffle(c); else { player.queue = player.orig.slice(); player.qi = Math.max(0, player.queue.indexOf(c)); } } player.sync(); });
  const prv = ibtn(IC.prev, 'Предыдущий', prev), play1 = ibtn(IC.play, 'Играть / пауза', toggle, 'big'), nxt = ibtn(IC.next, 'Следующий', () => next(false));
  const rep = ibtn(IC.repeat, 'Повтор', () => { player.repeat = { off: 'all', all: 'one', one: 'off' }[player.repeat]; H.store.set('musicRepeat', player.repeat); player.sync(); });
  const ctl = el('div', 'mu-sh-ctl'); ctl.append(shuf, prv, play1, nxt, rep);
  // громкость — всегда на виду
  const mute = ibtn(IC.vol, 'Выключить звук', () => { if (player.vol > 0) { mute.dataset.v = String(player.vol); setVol(0); } else setVol(+mute.dataset.v || 0.8); }, 'mute');
  const vol = el('input', 'mu-vol'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.setAttribute('aria-label', 'Громкость'); vol.oninput = () => setVol(vol.value / 100);
  const volRow = el('div', 'mu-sh-vol'); volRow.append(mute, vol);
  const nextUp = el('button', 'mu-sh-next'); nextUp.type = 'button'; nextUp.hidden = true; nextUp.title = 'Переключить на следующий'; nextUp.onclick = () => next(false);
  // подборки: нажал — музыка сменилась
  const picksH = el('div', 'mu-sh-ph'), picks = el('div', 'mu-sh-pg');
  picksH.append(el('h4', '', 'Включить'));
  const srchBtn = ibtn('🔎', 'Найти трек', () => setPane('search'), 'mu-sh-sbtn'); picksH.append(srchBtn);
  const tools = el('div', 'mu-sh-tools');
  const qBtn = ibtn(IC.queue, 'Очередь', () => setPane('queue')), shBtn = ibtn('🏷️', 'Положить трек на полку', e => { const t = player.cur; if (t) shelfPalette(e.clientX - 150, e.clientY + 12, t, null); }), sndBtn = ibtn(IC.sliders, 'Звук: переходы, эквалайзер, скорость, таймер сна', () => setPane(pane === 'sound' ? 'main' : 'sound'));
  const favBtn = ibtn(IC.heart, 'В любимое', () => { const t = player.cur; if (t) { toggleFav(t); if (isFav(t)) { fly('❤️'); netReact(t, '❤️', null); } } }, 'fav');
  tools.append(favBtn, shBtn, qBtn, sndBtn);
  // фон
  const bgRow = el('div', 'mu-sh-bg'), bgt = el('div'), bgb = el('b'), bgs = el('span'); bgt.append(bgb, bgs);
  const bgp = ibtn(IC.play, 'Фон: играть / пауза', bgToggle), bgn = ibtn(IC.next, 'Фон: следующий', bgNext), bgx = ibtn('✕', 'Остановить фон', bgStop);
  const bgv = el('input', 'mu-vol'); bgv.type = 'range'; bgv.min = 0; bgv.max = 100; bgv.title = 'Громкость фона'; bgv.oninput = () => setBgVol(bgv.value / 100);
  bgRow.append(el('i', '', '🌙'), bgt, bgp, bgn, bgv, bgx);
  main.append(top, line, ctl, volRow, nextUp, picksH, picks, tools, bgRow);

  // ===== очередь (по кнопке, со стрелкой назад) =====
  const subHead = (title, onBack) => { const h = el('div', 'mu-sh-sub'); h.append(ibtn(IC.back, 'Назад', onBack), el('b', '', title)); return h; };
  const qp = el('section', 'mu-sh-pane queue'), qlist = el('div', 'mu-sh-ql'), qfoot = el('div', 'mu-sh-qf');
  qfoot.append(H.btnEl('Очистить очередь', '', () => { if (guestBlock()) return; if (decks) { silence(decks[0]); silence(decks[1]); } player.orig = []; player.queue = []; player.qi = -1; player.sync(); }));
  qp.append(subHead('Очередь', () => setPane('main')), qlist, qfoot);
  const paintQueue = () => {
    qlist.textContent = '';
    if (!player.queue.length) { qlist.append(el('p', 'mu-sh-empty', 'Очередь пуста.')); qfoot.hidden = true; return; }
    qfoot.hidden = false;
    player.queue.forEach((rel, i) => {
      const t = lib.get(rel); if (!t) return;
      const r0 = el('div', 'mu-row sm' + (i === player.qi ? ' cur' : '') + (i < player.qi ? ' done' : '')), tx0 = el('div', 'mu-tx'); tx0.append(el('b', '', t.title), el('span', '', t.artist || ''));
      r0.append(coverEl(t, 'sm'), tx0);
      if (i !== player.qi) r0.append(ibtn('✕', 'Убрать из очереди', () => { if (guestBlock()) return; player.queue.splice(i, 1); player.orig = player.orig.filter(x => x !== rel); if (i < player.qi) player.qi--; player.sync(); }));
      r0.onclick = () => { if (guestBlock()) return; player.qi = i; play(); };
      qlist.append(r0);
    });
    qlist.querySelector('.cur')?.scrollIntoView({ block: 'center' });
  };

  // ===== поиск трека =====
  const sp = el('section', 'mu-sh-pane search'), sq = el('input', 'mu-q'); sq.type = 'search'; sq.placeholder = 'Название, исполнитель, альбом'; sq.autocomplete = 'off';
  const sres = el('div', 'mu-sh-res'); sp.append(subHead('Поиск', () => setPane('main')), sq, sres);
  const paintSearch = () => {
    sres.textContent = ''; const qv = sq.value.trim().toLowerCase();
    if (!qv) { sres.append(el('p', 'mu-sh-empty', 'Начни вводить — нажми на трек, и он заиграет.')); return; }
    const ws = qv.split(/\s+/), found = sortTracks(allTracks().filter(t => ws.every(w => text(t).includes(w)))).slice(0, 40);
    if (!found.length) { sres.append(el('p', 'mu-sh-empty', 'Ничего не нашлось.')); return; }
    found.forEach((t, i) => { const r0 = el('div', 'mu-row sm' + (player.cur?.rel === t.rel ? ' cur' : '')), tx0 = el('div', 'mu-tx'); tx0.append(el('b', '', t.title), el('span', '', [t.artist, t.album].filter(Boolean).join(' · '))); r0.append(coverEl(t, 'sm'), tx0, el('span', 'mu-d', t.dur ? fmt(t.dur) : '')); r0.onclick = () => { if (guestBlock()) return; player.src = null; setQueue(found, i); setPane('main'); }; sres.append(r0); });
  };
  sq.oninput = paintSearch;
  // ===== звук: переходы, скорость, эквалайзер-круг, таймер сна — прямо в шторке, без отдельного окна =====
  const sndP = el('section', 'mu-sh-pane sound');
  panes.append(main, qp, sp, sndP);
  function setPane(k) {
    pane = k; main.hidden = k !== 'main'; qp.hidden = k !== 'queue'; sp.hidden = k !== 'search'; sndP.hidden = k !== 'sound';
    if (k === 'sound') { sndP.replaceChildren(subHead('Звук', () => setPane('main')), soundBody()); sheet.scrollTop = 0; }
    else if (sndP.firstChild) sndP.textContent = '';
    if (k === 'queue') paintQueue();
    if (k === 'search') { sq.value = ''; paintSearch(); if (!TOUCH) setTimeout(() => sq.focus(), 60); }
  }
  const fillPicks = () => {
    const sl = picks.scrollLeft; picks.textContent = '';
    const c = collections(''), all = [c.all, ...c.lists.filter(x => x.tracks.length), ...c.albums.slice(0, 8), ...c.artists.slice(0, 6)].slice(0, 22);
    for (const x of all) { const t = tile(x, { on: player.src?.kind === x.kind && player.src?.id === x.id, playing: !au.paused, go: () => { playColl(x); } }); t.classList.add('sm'); picks.append(t); }
    picksH.hidden = picks.hidden = !all.length; picks.scrollLeft = sl;
  };

  // ===== состояние =====
  let tintFor = '';
  const bar = { mini: true };
  const paintSess = () => {
    sess1.textContent = ''; sess1.hidden = !sess; if (!sess) return;
    const txt = sess.host ? '🎧 Ты включаешь для всех · ' + (sess.peers.size ? sess.peers.size + ' ' + plural(sess.peers.size, 'слушатель', 'слушателя', 'слушателей') : 'ждём друзей') : '🎧 Слушаешь вместе с ' + H.net.nameOf(sess.hostU) + (sess.mode === 'stream' ? ' · по трансляции' : '');
    sess1.append(el('span', '', txt), H.btnEl(sess.host ? 'Закончить' : 'Выйти', '', () => endSess(true)));
  };
  bar.sync = () => {
    const t = player.cur, playing = !!t && !au.paused, gt = isGuest() ? sess.track : null;
    root.classList.toggle('playing', playing); root.classList.toggle('idle', !t);
    hTt.textContent = t ? t.title : gt ? gt.title : '';
    cv.textContent = ''; cv.append(coverEl(t || null, 'xl'));
    tt.textContent = t ? t.title : gt ? gt.title : 'Ничего не играет'; ar.textContent = t ? (t.artist || '') : gt ? gt.artist || '' : 'Выбери, что включить, ниже';
    al.textContent = t?.album || '';
    play1.innerHTML = au.paused ? IC.play : IC.pause;
    shuf.classList.toggle('on', player.shuffle); rep.classList.toggle('on', player.repeat !== 'off'); rep.dataset.one = player.repeat === 'one' ? '1' : '';
    vol.value = Math.round(player.vol * 100); vol.style.setProperty('--p', Math.round(player.vol * 100) + '%'); mute.innerHTML = player.vol > 0 ? IC.vol : '🔇'; mute.title = player.vol > 0 ? 'Выключить звук' : 'Включить звук';
    const pn = planNext(), nt = pn && lib.get(pn.rel) || (player.queue[player.qi + 1] && lib.get(player.queue[player.qi + 1]));
    nextUp.hidden = !nt; if (nt) nextUp.textContent = 'Дальше: ' + nt.title + (nt.artist ? ' — ' + nt.artist : '');
    favBtn.classList.toggle('on', !!t && isFav(t)); sndBtn.classList.toggle('on', !!(cfg.xf || cfg.rate !== 1 || cfg.eqOn || sleep.until || sleep.endOfTrack));
    sheet.classList.toggle('noplay', !t);
    paintSess();
    if (t && tintFor !== t.rel) {   // цвета окошка — из обложки
      tintFor = t.rel; const rel = t.rel;
      coverTint(t).then(v => { if (tintFor === rel) { sheet.style.setProperty('--sh-h', v.h); sheet.style.setProperty('--sh-s', v.s + '%'); } });
      coverOf(t).then(u => { if (tintFor === rel) back.style.backgroundImage = u ? 'url("' + u + '")' : 'none'; });
    } else if (!t) { tintFor = ''; back.style.backgroundImage = 'none'; }
    if (isOpen) { if (pane === 'queue') paintQueue(); fillPicks(); }
    bar.tick();
  };
  bar.tick = () => {
    const d = au.duration, c = au.currentTime;
    tall.textContent = isFinite(d) ? fmt(d) : '0:00';
    if (!dragging) { seek.value = isFinite(d) && d ? Math.round(c / d * 1000) : 0; tcur.textContent = fmt(c); }
    seek.style.setProperty('--p', (seek.value / 10) + '%');
  };
  player.bars.add(bar);
  const bgBar = { perm: true, sync() { const t = bgCur(); bgRow.hidden = !bg.queue.length; bgb.textContent = t ? t.title : ''; bgs.textContent = t ? (bg.src?.emoji || '') + ' ' + (bg.src?.name || '') : ''; bgp.innerHTML = bgEl.paused ? IC.play : IC.pause; bgv.value = Math.round(bg.vol * 100); } };
  bgBars.add(bgBar);

  // ===== открытие и закрытие: нажатие или потянуть =====
  let isOpen = false, drag = null;
  const setOpen = o => {
    isOpen = o; sheet.style.transform = ''; sheet.style.transition = '';
    root.classList.toggle('open', o);
    if (o) { setPane('main'); bar.sync(); bgBar.sync(); fillPicks(); setTimeout(() => sheet.focus({ preventScroll: true }), 30); }
  };
  const openFull = () => {
    setOpen(false);
    const inRoom = window.kzRoom?.inRoom && !document.getElementById('room')?.hidden;
    if (inRoom && window.kzPanel) { if (!document.getElementById('roomMusic')?.classList.contains('on')) window.kzPanel('music'); } else H.openSelf();
  };
  const hgt = () => sheet.offsetHeight + 24;
  const startDrag = (e, fromOpen) => { if (e.button) return; drag = { y0: e.clientY, moved: false, open: fromOpen, src: e.currentTarget }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) {} if (!isOpen) { setPane('main'); bar.sync(); bgBar.sync(); fillPicks(); } };
  const moveDrag = e => {
    if (!drag) return; const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 5) return;
    drag.moved = true; drag.dy = dy; sheet.style.transition = 'none'; root.classList.add('pulling');
    const h = hgt(), base = drag.open ? 0 : -h;
    sheet.style.transform = 'translateY(' + Math.max(-h, Math.min(0, base + dy)) + 'px)';
  };
  const endDrag = () => {
    if (!drag) return; const d = drag; drag = null; root.classList.remove('pulling');
    if (!d.moved) { if (d.src === handle) setOpen(!isOpen); else setOpen(false); return; }
    const h = hgt(); setOpen(d.open ? d.dy > -h * 0.25 : d.dy > h * 0.3);   // потянул на треть вниз — раскрылась; вверх на четверть — свернулась
  };
  handle.addEventListener('pointerdown', e => startDrag(e, isOpen));
  grab.addEventListener('pointerdown', e => startDrag(e, true));
  for (const el0 of [handle, grab]) { el0.addEventListener('pointermove', moveDrag); el0.addEventListener('pointerup', endDrag); el0.addEventListener('pointercancel', endDrag); }
  document.addEventListener('pointerdown', e => { if (isOpen && !drag && !root.contains(e.target) && !e.target.closest?.('.mx-modal, .mx-pop')) setOpen(false); }, true);
  document.addEventListener('keydown', e => {
    if (!isOpen || document.querySelector('.mx-modal')) return;
    if (e.key === 'Escape') { if (pane !== 'main') setPane('main'); else setOpen(false); return; }
    if (/^(input|textarea|select)$/i.test(e.target?.tagName || '') && e.target.type !== 'range') return;
    if (e.key === ' ' && !/^button$/i.test(e.target?.tagName || '')) { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight' && !isGuest() && player.cur) { e.preventDefault(); au.currentTime = Math.min((au.duration || 1e9), au.currentTime + 5); }
    else if (e.key === 'ArrowLeft' && !isGuest() && player.cur) { e.preventDefault(); au.currentTime = Math.max(0, au.currentTime - 5); }
    else if (e.key === 'ArrowUp' && e.target.type !== 'range') { e.preventDefault(); setVol(player.vol + 0.05); }
    else if (e.key === 'ArrowDown' && e.target.type !== 'range') { e.preventDefault(); setVol(player.vol - 0.05); }
  });
  const wheel = e => { e.preventDefault(); setVol(player.vol + (e.deltaY < 0 ? 0.04 : -0.04)); };   // колесо над обложкой, ручкой и громкостью
  cv.addEventListener('wheel', wheel, { passive: false }); volRow.addEventListener('wheel', wheel, { passive: false }); handle.addEventListener('wheel', wheel, { passive: false });
  // мышь приближается к верхнему центру — язычок выезжает целиком; отошла — прячется
  let near = false, nearT = 0;
  document.addEventListener('mousemove', e => {
    const dx = Math.abs(e.clientX - innerWidth / 2), want = near ? dx < 130 && e.clientY < 90 : dx < 85 && e.clientY < 46;
    if (want) { clearTimeout(nearT); nearT = 0; if (!near) { near = true; root.classList.add('near'); } }
    else if (near && !nearT) nearT = setTimeout(() => { nearT = 0; near = false; root.classList.remove('near'); }, 350);
  }, { passive: true });
  document.addEventListener('mouseleave', () => { near = false; root.classList.remove('near'); });
  document.body.append(root);
  setPane('main'); bar.sync(); bgBar.sync();
  shadeApi = { open: () => setOpen(true), close: () => setOpen(false), get isOpen() { return isOpen; }, refresh: () => { if (isOpen) paintSess(); } };
  return shadeApi;
}

// ---------- подключение к приложению ----------
let ready = false;
async function init() {
  if (ready) return; ready = true;
  loadPL(); loadCfg(); loadBg();
  mode = ['my', 'together', 'bg'].includes(H.store.get('musicMode', 'my')) ? H.store.get('musicMode', 'my') : 'my';
  player.vol = Math.max(0, Math.min(1, +H.store.get('musicVol', '1') || 1)); 
  player.shuffle = H.store.get('musicShuffle', '0') === '1'; player.repeat = ['off', 'all', 'one'].includes(H.store.get('musicRepeat', 'off')) ? H.store.get('musicRepeat', 'off') : 'off';
  sortBy = sorters[H.store.get('musicSort', 'title')] ? H.store.get('musicSort', 'title') : 'title';
  await loadCache().catch(() => {});
  MU.watch(() => { refresh(); });
  refresh();
}
window.kzMusic = {
  // громкость принимаемой трансляции — для проверки, что звук действительно идёт
  level: async () => { if (!sess?.aud?.srcObject) return -1; const c = new AudioContext(), src = c.createMediaStreamSource(sess.aud.srcObject), an = c.createAnalyser(); src.connect(an); const b = new Float32Array(an.fftSize); let m = 0; for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 100)); an.getFloatTimeDomainData(b); m = Math.max(m, Math.sqrt(b.reduce((a, x) => a + x * x, 0) / b.length)); } c.close(); return +m.toFixed(4); },
  onMsg: (L, d) => { if (H) onMusicMsg(L, d); },
  activity: allowJoin => (H ? activity(allowJoin) : null),
  joinFrom: (u, sid, a) => { if (H) joinFrom(u, sid, a); },
  actsChanged: () => { if (shown && mode === 'together') repaint(); shadeApi?.refresh(); },
  onCall: c => { if (H) onMusicCall(c); else { try { c.close(); } catch (e) {} } },
  tracks: () => [...lib.values()].map(t => ({ p: t.p, rel: t.rel, h: !!t.h, dur: t.dur, tagged: t.tagged, busy: t.busy })),
  durAll,
  debug: () => ({ bg: { vol: bg.vol, level: +bg.level.toFixed(2), volume: +bgEl.volume.toFixed(2), paused: bgEl.paused, n: bg.queue.length }, sess: sess && { host: sess.host, mode: sess.mode, track: sess.track && sess.track.title, aud: !!sess.aud, audOn: !!(sess.aud && !sess.aud.paused && !sess.aud.muted), off: Math.round(sess.off), peers: sess.peers.size }, decks: decks && decks.map(d => ({ rel: d.rel.slice(-14), paused: d.el.paused, g: +d.g.gain.value.toFixed(2), t: +d.el.currentTime.toFixed(1), rate: d.el.playbackRate })), eq: eqNodes.map(n => n.gain.value), xf: cfg.xf, q: player.queue, qi: player.qi, paused: au.paused, err: au.error && au.error.message, code: au.error && au.error.code, src: au.src, t: au.currentTime, dur: au.duration, ready: au.readyState }),
  // H: {store, toast, modal, btnEl, host(): контейнер раздела, side: боковая колонка, openSelf(), close(), net}
  mount(h) {
    H = h; init(); buildShade();
    const wrap = el('div', 'mu-mini'); h.side.append(wrap);
    const mini = playerBar(true), bgm = bgBarEl(true); wrap.append(mini, bgm);
    const upd = () => { wrap.hidden = shown || (!player.cur && !bg.queue.length); mini.hidden = !player.cur; };
    const old = mini.sync; mini.sync = () => { old(); upd(); };
    bgm.perm = true; const oldB = bgm.sync; bgm.sync = () => { oldB(); upd(); };
    mini.sync(); bgm.sync();
    return {
      // el — куда рисовать: по умолчанию главная область мессенджера, в зале — правая панель
      show(target) { shown = true; inPanel = !!target; host = target || H.host(); init(); paint(); upd(); refresh(); },
      hide() { shown = false; inPanel = false; host = null; statusEl = null; queuePaint = null; upd(); },
      get shown() { return shown; },
      get inPanel() { return inPanel; }
    };
  }
};
})();
