// Кинозал — мессенджер.
// Без серверов: каждый участник — это ключ ECDSA P-256 на его компьютере, ID — кусок хэша открытого ключа.
// Компьютеры соединяются напрямую (WebRTC через PeerJS), при встрече проверяют подписи друг друга
// и досинхронизируют переписку: что есть у одного и нет у другого — досылается. История живёт в IndexedDB.
// Звонок и кинозал — это обычный зал по коду (код в index.html), приглашение уходит сообщением в чат.
(async () => {
'use strict';
const APP = window.kinozalApp || window.kzAndroid || null;   // программа для Windows или приложение для Android; на сайте — null
const ANDROID = !!APP?.android;
// свой TURN-сервер (профиль → «Связь через свой сервер») выручает, когда оба за строгим NAT — например, в мобильной сети
function iceCfg() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  try { const t = JSON.parse(localStorage.getItem('kinozal-turn') || 'null'); if (t?.url && /^turns?:/i.test(t.url)) list.push({ urls: t.url, username: t.user || '', credential: t.pass || '' }); } catch (e) {}
  return { iceServers: list };
}
const LIMIT = 25e6;                 // самый большой файл в сообщении (кружочек ~5 МБ, фото до 8 МБ, документ до 25 МБ)
const SYNC_DEPTH = 300;             // сколько последних сообщений чата сверяем при встрече
const DOWNLOAD = 'https://github.com/desinaleksandr80-star/kinozal/releases/latest/download/Kinozal-Setup.exe';
const WEB = 'https://desinaleksandr80-star.github.io/kinozal/';
const APK = 'https://github.com/desinaleksandr80-star/kinozal/releases/latest/download/Kinozal.apk';   // приложение для Android
const ANDROID_WEB = !APP && /Android/i.test(navigator.userAgent);   // веб-версия: телефон и любой браузер
const TOUCH = matchMedia('(pointer:coarse)').matches;

// ---------- мелочи ----------
const $ = (s, r = document) => r.querySelector(s);
const enc = s => new TextEncoder().encode(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = (s, n = 40) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; };
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(String(s || '')), c => c.charCodeAt(0));
const uid = () => Date.now().toString(36) + '-' + b64(rnd(9)).replace(/[+/=]/g, '');
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const store = { get(k, d) { try { const v = localStorage.getItem('kinozal-' + k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('kinozal-' + k, v); } catch (e) {} } };
const jlog = (...a) => { try { APP?.log?.(...a); } catch (e) {} };  // в журнал %APPDATA%\Кинозал\logs
function toast(t) { const e = $('#toast'); if (!e) return; e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 4000); }
const IC = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M19 8v6M16 11h6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l5-3v10l-5-3z"/><rect x="2" y="6" width="13" height="12" rx="3"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>',
  circ: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5l1-4.2L15.8 5a2.1 2.1 0 0 1 3 0l.2.2a2.1 2.1 0 0 1 0 3L8.7 18.5z"/><path d="M13.6 7.2l3.2 3.2"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path class="sh" d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.6-1.3-.6-2.1 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7" r="1.2" fill="currentColor"/></svg>',
  logo: '<svg class="logo" viewBox="0 0 480 300" role="img" aria-label="Кинозал"><defs><linearGradient id="mxbeam" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6b4a" stop-opacity=".55"/><stop offset="1" stop-color="#ff6b4a" stop-opacity="0"/></linearGradient><linearGradient id="mxscr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd2c4"/><stop offset=".6" stop-color="#ff8a6c"/><stop offset="1" stop-color="#e2553a"/></linearGradient></defs><polygon points="440,262 40,26 300,26" fill="url(#mxbeam)"/><rect x="40" y="26" width="260" height="150" rx="10" fill="url(#mxscr)"/><circle cx="440" cy="262" r="12" fill="#ff6b4a"/><g fill="#1c282b" stroke="#2a3639"><rect x="30" y="226" width="64" height="58" rx="18"/><rect x="110" y="226" width="64" height="58" rx="18"/><rect x="190" y="226" width="64" height="58" rx="18"/></g><g fill="#5fd4c4"><circle cx="62" cy="214" r="14"/><circle cx="142" cy="210" r="15"/><circle cx="222" cy="214" r="14"/></g></svg>'
};

// ---------- хранилище ----------
// На одном устройстве может быть несколько профилей (как аккаунты в Телеграме): у каждого своя база.
// Первый (старый) — 'kinozal-mx', остальные — 'kinozal-mx-<слот>'. Активный — localStorage 'kinozal-slot'.
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const SLOT = /^[0-9a-z]{4,12}$/.test(lsGet('kinozal-slot') || '') ? lsGet('kinozal-slot') : '';
const dbName = slot => 'kinozal-mx' + (slot ? '-' + slot : '');
{ const drop = lsGet('kinozal-dropdb'); if (drop && drop !== dbName(SLOT)) { lsSet('kinozal-dropdb', null); try { indexedDB.deleteDatabase(drop); } catch (e) {} } }   // брошенный пустой профиль
const db = await new Promise((res, rej) => {
  const r = indexedDB.open(dbName(SLOT), 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('msgs', { keyPath: 'id' }).createIndex('chat', ['chat', 'ts']); d.createObjectStore('blobs'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
function tx(name, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(name, mode), s = t.objectStore(name); let out;
    const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
const msgGet = id => tx('msgs', 'readonly', s => s.get(id));
const msgPut = m => tx('msgs', 'readwrite', s => s.put(m));
const blobGet = id => tx('blobs', 'readonly', s => s.get(id));
const blobPut = (id, b) => tx('blobs', 'readwrite', s => s.put(b, id));
function chatMsgs(chat, limit = SYNC_DEPTH) {
  return new Promise((res, rej) => {
    const out = [], r = db.transaction('msgs').objectStore('msgs').index('chat').openCursor(IDBKeyRange.bound([chat, -Infinity], [chat, Infinity]), 'prev');
    r.onsuccess = () => { const c = r.result; if (c && out.length < limit) { out.push(c.value); c.continue(); } else res(out.reverse()); };
    r.onerror = () => rej(r.error);
  });
}
function wipeChat(chat) {
  return new Promise((res, rej) => {
    const t = db.transaction(['msgs', 'blobs'], 'readwrite'), bl = t.objectStore('blobs');
    const r = t.objectStore('msgs').index('chat').openCursor(IDBKeyRange.bound([chat, -Infinity], [chat, Infinity]));
    r.onsuccess = () => { const c = r.result; if (c) { xGone(c.value.id); bl.delete(c.value.id); bl.delete(partsKey(c.value.id)); c.delete(); c.continue(); } };
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
const partsKey = id => IDBKeyRange.bound(id + ':', id + ':￿');   // куски большого файла, пока он качается в браузере
const delMsg = id => new Promise(res => { xGone(id); const t = db.transaction(['msgs', 'blobs'], 'readwrite'); t.objectStore('msgs').delete(id); t.objectStore('blobs').delete(id); t.objectStore('blobs').delete(partsKey(id)); t.oncomplete = res; t.onerror = res; });

// Телефон: если хранилище WebView стёрлось (сбой посреди записи), но в закрытой папке приложения есть
// запасная копия — возвращаем тот же профиль: ключ, контакты, группы, устройства. Переписку дошлют собеседники.
let restored = false;
if (APP?.backup && !await kvGet('keys')) {
  try {
    const b = JSON.parse(await APP.backup.get(SLOT) || 'null');
    if (b?.keys?.jwk && b.keys.pub) {
      const priv = await crypto.subtle.importKey('jwk', b.keys.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
      await kvSet('keys', { pub: b.keys.pub, priv, jwk: b.keys.jwk });
      if (b.ident) await kvSet('ident', b.ident);
      if (b.state?.me) await kvSet('state', { ...b.state, chats: {}, ended: {}, dl: {}, src: {} });
      restored = true; jlog('[копия] профиль восстановлен из запасной копии', b.id || '');
    }
  } catch (e) { jlog('[копия] не получилось восстановить:', e?.message || e); }
}
// состояние: я, контакты, группы, чаты (сами сообщения — отдельно, в msgs)
let S = await kvGet('state') || null;
if (!S) S = { me: null, contacts: {}, groups: {}, chats: {}, ended: {} };
S.ended ||= {};
// большие файлы: что качаю (S.dl: id → {st, got, path}), откуда читаю отправленное (S.src: id → путь на диске)
S.dl ||= {}; S.src ||= {};
for (const d of Object.values(S.dl)) if (d.st === 'go') d.st = 'wait';   // программу закрыли посреди закачки — докачаем
const dls = new Map(), ups = new Map(), expect = new Map(), srcMem = new Map();
let saveT = 0, wiping = false;
function save() { if (wiping) return; clearTimeout(saveT); saveT = setTimeout(() => { kvSet('state', S).catch(e => console.warn('save', e)); backupSoon(); }, 250); }
let backupT = 0;
function backupSoon() {
  if (!APP?.backup || wiping || !S?.me) return;
  clearTimeout(backupT); backupT = setTimeout(() => {
    const st = { me: S.me, contacts: S.contacts, groups: S.groups, devs: S.devs, revs: S.revs, pname: S.pname, pwd: S.pwd, routing: S.routing, devSeen: S.devSeen };
    APP.backup.put(SLOT, JSON.stringify({ v: 1, id: myId, ts: Date.now(), keys: { pub: keys.pub, jwk: keys.jwk || null }, ident, state: st }));
  }, 3000);
}

// ---------- личность: ключ и подписи ----------
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function b32(bytes) { let bits = 0, val = 0, out = ''; for (const b of bytes) { val = ((val << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } return out; }
const normId = s => String(s || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V').replace(/[^0-9A-Z]/g, '');
const fmtId = id => id ? id.slice(0, 5) + '-' + id.slice(5) : '';
const pid = id => 'kzm-' + id.toLowerCase();
async function idFromPub(p) { const h = await crypto.subtle.digest('SHA-256', enc(String(p.x) + '.' + String(p.y))); return b32(new Uint8Array(h)).slice(0, 10); }
let keys = await kvGet('keys');
if (!keys) {
  // на телефоне ключ можно прочитать — его копия лежит в закрытой папке приложения на случай, если хранилище WebView сотрётся
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, !!APP?.backup, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', k.publicKey);
  keys = { pub: { kty: 'EC', crv: 'P-256', x: j.x, y: j.y }, priv: k.privateKey };
  if (APP?.backup) keys.jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  await kvSet('keys', keys);
}
// Связанные устройства. Ключ профиля живёт только на основном устройстве (его нельзя скопировать).
// Другое устройство («вошёл в профиль») держит свой ключ и сертификат: подпись ключом профиля
// под строкой 'dev|ID профиля|ID устройства|ключ устройства'. В сети оно — kzm-<профиль>-<устройство>.
const devIdOf = async p => (await idFromPub(p)).slice(0, 6).toLowerCase();
const certStr = (id, dev, p) => 'dev|' + id + '|' + dev + '|' + String(p.x) + '.' + String(p.y);
const cleanPub = p => ({ kty: 'EC', crv: 'P-256', x: String(p?.x || ''), y: String(p?.y || '') });
let ident = await kvGet('ident') || null;   // {profile, ppub, dev, cert, name} — это устройство вошло в профиль с другого
if (ident && ident.dev !== await devIdOf(keys.pub)) { console.error('[личность] ключ устройства не совпадает с сертификатом — выхожу из профиля'); ident = null; S = null; await kvSet('ident', null); }
if (!S) S = { me: null, contacts: {}, groups: {}, chats: {}, ended: {} };
const myDev = ident?.dev || '';                         // '' — основное устройство профиля
const myId = ident ? ident.profile : await idFromPub(keys.pub);
const myPub = ident ? ident.ppub : keys.pub;            // открытый ключ профиля
const peerOf = (u, dev) => pid(u) + (dev ? '-' + dev : '');
const myPeer = peerOf(myId, myDev);
if (S?.me?.id && S.me.id !== myId) console.error('[личность] сохранённый ключ не найден — создан новый: был ' + S.me.id + ', стал ' + myId);
const sign = async s => b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.priv, enc(s)));
async function verify(pub, sig, s) {
  try { const k = await crypto.subtle.importKey('jwk', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, unb64(sig), enc(s)); }
  catch (e) { return false; }
}
// как назвать это устройство в списке устройств профиля
function devName() {
  const ua = navigator.userAgent;
  if (ANDROID || /Android/i.test(ua)) { const m = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\s*[;)]/), md = m ? m[1].trim() : ''; return 'Телефон' + (md && !/^(K|wv|Linux)$/i.test(md) ? ' ' + md.slice(0, 24) : ''); }
  if (/iPhone|iPad/i.test(ua)) return /iPad/i.test(ua) ? 'Планшет iPad' : 'iPhone';
  return APP ? 'Компьютер' : 'Браузер на компьютере';
}
let appVer = '';
APP?.version?.().then(v => { appVer = String(v || ''); }).catch(() => {});
if (!APP) fetch('package.json', { cache: 'no-cache' }).then(r => r.json()).then(j => { appVer = String(j.version || ''); }).catch(() => {});

// ---------- чаты и участники ----------
const dmId = u => 'd:' + [myId, u].sort().join(':');
const isDm = c => c.startsWith('d:');
const dmPeer = c => c.slice(2).split(':').find(x => x !== myId) || myId;
function members(c) { if (isDm(c)) return c.slice(2).split(':'); const g = S.groups[c]; return g && !g.gone ? g.members : []; }
const shares = (c, u) => { const m = members(c); return m.includes(u) && m.includes(myId); };
const groupsWith = u => Object.values(S.groups).filter(g => !g.gone && g.members.includes(u) && g.members.includes(myId));
function sharedChats(u) { const out = [dmId(u)]; for (const g of groupsWith(u)) out.push(g.id); return out; }
function nameOf(u, c) {
  if (u === myId) return S.me?.name || 'Я';
  const ct = S.contacts[u];
  if (ct?.alias) return ct.alias;
  if (ct?.name) return ct.name;
  for (const g of Object.values(S.groups)) if (g.names?.[u]) return g.names[u];
  return 'Собеседник ' + fmtId(u).slice(0, 5);
}
function ensureChat(c) {
  if (!S.chats[c]) { S.chats[c] = { id: c, last: null, unread: 0, myRead: 0, seen: {}, created: Date.now() }; save(); }
  return S.chats[c];
}
function chatTitle(c) { return isDm(c) ? nameOf(dmPeer(c)) : (S.groups[c]?.name || 'Группа'); }
function avEl(c, size = 48) {
  const d = el('div', 'av'); d.style.setProperty('--s', size + 'px');
  let img = '', seed = c, letter = '?';
  if (isDm(c) || !c.includes(':')) {
    const u = c.includes(':') ? dmPeer(c) : c;
    seed = u; img = u === myId ? S.me?.avatar : S.contacts[u]?.avatar; letter = nameOf(u);
  } else { d.classList.add('grp'); letter = S.groups[c]?.name || 'Г'; img = S.groups[c]?.avatar; }
  d.style.setProperty('--h', hash(seed) % 360);
  if (img && /^data:image\/(webp|jpeg|png);base64,/.test(img)) { const i = el('img'); i.src = img; i.alt = ''; d.append(i); }
  else d.textContent = (String(letter).trim()[0] || '?').toUpperCase();
  if (!d.classList.contains('grp')) { const u = c.includes(':') ? dmPeer(c) : c; window.kzTheme?.frameAv(d, u === myId ? S.me?.frame : S.contacts[u]?.frame); }
  return d;
}
const cleanAvatar = a => (typeof a === 'string' && a.length < 60000 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(a)) ? a : '';

// ---------- время ----------
const hm = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayKey = ts => new Date(ts).toDateString();
function listTime(ts) {
  if (!ts) return ''; const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return hm(ts);
  const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'вчера';
  if (now - d < 6 * 864e5) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
function seenText(ts) {
  if (!ts) return 'не в сети';
  const d = new Date(ts), now = new Date(), min = Math.round((now - d) / 6e4);
  if (min < 1) return 'в сети только что';
  if (min < 60) return 'в сети ' + min + ' мин назад';
  return 'последний раз в сети ' + (listTime(ts) === hm(ts) ? 'сегодня в ' + hm(ts) : listTime(ts) === 'вчера' ? 'вчера в ' + hm(ts) : listTime(ts));
}
const fmtDur = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---------- сеть ----------
let peer = null, net = 'off', idTaken = 0;
// связи: id человека -> Map(устройство -> связь {c, authed, outgoing, nonce, uid, dev, self, peer, their, q}); '' — его основное устройство.
// У человека бывает несколько устройств, у меня самого — тоже: uid === myId — это мои же устройства (self).
const links = new Map();
const dialing = new Map();  // адрес в сети (kzm-…) -> когда начали звонить
const typing = new Map();   // chat|uid -> до какого времени «печатает»
const hasDevs = () => !!myDev || Object.keys(S.devs || {}).length > 0;   // есть ли у профиля другие устройства
const revStr = (id, list) => 'revoked|' + id + '|' + [...list].sort().join(',');
const revSet = u => new Set((u === myId ? S.revs : S.contacts[u]?.revs)?.list || []);
function devsOf(u) {   // на какие устройства человека звонить
  const src = u === myId ? S.devs : S.contacts[u]?.devs, rv = revSet(u);
  return ['', ...Object.keys(src || {})].filter(d => !rv.has(d) && !(u === myId && d === myDev));
}
function parsePeer(s) { const m = String(s || '').toLowerCase().match(/^kzm-([0-9a-z]{10})(?:-([0-9a-z]{6}))?$/); return m ? { u: normId(m[1]), dev: m[2] || '' } : null; }
function startPeer() {
  if (typeof Peer === 'undefined') { setNet('off'); setTimeout(startPeer, 5000); return; }
  if (wiping) return;
  try { peer?.destroy(); } catch (e) {}
  setNet('wait');
  const p = peer = new Peer(myPeer, { config: iceCfg(), debug: 0 });
  p.on('open', () => { if (peer !== p) return; idTaken = 0; setNet('on'); dialAll(); });
  p.on('call', c => window.kzMusic?.onCall?.(c));   // трансляция музыки от ведущего
  p.on('connection', c => {
    if (c.metadata?.link === 1) { setTimeout(() => { try { c.close(); } catch (e) {} }, 100); return; }   // старые версии стучались сюда за входом по коду — теперь вход идёт через сервер
    if (c.metadata?.xfer) { xIncoming(c); return; }          // отправитель большого файла, который я попросил
    const x = parsePeer(c.peer);
    if (!x || (x.u === myId && x.dev === myDev) || S.contacts[x.u]?.state === 'blocked') { setTimeout(() => { try { c.close(); } catch (e) {} }, 100); return; }
    wire(c, false, x.u, x.dev);
  });
  p.on('disconnected', () => { if (peer !== p) return; setNet('wait'); setTimeout(() => { if (peer === p && !p.destroyed && p.disconnected) try { p.reconnect(); } catch (e) {} }, 2000); });
  p.on('error', e => {
    if (peer !== p) return;
    if (e.type === 'peer-unavailable') { const m = String(e.message || '').match(/kzm-[0-9a-z-]+/i); if (m) dialing.delete(m[0].toLowerCase()); return; }
    if (e.type === 'unavailable-id') { idTaken++; setNet(idTaken > 3 ? 'dup' : 'wait'); setTimeout(startPeer, 4000); return; }
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { setNet('off'); setTimeout(() => { if (peer === p) startPeer(); }, 6000); return; }
    console.warn('peer', e.type, e.message);
  });
}
function setNet(s) { if (s !== net) jlog('[сеть]', s); net = s; const e = $('#mxNet'); if (!e) return; e.textContent = { on: 'в сети · ID ' + fmtId(myId), wait: 'подключаюсь…', off: 'нет связи — переподключаюсь', dup: 'этот профиль уже открыт в другом окне' }[s]; e.className = s === 'on' ? '' : 'off'; }
function dialList() {
  const set = new Set();
  for (const [u, ct] of Object.entries(S.contacts)) if (ct.state !== 'blocked' && (ct.state !== 'req' || S.chats[dmId(u)])) set.add(u);
  for (const g of Object.values(S.groups)) if (!g.gone) for (const u of g.members) set.add(u);
  set.delete(myId); return hasDevs() ? [myId, ...set] : [...set];   // свои устройства — первыми: с них досинхронизируется всё остальное
}
function dial(u) {
  if (!peer || net !== 'on' || S.contacts[u]?.state === 'blocked') return;
  if (myDev && u !== myId && S.contacts[u]?.old) return;   // старый Кинозал не пускает дополнительные устройства — до него дойдёт через основное
  for (const dev of devsOf(u)) {
    if (links.get(u)?.get(dev)?.c.open) continue;
    const pk = peerOf(u, dev), t = dialing.get(pk); if (t && Date.now() - t < 20000) continue;
    dialing.set(pk, Date.now());
    try { wire(peer.connect(pk, { reliable: true, metadata: { v: 1 } }), true, u, dev); } catch (e) { dialing.delete(pk); }
  }
}
async function dialAll() { for (const u of dialList()) { dial(u); await sleep(120); } }
setInterval(dialAll, 40000);
window.addEventListener('focus', () => { if (net === 'on') dialAll(); });
const helloMsg = nonce => ({ t: 'hello', v: 1, id: myId, pub: myPub, name: S.me?.name || '', avatar: S.me?.avatar || '', frame: S.me?.frame || null, pts: S.me?.pts || 0, nonce, ver: appVer, caps: ['dev', 'xfer', 'xdir', ...(window.kzMusic ? ['mu'] : [])], ...(myDev ? { dev: myDev, dpub: keys.pub, cert: ident.cert } : {}) });
function wire(c, outgoing, u, dev = '') {
  const L = { c, outgoing, authed: false, nonce: b64(rnd(18)), uid: u, dev, self: u === myId, peer: peerOf(u, dev), their: null, q: Promise.resolve() };
  c.on('open', () => { c.send(helloMsg(L.nonce)); });
  c.on('data', d => { L.q = L.q.then(() => onData(L, d)).catch(e => console.error('[сообщение] ' + (e?.stack || e))); });
  const end = () => {
    if (outgoing) dialing.delete(L.peer);
    const m = links.get(u);
    if (m?.get(dev) === L) {
      m.delete(dev); if (!m.size) links.delete(u);
      jlog('[связь] нет с', L.peer);
      for (const x of [...dls.values()]) if (x.L === L) xDrop(x, 'wait');   // докачаем, когда связь вернётся
      if (L.self) { (S.devSeen ||= {})[dev] = Date.now(); save(); renderDevs(); }
      else if (!isOn(u) && S.contacts[u]) { S.contacts[u].seen = Date.now(); save(); }
      presence(u);
    }
  };
  c.on('close', end); c.on('error', end);
  setTimeout(() => { if (!L.authed) { try { c.close(); } catch (e) {} end(); } }, 25000);
}
const linksOf = u => [...(links.get(u)?.values() || [])].filter(L => L.authed && L.c.open);
const isOn = u => linksOf(u).length > 0;
const isDevOn = (u, dev) => { const L = links.get(u)?.get(dev); return !!L?.authed && L.c.open; };
// кому: id человека (на все его устройства; myId — на мои другие устройства) или одна связь
function send(x, m) {
  const ls = typeof x === 'object' ? (x?.authed && x.c.open ? [x] : []) : linksOf(x);
  let ok = false; for (const L of ls) try { L.c.send(m); ok = true; } catch (e) {}
  return ok;
}
function closeLinks(u, dev) { for (const [d, L] of links.get(u) || []) if (dev == null || d === dev) try { L.c.close(); } catch (e) {} }
function sendChat(c, m) { for (const u of members(c)) send(u, m); }   // в том числе моим другим устройствам

async function onData(L, d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'hello') {
    if (L.their || !d.pub || normId(d.id) !== L.uid) return;
    const pub = cleanPub(d.pub);
    if (await idFromPub(pub) !== L.uid) { console.warn('чужой ключ', L.uid); L.c.close(); return; }
    const dev = String(d.dev || '').toLowerCase(); let dpub = null;
    if (dev !== L.dev) { console.warn('чужое устройство', L.peer); L.c.close(); return; }
    if (dev) {   // дополнительное устройство: сертификат подписан ключом профиля
      dpub = cleanPub(d.dpub);
      if (await devIdOf(dpub) !== dev || !await verify(pub, String(d.cert || ''), certStr(L.uid, dev, dpub))) { console.warn('сертификат устройства не сошёлся', L.peer); L.c.close(); return; }
      if (revSet(L.uid).has(dev)) { jlog('[устройства] отвязанное устройство', L.peer); if (L.self && S.revs) try { L.c.send({ t: 'revoked', revs: S.revs }); } catch (e) {} setTimeout(() => { try { L.c.close(); } catch (e) {} }, 800); return; }
    }
    L.their = { pub, dpub, dev, cert: dev ? String(d.cert) : '', name: clean(d.name, 40), avatar: cleanAvatar(d.avatar), ver: clean(d.ver, 20), frame: window.kzTheme?.cleanFrame(d.frame) || null, pts: +d.pts || 0, caps: [].concat(d.caps || []).map(String) };
    L.c.send({ t: 'proof', sig: await sign(String(d.nonce || '') + '|' + myId) });
    return;
  }
  if (d.t === 'proof') {
    if (!L.their || L.authed) return;
    if (!await verify(L.their.dpub || L.their.pub, d.sig, L.nonce + '|' + L.uid)) { console.warn('подпись не сошлась', L.uid); L.c.close(); return; }
    L.authed = true; L.at = Date.now(); return linkUp(L);
  }
  if (d.t === 'revoked' && L.self && myDev) return onRevs(d.revs, true);   // меня отвязали, пока я был не в сети
  if (!L.authed) return;
  const u = L.uid;
  switch (d.t) {
    case 'msg': return onMsg(L, d);
    case 'ack': {
      if (L.self && !d.fwd) return;   // моё другое устройство получило — это ещё не «доставлено»
      const ids = [].concat(d.ids || []).slice(0, 500).map(String);
      for (const id of ids) { const m = await msgGet(id); if (m && m.from === myId && !m.ack) { m.ack = 1; await msgPut(m); const l = S.chats[m.chat]?.last; if (l?.id === m.id) { l.ack = 1; save(); } tick(m); } }
      if (!L.self && hasDevs()) send(myId, { t: 'ack', ids, fwd: 1 });
      return;
    }
    case 'read': return onRead(L, d);
    case 'sync': return onSync(L, d);
    case 'groups': for (const g of [].concat(d.list || []).slice(0, 100)) mergeGroup(g, u); return;
    case 'profile': return onProfile(L, d);
    case 'typing': { if (L.self) return; const c = String(d.chat || ''); if (!shares(c, u)) return; typing.set(c + '|' + u, Date.now() + 4500); renderHead(); renderList(); setTimeout(() => { renderHead(); renderList(); }, 4700); return; }
    case 'decline': if (!L.self && myCall && d.code === myCall.code) toast(nameOf(u) + ' сейчас не может ответить'); return;
    case 'ringoff': if (L.self && ringing && ringing.code === clean(d.code, 8)) stopRing(); return;   // ответил(а) или отклонил(а) на другом своём устройстве
    case 'calls': {   // какие звонки у собеседника на самом деле идут — остальные его приглашения гаснут
      if (L.self) return;
      const live = new Set([].concat(d.live || []).map(x => clean(x, 8)));
      let ch = false;
      for (const [code, x] of Object.entries(S.calls || {})) if (x.from === u && !live.has(code) && !S.ended[code] && Date.now() - x.ts > 15000) {
        S.ended[code] = Date.now(); ch = true; if (ringing?.code === code) stopRing();
        if (window.kzRoom?.inRoom && window.kzRoom.code === code) { jlog('[зал] у хозяина звонка его больше нет — выхожу'); toast('Звонок оборвался'); window.kzRoom.leave(); }
      }
      if (ch) { save(); refreshCallCards(); }
      return;
    }
    case 'react': return onReact(L, d);
    case 'del': return onDel(L, d);
    case 'knock': if (L.self) return; return onKnock(u, d);
    case 'callend': { const code = clean(d.code, 8); if (!code) return; S.ended[code] = Date.now(); save(); if (ringing?.code === code) stopRing(); refreshCallCards(); return; }
    case 'devs': return onDevs(L, d);
    case 'contacts': if (L.self) onContacts(d); return;
    case 'bye': if (L.self && L.dev && !myDev) revokeDev(L.dev); return;   // моё устройство вышло из профиля — его ключ стёрт, убираем из списка
    case 'xget': return xServe(L, d);
    case 'xno': return xNo(L, d);
    case 'xmanq': return xManServe(L, d);
    case 'xman': return xManGot(L, d);
    case 'mu': return window.kzMusic?.onMsg?.(L, d);
    case 'act': return onAct(L, d);   // статус активности друга   // совместное прослушивание (music.js)
  }
}
function linkUp(L) {
  const u = L.uid; let lm = links.get(u); const ex = lm?.get(L.dev);
  if (ex && ex !== L && ex.authed && ex.c.open) {
    // двое позвонили друг другу одновременно — оставляем соединение того, чей адрес в сети меньше.
    // Если же старому соединению больше 10 с, собеседник перезапустился (упал, выключили свет), а старое
    // просто ещё не заметило, что мертво, — оставляем новое, иначе связи не будет, пока WebRTC не похоронит старое
    const exO = ex.outgoing ? myPeer : L.peer, myO = L.outgoing ? myPeer : L.peer;
    if (Date.now() - (ex.at || 0) < 10000 && exO < myO) { setTimeout(() => L.c.close(), 300); return; }
    setTimeout(() => ex.c.close(), 300);
  }
  if (!lm) links.set(u, lm = new Map());
  lm.set(L.dev, L); dialing.delete(L.peer); jlog('[связь] есть с', L.peer, L.their?.ver || '');
  if (L.self) return selfUp(L);
  setTimeout(() => actHello(L), 700);   // новому соединению — мой статус
  const t = L.their; let ct = S.contacts[u];
  // имя и аватарка — самые свежие из всех устройств собеседника (старый Кинозал времени правки не присылает — верим ему)
  const fresh = !t.caps.includes('dev') || t.pts >= (ct?.pts || 0);
  if (ct) { if (fresh) { if (t.name) ct.name = t.name; ct.avatar = t.avatar; ct.frame = t.frame; if (t.pts) ct.pts = t.pts; } ct.ver = t.ver; if (ct.state === 'pending') ct.state = 'ok'; }
  else { S.contacts[u] = ct = { id: u, name: t.name, avatar: t.avatar, ver: t.ver, frame: t.frame, pts: t.pts, state: groupsWith(u).length ? 'member' : 'req', added: Date.now() }; if (hasDevs()) send(myId, contactsMsg([ct])); }
  const old = !t.caps.includes('dev'); if (ct.old !== old) { ct.old = old; if (hasDevs()) send(myId, contactsMsg([ct])); }   // мои устройства узнают, что сюда звонить им бесполезно
  if (L.dev) (ct.devs ||= {})[L.dev] = { ...(ct.devs[L.dev] || {}), dev: L.dev, pub: t.dpub, cert: t.cert };
  for (const g of groupsWith(u)) if (t.name && fresh) g.names[u] = t.name;
  save(); presence(u);
  const gl = groupsWith(u).map(gWire); if (gl.length) send(L, { t: 'groups', list: gl });
  for (const c of sharedChats(u)) { const ch = S.chats[c]; if (ch?.myRead) send(L, { t: 'read', chat: c, ts: ch.myRead }); }
  send(L, { t: 'calls', live: myCall && window.kzRoom?.inRoom ? [myCall.code] : [] });
  if (hasDevs() || S.revs) send(L, devsMsg());
  sendSync(L); flushQ(u); xResume(L);
}
// встретились два моих устройства: сверяем всё — профиль, контакты, группы, устройства, прочитанное и переписку
function selfUp(L) {
  (S.devSeen ||= {})[L.dev] = Date.now(); save();
  send(L, profileMsg()); send(L, contactsMsg()); send(L, devsMsg());
  const gl = Object.values(S.groups).filter(g => !g.gone && g.members.includes(myId)).map(gWire); if (gl.length) send(L, { t: 'groups', list: gl });
  for (const ch of Object.values(S.chats)) if (ch.myRead) send(L, { t: 'read', chat: ch.id, ts: ch.myRead });
  sendSync(L); flushQ(myId); presence(myId); renderDevs(); xResume(L);
}
const myChats = () => Object.keys(S.chats).filter(c => isDm(c) ? members(c).includes(myId) : !!S.groups[c] && !S.groups[c].gone);
const chatsFor = L => L.self ? myChats() : sharedChats(L.uid);
async function sendSync(L) {
  const have = {};
  for (const c of chatsFor(L)) have[c] = (await chatMsgs(c)).map(m => m.id);
  send(L, { t: 'sync', have });
}
async function onSync(L, d) {
  const have = d.have && typeof d.have === 'object' ? d.have : {};
  for (const c of chatsFor(L)) {
    const theirs = new Set([].concat(have[c] || []).slice(0, 2000));
    for (const m of await chatMsgs(c)) if (!theirs.has(m.id)) { if (!await push(L, m)) return; await sleep(5); }
  }
}
const wireMsg = m => ({ id: m.id, chat: m.chat, from: m.from, ts: m.ts, kind: m.kind, text: m.text, mime: m.mime, dur: m.dur, wave: m.wave, code: m.code, room: m.room, blob: m.blob, big: m.big, dev: m.big ? m.dev || '' : undefined, dir: m.dir, n: m.dir ? m.n : undefined, w: m.w, h: m.h, th: m.th, ex: m.ex, name: m.name, size: m.size, re: m.re, open: m.open, at: m.at });
// кому: id человека или одна связь; своим устройствам уходят ещё галочки и реакции
async function push(x, m) {
  const self = typeof x === 'object' ? x.self : x === myId;
  if (typeof x === 'object' ? !(x.authed && x.c.open) : !isOn(x)) return false;
  let b = null;
  if (m.blob && !m.big) { const bl = await blobGet(m.id); if (bl) b = await bl.arrayBuffer(); }
  const w = wireMsg(m); if (self) { if (m.ack) w.ack = 1; if (m.rx) w.rx = m.rx; }
  return send(x, { t: 'msg', m: w, b });
}

// ---------- мои устройства: профиль, контакты, прочитанное ----------
const profileMsg = () => ({ t: 'profile', name: S.me?.name || '', avatar: S.me?.avatar || '', frame: S.me?.frame || null, pts: S.me?.pts || 0 });
function sendProfile() { const m = profileMsg(); for (const u of links.keys()) send(u, m); }   // собеседникам и моим устройствам
function onProfile(L, d) {
  const u = L.uid, n = clean(d.name, 40), pts = +d.pts || 0;
  if (L.self) {   // имя или аватарку поменяли на другом моём устройстве
    if (!S.me || !n || pts <= (S.me.pts || 0)) return;
    S.me.name = n; S.me.avatar = cleanAvatar(d.avatar); S.me.frame = window.kzTheme?.cleanFrame(d.frame) || null; S.me.pts = pts; store.set('name', n);
    for (const g of Object.values(S.groups)) if (g.names) g.names[myId] = n;
    save(); renderMe(); renderList(); renderHead();
    const m = profileMsg(); for (const x of links.keys()) if (x !== myId) send(x, m);   // и собеседникам, что на связи со мной здесь
    return;
  }
  const ct = S.contacts[u]; if (ct && d.pts != null && pts < (ct.pts || 0)) return;   // устаревшее имя с другого устройства собеседника
  if (ct) { if (n) ct.name = n; ct.avatar = cleanAvatar(d.avatar); ct.frame = window.kzTheme?.cleanFrame(d.frame) || null; if (pts) ct.pts = pts; }
  for (const g of groupsWith(u)) if (n) g.names[u] = n;
  save(); renderList(); renderHead();
}
const CT_STATES = ['ok', 'pending', 'req', 'member', 'blocked'];
const ctWire = c => ({ id: c.id, name: c.name || '', alias: c.alias || '', state: c.state, avatar: c.avatar || '', frame: c.frame || null, added: c.added || 0, cts: c.cts || 0, pts: c.pts || 0, old: c.old, devs: c.devs || null, revs: c.revs || null });
const contactsMsg = (list = Object.values(S.contacts)) => ({ t: 'contacts', list: list.filter(c => c?.id && c.id !== myId).map(ctWire) });
// контакт изменили вручную (добавили, подписали, заблокировали) — сообщаем моим устройствам
function ctChanged(ct) { if (!ct) return; ct.cts = Date.now(); save(); if (hasDevs()) send(myId, contactsMsg([ct])); }
function onContacts(d) {
  let ch = false;
  for (const x of [].concat(d.list || []).slice(0, 3000)) {
    const id = normId(x?.id); if (id.length !== 10 || id === myId || !CT_STATES.includes(x.state)) continue;
    let ct = S.contacts[id];
    if (!ct) { ct = S.contacts[id] = { id, name: clean(x.name, 40), alias: clean(x.alias, 40), state: x.state, avatar: cleanAvatar(x.avatar), frame: window.kzTheme?.cleanFrame(x.frame) || null, added: +x.added || Date.now(), cts: +x.cts || 0, pts: +x.pts || 0 }; ch = true; }
    else {
      if ((+x.cts || 0) > (ct.cts || 0)) { ct.alias = clean(x.alias, 40); ct.state = x.state; ct.cts = +x.cts; ch = true; if (x.state === 'blocked') closeLinks(id); }
      if (x.name && ((+x.pts || 0) > (ct.pts || 0) || !ct.name)) { ct.name = clean(x.name, 40); ct.avatar = cleanAvatar(x.avatar); ct.frame = window.kzTheme?.cleanFrame(x.frame) || null; ct.pts = +x.pts || ct.pts || 0; ch = true; }
    }
    if (x.old != null && !isOn(id)) ct.old = !!x.old;
    // устройства собеседника: подписи проверятся при встрече, а звонить на них можно уже сейчас
    if (x.devs && typeof x.devs === 'object') for (const [dv, v] of Object.entries(x.devs).slice(0, 20)) if (/^[0-9a-z]{6}$/.test(dv) && v?.pub && v?.cert && !ct.devs?.[dv]) { (ct.devs ||= {})[dv] = { dev: dv, pub: cleanPub(v.pub), cert: String(v.cert) }; ch = true; }
    if (Array.isArray(x.revs?.list) && x.revs.list.length > (ct.revs?.list.length || 0)) { ct.revs = { list: x.revs.list.map(String).slice(0, 200), sig: String(x.revs.sig || '') }; ch = true; }
  }
  if (ch) { save(); renderList(); renderHead(); }
  setTimeout(dialAll, 300);
}
async function onRead(L, d) {
  const c = String(d.chat || ''), ts = +d.ts || 0;
  if (L.self && !d.by) {   // прочитал(а) на другом своём устройстве — здесь тоже прочитано
    if (!/^(d:[0-9A-Z]{10}:[0-9A-Z]{10}|g:[\w-]{6,40})$/.test(c) || !members(c).includes(myId)) return;
    const ch = ensureChat(c); if (ts <= (ch.myRead || 0)) return;
    ch.myRead = ts;
    ch.unread = !ch.last || ch.last.ts <= ts ? 0 : (await chatMsgs(c, 400)).filter(m => m.from !== myId && m.ts > ts).length;
    save(); renderList(); if (!ch.unread) APP?.seen?.(c);
    return;
  }
  const by = L.self ? normId(d.by) : L.uid;
  if (!shares(c, by)) return;
  const ch = S.chats[c]; if (!ch) return;   // отметка о прочтении не воскрешает удалённый чат
  if (ts > (ch.seen[by] || 0)) { ch.seen[by] = ts; save(); ticksAll(c); renderList(); if (!L.self && hasDevs()) send(myId, { t: 'read', chat: c, ts, by }); }
}

// ---------- мои устройства: список, сертификаты, отвязка ----------
const devList = () => Object.values(S.devs || {}).map(x => ({ dev: x.dev, pub: x.pub, cert: x.cert, name: x.name || '' }));
const devsMsg = () => ({ t: 'devs', list: devList(), revs: S.revs || null, pname: myDev ? (S.pname || '') : devName() });
let devsPaint = null;
const renderDevs = () => { try { devsPaint?.(); } catch (e) {} };
// пришёл список отвязанных устройств — он подписан ключом профиля
async function onRevs(rv, self, u = myId, ppub = myPub) {
  if (!rv || !Array.isArray(rv.list) || !await verify(ppub, String(rv.sig || ''), revStr(u, rv.list))) return false;
  const list = rv.list.map(String).slice(0, 200).sort(), cur = self ? S.revs : S.contacts[u]?.revs;
  if (list.length <= (cur?.list.length || 0)) return false;
  const revs = { list, sig: String(rv.sig) };
  if (self) {
    if (myDev && list.includes(myDev)) { revokedMe(); return true; }
    S.revs = revs; for (const dv of list) { delete S.devs?.[dv]; closeLinks(myId, dv); }
  } else { const ct = S.contacts[u]; if (!ct) return false; ct.revs = revs; for (const dv of list) { delete ct.devs?.[dv]; closeLinks(u, dv); } }
  save(); renderDevs(); return true;
}
async function onDevs(L, d) {
  const u = L.uid, ppub = L.their.pub;
  if (d.revs) await onRevs(d.revs, L.self, u, ppub);
  if (wiping) return;
  const ct = L.self ? null : S.contacts[u]; if (!L.self && !ct) return;
  const devs = L.self ? (S.devs ||= {}) : (ct.devs ||= {}), rv = revSet(u);
  for (const x of [].concat(d.list || []).slice(0, 20)) {
    const dev = String(x?.dev || ''), p = cleanPub(x?.pub);
    if (!/^[0-9a-z]{6}$/.test(dev) || rv.has(dev)) continue;
    if (devs[dev]?.cert && devs[dev].cert === x.cert) { if (x.name) devs[dev].name = clean(x.name, 40); continue; }
    if (await devIdOf(p) !== dev || !await verify(ppub, String(x.cert || ''), certStr(u, dev, p))) continue;
    devs[dev] = { ...(devs[dev] || {}), dev, pub: p, cert: String(x.cert), name: clean(x.name, 40) };
  }
  if (L.self && myDev && d.pname) S.pname = clean(d.pname, 40);
  save(); dial(u); renderDevs();
}
// основное устройство отвязывает другое: подписывает новый список отвязанных и рассылает его всем
async function revokeDev(dev) {
  if (myDev) return;
  const list = [...new Set([...(S.revs?.list || []), dev])].sort();
  S.revs = { list, sig: await sign(revStr(myId, list)) };
  delete S.devs?.[dev]; save();
  const m = devsMsg(); for (const u of links.keys()) send(u, m);
  setTimeout(() => closeLinks(myId, dev), 1500);
  jlog('[устройства] отвязано', dev); renderDevs();
}
// стереть с этого устройства этот профиль: ключ, переписку, запасную копию — и перейти к другому профилю или на первый экран
async function wipeDevice(why) {
  wiping = true; clearTimeout(saveT); clearTimeout(backupT);
  try { peer?.destroy(); } catch (e) {}
  for (const n of ['kv', 'msgs', 'blobs']) await tx(n, 'readwrite', s => s.clear()).catch(() => {});
  await APP?.backup?.drop(SLOT);   // иначе профиль «воскреснет» из копии при следующем запуске
  const rest = profList().filter(x => x.slot !== SLOT); profSave(rest);
  try { if (why) sessionStorage.setItem('kinozal-why', why); } catch (e) {}
  if (rest.length) { lsSet('kinozal-slot', rest[0].slot || null); if (SLOT) lsSet('kinozal-dropdb', dbName(SLOT)); }
  location.hash = ''; location.reload();
}

// ---------- профили на этом устройстве ----------
// Список (localStorage 'kinozal-profiles'): [{slot, id, name, avatar}]. В сети — только активный; остальные догрузят своё, когда в них перейдёшь.
const profList = () => { try { const l = JSON.parse(lsGet('kinozal-profiles') || '[]'); return Array.isArray(l) ? l.filter(x => x && typeof x.slot === 'string') : []; } catch (e) { return []; } };
const profSave = l => lsSet('kinozal-profiles', JSON.stringify(l.slice(0, 20)));
function profTouch() {   // текущий профиль — в список (имя и аватарка свежие)
  if (!S?.me) return;
  const l = profList().filter(x => x.slot !== SLOT);
  l.unshift({ slot: SLOT, id: myId, name: S.me.name || '', avatar: S.me.avatar || '', dev: !!myDev });
  profSave(l.sort((a, b) => (a.slot || '').localeCompare(b.slot || '')));
}
function switchProfile(slot) { if (slot === SLOT) return; clearTimeout(saveT); kvSet('state', S).finally(() => { lsSet('kinozal-slot', slot || null); location.hash = ''; location.reload(); }); }
// новый профиль рядом с текущим: пустой слот, на первом экране — сразу вход (по ID и паролю или коду) или создание
function addProfile(mode, code) {
  const slot = b32(rnd(5)).toLowerCase().slice(0, 8);
  try { sessionStorage.setItem('kinozal-add', JSON.stringify({ mode, code: code || '', back: SLOT })); } catch (e) {}
  switchProfile(slot);
}
async function removeProfile(x) {
  if (x.slot === SLOT) return;
  try { indexedDB.deleteDatabase(dbName(x.slot)); } catch (e) {}
  await APP?.backup?.drop(x.slot);
  profSave(profList().filter(y => y.slot !== x.slot));
}
function revokedMe() {
  if (wiping) return;
  jlog('[устройства] это устройство отвязали от профиля');
  wipeDevice('Это устройство отвязали от профиля «' + (S.me?.name || '') + '» на основном устройстве — его данные здесь удалены. Можно создать новый профиль или войти снова.');
}

// ---------- вход в профиль по ID и паролю ----------
// Пароль → PBKDF2 → ключ k (на основном устройстве хранится только он, не сам пароль). Из k отдельно получаются «ключ входа»
// (сервер хранит его хэш, чтобы отличать верный пароль) и ключ шифрования (сервер его не знает).
// Основное устройство держит на сервере связи Кинозала (/vault) зашифрованные запасные «места» для новых устройств:
// готовый ключ устройства и сертификат, подписанный ключом профиля. Новое устройство вводит ID и пароль, забирает одно
// место и входит в профиль — основное устройство при этом может быть выключено. Самого ключа профиля на сервере нет.
const VAULT = store.get('vault', '') || 'https://kinozal-signal.kinozal-signal.workers.dev/vault/';   // свой адрес — только для проверки
const VSLOTS = 10;   // сколько мест держим про запас; основное устройство пополняет их при каждом запуске
const hmacBytes = async (k, label) => { const key = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(label))); };
const vAuth = async k => b64(await hmacBytes(k, 'kinozal-vault-auth'));
const vKey = async k => crypto.subtle.importKey('raw', await hmacBytes(k, 'kinozal-vault-key'), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function vSeal(key, obj) { const iv = rnd(12), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(JSON.stringify(obj)))); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64(o); }
async function vOpen(key, s) { const u = unb64(s); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12)))); }
let vSkew = 0;   // на сколько часы сервера отличаются от моих
async function vFetch(path, body) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(VAULT + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal } : { signal: ac.signal });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  } catch (e) { throw new Error('Нет связи с сервером Кинозала — проверь интернет'); }
  finally { clearTimeout(to); }
}
const PWD_IT = 310000;
async function pwdKey(pw, salt, it) {
  const k = await crypto.subtle.importKey('raw', enc(String(pw).normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, k, 256));
}
async function setPassword(pw) {
  if (!pw) { delete S.pwd; save(); jlog('[устройства] пароль убран'); vaultSync(); return; }
  const salt = rnd(16); S.pwd = { salt: b64(salt), it: PWD_IT, k: b64(await pwdKey(pw, salt, PWD_IT)) }; delete S.vaultOn; save();
  jlog('[устройства] пароль задан'); vaultSync();
}
// основное устройство: запрос к хранилищу, подписанный ключом профиля
async function vaultCall(path, o) {
  for (let t = 0; t < 2; t++) {
    const msg = JSON.stringify({ id: myId, ts: Date.now() + vSkew, ...o });
    const r = await vFetch(myId + path, { ppub: myPub, msg, sig: await sign(msg) });
    if (r.j?.error === 'time' && r.j.now && !t) { vSkew = r.j.now - Date.now(); continue; }
    return r;
  }
}
async function newSlot() {   // готовое устройство для будущего входа: ключ и сертификат от ключа профиля
  const g = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', g.publicKey), pub = { kty: 'EC', crv: 'P-256', x: j.x, y: j.y }, dev = await devIdOf(pub);
  return { dev, pub, jwk: await crypto.subtle.exportKey('jwk', g.privateKey), cert: await sign(certStr(myId, dev, pub)) };
}
let vaultBusy = false;
async function vaultSync() {
  if (myDev || wiping || vaultBusy || !S?.me) return;
  vaultBusy = true;
  try {
    if (!S.pwd) {
      if (S.vaultOn || S.vaultDel) { S.vaultDel = 1; const r = await vaultCall('/put', { op: 'del' }); if (r.j?.ok) { delete S.vaultOn; delete S.vaultDel; save(); } }
      return;
    }
    const k = unb64(S.pwd.k), key = await vKey(k);
    const me = { name: S.me.name || '', avatar: S.me.avatar || '', frame: S.me.frame || null, pts: S.me.pts || 0 };
    const base = { op: 'sync', salt: S.pwd.salt, it: S.pwd.it, auth: await vAuth(k), state: await vSeal(key, { ppub: myPub, me, devs: devList(), pname: devName() }) };
    let r = await vaultCall('/put', base);
    if (!r.j?.ok) throw new Error('сервер ответил ' + (r.j?.error || r.status));
    let n = r.j.count;
    if (n < VSLOTS) {
      const add = []; for (let i = n; i < VSLOTS; i++) add.push(await vSeal(key, await newSlot()));
      r = await vaultCall('/put', { ...base, add });
      if (!r.j?.ok) throw new Error('сервер ответил ' + (r.j?.error || r.status));
      n = r.j.count;
    }
    if (!S.vaultOn) jlog('[вход] данные для входа по паролю на сервере, мест', n);
    S.vaultOn = { at: Date.now(), n }; save(); renderDevs();
  } catch (e) { jlog('[вход] данные для входа не обновились:', e?.message || e); }
  finally { vaultBusy = false; }
}
// новое устройство: ID и пароль → одно место из хранилища → вход в профиль
async function joinProfile(idText, dname, status, pw) {
  const id = idFromText(idText); if (id.length !== 10) throw new Error('ID — это 10 букв и цифр, например ' + fmtId('7KQ2M9XAB4'));
  if (!pw) throw new Error('Введи пароль от профиля');
  status('Ищу профиль ' + fmtId(id) + '…');
  const info = await vFetch(id + '/info');
  if (info.status === 404) throw new Error('Профиль ' + fmtId(id) + ' не найден. Проверь ID. Если всё верно — на основном устройстве (обновлённом до последней версии) задай пароль: Профиль → «Мои устройства» → «Пароль для входа» и один раз дай ему побыть в сети.');
  if (!info.j?.salt) throw new Error('Сервер Кинозала ответил не то, что ожидалось — попробуй позже');
  status('Проверяю пароль…');
  const k = await pwdKey(pw, unb64(info.j.salt), Math.min(2e6, Math.max(1e5, info.j.it | 0)));
  const r = await vFetch(id + '/claim', { auth: await vAuth(k) });
  if (r.j?.error) throw new Error({
    pwd: 'Пароль не подошёл' + (r.j.left != null ? ' (осталось попыток: ' + r.j.left + ')' : '') + '. После 5 неверных попыток вход закрывается на 15 минут, потом на дольше.',
    locked: 'Слишком много неверных попыток — вход закрыт' + (r.j.until ? ' до ' + new Date(r.j.until).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : ' на время') + '.',
    empty: 'Сейчас на сервере не осталось свободных мест для входа. Открой Кинозал на основном устройстве — оно пополнит их за несколько секунд — и попробуй снова.',
    none: 'Профиль не найден — на основном устройстве не задан пароль для входа.'
  }[r.j.error] || 'Не получилось войти в профиль (' + r.j.error + ')');
  status('Проверяю профиль…');
  let slot, st;
  try { const key = await vKey(k); slot = await vOpen(key, r.j.slot); st = await vOpen(key, r.j.state); } catch (e) { throw new Error('Данные профиля не расшифровались — обнови Кинозал и попробуй ещё раз'); }
  const ppub = cleanPub(st.ppub), dpub = cleanPub(slot.pub), dev = String(slot.dev || '');
  if (await idFromPub(ppub) !== id || !/^[0-9a-z]{6}$/.test(dev) || await devIdOf(dpub) !== dev || !await verify(ppub, String(slot.cert || ''), certStr(id, dev, dpub))) throw new Error('Ответ не похож на настоящий профиль — вход отменён');
  const priv = await crypto.subtle.importKey('jwk', slot.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, !!APP?.backup, ['sign']);
  const me = st.me || {}, devs = {}, name = clean(dname, 40);
  for (const x of [].concat(st.devs || []).slice(0, 20)) { const p2 = cleanPub(x?.pub), dv = String(x?.dev || ''); if (/^[0-9a-z]{6}$/.test(dv) && await devIdOf(p2) === dv && await verify(ppub, String(x.cert || ''), certStr(id, dv, p2))) devs[dv] = { dev: dv, pub: p2, cert: String(x.cert), name: clean(x.name, 40) }; }
  devs[dev] = { dev, pub: dpub, cert: String(slot.cert), name, added: Date.now() };
  wiping = true; clearTimeout(saveT);   // дальше состояние пишем сами и перезапускаемся
  await kvSet('keys', { pub: dpub, priv, ...(APP?.backup ? { jwk: slot.jwk } : {}) });
  await kvSet('ident', { profile: id, ppub, dev, cert: String(slot.cert), name });
  await kvSet('state', { me: { id, name: clean(me.name, 40) || 'Я', avatar: cleanAvatar(me.avatar), frame: window.kzTheme?.cleanFrame(me.frame) || null, pts: +me.pts || 0 }, contacts: {}, groups: {}, chats: {}, ended: {}, devs, pname: clean(st.pname, 40) });
  if (me.name) store.set('name', clean(me.name, 40));
  jlog('[устройства] вошёл в профиль', id, 'как', dev, 'по паролю');
  status('Готово! Загружаю переписку…');
  await sleep(700); location.hash = ''; location.reload();
}
const KINDS = ['text', 'img', 'voice', 'circle', 'call', 'sys', 'file', 'plan'];
const fileName = s => String(s || 'файл').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120) || 'файл';
function cleanMsg(x) {
  if (!x || typeof x !== 'object') return null;
  const m = { id: clean(x.id, 60), chat: clean(x.chat, 60), from: normId(x.from), ts: +x.ts || 0, kind: String(x.kind) };
  if (!m.id || !m.chat || m.from.length !== 10 || !KINDS.includes(m.kind) || m.ts <= 0 || m.ts > Date.now() + 864e5) return null;
  if (x.text != null) m.text = String(x.text).slice(0, 4000);
  if (['img', 'voice', 'circle'].includes(m.kind)) {
    m.blob = 1; m.mime = String(x.mime || '');
    const ok = { img: /^image\/(webp|jpeg|png|gif)$/, voice: /^audio\/(webm|ogg|mp4)(;.*)?$/, circle: /^video\/(webm|mp4)(;.*)?$/ }[m.kind];
    if (!ok.test(m.mime)) return null;
    if (x.dur != null) m.dur = Math.min(3600, Math.max(0, +x.dur || 0));
    if (Array.isArray(x.wave)) m.wave = x.wave.slice(0, 64).map(v => Math.max(0, Math.min(100, v | 0)));
    if (x.w) m.w = x.w | 0; if (x.h) m.h = x.h | 0;
  }
  if (m.kind === 'file') {
    m.mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(x.mime || '')) ? String(x.mime) : 'application/octet-stream';
    m.name = fileName(x.name); m.size = Math.max(0, +x.size || 0);
    // большой файл в сообщение не вложен: его скачивают напрямую с устройства отправителя (dev), кусками
    if (x.big) {
      m.big = 1; m.dev = /^[0-9a-z]{6}$/.test(String(x.dev || '')) ? String(x.dev) : ''; if (!m.size || m.size > 1e13) return null;
      if (x.dir) { m.dir = 1; m.n = Math.max(1, Math.min(50000, x.n | 0)); }   // папка целиком: n файлов, size — сумма
    } else m.blob = 1;
    // превью (картинка, RAW, кадр видео), размер и данные снимка — чтобы было видно, что прислали, ещё до скачивания
    if (typeof x.th === 'string' && x.th.length <= 200000 && /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(x.th)) m.th = x.th;
    if (x.w > 0 && x.h > 0) { m.w = Math.min(1e5, x.w | 0); m.h = Math.min(1e5, x.h | 0); }
    if (x.ex) m.ex = clean(x.ex, 160);
    if (x.dur > 0) m.dur = Math.min(864e3, Math.round(+x.dur));
  }
  if (m.kind === 'call') { m.code = clean(x.code, 8).toUpperCase(); m.room = x.room === 'cinema' ? 'cinema' : 'call'; if (!/^[A-Z0-9]{5}$/.test(m.code)) return null; }
  if (m.kind === 'plan') { m.at = +x.at || 0; m.room = x.room === 'call' ? 'call' : 'cinema'; m.text = clean(x.text, 80); if (m.at < m.ts - 864e5 || m.at > m.ts + 400 * 864e5) return null; }
  if (x.re && typeof x.re === 'object') { const r = { id: clean(x.re.id, 60), from: normId(x.re.from), kind: KINDS.includes(x.re.kind) ? x.re.kind : 'text', text: String(x.re.text || '').slice(0, 140) }; if (r.id && r.from.length === 10) m.re = r; }
  if (+x.open > m.ts && +x.open < m.ts + 400 * 864e5 && !['sys', 'call', 'plan'].includes(m.kind)) m.open = +x.open;   // капсула времени
  return m;
}
function cleanRx(x) {   // реакции, которые принесло моё другое устройство
  if (!x || typeof x !== 'object') return null;
  const out = {}; for (const [u, v] of Object.entries(x).slice(0, 60)) { const id = normId(u); if (id.length === 10 && Array.isArray(v)) out[id] = [cleanEmoji(v[0]), +v[1] || 0]; }
  return Object.keys(out).length ? out : null;
}
async function onMsg(L, d) {
  const u = L.uid, m = cleanMsg(d.m); if (!m) return;
  if (L.self) { const mem = members(m.chat); if (!mem.includes(myId) || !mem.includes(m.from)) return; }   // с моего устройства — любой мой чат
  else if (isDm(m.chat)) { if (m.chat !== dmId(u) || (m.from !== u && m.from !== myId)) return; }
  else if (!shares(m.chat, u) || !members(m.chat).includes(m.from)) return;
  if (S.gone?.[m.id] || m.ts <= (S.cleared?.[m.chat] || 0) || await msgGet(m.id)) { if (!L.self) send(L, { t: 'ack', ids: [m.id] }); return; }
  if (m.blob) {
    const b = d.b instanceof ArrayBuffer ? d.b : ArrayBuffer.isView(d.b) ? d.b.buffer.slice(d.b.byteOffset, d.b.byteOffset + d.b.byteLength) : null;
    if (!b || !b.byteLength || b.byteLength > LIMIT) return;
    await blobPut(m.id, new Blob([b], { type: m.mime }));
  }
  if (L.self) { if (d.m.ack) m.ack = 1; const rx = cleanRx(d.m.rx); if (rx) m.rx = rx; }
  else if (m.from === myId) m.ack = 1;
  await msgPut(m);
  if (!L.self) send(L, { t: 'ack', ids: [m.id] });
  arrived(m);
  autoRoute(m);   // маршруты: сохранить на диск или начать качать, если так настроено
  // пересылка между моими устройствами: чужое — моим другим устройствам (вдруг они не на связи с автором),
  // моё с другого устройства — собеседникам, что на связи здесь (например, старому Кинозалу, который не пускает дополнительные устройства)
  if (!L.self) { if (hasDevs()) push(myId, m); }
  else if (m.from === myId) for (const x of members(m.chat)) if (x !== myId && isOn(x)) push(x, m);
}
// новое сообщение (своё или чужое) — в список, в открытый чат, в уведомления
function arrived(m) {
  const ch = ensureChat(m.chat);
  if (!ch.last || m.ts >= ch.last.ts) ch.last = { ts: m.ts, from: m.from, kind: m.kind, text: m.text || '', id: m.id, room: m.room, ack: m.ack, name: m.name, open: m.open };
  const mine = m.from === myId;
  const viewing = open === m.chat && document.visibilityState === 'visible' && document.hasFocus() && $('#mx') && !$('#mx').hidden;
  if (!mine && m.ts > (ch.myRead || 0) && !viewing) ch.unread = (ch.unread || 0) + 1;
  if (isDm(m.chat) && !mine) { const u = dmPeer(m.chat); if (!S.contacts[u]) S.contacts[u] = { id: u, name: '', state: 'req', added: Date.now() }; }
  save(); renderList();
  if (open === m.chat) appendMsg(m);
  if (viewing && !mine) markRead(m.chat);
  if (m.kind === 'plan' && m.at > Date.now() - 3 * 3600e3) { (S.plans ||= {})[m.id] = { chat: m.chat, at: m.at, text: m.text || '', room: m.room }; save(); }
  if (m.open > Date.now() && !mine) { (S.caps ||= {})[m.id] = { chat: m.chat, open: m.open }; save(); }
  if (m.kind === 'call') { S.calls ||= {}; S.calls[m.code] = { from: m.from, ts: m.ts, chat: m.chat }; const k = Object.keys(S.calls); if (k.length > 200) delete S.calls[k[0]]; }
  if (!mine && Date.now() - m.ts < 5 * 6e4) {
    if (m.kind === 'call' && Date.now() - m.ts < 90000 && !S.ended[m.code]) ring(m);
    else if (!viewing && m.kind !== 'sys') notify(m);
  }
}

// ---------- отправка ----------
async function post(c, x, blob) {
  if (isDm(c)) { const ct = S.contacts[dmPeer(c)]; if (ct && (ct.state === 'req' || ct.state === 'member')) { ct.state = 'ok'; ctChanged(ct); renderHead(); } }  // ответил — значит, свой
  if (!['sys', 'call', 'plan'].includes(x.kind)) {
    if (replyTo?.chat === c) { x = { ...x, re: snip(replyTo) }; replyTo = null; }
    if (capsule?.chat === c) { if (capsule.ts > Date.now() + 5000) x = { ...x, open: capsule.ts }; capsule = null; }
    paintPre();
  }
  askNotify();
  const m = { id: uid(), chat: c, from: myId, ts: Date.now(), ...x };
  if (blob) { m.blob = 1; m.mime = blob.type; await blobPut(m.id, blob); }
  await msgPut(m); arrived(m);
  for (const u of members(c)) if (u !== myId || hasDevs()) { if (isOn(u)) push(u, m); else dial(u); }   // и моим другим устройствам
  return m;
}
function markRead(c) {
  const ch = S.chats[c]; if (!ch) return;
  const lastTs = ch.last?.ts || 0;
  if ((ch.unread || 0) === 0 && (ch.myRead || 0) >= lastTs) return;
  ch.unread = 0; ch.myRead = Math.max(ch.myRead || 0, lastTs); save(); renderList(); APP?.seen?.(c);
  sendChat(c, { t: 'read', chat: c, ts: ch.myRead });
}

// ---------- группы ----------
const gWire = g => ({ id: g.id, name: g.name, members: g.members, names: g.names, owner: g.owner, ver: g.ver, avatar: g.avatar || '' });
function mergeGroup(x, from) {
  if (!x || typeof x !== 'object' || !/^g:[\w-]{6,40}$/.test(String(x.id))) return;
  const mem = [...new Set([].concat(x.members || []).map(normId).filter(v => v.length === 10))].slice(0, 50);
  const loc = S.groups[x.id];
  if (!mem.includes(from) && !loc?.members.includes(from)) return;
  if (loc && (+x.ver || 0) <= (loc.ver || 0)) return;
  if (!mem.includes(myId)) { if (loc && !loc.gone) { loc.gone = 1; loc.ver = +x.ver; save(); renderList(); if (open === x.id) renderChat(); } return; }
  const names = {}; for (const u of mem) names[u] = clean(x.names?.[u], 40) || loc?.names?.[u] || '';
  S.groups[x.id] = { id: x.id, name: clean(x.name, 60) || 'Группа', members: mem, names, owner: normId(x.owner), ver: +x.ver || Date.now(), avatar: cleanAvatar(x.avatar) };
  ensureChat(x.id); save(); renderList(); if (open === x.id) { renderHead(); }
  for (const u of mem) if (u !== myId && !isOn(u)) dial(u);
}
function pushGroup(g, extra = []) { const w = gWire(g); for (const u of new Set([...g.members, ...extra])) if (u !== myId || hasDevs()) { if (isOn(u)) send(u, { t: 'groups', list: [w] }); else dial(u); } }
async function createGroup(name, list) {
  const g = { id: 'g:' + uid(), name: clean(name, 60) || 'Группа', members: [myId, ...list], names: { [myId]: S.me.name }, owner: myId, ver: Date.now() };
  for (const u of list) g.names[u] = nameOf(u);
  S.groups[g.id] = g; ensureChat(g.id); save();
  pushGroup(g);
  await post(g.id, { kind: 'sys', text: S.me.name + ' создаёт группу «' + g.name + '»' });
  openChat(g.id);
}

// ---------- интерфейс: каркас ----------
const root = el('div'); root.id = 'mx'; root.hidden = true;
root.innerHTML = `
<aside class="mx-side">
  <div class="mx-top"><button class="me" id="mxMe" title="Профиль и настройки"></button><h1 id="mxProf" title="Профиль и настройки"><span id="mxName">Профиль</span><small id="mxNet"></small></h1><button class="ib" id="mxTheme" title="Оформление: темы, обои, неон">${IC.palette}</button><button class="ib cine" id="mxCine" title="Кинозал — смотреть вместе без добавления в друзья">${IC.film}</button><button class="ib" id="mxFiles" title="Файлы: передачи, полученное, отправленное">${IC.folder}<b hidden></b></button><button class="ib" id="mxMusic" title="Музыка" hidden>${IC.music}</button><button class="ib" id="mxAdd" title="Добавить собеседника">${IC.add}</button></div>
  <div class="mx-callbar" id="mxCallbar" hidden><i class="pulse"></i><span>Идёт звонок</span><b>Вернуться →</b></div>
  <div class="mx-sec"><span>Чаты</span><button class="ib lay" id="mxLay" title="Список чатов: ширина, сторона, компактный вид">${IC.dots}</button></div>
  <div class="mx-search"><input id="mxQ" type="search" placeholder="Поиск" autocomplete="off"></div>
  <div class="mx-list" id="mxList"></div>
  <div class="mx-fab"><div class="fabmenu menu" id="mxFabMenu" hidden>
    <button data-a="contact"><i>👤</i>Новый собеседник</button><button data-a="group"><i>👥</i>Новая группа</button><button data-a="call"><i>📞</i>Созвон по коду</button>
  </div><button class="fab" id="mxFab" title="Новый чат" aria-label="Новый чат">${IC.pen}</button></div>
  <div class="mx-split" id="mxSplit" title="Тяни — ширина списка чатов (совсем узко — только аватарки, к другому краю — список переедет туда) · двойной клик — как было · правый клик — ещё"></div>
</aside>
<main class="mx-main" id="mxMain"></main>`;
document.body.append(root);
setNet(net);
$('#mxQ').oninput = () => { renderList(); clearTimeout(globalFind.t); globalFind.t = setTimeout(globalFind, 220); };
$('#mxAdd').onclick = () => addContactDlg();
$('#mxFiles').onclick = () => filesOpen ? closeFiles() : openFiles();
$('#mxMusic').onclick = () => musicApi?.shown ? closeMusic() : openMusic();
$('#mxTheme').onclick = () => openTheme();
$('#mxMe').onclick = $('#mxProf').onclick = () => settingsDlg();
$('#mxCine').onclick = () => codeDlg('cinema');
$('#mxCallbar').onclick = () => window.kzRoom?.show();
$('#mxFab').onclick = e => { e.stopPropagation(); $('#mxFabMenu').hidden = !$('#mxFabMenu').hidden; };
$('#mxFabMenu').onclick = e => { const a = e.target.closest('button')?.dataset.a; $('#mxFabMenu').hidden = true; if (a === 'contact') addContactDlg(); else if (a === 'group') groupDlg(); else if (a === 'call') codeDlg(); };
document.addEventListener('click', () => { if (Date.now() - menuAt < 450) return; $('#mxFabMenu').hidden = true; closeMenus(); });
function closeMenus() { document.querySelectorAll('.mx-pop').forEach(x => x.remove()); }
function renderMe() { const b = $('#mxMe'); b.textContent = ''; if (S.me) b.append(avEl(myId, 40)); $('#mxName').textContent = S.me?.name || 'Профиль'; }

// ---------- ширина и сторона списка чатов (на широком экране; на телефоне — одна панель за раз) ----------
const LAY = { min: 260, max: 600, rail: 80, snap: 180 };
const lay = { w: +store.get('mxSideW', 0) || 0, rail: store.get('mxRail', '0') === '1', right: store.get('mxSideR', '0') === '1' };
function applyLay(init) {
  const w = lay.rail ? LAY.rail : lay.w ? Math.round(Math.max(LAY.min, Math.min(LAY.max, innerWidth - 420, lay.w))) : 0;
  if (w) root.style.setProperty('--sideW', w + 'px'); else root.style.removeProperty('--sideW');
  const was = root.classList.contains('rail');
  root.classList.toggle('sized', !!w); root.classList.toggle('rail', lay.rail); root.classList.toggle('side-right', lay.right);
  if (was !== lay.rail && !init) renderList();   // подписи-подсказки у аватарок
}
function saveLay() { store.set('mxSideW', lay.w || ''); store.set('mxRail', lay.rail ? '1' : '0'); store.set('mxSideR', lay.right ? '1' : '0'); }
function setLay(x) { Object.assign(lay, x); applyLay(); saveLay(); }
function layMenu(x, y) {
  closeMenus(); menuAt = Date.now();
  const mn = el('div', 'menu fabmenu mx-pop');
  Object.assign(mn.style, { position: 'fixed', left: Math.max(8, Math.min(x, innerWidth - 270)) + 'px', top: Math.max(8, Math.min(y, innerHeight - 180)) + 'px', bottom: 'auto', right: 'auto', width: '260px', zIndex: 50 });
  const add = (ic, t, f) => { const b = el('button'); b.append(el('i', '', ic), document.createTextNode(t)); b.onclick = () => { closeMenus(); f(); }; mn.append(b); };
  add('⇄', lay.right ? 'Список чатов слева' : 'Список чатов справа', () => setLay({ right: !lay.right }));
  add(lay.rail ? '☰' : '◉', lay.rail ? 'Обычный список' : 'Только аватарки', () => setLay({ rail: !lay.rail }));
  if (lay.w || lay.rail) add('↺', 'Ширина по умолчанию', () => setLay({ w: 0, rail: false }));
  document.body.append(mn); mn.addEventListener('click', e => e.stopPropagation());
}
{
  const sp = $('#mxSplit');
  sp.addEventListener('pointerdown', e => {
    if (e.button !== 0 || narrow()) return;
    e.preventDefault(); try { sp.setPointerCapture(e.pointerId); } catch (er) {}
    const H = document.documentElement; H.classList.add('mx-resizing');
    let swap = false; const w0 = lay.w, r0 = lay.rail;
    const mv = ev => {
      const x = lay.right ? innerWidth - ev.clientX : ev.clientX;
      swap = x > innerWidth - 110;   // утащили к другому краю — отпустишь, и список переедет туда
      H.classList.toggle('mx-swap', swap); root.dataset.swapTo = lay.right ? 'left' : 'right';
      if (swap) return;
      if (x < LAY.snap) lay.rail = true; else { lay.rail = false; lay.w = Math.round(x); }
      applyLay();
    };
    const up = () => {
      sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); sp.removeEventListener('pointercancel', up);
      H.classList.remove('mx-resizing', 'mx-swap');
      if (swap) Object.assign(lay, { right: !lay.right, w: w0, rail: r0 });   // переехал — с той же шириной, что была
      applyLay(); saveLay();
    };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
  });
  sp.addEventListener('dblclick', () => setLay({ w: 0, rail: false }));
  sp.addEventListener('contextmenu', e => { e.preventDefault(); layMenu(e.clientX, e.clientY); });
  $('#mxLay').onclick = e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); layMenu(lay.right && !lay.rail ? r.right - 260 : r.left, r.bottom + 6); };
  addEventListener('resize', () => { if (lay.w) applyLay(); });
  applyLay(true);
}

// ---------- список чатов ----------
function lastText(c, l) {
  if (!l) return ['', isDm(c) ? 'Напиши первым' : 'Группа создана'];
  const who = l.from === myId ? 'Ты: ' : !isDm(c) ? nameOf(l.from) + ': ' : '';
  let t = { img: '🖼 Фото', voice: '🎤 Голосовое сообщение', circle: '⭕ Видеосообщение', call: l.room === 'cinema' ? '🎬 Кинозал' : '📞 Видеозвонок', sys: l.text, file: '📄 ' + (l.name || 'Файл'), plan: '🗓 ' + (l.room === 'call' ? 'Созвон' : 'Киносеанс') + (l.text ? ': ' + l.text : '') }[l.kind] || l.text || '';
  if (l.open > Date.now() && l.from !== myId) t = '⏳ Капсула времени';
  return [l.kind === 'sys' ? '' : who, t];
}
function typingIn(c) { const now = Date.now(); for (const [k, t] of typing) if (k.startsWith(c + '|') && t > now) return k.slice(c.length + 1); return null; }
function renderList() {
  const box = $('#mxList'); if (!box) return;
  const q = $('#mxQ').value.trim().toLowerCase();
  const list = Object.values(S.chats).filter(ch => {
    if (!isDm(ch.id) && !S.groups[ch.id]) return false;
    if (isDm(ch.id) && S.contacts[dmPeer(ch.id)]?.state === 'blocked' && !ch.last) return false;
    return !q || chatTitle(ch.id).toLowerCase().includes(q);
  }).sort((a, b) => (b.last?.ts || b.created || 0) - (a.last?.ts || a.created || 0));
  box.textContent = '';
  let total = 0;
  for (const ch of Object.values(S.chats)) total += ch.unread || 0;
  APP?.unread?.(total); document.title = total ? '(' + total + ') Кинозал' : 'Кинозал';
  const hits = q && gfind.q === fold(q) ? gfind.hits : [];   // найденные сообщения (ищутся в фоне, см. globalFind)
  const addHits = () => { if (!hits.length) return; box.append(el('div', 'mx-sec2', 'Сообщения')); for (const m of hits) box.append(hitEl(m, gfind.q)); };
  if (!list.length && hits.length) return addHits();
  if (!list.length) {
    const e = el('div', 'mx-nochats');
    if (q) e.append(el('span', '', 'Ничего не нашлось'));
    else { e.append(el('b', '', 'Пока нет чатов'), el('span', '', 'Добавь собеседника по его ID — и пишите, звоните, смотрите кино вместе.')); const b = el('button', 'btn pri', 'Добавить собеседника'); b.onclick = () => addContactDlg(); e.append(b); }
    box.append(e); return;
  }
  // при первом показе строки въезжают по очереди; счётчик непрочитанного подпрыгивает, только когда вырос
  if (!box.dataset.shown) { box.dataset.shown = 1; box.classList.add('enter'); setTimeout(() => box.classList.remove('enter'), 1200); }
  const was = renderList.unread ||= {};
  list.forEach((ch, i) => {
    const it = el('div', 'ci' + (ch.id === open ? ' act' : '')); it.dataset.chat = ch.id; it.style.setProperty('--i', i);
    const w = el('div', 'avwrap'); w.append(avEl(ch.id, 52), el('i', 'dot'));
    if (isDm(ch.id) && isOn(dmPeer(ch.id))) w.classList.add('on');
    const tx = el('div', 'tx'), r1 = el('div', 'r1'), r2 = el('div', 'r2');
    r1.append(el('span', 'nm', chatTitle(ch.id)));
    const ac = isDm(ch.id) ? actOf(dmPeer(ch.id)) : null; if (ac) { const bd = el('span', 'actb', actIcon(ac)); bd.title = actText(ac); r1.append(bd); }
    const l = ch.last;
    if (l?.from === myId && l.kind !== 'sys') r1.append(el('span', 'tick', readBy(ch.id, l.ts) || l.ack ? '✓✓' : '✓'));
    r1.append(el('span', 'tm', listTime(l?.ts || ch.created)));
    const ls = el('span', 'ls'), ty = typingIn(ch.id);
    if (ty) ls.append(el('span', 'ty', (isDm(ch.id) ? '' : nameOf(ty) + ' ') + 'печатает'));
    else { const [who, t] = lastText(ch.id, l); if (who) ls.append(el('b', '', who)); ls.append(document.createTextNode(t)); }
    r2.append(ls); if (ch.unread) r2.append(el('span', 'badge' + (ch.unread > (was[ch.id] || 0) ? ' bump' : ''), ch.unread > 99 ? '99+' : String(ch.unread)));
    was[ch.id] = ch.unread || 0;
    tx.append(r1, r2); it.append(w, tx);
    it.onclick = () => { if (Date.now() - (it._lp || 0) < 700) return; openChat(ch.id); };
    it.addEventListener('contextmenu', e => { e.preventDefault(); it._lp = Date.now(); listMenu(ch.id, e.clientX, e.clientY); });
    let lp = 0, p0 = null;
    it.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return; p0 = { x: e.clientX, y: e.clientY };
      lp = setTimeout(() => { lp = 0; it._lp = Date.now(); try { navigator.vibrate?.(12); } catch (er) {} listMenu(ch.id, p0.x, p0.y); }, 480);
    });
    it.addEventListener('pointermove', e => { if (lp && p0 && Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 10) { clearTimeout(lp); lp = 0; } });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) it.addEventListener(t, () => { clearTimeout(lp); lp = 0; });
    if (ch.unread) it.dataset.unread = ch.unread > 99 ? '99+' : ch.unread;   // в компактном списке — кружок на аватарке
    it.title = root.classList.contains('rail') ? chatTitle(ch.id) : '';
    box.append(it);
  });
  addHits();
}
const readBy = (c, ts) => Object.entries(S.chats[c]?.seen || {}).some(([u, t]) => u !== myId && t >= ts);
function presence(u) { renderList(); if (open && members(open).includes(u)) renderHead(); }

// ---------- открытый чат ----------
let open = null, shown = [], urls = new Map(), downCount = 0, enterChat = false;
function blobUrl(id) { return urls.get(id); }
async function mediaUrl(m) { if (urls.has(m.id)) return urls.get(m.id); const b = await blobGet(m.id); if (!b) return ''; const u = URL.createObjectURL(b); urls.set(m.id, u); return u; }
function freeUrls() { stopVoice(); for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); }
function showEmpty() {
  closePanel(true); filesOpen = false; musicApi?.hide();
  const main = $('#mxMain'); main.textContent = ''; root.classList.remove('chat-open');
  const e = el('div', 'mx-empty');
  e.innerHTML = IC.logo;
  e.querySelector('svg').style.width = '220px';
  e.append(el('h2', '', 'Кинозал'), el('p', '', 'Переписка, голосовые и кружочки, видеозвонки — и кино вместе, секунда в секунду. Всё напрямую между вами, без серверов.'));
  e.append(idCard());
  const b = el('button', 'btn pri', 'Добавить собеседника'); b.onclick = () => addContactDlg(); e.append(b);
  main.append(e);
}
function idCard() {
  const c = el('div', 'idcard'), t = el('div');
  t.append(el('span', 'lab', 'Твой ID — отправь его тем, с кем хочешь общаться'), el('code', '', fmtId(myId)));
  const b = el('button', 'btn', 'Скопировать'); b.onclick = e => { e.stopPropagation(); copyInvite(); };
  const q = el('button', 'btn', 'QR'); q.title = 'QR-код и ссылка-приглашение'; q.onclick = e => { e.stopPropagation(); qrDlg(); };
  c.append(t, b, q); return c;
}
async function copyInvite() {
  const text = 'Пиши мне в Кинозале! Открой ссылку — на телефоне или компьютере, ставить ничего не нужно:\n' + inviteLink() + '\nМой ID: ' + fmtId(myId) + '\nПриложение для Android: ' + APK + '\nПрограмма для Windows: ' + DOWNLOAD;
  try { await navigator.clipboard.writeText(text); toast('Приглашение скопировано'); } catch (e) { toast('Твой ID: ' + fmtId(myId)); }
}
async function openChat(c) {
  if (!S.chats[c] && !isDm(c) && !S.groups[c]) return;
  filesOpen = false; musicApi?.hide();
  ensureChat(c);
  if (open !== c) { freeUrls(); open = c; enterChat = true; }
  root.classList.add('chat-open');
  renderList(); await renderChat();
  markRead(c);
  if (isDm(c)) dial(dmPeer(c)); else for (const u of members(c)) if (u !== myId) dial(u);
  if (!TOUCH) setTimeout(() => $('.mx-input textarea')?.focus(), 30);
}
function closeChat() { freeUrls(); open = null; find = null; renderList(); showEmpty(); }
async function renderChat() {
  const c = open; if (!c) return showEmpty();
  const main = $('#mxMain'); main.textContent = '';
  const sec = el('section', 'mx-chat'); sec.innerHTML = `
    <header class="mx-chead"><button class="ib back" title="К чатам">${IC.back}</button><div class="avwrap"></div><div class="who"><b></b><span></span></div>
      <div class="callzone"><button class="cz call" title="Видеозвонок">${IC.phone}<span>Позвонить</span></button><button class="cz cine" title="Кинозал — смотреть вместе">${IC.film}<span>Кинозал</span></button><button class="cz live" hidden title="Вернуться к звонку"><i class="pulse"></i><span>Идёт звонок</span><b class="tm"></b><span>· Вернуться</span></button></div>
      <div class="act"><button class="ib find" title="Поиск в чате (Ctrl+F)">${IC.search}</button><button class="ib more" title="Ещё">${IC.dots}</button></div></header>
    <div class="mx-banner" hidden></div>
    <div class="mx-msgs" tabindex="-1"></div>
    <div class="mx-input"><div class="field"><button class="ib clip" title="Фото или файл">${IC.clip}</button><textarea rows="1" placeholder="Сообщение" maxlength="4000"></textarea></div>
      <button class="rec-btn" title=""></button><div class="rec-hint"></div><input type="file" multiple hidden></div>
    <button class="mx-down" hidden title="Вниз">${IC.down}<b hidden></b></button>`;
  main.append(sec);
  if (enterChat) { enterChat = false; sec.classList.add('enter'); }   // только что открыт — шапка, переписка и поле въезжают
  $('.back', sec).onclick = closeChat;
  $('.who', sec).onclick = () => infoDlg(c);
  $('.mx-chead .avwrap', sec).onclick = () => infoDlg(c);
  $('.call', sec).onclick = () => startCall(c, 'call');
  $('.cine', sec).onclick = () => startCall(c, 'cinema');
  $('.more', sec).onclick = e => { e.stopPropagation(); chatMenu(c, e.currentTarget); };
  $('.find', sec).onclick = () => openFind();
  $('.cz.live', sec).onclick = () => window.kzRoom?.show();
  setupInput(sec, c); paintPre();
  if (rec?.c === c && rec.kind === 'voice') showRecBar();   // чат перерисовался посреди записи — панель записи на место
  const box = $('.mx-msgs', sec);
  box.addEventListener('scroll', () => {
    if (nearBottom(box)) { downCount = 0; updDown(); } else $('.mx-down', sec).hidden = false;
    if (box.scrollTop < 400 && !shownAll && Date.now() - jumpAt > 900) showMore(200);   // долистали до верха — дорисуем старые
  });
  $('.mx-down', sec).onclick = () => { box.scrollTop = box.scrollHeight; downCount = 0; updDown(); };
  if (find && find.chat !== c) find = null;
  if (find) findBar(sec);   // поиск переживает перерисовку чата
  renderHead(); updCallUi();
  box.classList.add('loading');   // силуэты сообщений, если чтение затянется
  const list = await chatMsgs(c, 400);
  box.classList.remove('loading');
  if (open !== c) return;
  shown = list; shownAll = list.length < 400;
  box.textContent = '';
  shown.forEach((m, i) => box.append(...mEls(m, shown[i - 1], shown[i + 1])));
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}
const nearBottom = b => b.scrollHeight - b.scrollTop - b.clientHeight < 140;
// старые сообщения: дорисовываем сверху ещё n штук, не сдвигая то, что сейчас на экране
let shownAll = false, moreBusy = null, jumpAt = 0;
function showMore(n) { return moreBusy ||= showMore1(n).finally(() => { moreBusy = null; }); }
async function showMore1(n) {
  const c = open, box = $('.mx-msgs'); if (!c || !box || shownAll) return;
  const want = shown.length + n, list = await chatMsgs(c, want);
  if (open !== c || box !== $('.mx-msgs')) return;
  shownAll = list.length < want;
  const k = list.length - shown.length;
  if (k <= 0) return;
  const fromBottom = box.scrollHeight - box.scrollTop;
  if (!shown.length || list[k]?.id !== shown[0].id) {   // пока читали, переписка поменялась — проще нарисовать заново
    shown = list; box.textContent = ''; shown.forEach((m, i) => box.append(...mEls(m, shown[i - 1], shown[i + 1])));
  } else {
    const older = list.slice(0, k), first = shown[0], frag = document.createDocumentFragment();
    older.forEach((m, i) => frag.append(...mEls(m, older[i - 1], older[i + 1] || first)));
    // бывшее первое сообщение теперь не первое: его плашка дня, имя автора и отступ зависят от соседа сверху
    if (box.firstElementChild?.classList.contains('day')) box.firstElementChild.remove();
    box.firstElementChild?.replaceWith(...mEls(first, older[k - 1], shown[1]));
    box.prepend(frag);
    shown = list;
  }
  box.scrollTop = box.scrollHeight - fromBottom;
}
function updDown() { const d = $('.mx-down'); if (!d) return; const b = d.querySelector('b'); b.hidden = !downCount; b.textContent = downCount; if (!downCount && nearBottom($('.mx-msgs'))) d.hidden = true; }
function renderHead() {
  const c = open, h = $('.mx-chead'); if (!c || !h) return;
  const w = $('.avwrap', h); w.textContent = ''; w.append(avEl(c, 42), el('i', 'dot'));
  $('.who b', h).textContent = chatTitle(c);
  const st = $('.who span', h); st.className = '';
  const ty = typingIn(c);
  if (isDm(c)) {
    const u = dmPeer(c), on = isOn(u); w.classList.toggle('on', on);
    if (ty) { st.textContent = 'печатает'; st.className = 'live typing'; }
    else if (on && actOf(u)) { const a = actOf(u); st.textContent = actIcon(a) + ' ' + actText(a); st.className = 'live act'; }
    else if (on) { st.textContent = 'в сети'; st.className = 'live'; }
    else st.textContent = S.contacts[u]?.state === 'pending' && !S.contacts[u]?.name ? 'пока не в сети' : seenText(S.contacts[u]?.seen);
  } else {
    const g = S.groups[c], mem = g?.members || [], on = mem.filter(u => u !== myId && isOn(u)).length;
    if (ty) { st.textContent = nameOf(ty) + ' печатает'; st.className = 'live typing'; }
    else st.textContent = g?.gone ? 'тебя нет в этой группе' : mem.length + ' ' + plural(mem.length, 'участник', 'участника', 'участников') + (on ? ', ' + on + ' в сети' : '');
  }
  // плашка над перепиской
  const bn = $('.mx-banner'); bn.textContent = ''; bn.hidden = true;
  const btn = (t, f, pri) => { const b = el('button', 'btn' + (pri ? ' pri' : ''), t); b.onclick = f; return b; };
  if (isDm(c) && actJoinable(actOf(dmPeer(c)))) { const a = actOf(dmPeer(c)); bn.hidden = false; bn.append(el('span', '', actIcon(a) + ' ' + actText(a)), btn('Присоединиться', () => actJoin(dmPeer(c), a), true)); }
  if (isDm(c)) {
    const u = dmPeer(c), ct = S.contacts[u];
    if (ct?.state === 'req' || ct?.state === 'member') { bn.hidden = false; bn.append(el('span', '', ct.state === 'req' ? 'Этого человека нет в твоих контактах.' : 'Вы вместе в группе, но не в контактах.'), btn('Добавить в контакты', () => { ct.state = 'ok'; ctChanged(ct); renderHead(); }, 1)); if (ct.state === 'req') bn.append(btn('Заблокировать', () => block(u))); }
    else if (ct?.state === 'blocked') { bn.hidden = false; bn.append(el('span', '', 'Ты заблокировал(а) этот контакт — сообщения от него не приходят.'), btn('Разблокировать', () => unblock(u), 1)); }
    else if (ct?.state === 'pending' && !isOn(u)) { bn.hidden = false; bn.append(el('span', '', 'Собеседник ещё не в сети. Напиши — сообщения уйдут, как только вы оба будете онлайн.')); }
    else if (!isOn(u) && S.chats[c]?.last?.from === myId && !S.chats[c]?.last?.ack) { /* без плашки: галочки и так покажут */ }
  } else if (S.groups[c]?.gone) { bn.hidden = false; bn.append(el('span', '', 'Тебя больше нет в этой группе.'), btn('Удалить чат', () => deleteChat(c))); }
  const dis = (isDm(c) && S.contacts[dmPeer(c)]?.state === 'blocked') || S.groups[c]?.gone;
  $('.mx-input').hidden = !!dis; $('.call').disabled = $('.cine').disabled = !!dis;
}
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

// ---------- пузыри сообщений ----------
function tickOf(m) { if (readBy(m.chat, m.ts)) return ['✓✓', 'read', 'Прочитано']; if (m.ack) return ['✓✓', '', 'Доставлено']; return ['✓', '', 'Ждёт, когда собеседник будет в сети']; }
function metaEl(m) {
  const s = el('span', 'meta'); s.append(document.createTextNode(hm(m.ts)));
  if (m.from === myId) { const [t, c, ti] = tickOf(m); const k = el('span', 'tk ' + c, t); k.title = ti; s.append(k); }
  return s;
}
function tick(m) { const e = document.querySelector(`.m[data-id="${CSS.escape(m.id)}"] .tk`); if (e) { const [t, c, ti] = tickOf(m); e.textContent = t; e.className = 'tk ' + c; e.title = ti; } const i = shown.findIndex(x => x.id === m.id); if (i >= 0) shown[i] = m; renderList(); }
function ticksAll(c) { if (open !== c) return; for (const m of shown) if (m.from === myId) tick(m); }
const sameRun = (a, b) => a && b && a.from === b.from && a.kind !== 'sys' && b.kind !== 'sys' && Math.abs(b.ts - a.ts) < 5 * 6e4 && dayKey(a.ts) === dayKey(b.ts);
function mEls(m, prev, next) {
  const out = [];
  if (!prev || dayKey(prev.ts) !== dayKey(m.ts)) out.push(el('div', 'day', dayLabel(m.ts)));
  if (m.kind === 'sys') { out.push(el('div', 'sysm', m.text || '')); return out; }
  const mine = m.from === myId, grp = !isDm(m.chat);
  const row = el('div', 'm' + (mine ? ' mine' : '') + (sameRun(m, next) ? '' : ' tail') + (sameRun(prev, m) ? '' : ' gap') + (m.kind === 'circle' && !(m.open > Date.now() && !mine) ? ' circ' : ''));
  const locked = m.open > Date.now() && !mine;
  row.dataset.id = m.id; row.dataset.from = m.from;
  if (grp && !mine) { if (sameRun(m, next)) row.append(el('div', 'ghost')); else row.append(avEl(m.from, 34)); }
  const b = el('div', 'b' + (m.kind === 'img' ? ' media' : ''));
  if (grp && !mine && !sameRun(prev, m)) { const f = el('span', 'from', nameOf(m.from)); f.style.setProperty('--h', hash(m.from) % 360); b.append(f); }
  if (m.re && !locked) { const q = el('div', 'quote'); q.append(el('b', '', nameOf(m.re.from)), el('span', '', m.re.text || 'Сообщение')); q.onclick = () => jumpTo(m.re.id); b.append(q); }
  if (locked) { b.classList.remove('media'); b.append(capsuleEl(m), metaEl(m)); }
  else if (m.kind === 'text') { b.append(textEl(m.text || '')); b.append(metaEl(m)); }
  else if (m.kind === 'img') { const i = el('img'); i.alt = 'Фото'; if (m.w && m.h) { i.width = m.w; i.height = m.h; i.style.aspectRatio = m.w + '/' + m.h; i.style.width = Math.min(360, m.w) + 'px'; i.style.height = 'auto'; } mediaUrl(m).then(u => { i.src = u; }); i.onclick = () => photo(m); dragify(i, () => dragPathOfMsg(m)); b.append(i, metaEl(m)); }
  else if (m.kind === 'voice') { b.append(voiceEl(m), metaEl(m)); }
  else if (m.kind === 'circle') { b.append(circleEl(m)); row.append(b); const mt = metaEl(m); b.append(mt); }
  else if (m.kind === 'call') { b.append(callEl(m), metaEl(m)); }
  else if (m.kind === 'file') { b.append(dragify(fileEl(m), () => dragPathOfMsg(m)), metaEl(m)); }   // файл из чата можно утащить в другой чат, на стол, в проводник
  else if (m.kind === 'plan') { b.append(planEl(m), metaEl(m)); }
  if (m.open && !locked) b.append(el('div', 'capnote', m.open > Date.now() ? '⏳ откроется ' + whenText(m.open) : '⏳ из капсулы времени'));
  if (hasRx(m)) b.append(rxEl(m));
  if (m.kind !== 'circle' || locked) row.append(b);
  row.addEventListener('contextmenu', e => { e.preventDefault(); msgMenu(m, e); });
  row.addEventListener('dblclick', e => { if (!locked && !e.target.closest('button,a,img,video,input,.voice,.callcard,.plancard,.filecard')) { getSelection()?.removeAllRanges(); setReact(m, '❤️'); } });
  touchRow(row, m);
  out.push(row); return out;
}
function textEl(t) {
  const s = el('span', 'txt');
  for (const part of t.split(/(https?:\/\/[^\s<>"]+)/g)) {
    if (/^https?:\/\//.test(part)) { const a = el('a', '', part); a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer'; s.append(a); }
    else if (part) s.append(document.createTextNode(part));
  }
  hilite(s, findQ());   // открыт поиск — найденное подсвечено и в новых пузырях
  return s;
}
async function appendMsg(m) {
  const box = $('.mx-msgs'); if (!box || open !== m.chat) return;
  if (shown.some(x => x.id === m.id)) return;
  const last = shown[shown.length - 1];
  if (last && m.ts < last.ts) { await renderChat(); return; }  // старое сообщение досинхронизировалось — перерисуем
  const stick = nearBottom(box) || m.from === myId;
  if (sameRun(last, m)) {  // предыдущий пузырь больше не последний в серии
    const pe = box.querySelector(`.m[data-id="${CSS.escape(last.id)}"]`);
    if (pe) { pe.classList.remove('tail'); const a = pe.querySelector(':scope > .av'); if (a) a.replaceWith(el('div', 'ghost')); }
  }
  shown.push(m);
  const els = mEls(m, last, null); for (const e of els) if (e.classList?.contains('m')) e.classList.add('pop');   // новое — влетает
  box.append(...els);
  if (stick) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  else { downCount++; $('.mx-down').hidden = false; updDown(); }
}
function msgMenu(m, e) {
  closeMenus();
  menuAt = Date.now();
  const locked = m.open > Date.now() && m.from !== myId;
  const mn = el('div', 'menu fabmenu mx-pop'); mn.style.position = 'fixed'; mn.style.left = Math.max(8, Math.min(e.clientX, innerWidth - 250)) + 'px'; mn.style.top = Math.max(8, Math.min(e.clientY - 30, innerHeight - 330)) + 'px'; mn.style.bottom = 'auto'; mn.style.zIndex = 50;
  if (!locked) { const rr = el('div', 'rxrow'); for (const q of QUICK) { const b = el('button', m.rx?.[myId]?.[0] === q ? 'on' : '', q); b.onclick = () => { closeMenus(); setReact(m, q); }; rr.append(b); } mn.append(rr); }
  const add = (ic, t, f, cls) => { const b = el('button', cls || ''); b.append(el('i', '', ic), document.createTextNode(t)); b.onclick = () => { closeMenus(); f(); }; mn.append(b); };
  if (!locked) add('↩', 'Ответить', () => setReply(m));
  if (m.text && m.kind === 'text' && !locked) add('📋', 'Копировать текст', () => navigator.clipboard.writeText(m.text).then(() => toast('Скопировано')).catch(() => {}));
  if (m.kind === 'img' && !locked) add('🖼', 'Открыть фото', () => photo(m));
  add('🗑', 'Удалить у себя', () => dropMsg(m), 'danger');
  if (m.from === myId) add('🧨', 'Удалить у всех', () => dropForAll(m), 'danger');
  document.body.append(mn); mn.addEventListener('click', ev => ev.stopPropagation());
}
// фото из чата — в то же окно просмотра, с приближением и перемещением
async function photo(m) { const u = await mediaUrl(m); if (!u) return; const b = await blobGet(m.id); viewer({ src: u, photo: true, m: { ...m, name: fileNameOf(m), size: b?.size || 0 } }); }

// голосовые: одна общая «вертушка» на все сообщения
const player = { a: new Audio(), id: null, speed: +store.get('mxSpeed', 1) || 1 };
function voiceEl(m) {
  const v = el('div', 'voice'); v.dataset.vid = m.id;
  const pl = el('button', 'pl'); pl.innerHTML = IC.play; pl.title = 'Слушать';
  const wv = el('div', 'wv'); const wave = m.wave?.length ? m.wave : Array.from({ length: 40 }, (_, i) => 30 + (hash(m.id + i) % 50));
  for (const x of wave) { const i = el('i'); i.style.height = Math.max(12, x) + '%'; wv.append(i); }
  const vd = el('div', 'vd'), sp = el('button', 'sp', player.speed + '×'); sp.title = 'Скорость';
  vd.append(el('span', 'tt', fmtDur(m.dur))); vd.append(sp);
  v.append(pl, wv, vd);
  pl.onclick = () => playVoice(m);
  wv.onclick = e => { const r = wv.getBoundingClientRect(); playVoice(m, (e.clientX - r.left) / r.width); };
  sp.onclick = () => { player.speed = player.speed === 1 ? 1.5 : player.speed === 1.5 ? 2 : 1; store.set('mxSpeed', player.speed); document.querySelectorAll('.voice .sp').forEach(b => b.textContent = player.speed + '×'); player.a.playbackRate = player.speed; };
  return v;
}
async function playVoice(m, at) {
  const a = player.a;
  if (player.id === m.id && at == null) { if (a.paused) a.play().catch(() => {}); else a.pause(); return; }
  if (player.id !== m.id) { stopVoice(); player.id = m.id; a.src = await mediaUrl(m); }
  a.playbackRate = player.speed;
  if (at != null) { const d = isFinite(a.duration) ? a.duration : m.dur || 0; try { a.currentTime = Math.max(0, Math.min(d - .05, d * at)); } catch (e) {} }
  a.play().catch(() => {});
}
function stopVoice() { const a = player.a; a.pause(); if (player.id) paintVoice(player.id, 0, false); player.id = null; }
function paintVoice(id, frac, playing) {
  const v = document.querySelector(`.voice[data-vid="${CSS.escape(id)}"]`); if (!v) return;
  v.querySelector('.pl').innerHTML = playing ? IC.pause : IC.play;
  const bars = v.querySelectorAll('.wv i'), n = Math.round(frac * bars.length); bars.forEach((b, i) => b.classList.toggle('p', i < n));
  const m = shown.find(x => x.id === id); const t = v.querySelector('.tt');
  if (t) t.textContent = playing || frac > 0 ? fmtDur(player.a.currentTime) : fmtDur(m?.dur);
}
player.a.addEventListener('timeupdate', () => { if (!player.id) return; const m = shown.find(x => x.id === player.id); const d = isFinite(player.a.duration) ? player.a.duration : m?.dur || 1; paintVoice(player.id, player.a.currentTime / d, !player.a.paused); });
player.a.addEventListener('play', () => player.id && paintVoice(player.id, 0.001, true));
player.a.addEventListener('pause', () => player.id && paintVoice(player.id, player.a.currentTime / (player.a.duration || 1), false));
player.a.addEventListener('ended', async () => {
  const id = player.id; paintVoice(id, 0, false); player.id = null;
  // как в Телеграме: следующее голосовое в этом чате играет само
  const i = shown.findIndex(x => x.id === id), nx = shown.slice(i + 1).find(x => x.kind === 'voice');
  if (nx && nx.from === shown[i]?.from) playVoice(nx);
});

// кружочки: в ленте крутятся без звука, по клику — со звуком и кольцом прогресса
function circleEl(m) {
  const w = el('div', 'circle'); w.dataset.cid = m.id;
  const v = el('video'); v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto';
  mediaUrl(m).then(u => { v.src = u; v.play().catch(() => {}); });
  w.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>';
  const cm = el('span', 'cm', fmtDur(m.dur)), snd = el('span', 'snd', '🔈');
  w.prepend(v); w.append(cm, snd);
  const ring = w.querySelector('svg circle');
  v.addEventListener('timeupdate', () => {
    if (!w.classList.contains('playing')) return;
    const d = m.dur || (isFinite(v.duration) ? v.duration : 1); ring.style.strokeDashoffset = 100 - Math.min(100, v.currentTime / d * 100);
    cm.textContent = fmtDur(d - v.currentTime);
  });
  const reset = () => { w.classList.remove('playing'); v.muted = true; v.loop = true; ring.style.strokeDashoffset = 100; cm.textContent = fmtDur(m.dur); v.play().catch(() => {}); };
  v.addEventListener('ended', reset);
  w.onclick = () => {
    if (!w.classList.contains('playing')) {
      document.querySelectorAll('.circle.playing').forEach(o => o !== w && o.click());
      stopVoice(); w.classList.add('playing'); v.loop = false; v.muted = false; v.currentTime = 0; v.play().catch(() => {});
    } else if (v.paused) v.play().catch(() => {}); else { v.pause(); reset(); }
  };
  return w;
}
// документ: имя, размер, по клику — сохранить
const fmtSize = n => n < 1024 ? n + ' Б' : n < 1048576 ? Math.round(n / 1024) + ' КБ' : n < 1073741824 ? (n / 1048576).toFixed(1).replace('.', ',') + ' МБ' : (n / 1073741824).toFixed(2).replace('.', ',') + ' ГБ';
const RISKY = /\.(exe|msi|bat|cmd|com|scr|pif|ps1|vbs|vbe|js|jse|wsf|hta|jar|lnk|reg|cpl)$/i;
const riskOk = m => !RISKY.test(m.name || '') || confirm('«' + m.name + '» — это программа или скрипт. Запускай её, только если доверяешь ' + (m.from === myId ? 'источнику' : nameOf(m.from)) + '. Скачать?');
// файл с картинкой: превью (или сам оригинал, если он в переписке) над карточкой, по клику — просмотр в полный размер
function fileEl(m) {
  const card = fileCard(m);
  if (m.th && /\.pdf$/i.test(m.name || '')) {   // PDF: большая картинка титульного листа не нужна — маленькая вместо значка
    const ic = $('.ic', card); ic.textContent = ''; ic.classList.add('thumb'); const i = el('img'); i.src = m.th; i.alt = ''; ic.append(i);
    if (m.ex) $('.t span', card).after(el('span', 'pages', m.ex));
    return card;
  }
  if (!m.th && !(m.blob && viewable(m))) return card;
  const box = el('div', 'fwrap'), md = el('div', 'fmedia'), img = el('img');
  img.alt = m.name; img.decoding = 'async';
  if (m.w && m.h) { md.style.aspectRatio = m.w + '/' + m.h; md.style.width = Math.min(360, Math.round(360 * Math.min(1.6, m.w / m.h))) + 'px'; }
  if (m.th) img.src = m.th;
  if (m.blob && viewable(m)) mediaUrl(m).then(u => { if (u) img.src = u; });   // оригинал из переписки — во всей красе
  else if (DESK && viewable(m)) { const p = isMineSrc(m) ? S.src[m.id] : S.dl[m.id]?.st === 'done' ? S.dl[m.id].path : ''; if (p) { const full = new Image(); full.onload = () => { img.src = full.src; }; full.src = fileUrl(p); } }
  const raw = isRawName(m.name), vid = isVideoName(m.name) || /^video\//.test(m.mime || '');
  const ext = (m.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toUpperCase();
  md.append(img, el('span', 'fbadge', raw ? (/^TIFF?$/.test(ext) ? ext + ' · миниатюра' : 'RAW · ' + ext) : vid ? '▶ ' + (m.dur ? fmtDur(m.dur) : ext) : typeOfName(m.name) === 'audio' ? '♪ ' + ext : /^PDF$/.test(ext) ? 'PDF' : ext + ' · оригинал'));
  if (m.ex) md.append(el('span', 'fex', m.ex));
  md.title = 'Посмотреть в полный размер'; md.onclick = e => { e.preventDefault(); e.stopPropagation(); openOriginal(m); };
  box.append(md, card); return box;
}
function fileCard(m) {
  const w = el('a', 'filecard'); w.href = '#';
  const ext = (m.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toUpperCase();
  const ic = el('span', 'ic' + (m.dir ? ' dir' : ''), m.dir ? '📁' : ext || '📄'), t = el('div', 't');
  t.append(el('b', '', m.name), el('span', '', fmtSize(m.size || 0) + (!m.big && canView(m) ? ' · открыть' : ' · сохранить'))); hilite(t.firstChild, findQ());
  w.append(ic, t);
  if (m.big) {
    w.dataset.x = m.id; w.classList.add('big'); const bar = el('i', 'xbar'); bar.append(el('i')); t.append(bar);
    // режим скорости — переключается прямо во время передачи
    const md = el('span', 'xmode'); md.setAttribute('role', 'button'); md.tabIndex = 0; t.append(md);
    md.onclick = e => { e.preventDefault(); e.stopPropagation(); const soft = !xSoft(); setXMode(soft ? 'soft' : 'max'); toast(soft ? '🐢 Щадящий режим: отдача до ' + fmtRate(xLim('xup')) + ', скачивание до ' + fmtRate(xLim('xdown')) + ' (настраивается в профиле)' : '⚡ Максимальная скорость'); };
    xFill(w, m); w.onclick = e => { e.preventDefault(); xClick(m); }; return w; }
  w.title = 'Сохранить';
  if (canView(m)) w.title = 'Посмотреть';
  w.onclick = e => { e.preventDefault(); canView(m) ? openAny(m) : saveSmall(m); };
  return w;
}
// небольшой файл из переписки: в программе для Windows — в «Полученные» (его видно в разделе «Файлы»), в браузере — скачать
async function saveSmall(m) {
  if (DISK) {
    const d = S.dl[m.id];
    if (d?.path && await APP.files.exists(d.path)) { APP.files.show(d.path); return; }
    if (!riskOk(m)) return;
    const b = await blobGet(m.id); if (!b) return;
    try { const p = await saveToRoute(m); if (DESK) APP.files.show(p); toast('«' + m.name + '» сохранён — ' + routeLabel(m)); }
    catch (er) { toast('Не получилось сохранить: ' + errText(er)); }
    return;
  }
  if (!riskOk(m)) return; const u = await mediaUrl(m); if (!u) return; const a = el('a'); a.href = u; a.download = m.name; document.body.append(a); a.click(); a.remove();
}

// ---------- оригиналы, RAW и превью ----------
const KR = window.kzRaw;
const VIEW = /^image\/(png|jpeg|webp|gif|avif|bmp)$/;   // такие браузер показывает сам
const viewable = m => VIEW.test(m.mime || '') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(m.name || '');
const isRawName = n => !!KR?.isRaw(n) || /\.tiff?$/i.test(n || '');   // TIFF браузер не показывает, но миниатюра внутри обычно есть
const isVideoName = n => /\.(mp4|webm|mov|m4v|mkv)$/i.test(n || '');
const toDataUrl = cv => cv.toDataURL('image/jpeg', .74);
// повернуть, как держали камеру (RAW хранит поворот отдельно от картинки); max — уменьшить до стольки пикселей
function oriented(src, orient, max) {
  const k = max ? Math.min(1, max / Math.max(src.width, src.height)) : 1, w = Math.round(src.width * k), h = Math.round(src.height * k), rot = orient === 6 || orient === 8;
  const cv = el('canvas'); cv.width = rot ? h : w; cv.height = rot ? w : h;
  const g = cv.getContext('2d');
  if (orient === 3) { g.translate(w, h); g.rotate(Math.PI); } else if (orient === 6) { g.translate(h, 0); g.rotate(Math.PI / 2); } else if (orient === 8) { g.translate(0, w); g.rotate(-Math.PI / 2); }
  g.drawImage(src, 0, 0, w, h); return cv;
}
async function bitmapOf(blob, raw) { if (raw) try { return await createImageBitmap(blob, { imageOrientation: 'none' }); } catch (e) {} return createImageBitmap(blob); }
function rawFromBytes(u8) {
  const p = KR?.preview(u8); if (!p) return null;
  const i = KR.info(u8, p.jpeg); return { blob: new Blob([p.jpeg], { type: 'image/jpeg' }), orient: i.orient || 1, ex: KR.summary(i) };
}
// превью и данные для сообщения: уменьшенная копия картинки, встроенная картинка RAW или кадр видео
async function makeThumb(f) {
  try {
    if (/\.hei[cf]$/i.test(f.name) && window.kzView && f.size <= 150e6) {
      const cv = await kzView.heic(new Uint8Array(await f.arrayBuffer()));
      return { th: toDataUrl(oriented(cv, 1, 480)), w: cv.width, h: cv.height };
    }
    if (/\.pdf$/i.test(f.name) && window.kzView && f.size <= 200e6) {
      const doc = await kzView.pdfOpen(new Uint8Array(await f.arrayBuffer())), cv = await kzView.pdfPage(doc, 1, 480), n = doc.numPages;
      doc.destroy?.(); return { th: toDataUrl(cv), w: cv.width, h: cv.height, ex: n + ' ' + plural(n, 'страница', 'страницы', 'страниц') };
    }
    if (isRawName(f.name)) {
      if (f.size > 400e6) return null;
      const u8 = new Uint8Array(await f.arrayBuffer()), r = rawFromBytes(u8);
      if (!r && /\.tiff?$/i.test(f.name) && window.kzView && f.size <= 150e6) { const cv = await kzView.tiff(u8); return { th: toDataUrl(oriented(cv, 1, 480)), w: cv.width, h: cv.height }; }
      if (!r) return null;
      const bm = await bitmapOf(r.blob, true), rot = r.orient === 6 || r.orient === 8;
      const out = { th: toDataUrl(oriented(bm, r.orient, 480)), w: rot ? bm.height : bm.width, h: rot ? bm.width : bm.height, ex: r.ex }; bm.close?.(); return out;
    }
    if (VIEW.test(f.type)) { const bm = await createImageBitmap(f); const out = { th: toDataUrl(oriented(bm, 1, 480)), w: bm.width, h: bm.height }; bm.close?.(); return out; }
    if (/^video\//.test(f.type) || isVideoName(f.name)) return await videoThumb(f);
    if (/\.(mp3|flac|m4a|aac)$/i.test(f.name) && window.kzView) {   // музыка: обложка и «исполнитель — название»
      const src = { size: f.size, read: async (o, n) => new Uint8Array(await f.slice(o, o + n).arrayBuffer()) };
      const t = await kzView.audioTags(src, f.name); if (!t) return null;
      const out = { ex: [t.artist, t.title].filter(Boolean).join(' — ') + (t.album ? ' · ' + t.album : '') + (t.year ? ' · ' + t.year : '') };
      if (t.cover) { const bm = await createImageBitmap(t.cover).catch(() => null); if (bm) { Object.assign(out, { th: toDataUrl(oriented(bm, 1, 480)), w: bm.width, h: bm.height }); bm.close?.(); } }
      return out;
    }
  } catch (e) { jlog('[файлы] превью не вышло', f.name, e?.message || e); }
  return null;
}
function videoThumb(f) {
  return new Promise(res => {
    const v = el('video'), u = URL.createObjectURL(f); let done = false;
    const fin = x => { if (done) return; done = true; URL.revokeObjectURL(u); v.removeAttribute('src'); v.load(); res(x); };
    v.muted = true; v.preload = 'metadata'; v.src = u;
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
    v.onseeked = () => {
      try { const cv = el('canvas'), k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight)); cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); fin({ th: toDataUrl(cv), w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration || 0) }); }
      catch (e) { fin(null); }
    };
    v.onerror = () => fin(null); setTimeout(() => fin(null), 6000);
  });
}
// сжать или отправить оригиналами — как в Телеграме
function askImages(c, files) {
  modal((card, close) => {
    const grid = el('div', 'imgpick'), urls = [], list = [...files];
    for (const f of list.slice(0, 12)) { const u = URL.createObjectURL(f); urls.push(u); const i = el('img'); i.src = u; i.alt = ''; grid.append(i); }
    const total = list.reduce((s, f) => s + f.size, 0), free = () => urls.forEach(u => URL.revokeObjectURL(u));
    const sw = el('label', 'switch'), cb = el('input'); cb.type = 'checkbox'; cb.checked = store.get('imgZip', '1') === '1';
    sw.append(document.createTextNode('Сжать — быстрее и меньше весит'), cb);
    const note = el('p', 'fhint');
    const paint = () => { note.textContent = cb.checked ? 'Уйдёт уменьшенная копия (до 1600 пикселей по длинной стороне).' : 'Уйдут оригиналы как есть — ' + fmtSize(total) + ', без потери качества. Посмотреть можно будет в полный размер.'; };
    cb.onchange = paint; paint();
    const go = () => { store.set('imgZip', cb.checked ? '1' : '0'); close(); free(); if (cb.checked) sendImages(c, list); else sendFiles(c, list); };
    const row = el('div', 'row'), ok = btnEl('Отправить', 'pri', go); row.append(btnEl('Отмена', '', () => { close(); free(); }), ok);
    card.append(el('h2', '', list.length > 1 ? 'Отправить ' + list.length + ' ' + plural(list.length, 'картинку', 'картинки', 'картинок') : 'Отправить картинку'), grid, sw, note, row);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); go(); } });
    setTimeout(() => ok.focus(), 40);
  });
}
// просмотр в полный размер: оригинал картинки, встроенная картинка RAW (с поворотом), видео
// ---------- просмотр документов, таблиц, архивов, музыки и шрифтов (разбор форматов — в viewers.js) ----------
const ZIPLIKE = /\.(zip|jar|mrpack|apk|epub|docx|xlsx|pptx|odt|ods)$/i;
function canViewName(n) {
  if (!window.kzView) return false;
  const t = typeOfName(n);
  return ['text', 'font', 'pdf'].includes(t) || (t === 'audio' && /\.(mp3|ogg|opus|wav|flac|m4a|aac)$/i.test(n)) || /\.(docx|xlsx|csv|tsv|zip|jar|mrpack|apk)$/i.test(n);
}
const canView = m => m.kind === 'file' && !m.dir && canViewName(m.name);
// откуда брать байты: свой отправленный файл, переписка (или собранное в браузере), диск
const diskSource = async p => {   // с диска — кусками до 32 МБ (за один раз главный процесс отдаёт не больше 64 МБ)
  const size = await APP.files.size(p); if (size < 0) return null;
  const part = async (o, n) => { const b = await APP.files.slice(p, o, n); return b instanceof Uint8Array ? b : new Uint8Array(b); };
  return { size, path: p, read: async (o, n) => {
    n = Math.max(0, Math.min(n, size - o)); if (n <= 32 << 20) return part(o, n);
    const out = new Uint8Array(n); for (let d = 0; d < n; d += 32 << 20) out.set(await part(o + d, Math.min(32 << 20, n - d)), d); return out;
  } };
};
const blobSource = b => ({ size: b.size, blob: b, read: async (o, n) => new Uint8Array(await b.slice(o, o + n).arrayBuffer()) });
async function fileSource(m) {
  const f = isMineSrc(m) ? srcMem.get(m.id) : null; if (f) return blobSource(f);
  if (m.blob || (!DISK && S.dl[m.id]?.st === 'done')) { const b = await blobGet(m.id); if (b) return blobSource(b); }
  const st = fileState(m); if (DISK && st.path) return diskSource(st.path);
  return null;
}
async function srcBlob(src, type) { return src.blob ? (type ? new Blob([src.blob], { type }) : src.blob) : new Blob([await src.read(0, src.size)], type ? { type } : {}); }
async function openDoc(m) {
  const src = await fileSource(m);
  if (!src) { if (m.big && !isMineSrc(m) && confirm('«' + m.name + '» ещё не скачан. Скачать?')) xClick(m); else if (!m.big) toast('Файла нет на этом устройстве'); return; }
  docView({ name: m.name, size: m.size || src.size, m, path: fileState(m).path, src });
}
async function openDocPath(it) { const src = await diskSource(it.path); if (src) docView({ name: it.name, size: src.size, path: it.path, src }); }
function docView(o) {
  const ov = el('div', 'kzview kzdoc'), top = el('div', 'kvtop'), body = el('div', 'kvdoc'), t = el('div', 't'), acts = el('div', 'acts'), urls = [];
  const info = el('span', '', fmtSize(o.size) + ' · ' + FT[typeOfName(o.name)].t);
  t.append(el('b', '', o.name), info);
  const offs = [], close = () => { ov.remove(); document.removeEventListener('keydown', key, true); for (const u of urls) URL.revokeObjectURL(u); for (const f of offs) try { f(); } catch (e) {} };
  const btn = (txt, f, cls) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); b.onclick = e => { e.stopPropagation(); f(); }; acts.append(b); };
  const m = o.m, st = m ? fileState(m) : null;
  if (DISK && o.path) { btn(SHOWB, () => APP.files.show(o.path)); if (DESK) btn('Открыть в программе', () => openOnDisk({ name: o.name, path: o.path })); }
  else if (m && st?.k === 'chat') btn(DISK ? 'Сохранить' : 'Скачать', async () => { if (!DISK) return saveSmall(m); try { const p = await saveToRoute(m); toast('Сохранено — ' + routeLabel(m)); if (DESK) APP.files.show(p); } catch (e) { toast('Не получилось: ' + errText(e)); } });
  btn('Закрыть', close, 'pri');
  top.append(t, acts); ov.append(top, body); document.body.append(ov);
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  const wait = el('div', 'fempty'); wait.append(el('div', 'big', '⏳'), el('b', '', 'Открываю…')); body.append(wait);
  const fail = e => { body.textContent = ''; body.append(emptyEl('🤷', 'Не получилось показать', errText(e) + (DISK && o.path ? ' — попробуй «Открыть в программе».' : ''))); };
  const n = o.name.toLowerCase(), ty = typeOfName(n);
  (async () => {
    if (/\.pdf$/.test(n)) return showPdf(o.src, body, info, offs);
    if (/\.docx$/.test(n)) return showDocx(o.src, body, urls);
    if (/\.xlsx$/.test(n)) return showXlsx(o.src, body);
    if (/\.(zip|jar|mrpack|apk)$/.test(n)) return showZip(o, body, urls, info);
    if (ty === 'audio') return showAudio(o, body, urls, info);
    if (ty === 'font') return showFont(o.src, body, o.name);
    return showText(o.src, body, n, info);
  })().then(() => wait.remove(), fail);
}
// текст, код, лог, JSON, CSV, Markdown
async function showText(src, body, n, info) {
  const LIM = 2 << 20, u = await src.read(0, Math.min(src.size, LIM));
  if (kzView.isBinary(u)) throw new Error('это не текстовый файл');
  let text = kzView.decodeText(u); const cut = src.size > LIM;
  body.textContent = '';
  if (cut) body.append(el('p', 'fhint', 'Показаны первые 2 МБ из ' + fmtSize(src.size) + '.'));
  if (/\.(csv|tsv)$/.test(n)) { const rows = kzView.csv(text); info.textContent += ' · строк: ' + rows.length + (rows.length >= 2000 ? '+' : ''); body.append(tableEl(rows, true)); return; }
  if (/\.(md|markdown)$/.test(n)) { const d = el('div', 'kmd'); d.append(kzView.markdown(text)); body.append(d); return; }
  if (/\.json$/.test(n) && !cut) try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (e) {}
  const lines = text.split('\n'), shown = lines.length > 20000 ? lines.slice(0, 20000) : lines;
  info.textContent += ' · строк: ' + lines.length;
  const wrap = el('div', 'kcode'), gut = el('pre', 'gut'), code = el('pre', 'code');
  gut.textContent = shown.map((_, i) => i + 1).join('\n');
  if (text.length <= 400e3) code.append(kzView.highlight(shown.join('\n'), n)); else code.textContent = shown.join('\n');
  wrap.append(gut, code); body.append(wrap);
}
function tableEl(rows, head) {
  const t = el('table', 'ktable');
  rows.forEach((r, i) => { const tr = t.insertRow(); if (head && i === 0) tr.className = 'h'; const w = Math.max(...rows.slice(0, 50).map(x => x?.length || 0), r?.length || 0); for (let c = 0; c < w; c++) { const td = tr.insertCell(); td.textContent = r?.[c] ?? ''; } });
  return t;
}
// PDF: страницы рисуются, только когда до них долистали; масштаб, номер страницы
async function showPdf(src, body, info, offs) {
  if (src.size > 300e6) throw new Error('PDF слишком большой, чтобы открыть его здесь');
  const doc = await kzView.pdfOpen(await src.read(0, src.size)); offs.push(() => doc.destroy?.());
  const N = doc.numPages; info.textContent += ' · ' + N + ' ' + plural(N, 'страница', 'страницы', 'страниц');
  body.textContent = ''; body.classList.add('pdfmode');
  const bar = el('div', 'kpdfbar'), pages = el('div', 'kpdf'), cnt = el('span', 'cnt', '1 / ' + N);
  let zoom = 1, gen = 0;
  const v1 = (await doc.getPage(1)).getViewport({ scale: 1 });
  const width = () => Math.round(Math.min(body.clientWidth - 48, 1000) * zoom);
  const slots = [];
  for (let i = 1; i <= N; i++) { const s = el('div', 'kpg'); s.dataset.n = i; s.style.aspectRatio = v1.width + '/' + v1.height; s.append(el('span', 'pn', String(i))); pages.append(s); slots.push(s); }
  const render = async s => {
    const g = gen; if (s.dataset.g === String(g)) return; s.dataset.g = String(g);
    try { const cv = await kzView.pdfPage(doc, +s.dataset.n, width() * Math.min(2, devicePixelRatio || 1)); if (g !== gen) return; cv.className = 'pc'; s.querySelector('canvas')?.remove(); s.style.aspectRatio = cv.width + '/' + cv.height; s.prepend(cv); }
    catch (e) { s.dataset.g = ''; }
  };
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) render(e.target); }, { root: body, rootMargin: '800px 0px' });
  const relayout = () => { gen++; for (const s of slots) { s.style.width = width() + 'px'; io.unobserve(s); io.observe(s); } };
  offs.push(() => io.disconnect());
  body.addEventListener('scroll', () => { const mid = body.scrollTop + body.clientHeight / 3; let n = 1; for (const s of slots) { if (s.offsetTop <= mid) n = +s.dataset.n; else break; } cnt.textContent = n + ' / ' + N; });
  const zb = (t, f, title) => { const b = el('button', 'btn', t); b.title = title || ''; b.onclick = () => { f(); relayout(); }; bar.append(b); };
  zb('−', () => { zoom = Math.max(.4, zoom - .2); }, 'Мельче'); zb('+', () => { zoom = Math.min(3, zoom + .2); }, 'Крупнее'); zb('По ширине', () => { zoom = 1; });
  bar.append(cnt); body.append(bar, pages); relayout();
}
async function showDocx(src, body, urls) {
  const r = await kzView.docx(src); urls.push(...r.urls);
  body.textContent = ''; const page = el('div', 'kpage'); page.append(r.el); body.append(page);
  if (!r.el.textContent.trim() && !r.el.querySelector('img')) body.append(emptyEl('📄', 'Документ пустой', ''));
}
async function showXlsx(src, body) {
  const sheets = await kzView.xlsx(src); body.textContent = '';
  if (!sheets.length) throw new Error('в книге нет листов');
  const tabs = el('div', 'fchips'), box = el('div', 'kxl');
  const show = i => { box.textContent = ''; const s = sheets[i]; box.append(tableEl(s.rows.map(r => r || []), false)); if (s.cut) box.append(el('p', 'fhint', 'Показаны первые 1000 строк и 60 столбцов.')); [...tabs.children].forEach((b, j) => b.classList.toggle('on', i === j)); };
  sheets.forEach((s, i) => { const b = el('button', 'fchip', s.name); b.onclick = () => show(i); tabs.append(b); });
  if (sheets.length > 1) body.append(tabs);
  body.append(box); show(0);
}
// архив: что внутри; у сборок Modrinth (.mrpack) и модов (.jar) — ещё и что это за сборка/мод
async function showZip(o, body, urls, info) {
  const list = await kzView.zipList(o.src), files = list.filter(e => !e.dir);
  info.textContent += ' · ' + nFiles(files.length) + ' · распаковано ' + fmtSize(files.reduce((s, e) => s + e.size, 0));
  body.textContent = '';
  const about = async (name, f) => { const e = list.find(x => x.name === name); if (!e) return null; try { return f(JSON.parse(kzView.decodeText(await kzView.zipGet(o.src, e)))); } catch (er) { return null; } };
  const card = await about('modrinth.index.json', j => [j.name + (j.versionId ? ' ' + j.versionId : ''), 'Minecraft ' + (j.dependencies?.minecraft || '?') + (j.dependencies ? ' · ' + Object.keys(j.dependencies).filter(k => k !== 'minecraft').join(', ') : ''), (j.files?.length || 0) + ' модов и файлов скачается при установке'])
    || await about('fabric.mod.json', j => [(j.name || j.id) + ' ' + (j.version || ''), 'мод для Fabric' + (j.depends?.minecraft ? ' · Minecraft ' + j.depends.minecraft : ''), j.description || '']);
  if (card) { const c = el('div', 'kabout'); c.append(el('b', '', card[0]), ...card.slice(1).filter(Boolean).map(x => el('span', '', x))); body.append(c); }
  const q = el('input', 'fq'); q.type = 'search'; q.placeholder = 'Найти в архиве'; const tbl = el('div', 'kzip');
  const paint = () => {
    tbl.textContent = ''; const Q = q.value.trim().toLowerCase(), shown = files.filter(e => !Q || e.name.toLowerCase().includes(Q)).slice(0, 3000);
    for (const e of shown) {
      const r = el('div', 'kzr'), i = e.name.lastIndexOf('/');
      r.append(el('span', 'ico', FT[typeOfName(e.name)].i), el('span', 'nm', ''), el('span', 'sz', fmtSize(e.size)));
      r.children[1].append(el('small', '', i >= 0 ? e.name.slice(0, i + 1) : ''), e.name.slice(i + 1));
      r.title = 'Нажми — посмотреть или достать'; r.onclick = () => zipEntry(o, e, urls); tbl.append(r);
    }
    if (files.length > shown.length && !Q) tbl.append(el('p', 'fhint', 'Показаны первые 3000 — найди нужное поиском.'));
  };
  q.oninput = paint; paint(); body.append(q, tbl);
}
async function zipEntry(o, e, urls) {
  try {
    const data = await kzView.zipGet(o.src, e), nm = e.name.split('/').pop(), src = kzView.memSrc(data);
    if (/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(nm)) { const u = URL.createObjectURL(new Blob([data])); urls.push(u); return viewer({ src: u, m: { id: '', name: nm, size: data.length } }); }
    if (canViewName(nm)) return docView({ name: nm, size: data.length, src });
    // остальное — достать наружу
    if (DISK) { const p = await APP.files.save(nm, data, o.m ? routeTarget(o.m) : null); toast('«' + nm + '» достан из архива'); if (DESK) APP.files.show(p); }
    else { const u = URL.createObjectURL(new Blob([data])), a = el('a'); a.href = u; a.download = nm; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
  } catch (er) { toast('Не получилось: ' + errText(er)); }
}
async function showAudio(o, body, urls, info) {
  const tags = await kzView.audioTags(o.src, o.name).catch(() => null) || {};
  body.textContent = ''; const box = el('div', 'kaudio'), cov = el('div', 'cov');
  if (tags.cover) { const u = URL.createObjectURL(tags.cover); urls.push(u); const i = el('img'); i.src = u; i.alt = ''; cov.append(i); } else cov.textContent = '🎵';
  const a = el('audio'); a.controls = true; a.autoplay = true;
  if (o.path) a.src = await pathUrl(o.path, urls); else { const u = URL.createObjectURL(await srcBlob(o.src)); urls.push(u); a.src = u; }
  a.onerror = () => a.replaceWith(el('p', 'fhint', 'Такой звук Кинозал не играет — открой в программе.'));
  const t = el('div', 't'); t.append(el('b', '', tags.title || o.name.replace(/\.[^.]+$/, '')), el('span', '', [tags.artist, tags.album, tags.year].filter(Boolean).join(' · ')));
  box.append(cov, t, a); body.append(box);
  if (tags.artist || tags.title) info.textContent += ' · ' + [tags.artist, tags.title].filter(Boolean).join(' — ');
}
let fontN = 0;
async function showFont(src, body, name) {
  const fam = 'kzfont' + (++fontN), ff = new FontFace(fam, await src.read(0, src.size));
  await ff.load(); document.fonts.add(ff);
  body.textContent = ''; const box = el('div', 'kfont'); box.style.fontFamily = fam;
  box.append(el('div', 'big', 'Съешь же ещё этих мягких французских булок, да выпей чаю'), el('div', 'mid', 'The quick brown fox jumps over the lazy dog'), el('div', 'abc', 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ абвгдеёжзийклмнопрстуфхцчшщъыьэюя ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 !?.,:;«»()—'));
  for (const px of [12, 16, 24, 36]) { const r = el('div', 'sz'); r.style.fontSize = px + 'px'; r.append(el('small', '', px + ' px'), document.createTextNode(' Кинозал — смотреть вместе')); box.append(r); }
  body.append(box);
}

const HEAVY = /\.(heic|heif|tiff?)$/i;   // браузер их не показывает — раскодируем библиотеками (libheif, UTIF)
async function heavyCanvas(name, src) {
  if (src.size > 400e6) throw new Error('файл слишком большой, чтобы показать его здесь');
  const u8 = await src.read(0, src.size);
  return /\.hei[cf]$/i.test(name) ? kzView.heic(u8) : kzView.tiff(u8);
}
async function viewHeavy(name, size, src, m, path) {
  const hint = toast2('Раскодирую «' + name + '»…');
  try {
    const cv = await heavyCanvas(name, src), b = await new Promise(r => cv.toBlob(r, 'image/jpeg', .95));
    hint();
    viewer({ src: URL.createObjectURL(b), own: true, full: true, m: { ...(m || { id: '' }), name, size, w: cv.width, h: cv.height }, path, ex: m?.ex });
    return true;
  } catch (e) { hint(); toast('Не получилось показать «' + name + '»: ' + errText(e)); return false; }
}
const toast2 = t => { toast(t); return () => { const e = $('#toast'); if (e?.textContent === t) e.classList.remove('on'); }; };
async function openOriginal(m) {
  if (HEAVY.test(m.name || '') && window.kzView) { const src = await fileSource(m); if (src && await viewHeavy(m.name, m.size || src.size, src, m, fileState(m).path)) return; }
  const raw = isRawName(m.name), vid = isVideoName(m.name) || /^video\//.test(m.mime || ''), d = S.dl[m.id], mine = isMineSrc(m);
  const path = mine ? S.src[m.id] || '' : d?.st === 'done' ? d.path || '' : '', file = mine ? srcMem.get(m.id) : null;
  let src = '', orient = 1, ex = m.ex || '', own = false;
  try {
    const b = file || (m.blob || (!DISK && d?.st === 'done') ? await blobGet(m.id) : null);
    if (b) {
      if (raw) { const r = rawFromBytes(new Uint8Array(await b.arrayBuffer())); if (r) { src = URL.createObjectURL(r.blob); own = true; orient = r.orient; ex = r.ex || ex; } }
      else if (viewable(m) || vid) { src = URL.createObjectURL(b); own = true; }
    } else if (DISK && path) {
      if (raw && APP.files.rawPreview) { const r = await APP.files.rawPreview(path); if (r) { src = URL.createObjectURL(new Blob([r.jpeg], { type: 'image/jpeg' })); own = true; orient = r.orient; ex = r.ex || ex; } }
      else if (raw) { const ds = await diskSource(path), r = ds && ds.size <= 400e6 ? rawFromBytes(await ds.read(0, ds.size)) : null; if (r) { src = URL.createObjectURL(r.blob); own = true; orient = r.orient; ex = r.ex || ex; } }   // телефон: разбираем сами
      else if (viewable(m) || vid) { src = await pathUrl(path); own = ANDROID; }
    }
  } catch (e) { jlog('[файлы] просмотр', m.name, e?.message || e); }
  const preview = !src && !!m.th; if (preview) src = m.th;
  if (!src) return;
  viewer({ src, own, orient, video: vid && !preview, raw, ex, preview, m, path });
}
function viewer(o) {
  const m = o.m, ov = el('div', 'kzview'), top = el('div', 'kvtop'), stage = el('div', 'kvstage'), t = el('div', 't');
  const tif = /\.tiff?$/i.test(m.name || '') && !o.full;   // TIFF без полной расшифровки: видна только встроенная миниатюра
  t.append(el('b', '', m.name), el('span', '', [fmtSize(m.size), m.w && m.h && !tif ? m.w + '×' + m.h : '', tif ? 'TIFF — показана встроенная миниатюра, сам файл не тронут' : o.raw ? 'RAW — оригинал не тронут' : o.video ? '' : o.photo ? 'фото из чата' : o.full ? 'полный размер, раскодирован здесь' : 'оригинал'].filter(Boolean).join(' · ')));
  if (o.ex) t.append(el('span', 'ex', o.ex));
  if (o.preview) t.append(el('span', 'ex', 'Это превью — оригинал появится после скачивания'));
  const acts = el('div', 'acts'), urls = o.own ? [o.src] : [];
  const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 500); };
  const btn = (txt, f, cls) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); b.onclick = e => { e.stopPropagation(); f(); }; acts.append(b); };
  const d = S.dl[m.id];
  if (m.big && !isMineSrc(m) && d?.st !== 'done') btn(d?.st === 'go' ? 'Качается…' : 'Скачать оригинал', () => { close(); if (d?.st !== 'go') xClick(m); }, 'pri');
  else if (o.path && DISK) btn(SHOWB, () => APP.files.show(o.path));
  else if (m.blob) btn('Сохранить', () => saveSmall(m));
  btn('Закрыть', close);
  top.append(t, acts);
  let media;
  if (o.video) { media = el('video'); media.controls = true; media.autoplay = true; media.src = o.src; media.onerror = () => media.replaceWith(el('p', 'fhint', 'Такое видео Кинозал не показывает — сохрани и открой в проигрывателе.')); }
  else {
    media = el('img'); media.alt = m.name || ''; media.draggable = false;
    if (o.orient > 1 && !o.preview) {   // RAW, снятый «вертикально»: поворачиваем картинку
      dataOr(o.src).then(b => bitmapOf(b, true)).then(async bm => { const cv = oriented(bm, o.orient); bm.close?.(); const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', .95)); const u = URL.createObjectURL(b); urls.push(u); media.src = u; }).catch(() => { media.src = o.src; });
    } else media.src = o.src;
    zoomable(stage, media, top, close);
  }
  stage.append(media); ov.append(top, stage); document.body.append(ov);
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else stage.zoomKey?.(e); };
  document.addEventListener('keydown', key, true);
}
// приближение и перемещение: колесо — к точке под курсором, клик — «по окну ↔ 100%» (маленькие — ×2),
// зажатая кнопка мыши — тащить, двумя пальцами — щипок; кнопки − 100% + и клавиши + − 0
function zoomable(stage, img, top, close) {
  let fit = 1, s = 1, x = 0, y = 0, ready = false;
  const bar = el('div', 'kvzoom'), pct = el('button', 'btn', '—');
  const zb = (t, f, title) => { const b = el('button', 'btn', t); b.title = title; b.onclick = e => { e.stopPropagation(); f(); }; return b; };
  pct.title = 'По размеру окна / 100 %'; pct.onclick = e => { e.stopPropagation(); toggle(); };
  bar.append(zb('−', () => zoomAt(s / 1.4), 'Отдалить (−)'), pct, zb('+', () => zoomAt(s * 1.4), 'Приблизить (+)'));
  top.querySelector('.acts')?.before(bar);
  const W = () => stage.clientWidth, H = () => stage.clientHeight, nw = () => img.naturalWidth || 1, nh = () => img.naturalHeight || 1;
  const maxS = () => Math.max(fit * 8, 4), minS = () => Math.min(fit, 1) * .5;
  function clamp() {   // картинка не уезжает за край: меньше окна — по центру, больше — край не отходит от края окна
    const w = nw() * s, h = nh() * s;
    x = w <= W() ? (W() - w) / 2 : Math.min(0, Math.max(W() - w, x));
    y = h <= H() ? (H() - h) / 2 : Math.min(0, Math.max(H() - h, y));
  }
  function apply(anim) {
    clamp(); img.style.transition = anim ? 'transform .18s ease-out' : 'none';
    img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    pct.textContent = Math.round(s * 100) + ' %';
    stage.classList.toggle('zoomed', s > fit * 1.01); stage.classList.toggle('pannable', nw() * s > W() + 1 || nh() * s > H() + 1);
  }
  function zoomAt(ns, cx = W() / 2, cy = H() / 2, anim = true) {   // точка (cx, cy) окна остаётся на месте
    ns = Math.max(minS(), Math.min(maxS(), ns));
    x = cx - (cx - x) * ns / s; y = cy - (cy - y) * ns / s; s = ns; apply(anim);
  }
  const toggle = (cx, cy) => zoomAt(s > fit * 1.01 ? fit : Math.max(1, fit * 2), cx, cy);
  function reset() { if (!img.naturalWidth) return; fit = Math.min(1, W() / nw(), H() / nh()); s = fit; x = 0; y = 0; ready = true; apply(false); }
  img.addEventListener('load', reset); if (img.complete) reset();
  const ro = new ResizeObserver(() => { if (!ready) return; const was = s <= fit * 1.01; fit = Math.min(1, W() / nw(), H() / nh()); if (was) s = fit; apply(false); }); ro.observe(stage);
  stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(s * Math.pow(1.0018, -e.deltaY * (e.deltaMode ? 33 : 1)), e.clientX - r.left, e.clientY - r.top, false); }, { passive: false });
  // мышь и пальцы
  const pts = new Map(); let moved = 0, last = null, pinch = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button > 0) return; stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; last = { x: e.clientX, y: e.clientY };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; }
    stage.classList.add('drag');
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = stage.getBoundingClientRect();
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; zoomAt(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, false); moved = 99; return; }
    const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy);
    x += dx; y += dy; apply(false);
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) stage.classList.remove('drag'); if (pts.size === 1) last = [...pts.values()][0]; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('click', e => {
    if (moved > 5) return;   // это было перетаскивание, а не клик
    const r = img.getBoundingClientRect();
    if (s <= fit * 1.01 && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) { close(); return; }   // мимо картинки — закрыть
    const sr = stage.getBoundingClientRect(); toggle(e.clientX - sr.left, e.clientY - sr.top);
  });
  stage.zoomKey = e => { if (e.key === '+' || e.key === '=') zoomAt(s * 1.4); else if (e.key === '-' || e.key === '_') zoomAt(s / 1.4); else if (e.key === '0') zoomAt(fit); };
  stage.title = 'Колесо — приблизить к курсору · клик — 100 % / по окну · тяни — двигать';
}
const dataOr = src => fetch(src).then(r => r.blob());
async function sendFiles(c, files) {
  for (const f of [...files]) {
    if (DESK && !f.type && f.size <= 65536 && await APP.files.kind(f) === 'dir') { await sendDir(c, APP.files.pathOfAny(f)); continue; }   // перетащили папку
    if (!f.size) continue;
    const meta = await makeThumb(f) || {};   // картинка, RAW или видео — с превью, чтобы было видно, что прислали
    if (f.size <= LIMIT) { await post(c, { kind: 'file', name: fileName(f.name), size: f.size, ...meta }, f.type ? f : new Blob([f], { type: 'application/octet-stream' })); continue; }
    await sendBig(c, f, meta);
  }
}

// ---------- большие файлы: кусками напрямую с устройства отправителя, с докачкой ----------
// В сообщении только имя и размер. Получатель нажимает «Скачать» и просит файл по обычной связи (xget),
// отправитель открывает к нему отдельное соединение (своё WebRTC, чтобы не тормозить переписку) и шлёт
// куски по 4 МБ, к каждому — SHA-256. Получатель проверяет кусок, пишет на диск и подтверждает; в пути
// не больше WIN неподтверждённых кусков. После обрыва или перезапуска продолжаем с последнего целого куска.
const BLK = 4 << 20, FRAME = 64 << 10, WIN = 6;
const DISK = !!APP?.files;   // программа для Windows и приложение для Android: пишем прямо в файл; в браузере — память и IndexedDB
const DESK = DISK && !ANDROID;   // только на компьютере: папки целиком, свои папки маршрутов, «Папки», проводник
const SHOWT = ANDROID ? 'открыть' : 'показать в папке', SHOWB = ANDROID ? 'Открыть в другой программе' : 'В проводнике';
// адрес файла с диска для <img>/<audio>: на компьютере — file://, на телефоне (content://) — читаем в память
async function pathUrl(p, urls) { if (!ANDROID) return fileUrl(p); const src = await diskSource(p); if (!src) return ''; const u = URL.createObjectURL(new Blob([await src.read(0, src.size)])); urls?.push(u); return u; }
const sha = async b => b64(await crypto.subtle.digest('SHA-256', b));
const devKey = d => d || '';
const isMineSrc = m => m.from === myId && devKey(m.dev) === devKey(myDev);
const srcLink = m => { const L = links.get(m.from)?.get(devKey(m.dev)); return L?.authed && L.c.open ? L : null; };
function xGone(id) {   // сообщение удалили — бросаем закачку и недокачанный файл
  const x = dls.get(id); if (x) xDrop(x, 'pause');
  for (const [k, o] of ups) if (o.m.id === id) { try { o.c.close(); } catch (e) {} ups.delete(k); }
  if (S.dl[id] && S.dl[id].st !== 'done') APP?.files?.drop(id).catch(() => {});
  delete S.dl[id]; delete S.src[id]; srcMem.delete(id); save();
}
async function sendBig(c, f, meta) {
  let path = '';
  if (DESK) path = await APP.files.pathOf(f);
  const id = uid();
  if (path) S.src[id] = path; else srcMem.set(id, f);
  save();
  const old = members(c).filter(u => u !== myId && linksOf(u).some(L => !L.their?.caps.includes('xfer')));
  await post(c, { id, kind: 'file', big: 1, dev: myDev || '', name: fileName(f.name), size: f.size, ...(meta || {}), mime: /^[\w.+-]+\/[\w.+-]+$/.test(f.type) ? f.type : 'application/octet-stream' });
  if (old.length) toast('У ' + old.map(nameOf).join(', ') + ' старая версия Кинозала — большой файл скачается после обновления');
  else toast(path ? '«' + f.name + '» скачают напрямую с этого компьютера, пока Кинозал открыт' : '«' + f.name + '» скачают напрямую отсюда — не закрывай вкладку, пока не скачают');
}
// папка целиком (только программа для Windows): опись снимается сейчас, по ней и отдаём
const nFiles = n => n + ' ' + plural(n, 'файл', 'файла', 'файлов');
async function sendDir(c, root) {
  if (!DESK || !root) return;
  const id = uid(), name = fileName(root.split(/[\\/]/).filter(Boolean).pop() || 'папка');
  toast('Считаю файлы в «' + name + '»…');
  let r; try { r = await APP.files.dirAdd(id, root); } catch (e) { toast('Не получилось прочитать папку: ' + String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); return; }
  if (!r.n || !r.size) { toast('В папке «' + name + '» нет файлов с содержимым — отправлять нечего'); return; }
  S.src[id] = root; save();
  const old = members(c).filter(u => u !== myId && linksOf(u).some(L => !L.their?.caps.includes('xdir')));
  await post(c, { id, kind: 'file', big: 1, dir: 1, n: r.n, dev: myDev || '', name, size: r.size, mime: 'inode/directory' });
  toast(old.length ? 'У ' + old.map(nameOf).join(', ') + ' старая версия Кинозала — папку скачают после обновления' : 'Папку «' + name + '» (' + nFiles(r.n) + ', ' + fmtSize(r.size) + ') скачают напрямую с этого компьютера, пока Кинозал открыт');
}
async function srcOf(m) {
  if (m.dir) return DESK && S.src[m.id] && await APP.files.dirStat(m.id) === 'ok' ? { dir: m.id } : null;
  const f = srcMem.get(m.id); if (f) return f.size === m.size ? { file: f } : null;
  const p = S.src[m.id]; if (!p || !DESK) return null;
  const st = await APP.files.stat(p); return st && st.size === m.size ? { path: p } : null;
}
async function readSrc(src, off, len) {
  if (src.file) return new Uint8Array(await src.file.slice(off, off + len).arrayBuffer());
  const b = src.dir ? await APP.files.dirRead(src.dir, off, len) : await APP.files.read(src.path, off, len);
  return b instanceof Uint8Array ? b : new Uint8Array(b);
}
// опись папки: получатель просит её по обычной связи перед первой закачкой
const manWait = new Map();
async function xManServe(L, d) {
  const id = clean(d.id, 60), m = await msgGet(id);
  if (!m || !m.dir || !isMineSrc(m) || (!L.self && !members(m.chat).includes(L.uid))) return send(L, { t: 'xman', id, err: 'nofile' });
  if (await APP.files?.dirStat(id) !== 'ok') return send(L, { t: 'xman', id, err: 'gone' });
  const man = await APP.files.dirMan(id);
  send(L, { t: 'xman', id, files: man.files, dirs: man.dirs });
}
function xManGot(L, d) { const w = manWait.get(clean(d.id, 60)); if (w && w.L === L) { manWait.delete(clean(d.id, 60)); w.res(d); } }
function xManAsk(L, id) {
  return new Promise(res => {
    manWait.set(id, { L, res }); send(L, { t: 'xmanq', id });
    setTimeout(() => { if (manWait.get(id)?.res === res) { manWait.delete(id); res(null); } }, 20000);
  });
}
// скорость за последние секунды
function speed(o, bytes) {
  const now = Date.now(), s = o.sp ||= []; s.push([now, bytes]);
  while (s.length > 2 && now - s[0][0] > 4000) s.shift();
  const dt = (now - s[0][0]) / 1000; o.rate = dt > 0.3 ? (bytes - s[0][1]) / dt : o.rate || 0;
}
// режимы скорости: «максимум» — без ограничений; «щадящий» — не больше заданного, чтобы не мешать звонку или фильму;
// «авто» — щадящий, пока я в звонке или зале Кинозала. Отдачу ограничивает отправитель (токен-бакет на все отдачи сразу),
// скачивание — тоже отправитель, по просьбе получателя (cap): так лишнее даже не идёт по сети.
const MB = 1 << 20;
const XMODES = { max: '⚡ Максимум', soft: '🐢 Щадящий', auto: '🤖 Авто' };
const xMode = () => XMODES[store.get('xmode', 'auto')] ? store.get('xmode', 'auto') : 'auto';
const xLim = k => Math.max(0.25, Math.min(100, +store.get(k, k === 'xup' ? '2' : '5') || 2));   // МБ/с
const xSoft = () => xMode() === 'soft' || (xMode() === 'auto' && !!window.kzRoom?.inRoom);
const upRate = () => xSoft() ? xLim('xup') * MB : Infinity;
const downRate = () => xSoft() ? xLim('xdown') * MB : Infinity;
const upB = { tok: 0, t: 0 };
const fmtRate = v => String(v).replace('.', ',') + ' МБ/с (' + Math.round(v * 8.39) + ' Мбит/с)';
async function takeFrom(b, rate, n) {   // ждём, пока «ведро» наберёт n байт; скорость перечитываем каждый раз — переключение на ходу
  for (;;) {
    const now = performance.now();
    if (!isFinite(rate())) { b.tok = 0; b.t = now; return; }
    const r = rate(); b.tok = Math.min(r * 0.25 + n, b.tok + (now - (b.t || now)) / 1000 * r); b.t = now;
    if (b.tok >= n) { b.tok -= n; return; }
    await sleep(Math.min(200, Math.max(4, (n - b.tok) / r * 1000)));
  }
}
// получатель сообщает отправителям, сколько можно слать: лимит скачивания делится на все текущие закачки
function xCaps() {
  const live = [...dls.values()].filter(x => x.c?.open), r = downRate(), bps = isFinite(r) ? Math.round(r / Math.max(1, live.length)) : 0;
  for (const x of live) if (x.cap !== bps) { x.cap = bps; try { x.c.send(JSON.stringify({ t: 'cap', bps })); } catch (e) {} }
}
let xSoftWas = null;
setInterval(() => {   // зашёл в звонок или вышел, сменил режим — пересчитываем и перерисовываем
  const k = xSoft() + '|' + xLim('xup') + '|' + xLim('xdown');
  if (k === xSoftWas) return; xSoftWas = k; xCaps();
  for (const id of new Set([...dls.keys(), ...[...ups.values()].map(o => o.m.id)])) xPaint(id);
}, 1500);
function setXMode(v) { store.set('xmode', v); xSoftWas = null; xCaps(); for (const id of new Set([...dls.keys(), ...[...ups.values()].map(o => o.m.id)])) xPaint(id); }
const fmtEta = s =>s < 60 ? Math.max(1, Math.round(s)) + ' с' : s < 3600 ? Math.round(s / 60) + ' мин' : Math.floor(s / 3600) + ' ч ' + Math.round(s % 3600 / 60) + ' мин';

// --- получатель ---
async function xStart(m) {
  if (dls.has(m.id) || isMineSrc(m)) return;
  const d = S.dl[m.id] ||= { st: 'wait', got: 0 };
  if (d.st === 'done') return;
  delete d.why;
  const L = srcLink(m);
  if (!L) { d.st = 'wait'; save(); xPaint(m.id); dial(m.from); return; }
  if (!L.their?.caps.includes(m.dir ? 'xdir' : 'xfer')) { d.st = 'err'; d.why = 'у отправителя старая версия Кинозала'; save(); xPaint(m.id); return; }
  if (m.dir && !DESK) { d.st = 'err'; d.why = 'папку целиком можно скачать только в программе для Windows'; save(); xPaint(m.id); return; }
  const x = { m, L, got: 0, tok: uid(), c: null, parts: [], plen: 0, q: Promise.resolve(), bad: 0 };
  dls.set(m.id, x);
  if (m.dir) {   // папка: сначала опись — какие файлы и каких размеров (один раз, дальше она лежит на диске)
    try {
      x.got = await APP.files.dirOpen(m.id, BLK, null, m.size);
      if (x.got < 0) {
        const r = await xManAsk(L, m.id); if (dls.get(m.id) !== x) return;
        if (!r) return xDrop(x, 'wait');
        if (r.err) return xDrop(x, r.err === 'gone' || r.err === 'nofile' ? 'gone' : 'err', r.err === 'gone' || r.err === 'nofile' ? '' : 'отправитель не может отдать папку');
        x.got = await APP.files.dirOpen(m.id, BLK, { files: r.files, dirs: r.dirs }, m.size);
      }
    } catch (e) { return xDrop(x, 'err', 'опись папки не подошла: ' + String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  } else {
    try { x.got = DISK ? await APP.files.open(m.id, BLK) : Math.floor(Math.min(d.got || 0, m.size) / BLK) * BLK; }
    catch (e) { return xDrop(x, 'err', 'не получилось создать файл на диске'); }
  }
  if (dls.get(m.id) !== x) return;
  d.st = 'go'; d.got = x.got; save(); xPaint(m.id);
  if (x.got >= m.size) return xFinish(x);
  expect.set(x.tok, x);
  send(L, { t: 'xget', id: m.id, from: x.got, tok: x.tok });
  x.to = setTimeout(() => { if (dls.get(m.id) === x && !x.c?.open) xDrop(x, 'wait'); }, 15000);
  jlog('[файлы] качаю', m.name, fmtSize(m.size), 'с', fmtSize(x.got));
}
function xIncoming(c) {
  const x = expect.get(String(c.metadata.xfer || ''));
  if (!x || c.peer !== x.L.peer) { setTimeout(() => { try { c.close(); } catch (e) {} }, 100); return; }
  expect.delete(x.tok); x.c = c; x.last = Date.now();
  const lost = () => { if (dls.get(x.m.id) === x) xDrop(x, 'wait'); };
  // отправитель пропал без «до свидания» (выключили компьютер, пропал интернет) — WebRTC заметит это только секунд через 30
  x.dog = setInterval(() => { if (dls.get(x.m.id) !== x) clearInterval(x.dog); else if (Date.now() - x.last > 15000) { jlog('[файлы] данные не идут 15 с — переподключаюсь'); lost(); } else xPaint(x.m.id); }, 3000);
  c.on('data', d => { x.last = Date.now(); x.q =x.q.then(() => xData(x, d)).catch(e => { console.error(e); if (dls.get(x.m.id) === x) xDrop(x, 'err', 'не получилось записать: ' + (e?.message || e)); }); });
  c.on('close', () => { lost(); xCaps(); }); c.on('error', lost);
  const opened = () => xCaps();   // сразу говорим отправителю свой лимит
  if (c.open) opened(); else c.on('open', opened);
}
function joinParts(parts, n) { const u = new Uint8Array(n); let o = 0; for (const p of parts) { u.set(new Uint8Array(p), o); o += p.byteLength; } return u; }
async function xData(x, d) {
  if (dls.get(x.m.id) !== x) return;
  const m = x.m;
  if (typeof d === 'string') {
    let j; try { j = JSON.parse(d); } catch (e) { return; }
    if (j.t === 'no') return xDrop(x, j.why === 'gone' ? 'gone' : 'err', j.why === 'gone' ? '' : 'отправитель не смог прочитать файл');
    if (j.t !== 'h') return;
    const i = x.got / BLK, buf = joinParts(x.parts, x.plen); x.parts = []; x.plen = 0;
    if (j.i !== i || buf.byteLength !== Math.min(BLK, m.size - x.got) || await sha(buf) !== j.h) {
      jlog('[файлы] кусок', i, 'не сошёлся — прошу заново');
      if (++x.bad > 5) return xDrop(x, 'err', 'файл приходит с ошибками');
      xDrop(x, 'wait'); setTimeout(() => xStart(m), 1000); return;
    }
    if (m.dir) await APP.files.dirWrite(m.id, x.got, buf); else if (DISK) await APP.files.write(m.id, x.got, buf); else await blobPut(m.id + ':' + i, new Blob([buf]));
    if (dls.get(m.id) !== x) return;
    x.got += buf.byteLength; S.dl[m.id].got = x.got; save(); speed(x, x.got);
    try { x.c.send(JSON.stringify({ t: 'ok', i })); } catch (e) {}
    xPaint(m.id);
    if (x.got >= m.size) return xFinish(x);
    return;
  }
  const b = d instanceof ArrayBuffer ? d : ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : null;
  if (!b) return;
  x.parts.push(b); x.plen += b.byteLength;
  if (x.plen > BLK) { x.parts = []; x.plen = 0; xDrop(x, 'wait'); setTimeout(() => xStart(m), 1000); }
}
async function xFinish(x) {
  const m = x.m, d = S.dl[m.id];
  dls.delete(m.id); clearInterval(x.dog); try { x.c?.close(); } catch (e) {}
  if (!d) return;
  try {
    if (m.dir) d.path = await APP.files.dirDone(m.id, m.name, routeTarget(m));
    else if (DISK) d.path = await APP.files.done(m.id, m.name, routeTarget(m));
    else {
      const parts = []; for (let i = 0; i * BLK < m.size; i++) { const p = await blobGet(m.id + ':' + i); if (!p) throw new Error('нет куска ' + i); parts.push(p); }
      await blobPut(m.id, new Blob(parts, { type: m.mime })); await tx('blobs', 'readwrite', s => s.delete(partsKey(m.id)));
    }
    d.st = 'done'; d.got = m.size; delete d.why; save(); xPaint(m.id);
    jlog('[файлы] скачан', m.name, fmtSize(m.size));
    if (!d.auto) toast('«' + m.name + '» скачан' + (DISK ? ' — ' + routeLabel(m) : ''));
  } catch (e) { d.st = 'err'; d.why = 'не получилось сохранить: ' + (e?.message || e); save(); xPaint(m.id); }
}
// закачка остановилась: пауза, ждём отправителя (сама продолжится) или ошибка
function xDrop(x, st, why) {
  const m = x.m; if (dls.get(m.id) === x) dls.delete(m.id);
  expect.delete(x.tok); clearTimeout(x.to); clearInterval(x.dog);
  if (x.c) { if (st === 'pause') try { x.c.send(JSON.stringify({ t: 'stop' })); } catch (e) {} setTimeout(() => { try { x.c.close(); } catch (e) {} }, 50); }
  const d = S.dl[m.id];
  if (d && d.st !== 'done') { d.st = st; if (why) d.why = why; else delete d.why; save(); }
  xPaint(m.id);
  if (st === 'wait') setTimeout(() => { if (S.dl[m.id]?.st === 'wait' && !dls.has(m.id) && srcLink(m)) xStart(m); }, 5000);
}
function xNo(L, d) {
  const id = clean(d.id, 60), x = dls.get(id); if (!x || x.L !== L) return;
  xDrop(x, d.why === 'gone' || d.why === 'nofile' ? 'gone' : 'err', d.why === 'gone' || d.why === 'nofile' ? '' : 'отправитель не может отдать файл');
}
// связь с отправителем появилась — докачиваем всё, что ждало
async function xResume(L) {
  // попытка, начатая по старой, уже мёртвой связи, ещё ждёт ответа — бросаем её и просим заново по новой
  for (const x of [...dls.values()]) if (x.L !== L && x.L.uid === L.uid && x.L.dev === L.dev && !x.c?.open) xDrop(x, 'wait');
  for (const [id, d] of Object.entries(S.dl)) {
    if (d.st !== 'wait' || dls.has(id)) continue;
    const m = await msgGet(id); if (!m) { delete S.dl[id]; continue; }
    if (srcLink(m) === L) xStart(m);
  }
}
function xClick(m) {
  if (isMineSrc(m)) { if (DISK && S.src[m.id]) APP.files.show(S.src[m.id]); return; }
  const d = S.dl[m.id];
  if (d?.st === 'done') {
    if (DISK) { APP.files.show(d.path); return; }
    mediaUrl(m).then(u => { if (!u) return; const a = el('a'); a.href = u; a.download = m.name; document.body.append(a); a.click(); a.remove(); });
    return;
  }
  if (d?.st === 'go') { const x = dls.get(m.id); if (x) xDrop(x, 'pause'); else { d.st = 'pause'; save(); xPaint(m.id); } return; }
  if (d?.st === 'wait') { d.st = 'pause'; save(); xPaint(m.id); return; }
  if (!d && !riskOk(m)) return;
  xStart(m);
}

// --- отправитель ---
async function xServe(L, d) {
  const id = clean(d.id, 60), tok = clean(d.tok, 60), from = Math.max(0, +d.from || 0);
  const no = why => send(L, { t: 'xno', id, why });
  const m = await msgGet(id);
  if (!m || !m.big || !isMineSrc(m)) return no('nofile');
  if (!L.self && !members(m.chat).includes(L.uid)) return;
  if (!tok || from % BLK || from >= m.size) return no('bad');
  if (m.dir && !L.their?.caps.includes('xdir')) return no('old');
  const src = await srcOf(m); if (!src) return no('gone');
  if (!peer || net !== 'on') return no('net');
  const c = peer.connect(L.peer, { reliable: true, serialization: 'raw', metadata: { v: 1, xfer: tok } });
  const k = id + '|' + tok, o = { m, c, next: from / BLK, done: from / BLK, sent: from, closed: false, wake: null, last: Date.now(), cap: Infinity, rb: { tok: 0, t: 0 } };
  ups.set(k, o); xPaint(id);
  const fin = () => { if (o.closed) return; o.closed = true; ups.delete(k); o.wake?.(); xPaint(id); };
  c.on('close', fin); c.on('error', fin);
  c.on('data', s => {
    if (typeof s !== 'string') return;
    let j; try { j = JSON.parse(s); } catch (e) { return; }
    if (j.t === 'ok') { o.last = Date.now(); o.done =Math.max(o.done, (j.i | 0) + 1); o.sent = Math.min(m.size, o.done * BLK); speed(o, o.sent); o.wake?.(); xPaint(id); if (o.sent >= m.size) jlog('[файлы] отдал', m.name, 'для', L.peer); }
    else if (j.t === 'cap') o.cap = +j.bps > 0 ? +j.bps : Infinity;
    else if (j.t === 'stop') { try { c.close(); } catch (e) {} fin(); }
  });
  c.on('open', () => pump(o, src).catch(e => {
    jlog('[файлы] не смог отдать', m.name, e?.message || e);
    try { c.send(JSON.stringify({ t: 'no', why: 'read' })); } catch (er) {}
    setTimeout(() => { try { c.close(); } catch (er) {} fin(); }, 300);
  }));
  setTimeout(() => { if (!c.open && !o.closed) { try { c.close(); } catch (e) {} fin(); } }, 30000);
  jlog('[файлы] отдаю', m.name, 'для', L.peer, 'с', fmtSize(from));
}
async function pump(o, src) {
  const m = o.m, n = Math.ceil(m.size / BLK), dc = o.c.dataChannel;
  const drained = () => new Promise(r => { dc.addEventListener('bufferedamountlow', r, { once: true }); setTimeout(r, 500); });
  while (o.next < n && !o.closed) {
    if (o.next - o.done >= WIN) {
      if (Date.now() - o.last > 60000) throw new Error('получатель не подтверждает куски');
      await new Promise(r => { o.wake = r; setTimeout(r, 3000); }); o.wake = null; continue;
    }
    const off = o.next * BLK, len = Math.min(BLK, m.size - off);
    const buf = await readSrc(src, off, len);
    if (buf.byteLength !== len) throw new Error('файл изменился');
    const h = await sha(buf);
    for (let p = 0; p < len && !o.closed; p += FRAME) {
      const n = Math.min(FRAME, len - p);
      await takeFrom(upB, upRate, n);                // мой лимит отдачи — общий на всех, кому отдаю
      await takeFrom(o.rb, () => o.cap, n);          // лимит скачивания получателя
      // в щадящем режиме держим очередь короткой, иначе в ней застрянут секунды данных и лимит «поплывёт»
      const hi = isFinite(upRate()) || isFinite(o.cap) ? 256 << 10 : 4 << 20;
      dc.bufferedAmountLowThreshold = hi >> 1;   // иначе «очередь опустела» не придёт, пока она и так ниже порога
      while (!o.closed && dc.bufferedAmount > hi) await drained();
      if (!o.closed) o.c.send(buf.subarray(p, p + n));
    }
    if (o.closed) return;
    o.c.send(JSON.stringify({ t: 'h', i: o.next, h }));
    o.next++;
  }
}

// --- карточка файла ---
function xLine(m) {
  const size = fmtSize(m.size) + (m.dir ? ' · ' + nFiles(m.n || 0) : ''), total = fmtSize(m.size);
  if (isMineSrc(m)) {
    const o = [...ups.values()].find(v => v.m.id === m.id);
    if (o) return { txt: 'отдаю: ' + Math.floor(o.sent / m.size * 100) + '%' + (o.rate ? ' · ' + fmtSize(Math.round(o.rate)) + '/с' : ''), p: o.sent / m.size };
    if (srcMem.has(m.id)) return { txt: size + ' · ждёт, пока скачают' };
    if (DESK && S.src[m.id]) return { txt: size + ' · показать в папке' };
    return { txt: size + ' · здесь файла уже нет — отправь заново' };
  }
  const d = S.dl[m.id], x = dls.get(m.id), who = m.from === myId ? 'другое твоё устройство' : nameOf(m.from);
  if (!d) return { txt: size + ' · скачать' };
  const part = fmtSize(d.got || 0) + ' из ' + total;
  switch (d.st) {
    case 'done': return { txt: size + (DISK ? ' · ' + SHOWT : ' · сохранить') };
    case 'go': {
      const stuck = x?.c && Date.now() - (x.last || 0) > 4000, r = stuck ? 0 : x?.rate || 0, left = r > 0 ? ' · ' + fmtEta((m.size - (d.got || 0)) / r) : '';
      return { txt: part + (r ? ' · ' + fmtSize(Math.round(r)) + '/с' + left : stuck ? ' · данные не идут…' : x?.c ? '' : ' · соединяюсь…'), p: (d.got || 0) / m.size, go: 1 };
    }
    case 'pause': return { txt: part + ' · пауза — продолжить', p: (d.got || 0) / m.size };
    case 'wait': return { txt: (d.got ? part + ' · ' : size + ' · ') + 'ждём, когда ' + who + ' будет в сети', p: d.got ? d.got / m.size : null };
    case 'gone': return { txt: size + (m.dir ? ' · у отправителя папка изменилась или пропала — пусть отправит заново' : ' · у отправителя файла уже нет') };
    default: return { txt: (d.why || 'не получилось') + ' · ещё раз', p: d.got ? d.got / m.size : null };
  }
}
function xFill(w, m) {
  const s = xLine(m), sp = $('.t span', w), bar = $('.xbar', w);
  sp.textContent = s.txt; w.title = s.go ? 'Пауза' : '';
  bar.hidden = s.p == null; if (s.p != null) bar.firstChild.style.width = Math.min(100, s.p * 100).toFixed(1) + '%';
  w.classList.toggle('go', !!s.go);
  const md = $('.xmode', w), live = !!s.go || (isMineSrc(m) && [...ups.values()].some(o => o.m.id === m.id));
  md.hidden = !live;
  if (live) { md.textContent = (xSoft() ? '🐢 щадящий' : '⚡ максимум') + (xMode() === 'auto' ? ' · авто' : ''); md.title = xSoft() ? 'Переключить на максимальную скорость' : 'Переключить на щадящий режим — чтобы не мешать звонку или фильму'; }
}
const xPaintT = new Map();
function xPaint(id) {
  if (xPaintT.has(id)) return;
  xPaintT.set(id, setTimeout(async () => {
    xPaintT.delete(id);
    const ws = document.querySelectorAll('.filecard[data-x="' + id + '"]'); if (!ws.length) return;
    const m = dls.get(id)?.m || [...ups.values()].find(o => o.m.id === id)?.m || await msgGet(id); if (!m) return;
    for (const w of ws) xFill(w, m);
  }, 150));
}

// ---------- раздел «Файлы»: передачи со всех чатов, полученное, отправленное ----------
// Не проводник по всему диску: только то, что прошло через Кинозал, — с тем, кто прислал и из какого чата.
let fHostEl = null, panelW = '';   // правая панель в зале: куда рисовать «Файлы» и что открыто ('music' | 'files')
let filesOpen = false, fTab = store.get('fTab', 'all'), fPath = '', fQ = '', fSort = store.get('fSort', 'date'), fGen = 0;
const FICON = { img: '🖼', video: '🎬', audio: '🎵', arc: '🗜', doc: '📄', exe: '⚙️', dir: '📁', raw: '📷' };
const fKind = n => isRawName(n) ? 'raw' : /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(n) ? 'img' : /\.(mp4|webm|mkv|mov|m4v|avi)$/i.test(n) ? 'video' : /\.(mp3|ogg|opus|wav|flac|m4a|aac)$/i.test(n) ? 'audio' : /\.(zip|rar|7z|tar|gz|jar|mrpack)$/i.test(n) ? 'arc' : RISKY.test(n) ? 'exe' : 'doc';
const fileUrl = p => 'file:///' + String(p).replace(/\\/g, '/').split('/').map((s, i) => i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s)).join('/');
const fDate = ts => { const d = new Date(ts), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }); };
const errText = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// что сейчас передаётся: качаю (в том числе жду и на паузе) и отдаю
async function liveItems() {
  const rx = [], tx = [];
  for (const [id, d] of Object.entries(S.dl)) if (['go', 'wait', 'pause', 'err'].includes(d.st)) { const m = dls.get(id)?.m || await msgGet(id); if (m?.big) rx.push(m); }
  const seen = new Set(); for (const o of ups.values()) if (!seen.has(o.m.id)) { seen.add(o.m.id); tx.push(o.m); }
  return { rx, tx };
}
const liveCount = () => dls.size + new Set([...ups.values()].map(o => o.m.id)).size;
// ---------- музыка (только программа для Windows; сам раздел — в music.js) ----------
let musicApi = null;
function swapAnim(h) { if (!h) return; h.classList.remove('sw-in'); void h.offsetWidth; h.classList.add('sw-in'); setTimeout(() => h.classList.remove('sw-in'), 340); }
function openMusic() {
  if (!musicApi) return;
  closePanel(true); swapAnim($('#mxMain'));
  if (open) { freeUrls(); open = null; find = null; }
  filesOpen = false; root.classList.add('chat-open'); renderList(); musicApi.show();
}
function closeMusic() { if (panelW === 'music') { closePanel(); return; } musicApi?.hide(); showEmpty(); }
// «Музыка» и «Файлы» прямо в зале (звонок и Кинозал): панель-«док» справа. Зал сжимается и уступает ей место, а не перекрывается;
// панель можно растянуть мышью за левый край или раскрыть на весь экран. Смена Музыка ↔ Файлы идёт плавно.
let panelCfg = { w: 0, full: false }; try { Object.assign(panelCfg, JSON.parse(store.get('panelCfg', '{}'))); } catch (e) {}
const savePanelCfg = () => store.set('panelCfg', JSON.stringify({ w: panelCfg.w, full: panelCfg.full }));
const panelWidth = () => Math.min(Math.max(panelCfg.w || Math.round(innerWidth * 0.46), 380), Math.max(380, innerWidth - 320));
let panelTimer = 0, relayoutRaf = 0;
function relayout(ms = 380) {   // пока панель едет, подгоняем плитки и видео под меняющуюся ширину зала
  const t0 = performance.now(); cancelAnimationFrame(relayoutRaf);
  const tick = () => { window.dispatchEvent(new Event('resize')); if (performance.now() - t0 < ms) relayoutRaf = requestAnimationFrame(tick); };
  tick();
}
function panelApply() {
  const room = document.getElementById('room'), dr = document.getElementById('rDrawer'); if (!room || !dr) return;
  const full = panelCfg.full || innerWidth < 900;
  room.style.setProperty('--rdw', panelWidth() + 'px');
  room.classList.toggle('panel-open', !!panelW); room.classList.toggle('panel-full', !!panelW && full);
  dr.classList.toggle('full', full);
  const fb = document.getElementById('rdFull'); if (fb) { fb.hidden = innerWidth < 900; fb.textContent = panelCfg.full ? '⤡' : '⤢'; fb.title = panelCfg.full ? 'Вернуть боковую панель' : 'Во весь экран'; }
}
function closePanel(instant) {
  const dr = document.getElementById('rDrawer'); if (!dr || !panelW) return;
  const w = panelW; panelW = '';
  if (w === 'music') musicApi?.hide(); else { filesOpen = false; fHostEl = null; }
  for (const id of ['roomMusic', 'roomFiles']) document.getElementById(id)?.classList.remove('on');
  document.getElementById('room')?.classList.remove('panel-open', 'panel-full');
  dr.classList.remove('open'); relayout();
  clearTimeout(panelTimer);
  const done = () => { if (!panelW) { dr.hidden = true; const b = document.getElementById('rdBody'); if (b) b.textContent = ''; } };
  if (instant) done(); else panelTimer = setTimeout(done, 360);
}
function roomPanel(w) {
  const dr = document.getElementById('rDrawer'), body = document.getElementById('rdBody'); if (!dr || !body) return;
  if (panelW === w) { closePanel(); return; }
  if (w === 'music' && !musicApi) return;
  const mark = () => { document.getElementById('roomMusic')?.classList.toggle('on', w === 'music'); document.getElementById('roomFiles')?.classList.toggle('on', w === 'files'); };
  const fill = () => {
    if (w === 'music') musicApi.show(body);
    else { musicApi?.hide(); fHostEl = body; filesOpen = true; if (!['all', 'live', 'recv', 'routes'].includes(fTab) || (!DESK && fTab === 'recv') || (!DISK && fTab === 'routes')) fTab = 'all'; renderFiles(); }
  };
  if (panelW) {   // открыта другая: содержимое плавно уезжает вниз и сменяется новым
    const was = panelW; panelW = w; mark();
    if (was === 'music') musicApi?.hide(); else { filesOpen = false; fHostEl = null; }
    body.classList.add('swap');
    setTimeout(() => { if (panelW !== w) return; body.textContent = ''; fill(); body.classList.remove('swap'); }, 150);
    return;
  }
  panelW = w; mark(); clearTimeout(panelTimer);
  dr.hidden = false; body.textContent = ''; panelApply(); void dr.offsetWidth;
  fill(); dr.classList.add('open'); relayout();
}
window.kzPanelFull = () => { if (!panelW) return; panelCfg.full = !panelCfg.full; savePanelCfg(); panelApply(); relayout(); };
window.addEventListener('resize', () => { if (panelW) panelApply(); });
(() => {   // потянул за левый край — ширина панели
  const g = document.getElementById('rdGrip'); if (!g) return;
  g.addEventListener('pointerdown', e => {
    e.preventDefault(); g.setPointerCapture(e.pointerId);
    const room = document.getElementById('room'); room.classList.add('dragging');
    const mv = ev => { panelCfg.w = Math.round(innerWidth - ev.clientX - 10); panelApply(); window.dispatchEvent(new Event('resize')); };
    const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); room.classList.remove('dragging'); savePanelCfg(); };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
  });
})();
window.kzPanel = roomPanel;
function openFiles(tab) {
  closePanel(true); swapAnim($('#mxMain')); musicApi?.hide();
  if (open) { freeUrls(); open = null; find = null; }
  filesOpen = true; if (tab) { fTab = tab; store.set('fTab', tab); }
  if ((!DESK && fTab === 'recv') || (!DISK && fTab === 'routes')) fTab = 'all';
  if (!['all', 'live', 'recv', 'routes'].includes(fTab)) fTab = 'all';
  root.classList.add('chat-open'); renderList(); renderFiles();
  APP?.files?.watch?.(() => { if (filesOpen && (fTab === 'recv' || fTab === 'all')) renderFiles(); });
}
function closeFiles() { if (panelW === 'files') { closePanel(); return; } filesOpen = false; showEmpty(); }
// строка с карточкой сообщения (она сама обновляет прогресс) и подписью: кто, где, когда
function msgRow(m, extra) {
  const r = el('div', 'frow msg'), meta = el('div', 'fmeta');
  const mine = m.from === myId, where = chatTitle(m.chat);
  meta.append(el('span', '', (mine ? 'ты → ' + where : nameOf(m.from) + (isDm(m.chat) ? '' : ' · ' + where)) + ' · ' + fDate(m.ts)));
  const go = el('button', 'lnk', 'к сообщению'); go.onclick = async () => { filesOpen = false; await openChat(m.chat); jumpTo(m.id); }; meta.append(go);
  for (const b of extra || []) meta.append(b);
  r.append(fileEl(m), meta); return r;
}
const lnk = (t, f, cls) => { const b = el('button', 'lnk' + (cls ? ' ' + cls : ''), t); b.onclick = e => { e.stopPropagation(); f(); }; return b; };
async function renderFiles() {
  if (!filesOpen) return;
  const gen = ++fGen, main = fHostEl || $('#mxMain');
  const sec = el('section', 'mx-files'), head = el('header', 'mx-chead'), tabs = el('div', 'ftabs'), bar = el('div', 'fbar'), list = el('div', 'flist');
  const back = el('button', 'ib back'); back.innerHTML = IC.back; back.title = 'К чатам'; back.onclick = closeFiles;
  const n = liveCount();
  for (const [k, t] of [['all', 'Все файлы'], ['live', 'Передачи' + (n ? ' · ' + n : '')], ...(DESK ? [['recv', 'Папки']] : []), ...(DISK ? [['routes', 'Маршруты']] : [])]) {
    const b = el('button', 'ftab' + (fTab === k ? ' on' : ''), t); b.onclick = () => { fTab = k; store.set('fTab', k); fPath = ''; fQ = ''; renderFiles(); }; tabs.append(b);
  }
  head.append(back, el('h2', '', 'Файлы'), tabs);
  sec.append(head, bar, list);
  if (fTab === 'live') await fillLive(bar, list);
  else if (fTab === 'recv') await fillRecv(bar, list, gen);
  else if (fTab === 'routes') await fillRoutes(bar, list);
  else await fillAll(bar, list, gen);
  if (gen !== fGen || !filesOpen) return;
  const keep = fKeepTop ? 0 : $('.mx-files .flist')?.scrollTop || 0, hadFocus = document.activeElement?.classList.contains('fq'); fKeepTop = false;
  main.textContent = ''; main.append(sec); list.scrollTop = keep;
  if (hadFocus) { const q = $('.fq', sec); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
}
let fKeepTop = false;
function emptyEl(icon, t, s) { const e = el('div', 'fempty'); e.append(el('div', 'big', icon), el('b', '', t), el('span', '', s)); return e; }

// --- типы файлов ---
const FTYPES = [['photo', 'Фото', '🖼'], ['raw', 'RAW', '📷'], ['video', 'Видео', '🎬'], ['audio', 'Звук', '🎵'], ['pdf', 'PDF', '📕'], ['doc', 'Документы', '📄'], ['sheet', 'Таблицы', '📊'], ['text', 'Текст и код', '📝'], ['arc', 'Архивы', '🗜'], ['dir', 'Папки', '📁'], ['font', 'Шрифты', '🔤'], ['exe', 'Программы', '⚙️'], ['other', 'Другое', '📦']];
const FT = Object.fromEntries(FTYPES.map(([k, t, i]) => [k, { t, i }]));
function typeOfName(n) {
  n = String(n || '').toLowerCase();
  if (isRawName(n) && !/\.tiff?$/.test(n)) return 'raw';
  if (/\.(png|jpe?g|webp|gif|avif|bmp|heic|heif|tiff?|svg|ico)$/.test(n)) return 'photo';
  if (/\.(mp4|webm|mkv|mov|m4v|avi|wmv|flv|3gp|ts)$/.test(n)) return 'video';
  if (/\.(mp3|ogg|opus|wav|flac|m4a|aac|wma|aiff?)$/.test(n)) return 'audio';
  if (/\.pdf$/.test(n)) return 'pdf';
  if (/\.(docx?|odt|rtf|pptx?|odp|epub|djvu)$/.test(n)) return 'doc';
  if (/\.(xlsx?|ods|csv|tsv)$/.test(n)) return 'sheet';
  if (/\.(txt|md|markdown|json|jsonc|log|ini|cfg|conf|toml|ya?ml|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|java|kt|c|h|cpp|hpp|cs|go|rs|rb|php|sh|bat|cmd|ps1|sql|lua|properties|srt|vtt|nfo|mcmeta)$/.test(n)) return 'text';
  if (/\.(zip|rar|7z|tar|gz|tgz|bz2|xz|jar|mrpack|apk)$/.test(n)) return 'arc';
  if (/\.(ttf|otf|woff2?)$/.test(n)) return 'font';
  if (RISKY.test(n)) return 'exe';
  return 'other';
}
const ftype = m => m.kind === 'img' ? 'photo' : m.dir ? 'dir' : typeOfName(m.name);
const fileNameOf = m => m.kind === 'img' ? 'Фото ' + new Date(m.ts).toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-') + '.' + (m.mime === 'image/jpeg' ? 'jpg' : String(m.mime || 'image/webp').split('/')[1]) : m.name;
const whoName = m => m.from === myId ? 'Я' : nameOf(m.from);

// --- маршруты: куда класть полученное ---
// Правила проверяются сверху вниз, первое подходящее решает: тип файла и от кого → папка и подпапки.
// Если ни одно не подошло — «Полученные». Маленькие файлы сохраняются сразу, большие качаются сами до заданного размера.
S.routing ||= { auto: true, bigMax: 2048, sub: 'none', rules: [] };
if (ANDROID && !S.routing.phone) { S.routing.phone = 1; S.routing.bigMax = 0; save(); }   // на телефоне большие — только по кнопке, бережём мобильный интернет
const SUBS = { none: 'без подпапок', person: 'по человеку', month: 'по месяцу', 'person-month': 'по человеку, внутри по месяцам', type: 'по типу файла' };
function routeOf(m) { const t = ftype(m); return S.routing.rules.find(r => r.on !== false && (!r.types?.length || r.types.includes(t)) && (!r.who || r.who === m.from || r.who === m.chat)) || null; }
function routeTarget(m) {
  const r = routeOf(m), d = new Date(m.ts), mon = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const sub = { none: [], person: [whoName(m)], month: [mon], 'person-month': [whoName(m), mon], type: [FT[ftype(m)].t] }[r ? r.sub : S.routing.sub] || [];
  return { root: r?.dest || '', sub };
}
const rootName = p => p ? String(p).split(/[\\/]/).filter(Boolean).pop() || p : ANDROID ? 'Загрузки/Кинозал' : 'Полученные';
function routeLabel(m) { const t = routeTarget(m); return 'он в «' + [rootName(t.root), ...t.sub].join(' → ') + '»'; }
async function saveToRoute(m, auto) {
  const b = await blobGet(m.id); if (!b) throw new Error('файла нет в переписке');
  const p = await APP.files.save(fileNameOf(m), new Uint8Array(await b.arrayBuffer()), routeTarget(m));
  S.dl[m.id] = { st: 'done', got: m.size || b.size, path: p, ...(auto ? { auto: 1 } : {}) }; save(); return p;
}
// пришёл файл — разложить по маршруту (old — «разложить уже полученное» из настроек)
async function autoRoute(m, old) {
  if (!DISK || (!S.routing.auto && !old) || m.from === myId || !['file', 'img'].includes(m.kind)) return false;
  if (!old && Date.now() - m.ts > 3 * 864e5) return false;               // старое, пришедшее досинхронизацией, само не раскладываем
  if (m.open > Date.now() || RISKY.test(m.name || '') || S.dl[m.id]) return false;   // капсулы и программы — только вручную
  try {
    if (m.big) { if (old || m.size > S.routing.bigMax * MB) return false; S.dl[m.id] = { st: 'wait', got: 0, auto: 1 }; save(); xStart(m); return true; }
    await saveToRoute(m, true); if (filesOpen && fTab === 'all') renderFiles(); return true;
  } catch (e) { jlog('[маршруты] не сохранил', m.name || m.id, errText(e)); return false; }
}

// --- библиотека: все файлы из всех чатов, любого размера ---
const fl = { type: store.get('flType', 'all'), who: '', sort: store.get('flSort', 'date'), group: store.get('flGroup', 'none'), view: store.get('flView', 'list'), q: '', shown: 150 };
function allFileMsgs() {
  return new Promise((res, rej) => {
    const out = [], r = db.transaction('msgs').objectStore('msgs').openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return res(out); const m = c.value; if ((m.kind === 'file' || m.kind === 'img') && !(m.open > Date.now() && m.from !== myId)) out.push(m); c.continue(); };
    r.onerror = () => rej(r.error);
  });
}
function fileState(m) {
  const d = S.dl[m.id], mine = isMineSrc(m);
  if (mine && S.src[m.id]) return { k: 'disk', path: S.src[m.id], t: 'отправлено отсюда' };
  if (d?.st === 'done' && d.path) return { k: 'disk', path: d.path, t: 'на диске' };
  if (d?.st === 'done') return { k: 'here', t: 'скачано' };
  if (m.blob) return { k: 'chat', t: 'в переписке' };
  if (d && ['go', 'wait', 'pause'].includes(d.st)) return { k: 'dl', t: d.st === 'go' ? 'качается ' + Math.floor((d.got || 0) / m.size * 100) + '%' : d.st === 'pause' ? 'на паузе' : 'ждёт отправителя' };
  if (mine) return { k: 'gone', t: 'отправлено с другого устройства' };
  return { k: 'remote', t: m.big ? 'не скачано' : '' };
}
const fMonth = ts => new Date(ts).toLocaleDateString('ru', { month: 'long', year: 'numeric' });
function fActions(m) {
  const st = fileState(m), a = [['Открыть', () => openAny(m)]];
  if (st.path) a.push([SHOWB, () => APP.files.show(st.path)]);
  if (st.k === 'chat') a.push([DISK ? 'Сохранить — ' + rootName(routeTarget(m).root) : 'Сохранить', async () => { if (!DISK) return saveSmall(m); try { const p = await saveToRoute(m); toast('Сохранено — ' + routeLabel(m)); if (DESK) APP.files.show(p); renderFiles(); } catch (e) { toast('Не получилось: ' + errText(e)); } }]);
  if (m.big && !isMineSrc(m) && st.k !== 'disk' && st.k !== 'here') a.push([S.dl[m.id]?.st === 'go' ? 'Пауза' : 'Скачать', () => { xClick(m); setTimeout(renderFiles, 300); }]);
  a.push(['Переслать', () => pickChat('Кому переслать «' + fileNameOf(m) + '»?', c => fwdMsg(c, m))]);
  a.push(['К сообщению', async () => { filesOpen = false; await openChat(m.chat); jumpTo(m.id); }]);
  if (isMineSrc(m) && (S.src[m.id] || srcMem.has(m.id))) a.push(['Больше не раздавать', () => {
    if (!confirm('Больше не раздавать «' + m.name + '»? Кто не успел скачать — уже не скачает.')) return;
    for (const [k, o] of ups) if (o.m.id === m.id) { try { o.c.close(); } catch (e) {} ups.delete(k); }
    delete S.src[m.id]; srcMem.delete(m.id); save(); xPaint(m.id); renderFiles();
  }]);
  return a;
}
// переслать из библиотеки: из переписки — прямо в сообщении, с диска — как файл или папку, своё большое — напрямую
async function fwdMsg(c, m) {
  const st = fileState(m), meta = { th: m.th, w: m.w, h: m.h, ex: m.ex, dur: m.dur };
  try {
    if (m.kind === 'img') { const b = await blobGet(m.id); if (!b) throw new Error('фото нет в переписке'); await post(c, { kind: 'img', w: m.w, h: m.h }, b); }
    else if (m.blob) { const b = await blobGet(m.id); if (!b) throw new Error('файла нет в переписке'); await post(c, { kind: 'file', name: m.name, size: m.size, mime: m.mime, ...meta }, b); }
    else if (isMineSrc(m)) return fwdSent(c, m);
    else if (st.path) return fwdPath(c, { path: st.path, name: m.name, size: m.size, dir: !!m.dir }, m);
    else { toast('Сначала скачай файл — пересылать его будешь со своего компьютера'); return; }
    toast('Отправлено в «' + chatTitle(c) + '»');
  } catch (e) { toast('Не получилось переслать: ' + errText(e)); }
}
// открыть чем умеем: картинки, RAW, видео — просмотр; документы, звук, архивы — свои просмотрщики; иначе — программой Windows
async function openAny(m) {
  const t = ftype(m), st = fileState(m);
  if (m.kind === 'img') return photo(m);
  if (m.dir) { if (st.path) { fTab = 'recv'; store.set('fTab', 'recv'); fPath = st.path; fQ = ''; renderFiles(); } else xClick(m); return; }
  if (viewable(m) || t === 'raw' || t === 'video' || HEAVY.test(m.name || '')) return openOriginal(m);
  if (typeof openDoc === 'function' && ['audio', 'pdf', 'doc', 'sheet', 'text', 'arc', 'font', 'photo'].includes(t)) return openDoc(m);
  if (st.path) return openOnDisk({ name: m.name, path: st.path });
  if (m.blob) return saveSmall(m);
  xClick(m);
}
function thumbEl(m, cls) {
  const t = ftype(m), box = el('span', cls + ' ' + t);
  const img = src => { const i = el('img'); i.loading = 'lazy'; i.alt = ''; i.src = src; box.textContent = ''; box.append(i); };
  if (m.th) img(m.th);
  else if (m.kind === 'img' || (m.blob && viewable(m))) { box.textContent = FT[t].i; mediaUrl(m).then(u => u && img(u)); }
  else { const ext = (String(m.name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toUpperCase(); box.textContent = FT[t].i; if (ext && !['photo', 'dir'].includes(t)) box.append(el('small', '', ext)); }
  return box;
}
async function fillAll(bar, list, gen) {
  const ms = await allFileMsgs(); if (gen !== fGen) return;
  const Q = fl.q.trim().toLowerCase();
  const base = ms.filter(m => (!fl.who || (fl.who === 'me' ? m.from === myId : m.from === fl.who)) && (!Q || [fileNameOf(m), whoName(m), chatTitle(m.chat), m.ex || ''].join(' ').toLowerCase().includes(Q)));
  const cnt = {}; for (const m of base) cnt[ftype(m)] = (cnt[ftype(m)] || 0) + 1;
  // строка фильтров: поиск, кто, сортировка, группировка, вид
  const q = el('input', 'fq'); q.type = 'search'; q.placeholder = 'Поиск: имя файла, человек, чат, камера…'; q.value = fl.q;
  q.oninput = () => { fl.q = q.value; fl.shown = 150; clearTimeout(q.t); q.t = setTimeout(renderFiles, 200); };
  const sel = (opts, val, set) => { const s = el('select', 'fsort'); for (const [v, t] of opts) { const o = el('option', '', t); o.value = v; o.selected = v === val; s.append(o); } s.onchange = () => { set(s.value); fl.shown = 150; fKeepTop = true; renderFiles(); }; return s; };
  const people = [...new Set(ms.filter(m => m.from !== myId).map(m => m.from))].map(u => [u, nameOf(u)]).sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  const viewBtn = el('button', 'btn fview', fl.view === 'grid' ? '☰ Список' : '▦ Плитка'); viewBtn.onclick = () => { fl.view = fl.view === 'grid' ? 'list' : 'grid'; store.set('flView', fl.view); renderFiles(); };
  const row = el('div', 'frowbar');
  row.append(q,
    sel([['', 'Все люди'], ['me', 'Только мои'], ...people], fl.who, v => { fl.who = v; }),
    sel([['date', 'Сначала новые'], ['old', 'Сначала старые'], ['name', 'По имени'], ['size', 'Сначала большие'], ['type', 'По типу']], fl.sort, v => { fl.sort = v; store.set('flSort', v); }),
    sel([['none', 'Без групп'], ['type', 'Группы: тип'], ['person', 'Группы: человек'], ['chat', 'Группы: чат'], ['month', 'Группы: месяц']], fl.group, v => { fl.group = v; store.set('flGroup', v); }),
    viewBtn);
  const chips = el('div', 'fchips');
  const chip = (k, t) => { const b = el('button', 'fchip' + (fl.type === k ? ' on' : ''), t); b.onclick = () => { fl.type = k; store.set('flType', k); fl.shown = 150; fKeepTop = true; renderFiles(); }; chips.append(b); };
  chip('all', 'Все · ' + base.length);
  for (const [k, t, i] of FTYPES) if (cnt[k] || fl.type === k) chip(k, i + ' ' + t + ' · ' + (cnt[k] || 0));
  bar.append(row, chips);
  let items = fl.type === 'all' ? base : base.filter(m => ftype(m) === fl.type);
  const size = m => m.size || 0, nm = m => fileNameOf(m).toLowerCase();
  const cmp = { date: (a, b) => b.ts - a.ts, old: (a, b) => a.ts - b.ts, name: (a, b) => nm(a).localeCompare(nm(b), 'ru', { numeric: true }), size: (a, b) => size(b) - size(a), type: (a, b) => FTYPES.findIndex(x => x[0] === ftype(a)) - FTYPES.findIndex(x => x[0] === ftype(b)) || b.ts - a.ts }[fl.sort] || ((a, b) => b.ts - a.ts);
  items.sort(cmp);
  const total = items.reduce((s, m) => s + size(m), 0), onDisk = items.filter(m => fileState(m).k === 'disk').length;
  bar.append(el('p', 'fhint', items.length ? plural(items.length, 'файл', 'файла', 'файлов').replace(/^/, items.length + ' ') + ' · ' + fmtSize(total) + (DISK ? ' · на диске ' + onDisk : '') + (DISK && S.routing.auto ? ' · новые раскладываются по маршрутам сами' : '') : ''));
  if (!items.length) { list.append(Q || fl.who || fl.type !== 'all' ? emptyEl('🔍', 'Ничего не нашлось', 'Попробуй убрать фильтры или поискать по-другому.') : emptyEl('🗂', 'Файлов пока нет', 'Здесь будут все файлы и фото из всех чатов — и твои, и присланные, любого размера.')); return; }
  // группы
  const key = { type: m => FT[ftype(m)].i + ' ' + FT[ftype(m)].t, person: m => whoName(m), chat: m => chatTitle(m.chat), month: m => fMonth(m.ts) }[fl.group];
  const groups = new Map(); for (const m of items.slice(0, fl.shown)) { const k = key ? key(m) : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
  for (const [k, gm] of groups) {
    if (k) list.append(el('h3', '', k + ' · ' + gm.length));
    const box = fl.view === 'grid' ? el('div', 'fgrid') : list;
    for (const m of gm) box.append(fl.view === 'grid' ? libTile(m) : libRow(m));
    if (box !== list) list.append(box);
  }
  if (items.length > fl.shown) { const more = el('button', 'btn fmore', 'Показать ещё ' + Math.min(300, items.length - fl.shown) + ' из ' + (items.length - fl.shown)); more.onclick = () => { fl.shown += 300; renderFiles(); }; list.append(more); }
}
// ---------- перетаскивание файлов из списка ----------
// Взял файл левой кнопкой и потащил — это настоящий перенос Windows: можно бросить в чат, в зал, на рабочий стол, в проводник, в другую программу.
// Пока тащишь: если вывел за рамки боковой панели в зале — панель закрывается, чтобы открыть то, что за ней; если завис над кнопкой или чатом
// (например, «← Чаты», потом нужный чат) — он подсвечивается и через полсекунды открывается, не отпуская файл.
const dnd = {
  on: false, last: 0, spring: null, springT: 0, outT: 0,
  begin() { this.on = true; this.last = Date.now(); document.documentElement.classList.add('dnd'); },
  end() { this.on = false; clearTimeout(this.springT); clearTimeout(this.outT); this.outT = 0; this.spring?.classList.remove('dnd-hot'); this.spring = null; document.documentElement.classList.remove('dnd'); }
};
const SPRING_SEL = 'button, [role="button"], .ci, .ftab, .fchip, .mu-mode, .mu-tile';
const SPRING_NO = /выйти|удалить|убрать|стереть|очистить|отвязать|закончить|остановить|отмена|не сейчас|отправить|заменить|в корзину/i;
const CANCEL_BTN = /^(отмена|закрыть|назад|✕)$/i;
function springOk(b) {
  if (!b || b.disabled) return false;
  // в открытых окнах (оформление, настройки…) можно навести на «Отмена»/«Закрыть» — окно закроется, ничего не меняя; остальные кнопки окон не нажимаются
  if (b.closest('.mx-modal')) return CANCEL_BTN.test((b.textContent || '').trim()) || /^(отмена|закрыть)$/i.test((b.title || '').trim());
  if (b.closest('.menu, .mx-pop, .mx-files, #rDrawer')) return false;   // внутри самой «Музыки» и «Файлов» не переключаем
  if (b.classList.contains('danger') || b.id === 'leaveBtn') return false;
  return !SPRING_NO.test((b.textContent || '') + ' ' + (b.title || ''));
}
document.addEventListener('dragover', e => {
  if (!dnd.on) return; dnd.last = Date.now();
  if (panelW) {   // вынес за рамки панели — закрываем её
    const dr = document.getElementById('rDrawer');
    if (dr && !dr.classList.contains('full')) {
      const r = dr.getBoundingClientRect(), out = e.clientX < r.left - 6 || e.clientX > r.right + 6 || e.clientY < r.top - 6 || e.clientY > r.bottom + 6;
      if (out) { if (!dnd.outT) dnd.outT = setTimeout(() => { dnd.outT = 0; closePanel(); }, 140); } else if (dnd.outT) { clearTimeout(dnd.outT); dnd.outT = 0; }
    }
  }
  // фон вокруг открытого окна (например, «Кинозал: создать / войти») — «назад»: зависнуть над ним, и окно закроется, как от щелчка мимо
  const t = e.target, back = t?.classList?.contains('mx-modal') && !t.classList.contains('ring') && !t.classList.contains('out') ? t : null;
  const b = e.target.closest?.(SPRING_SEL), ok = back || (b && springOk(b) ? b : null);
  if (ok !== dnd.spring) {
    clearTimeout(dnd.springT); dnd.spring?.classList.remove('dnd-hot'); dnd.spring = ok;
    if (ok) { ok.classList.add('dnd-hot'); dnd.springT = setTimeout(() => { const x = dnd.spring; dnd.spring = null; x?.classList.remove('dnd-hot'); if (x?.classList.contains('mx-modal')) x.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); else x?.click(); }, 650); }
  }
});
document.addEventListener('drop', () => { if (dnd.on) setTimeout(() => dnd.end(), 0); });
document.addEventListener('dragend', () => dnd.end());
setInterval(() => { if (dnd.on && Date.now() - dnd.last > 1200) dnd.end(); }, 400);
// Windows начинает перенос только при зажатой кнопке мыши; если кнопку уже отпустили, пока готовился файл, переносить нечего (иначе программа зависла бы в ожидании)
let mouseDown = false;
document.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; }, true);
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; }, true);
window.addEventListener('blur', () => { mouseDown = false; });
function dragOut(e, getPath) {
  if (!DESK || !APP?.files?.dragOut || e.defaultPrevented) return;   // defaultPrevented — вложенный элемент уже взялся тащить
  e.preventDefault(); dnd.begin();
  Promise.resolve().then(getPath).then(p => {
    if (!p) { dnd.end(); toast('Этот файл ещё не на диске — нечего перетаскивать'); return; }
    if (!mouseDown) { dnd.end(); return; }
    if (!window.__kzNoNativeDrag) APP.files.dragOut(p);   // __kzNoNativeDrag — только для проверки без мыши
  }).catch(() => dnd.end());
}
const dragPathOfMsg = async m => {
  const st = fileState(m); if (st.path && st.k === 'disk') return st.path;
  if (isMineSrc(m) && S.src[m.id]) return S.src[m.id];
  const b = m.blob ? await blobGet(m.id) : null; if (!b) return '';
  return APP.files.dragTemp(fileNameOf(m), new Uint8Array(await b.arrayBuffer()));   // небольшой файл из переписки — во временную папку
};
const dragify = (r, getPath) => { if (!DESK) return r; r.draggable = true; r.addEventListener('dragstart', e => dragOut(e, getPath)); return r; };
function libRow(m) {
  const r = el('div', 'frow file lib'), st = fileState(m), t = el('div', 't'), acts = el('div', 'facts');
  t.append(el('b', '', fileNameOf(m)));
  const info = [FT[ftype(m)].t, m.size ? fmtSize(m.size) : '', m.dir ? nFiles(m.n || 0) : '', (m.from === myId ? 'ты → ' + chatTitle(m.chat) : nameOf(m.from) + (isDm(m.chat) ? '' : ' · ' + chatTitle(m.chat))), fDate(m.ts)].filter(Boolean);
  t.append(el('span', '', info.join(' · ')));
  if (m.ex) t.append(el('span', 'ex', m.ex));
  if (st.t) { const s = el('span', 'fst ' + st.k, st.t + (st.path && st.k === 'disk' && DESK ? ' · ' + st.path.split(/[\\/]/).slice(-3, -1).join('\\') : st.k === 'disk' && ANDROID ? ' · Загрузки/Кинозал' : '')); s.title = st.path || ''; t.append(s); }
  for (const [txt, f] of fActions(m).slice(1)) acts.append(lnk(txt, f));
  r.append(thumbEl(m, 'fic'), t, acts);
  r.onclick = e => { if (!e.target.closest('button')) openAny(m); };
  return dragify(r, () => dragPathOfMsg(m));
}
function libTile(m) {
  const r = el('div', 'ftile'), st = fileState(m), more = el('button', 'ib fmorebtn', '⋯');
  more.title = 'Действия'; more.onclick = e => {
    e.stopPropagation(); closeMenus(); menuAt = Date.now();
    const mn = el('div', 'menu mx-pop'), rc = more.getBoundingClientRect();
    Object.assign(mn.style, { position: 'fixed', left: Math.min(innerWidth - 240, rc.left) + 'px', top: Math.min(innerHeight - 280, rc.bottom + 4) + 'px', width: '230px', zIndex: 50 });
    for (const [txt, f] of fActions(m)) { const b = el('button', '', txt); b.onclick = () => { closeMenus(); f(); }; mn.append(b); }
    document.body.append(mn); mn.addEventListener('click', ev => ev.stopPropagation());
  };
  const cap = el('div', 'cap'); cap.append(el('b', '', fileNameOf(m)), el('span', '', [m.size ? fmtSize(m.size) : '', whoName(m), st.k === 'remote' && m.big ? '☁ не скачано' : ''].filter(Boolean).join(' · ')));
  r.append(thumbEl(m, 'fpic'), cap, more); r.title = fileNameOf(m);
  r.onclick = () => openAny(m);
  return dragify(r, () => dragPathOfMsg(m));
}

// --- настройка маршрутов ---
function fillRoutes(bar, list) {
  const R = S.routing, ch = () => { save(); renderFiles(); };
  const auto = el('label', 'switch'), ac = el('input'); ac.type = 'checkbox'; ac.checked = R.auto;
  auto.append(document.createTextNode('Сохранять полученное само, по маршрутам'), ac); ac.onchange = () => { R.auto = ac.checked; ch(); };
  const big = el('select', 'fsort');
  for (const [v, t] of [[0, 'большие — только по кнопке'], [500, 'большие — сами до 500 МБ'], [2048, 'большие — сами до 2 ГБ'], [10240, 'большие — сами до 10 ГБ'], [1e6, 'большие — сами, любого размера']]) { const o = el('option', '', t); o.value = v; o.selected = +R.bigMax === v; big.append(o); }
  big.onchange = () => { R.bigMax = +big.value; ch(); }; big.disabled = !R.auto;
  const row = el('div', 'frowbar'); row.append(auto, big);
  bar.append(row, el('p', 'fhint', (ANDROID ? 'На телефоне всё складывается в «Загрузки/Кинозал», по подпапкам. ' : '') + 'Правила проверяются сверху вниз — решает первое подходящее. Программы (.exe и подобные) и капсулы времени сами не сохраняются. Удобно: RAW — в папку для фото, документы — по людям, всё остальное — в «Полученные».'));
  // быстрые заготовки
  const presets = el('div', 'fchips');
  const preset = (t, rule) => { const b = el('button', 'fchip', '+ ' + t); b.onclick = async () => { const dest = APP.files.pickRoot ? await APP.files.pickRoot() : ''; if (APP.files.pickRoot && !dest) return; R.rules.push({ id: uid(), on: true, dest, ...rule }); ch(); }; presets.append(b); };
  preset('RAW — в свою папку', { types: ['raw'], who: '', sub: 'month' });
  preset('Фото и видео по месяцам', { types: ['photo', 'video'], who: '', sub: 'month' });
  preset('Документы по людям', { types: ['pdf', 'doc', 'sheet', 'text'], who: '', sub: 'person' });
  preset('Сборки и архивы', { types: ['arc', 'dir'], who: '', sub: 'person' });
  const addBtn = el('button', 'fchip', '+ Свой маршрут'); addBtn.onclick = () => { R.rules.push({ id: uid(), on: true, types: [], who: '', dest: '', sub: 'person' }); ch(); }; presets.append(addBtn);
  bar.append(presets);
  // сами правила
  const whoOpts = [['', 'от кого угодно'], ...Object.values(S.contacts).filter(c => c.state !== 'blocked' && c.id !== myId).map(c => [c.id, 'от ' + nameOf(c.id)]), ...Object.values(S.groups).filter(g => !g.gone).map(g => [g.id, 'в группе «' + g.name + '»'])];
  R.rules.forEach((r, i) => {
    const c = el('div', 'frow route' + (r.on === false ? ' off' : '')), top = el('div', 'rtop');
    const on = el('input'); on.type = 'checkbox'; on.checked = r.on !== false; on.title = 'Включён'; on.onchange = () => { r.on = on.checked; ch(); };
    top.append(on, el('b', '', (i + 1) + '. ' + (r.types?.length ? r.types.map(t => FT[t].t).join(', ') : 'Любые файлы')));
    const mv = (d, t) => lnk(t, () => { const j = i + d; if (j < 0 || j >= R.rules.length) return; [R.rules[i], R.rules[j]] = [R.rules[j], R.rules[i]]; ch(); });
    top.append(el('span', 'grow'), mv(-1, '↑'), mv(1, '↓'), lnk('🗑', () => { R.rules.splice(i, 1); ch(); }, 'del'));
    const types = el('div', 'fchips sm');
    for (const [k, t, ic] of FTYPES) { const b = el('button', 'fchip' + (r.types?.includes(k) ? ' on' : ''), ic + ' ' + t); b.onclick = () => { r.types = r.types?.includes(k) ? r.types.filter(x => x !== k) : [...(r.types || []), k]; ch(); }; types.append(b); }
    const who = el('select', 'fsort'); for (const [v, t] of whoOpts) { const o = el('option', '', t); o.value = v; o.selected = (r.who || '') === v; who.append(o); } who.onchange = () => { r.who = who.value; ch(); };
    const sub = el('select', 'fsort'); for (const [v, t] of Object.entries(SUBS)) { const o = el('option', '', 'подпапки: ' + t); o.value = v; o.selected = r.sub === v; sub.append(o); } sub.onchange = () => { r.sub = sub.value; ch(); };
    const dest = el('button', 'btn fdest', '📂 ' + (r.dest ? rootName(r.dest) : 'Полученные')); dest.title = r.dest || 'Загрузки → Кинозал → Полученные';
    dest.onclick = async () => { if (!APP.files.pickRoot) { toast('На телефоне всё складывается в «Загрузки/Кинозал» — выбери подпапки справа'); return; } const p = await APP.files.pickRoot(); if (p) { r.dest = p; ch(); } };
    const line = el('div', 'frowbar'); line.append(who, el('span', 'arrow', '→'), dest, sub);
    const ex = { ts: Date.now(), from: r.who && S.contacts[r.who] ? r.who : (Object.keys(S.contacts)[0] || myId), chat: '', kind: 'file', name: 'пример' };
    const segs = { none: [], person: [whoName(ex)], month: [new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')], 'person-month': [whoName(ex), new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')], type: [r.types?.[0] ? FT[r.types[0]].t : 'Фото'] }[r.sub] || [];
    c.append(top, types, line, el('p', 'fhint', 'Например: ' + (ANDROID ? ['Загрузки/Кинозал', ...segs].join('/') : [r.dest || 'Загрузки\\Кинозал\\Полученные', ...segs].join('\\'))));
    list.append(c);
  });
  // всё остальное
  const fb = el('div', 'frow route'), fsub = el('select', 'fsort');
  for (const [v, t] of Object.entries(SUBS)) { const o = el('option', '', 'подпапки: ' + t); o.value = v; o.selected = R.sub === v; fsub.append(o); }
  fsub.onchange = () => { R.sub = fsub.value; ch(); };
  const fl2 = el('div', 'frowbar'); fl2.append(el('b', '', R.rules.length ? 'Всё остальное' : 'Все файлы'), el('span', 'arrow', '→'), DESK ? lnk('📂 Полученные', () => APP.files.dir()) : el('b', '', '📂 Загрузки/Кинозал'), fsub);
  fb.append(fl2); list.append(fb);
  // применить к тому, что уже пришло
  const again = el('button', 'btn', 'Разложить уже полученное по маршрутам');
  again.onclick = async () => {
    const ms = (await allFileMsgs()).filter(m => m.from !== myId && m.blob && !S.dl[m.id] && !RISKY.test(m.name || ''));
    if (!ms.length) { toast('Всё, что пришло в переписке, уже на диске'); return; }
    if (!confirm('Сохранить на диск ' + ms.length + ' ' + plural(ms.length, 'файл', 'файла', 'файлов') + ' из переписки, по маршрутам? Большие файлы, которые ещё не скачаны, останутся как есть.')) return;
    let n = 0; for (const m of ms) if (await autoRoute(m, true)) n++;
    toast('Сохранено: ' + n); renderFiles();
  };
  list.append(again);
}

// --- передачи ---
async function fillLive(bar, list) {
  const seg = el('div', 'seg');
  for (const [v, t] of Object.entries(XMODES)) { const b = el('button', 'btn' + (xMode() === v ? ' on' : ''), t); b.onclick = () => { setXMode(v); renderFiles(); }; seg.append(b); }
  const all = el('div', 'fall');
  all.append(lnk('⏸ всё на паузу', () => { for (const x of [...dls.values()]) xDrop(x, 'pause'); for (const d of Object.values(S.dl)) if (d.st === 'wait') d.st = 'pause'; save(); renderFiles(); }),
    lnk('▶ продолжить всё', async () => { for (const [id, d] of Object.entries(S.dl)) if (['pause', 'err', 'wait'].includes(d.st) && !dls.has(id)) { const m = await msgGet(id); if (m) xStart(m); } setTimeout(renderFiles, 300); }));
  bar.append(seg, all);
  bar.append(el('p', 'fhint', xSoft() ? '🐢 Сейчас щадящий: отдача до ' + fmtRate(xLim('xup')) + ', скачивание до ' + fmtRate(xLim('xdown')) + ' — лимиты в профиле.' : '⚡ Сейчас без ограничений.' + (xMode() === 'auto' ? ' В звонке или зале Кинозала станет щадящим.' : '')));
  const { rx, tx } = await liveItems();
  if (!rx.length && !tx.length) { list.append(emptyEl('📭', 'Сейчас ничего не передаётся', 'Большие файлы и папки, которые качаешь или отдаёшь, появятся здесь — из всех чатов сразу. Отправить: скрепка в чате или перетащи файл в окно.')); return; }
  if (rx.length) { list.append(el('h3', '', 'Качаю')); for (const m of rx.sort((a, b) => b.ts - a.ts)) list.append(msgRow(m)); }
  if (tx.length) { list.append(el('h3', '', 'Отдаю')); for (const m of tx) list.append(msgRow(m)); }
}
// пока раздел открыт на «Передачах» — следим, не началось ли или не закончилось что-то
let liveKey = '';
setInterval(async () => {
  const n = liveCount(), b = $('#mxFiles b'); if (b) { b.textContent = n || ''; b.hidden = !n; }
  if (!filesOpen || fTab !== 'live') return;
  const { rx, tx } = await liveItems(), k = rx.map(m => m.id + S.dl[m.id]?.st).join() + '|' + tx.map(m => m.id).join();
  if (k !== liveKey) { liveKey = k; renderFiles(); }
}, 1500);

// --- полученные (только программа для Windows) ---
function recvIndex() {   // путь на диске → сообщение, из которого он пришёл
  const ix = new Map(); for (const [id, d] of Object.entries(S.dl)) if (d.st === 'done' && d.path) ix.set(d.path.toLowerCase(), id); return ix;
}
async function fillRecv(bar, list, gen) {
  const q = el('input', 'fq'); q.type = 'search'; q.placeholder = 'Поиск по полученному'; q.value = fQ;
  q.oninput = () => { fQ = q.value; clearTimeout(q.t); q.t = setTimeout(renderFiles, 250); };
  const sort = el('select', 'fsort');
  for (const [v, t] of [['date', 'Сначала новые'], ['name', 'По имени'], ['size', 'По размеру']]) { const o = el('option', '', t); o.value = v; o.selected = fSort === v; sort.append(o); }
  sort.onchange = () => { fSort = sort.value; store.set('fSort', fSort); renderFiles(); };
  const row = el('div', 'frowbar'); row.append(q, sort, lnk('📂 в проводнике', () => fPath ? APP.files.show(fPath) : APP.files.dir()));
  bar.append(row);
  let r, items, rootsList = null;
  try {
    const roots = await APP.files.roots();
    if (fQ.trim()) { items = await APP.files.search(fQ.trim()); r = null; }
    else if (!fPath && roots.length > 1) {   // несколько папок маршрутов — сначала сами папки
      rootsList = roots; items = [];
      for (const x of roots) { const l = await APP.files.list(x.path).catch(() => null); items.push({ name: x.def ? 'Полученные (по умолчанию)' : x.path.split(/[\\/]/).filter(Boolean).pop() || x.path, path: x.path, dir: true, size: l ? l.items.reduce((a, b) => a + (b.size || 0), 0) : 0, count: l ? l.items.length : 0, mtime: 0, where: x.path, root: true }); }
    } else { r = await APP.files.list(fPath); items = r.items; }
  } catch (e) { list.append(emptyEl('⚠️', 'Не получилось прочитать папку', errText(e))); return; }
  if (gen !== fGen) return;
  // хлебные крошки: Папки › корень › папка › папка
  if (r) {
    const crumbs = el('div', 'fcrumbs'), rel = r.path.slice(r.root.length).split(/[\\/]/).filter(Boolean);
    const step = (t, p) => crumbs.append(lnk(t, () => { fPath = p; renderFiles(); }));
    step('Папки', ''); crumbs.append(el('span', '', '›')); step(r.root.split(/[\\/]/).filter(Boolean).pop() || r.root, r.root); let acc = r.root;
    for (const s of rel) { acc += '\\' + s; crumbs.append(el('span', '', '›')); step(s, acc); }
    bar.append(crumbs);
  } else bar.append(el('div', 'fcrumbs', rootsList ? 'Папки, куда маршруты складывают файлы' : 'Найдено: ' + items.length + (items.length >= 300 ? '+' : '')));
  const cmp = { date: (a, b) => b.mtime - a.mtime, name: (a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }), size: (a, b) => b.size - a.size }[fSort];
  items.sort((a, b) => (b.dir - a.dir) * (fSort === 'name' ? 1 : 0) || cmp(a, b));
  if (!items.length) {
    list.append(fQ.trim() ? emptyEl('🔍', 'Ничего не нашлось', 'Ищу по именам файлов и папок во всех полученных.') : emptyEl('📥', fPath ? 'Папка пуста' : 'Пока ничего не получено', 'Сюда попадает всё, что скачано из чатов: большие файлы, папки целиком, а ещё файлы из переписки после «сохранить».'));
    return;
  }
  const ix = recvIndex(), msgs = new Map();
  for (const it of items) { const id = ix.get(it.path.toLowerCase()); if (id && !msgs.has(id)) msgs.set(id, await msgGet(id)); }
  for (const it of items) list.append(recvRow(it, msgs.get(ix.get(it.path.toLowerCase()))));
}
// картинка или RAW из «Полученных»: если знаем сообщение — как из чата, иначе прямо с диска
async function viewFile(it, m, k) {
  if (m && m.kind === 'file' && !m.dir) return openOriginal(m);
  if (HEAVY.test(it.name) && window.kzView) { const src = await diskSource(it.path); if (src && await viewHeavy(it.name, it.size, src, null, it.path)) return; }
  const fake = { id: '', name: it.name, size: it.size };
  if (k === 'raw') { const r = await APP.files.rawPreview(it.path).catch(() => null); if (!r) { toast('В этом RAW нет встроенной картинки — открой его в своей программе для RAW'); return; } viewer({ src: URL.createObjectURL(new Blob([r.jpeg], { type: 'image/jpeg' })), own: true, orient: r.orient, raw: true, ex: r.ex, m: fake, path: it.path }); }
  else viewer({ src: fileUrl(it.path), m: fake, path: it.path });
}
function recvRow(it, m) {
  const r = el('div', 'frow file'), k = it.dir ? 'dir' : fKind(it.name);
  const ic = el('span', 'fic ' + k, FICON[k]), t = el('div', 't'), acts = el('div', 'facts');
  t.append(el('b', '', it.name));
  const info = [it.dir ? (it.approx ? '≈ ' : '') + fmtSize(it.size) + ' · ' + it.count + ' ' + plural(it.count, 'объект', 'объекта', 'объектов') : fmtSize(it.size), it.mtime ? fDate(it.mtime) : ''].filter(Boolean);
  if (it.where) info.push(it.root ? it.where : 'в «' + it.where + '»');
  if (m) info.push('от ' + (m.from === myId ? 'тебя' : nameOf(m.from)) + (isDm(m.chat) ? '' : ' · ' + chatTitle(m.chat)));
  t.append(el('span', '', info.join(' · ')));
  if (k === 'img' || m?.th) { const th = el('img', 'fthumb'); th.loading = 'lazy'; th.src = m?.th || fileUrl(it.path); th.alt = ''; ic.textContent = ''; ic.append(th); }
  if (k === 'raw' && m?.ex) info.push(m.ex), t.lastChild.textContent = info.join(' · ');
  const open1 = () => it.dir ? (fQ = '', fPath = it.path, renderFiles()) : k === 'img' || k === 'raw' || HEAVY.test(it.name) ? viewFile(it, m, k) : canViewName(it.name) ? openDocPath(it) : ['video', 'audio'].includes(k) ? preview(it, k) : openOnDisk(it);
  acts.append(
    ...(it.dir ? [] : [lnk('Открыть', () => openOnDisk(it))]),
    lnk('В проводнике', () => APP.files.show(it.path)),
    lnk('Переслать', () => pickChat('Кому переслать «' + it.name + '»?', c => fwdPath(c, it, m))),
    ...(m ? [lnk('К сообщению', async () => { filesOpen = false; await openChat(m.chat); jumpTo(m.id); })] : []),
    ...(it.root ? [] : [lnk('🗑', async () => { if (!confirm('Убрать «' + it.name + '» в корзину?' + (it.dir ? ' Вместе со всем, что внутри.' : '') + ' Достать можно будет из корзины Windows.')) return; if (await APP.files.trash(it.path).catch(() => false)) toast('«' + it.name + '» в корзине'); else toast('Не получилось удалить'); renderFiles(); }, 'del')]));
  r.append(ic, t, acts); r.onclick = e => { if (!e.target.closest('button')) open1(); };
  r.title = it.dir ? 'Открыть папку' : ['img', 'video', 'audio'].includes(k) ? 'Посмотреть' : 'Открыть';
  return dragify(r, () => it.path);
}
async function openOnDisk(it) {
  if (RISKY.test(it.name) && !confirm('«' + it.name + '» — программа или скрипт. Запускай, только если доверяешь тому, кто прислал. Запустить?')) return;
  const e = await APP.files.openPath(it.path); if (e) toast('Не открылось: ' + e);
}
function preview(it, k) {
  modal((card, close) => {
    card.classList.add('fprev');
    const m = k === 'img' ? el('img') : el(k === 'video' ? 'video' : 'audio');
    m.src = fileUrl(it.path); if (k !== 'img') { m.controls = true; m.autoplay = true; }
    m.onerror = () => m.replaceWith(el('p', 'fhint', 'Кинозал не умеет показывать такой формат — нажми «Открыть», и он откроется в программе Windows.'));
    const row = el('div', 'row'); row.append(btnEl('В проводнике', '', () => APP.files.show(it.path)), btnEl('Открыть', '', () => { openOnDisk(it); close(); }), btnEl('Закрыть', 'pri', close));
    card.append(el('h2', '', it.name), m, row);
  }, 'wide');
}

// --- переслать: выбрать чат ---
function pickChat(title, cb) {
  modal((card, close) => {
    const q = el('input'); q.type = 'text'; q.placeholder = 'Поиск'; const box = el('div', 'fpick');
    const paint = () => {
      box.textContent = '';
      const cs = myChats().filter(c => !q.value.trim() || chatTitle(c).toLowerCase().includes(q.value.trim().toLowerCase())).sort((a, b) => (S.chats[b]?.last?.ts || 0) - (S.chats[a]?.last?.ts || 0));
      for (const c of cs.slice(0, 50)) { const b = el('button', 'fpc'); b.append(avEl(c, 36), el('span', '', chatTitle(c))); b.onclick = () => { close(); cb(c); }; box.append(b); }
      if (!cs.length) box.append(el('p', '', 'Нет таких чатов'));
    };
    q.oninput = paint; paint();
    card.append(el('h2', '', title), q, box, btnEl('Отмена', '', close));
  });
}
// переслать полученное с диска: папку — как папку, большое — напрямую, небольшое — прямо в переписку
async function fwdPath(c, it, src) {   // src — сообщение, из которого файл пришёл: превью берём оттуда
  const meta = src ? { th: src.th, w: src.w, h: src.h, ex: src.ex, dur: src.dur } : {};
  try {
    if (it.dir) await sendDir(c, it.path);
    else if (it.size <= LIMIT) {
      if (!await APP.files.add(it.path)) throw new Error('файл недоступен');
      const parts = []; for (let o = 0; o < it.size; o += 8 << 20) parts.push(await APP.files.read(it.path, o, Math.min(8 << 20, it.size - o)));
      await post(c, { kind: 'file', name: fileName(it.name), size: it.size, mime: src?.mime, ...meta }, new Blob(parts, { type: src?.mime || 'application/octet-stream' }));
      toast('Отправлено в «' + chatTitle(c) + '»');
    } else await sendPathBig(c, it.path, it.name, it.size, meta);
  } catch (e) { toast('Не получилось переслать: ' + errText(e)); return; }
  filesOpen = false; openChat(c);
}
async function fwdSent(c, m) {
  const p = S.src[m.id], f = srcMem.get(m.id);
  const meta = { th: m.th, w: m.w, h: m.h, ex: m.ex, dur: m.dur };
  if (m.dir) await sendDir(c, p); else if (f) await sendBig(c, f, meta); else if (p) await sendPathBig(c, p, m.name, m.size, meta, m.mime);
  filesOpen = false; openChat(c);
}
async function sendPathBig(c, p, name, size, meta, mime) {
  if (!await APP.files.add(p)) throw new Error('файл недоступен');
  const id = uid(); S.src[id] = p; save();
  await post(c, { id, kind: 'file', big: 1, dev: myDev || '', name: fileName(name), size, mime: mime || 'application/octet-stream', ...(meta || {}) });
  toast('«' + name + '» скачают напрямую с этого компьютера, пока Кинозал открыт');
}
const sendAny =(c, files) => { files = [...files]; const im = files.filter(f => /^image\/(png|jpeg|webp|gif|bmp)$/.test(f.type)); const ot = files.filter(f => !im.includes(f)); if (im.length) askImages(c, im); if (ot.length) sendFiles(c, ot); };
// приглашение в звонок / кинозал
function callEl(m) {
  const w = el('div', 'callcard'); w.dataset.code = m.code;
  const cine = m.room === 'cinema';
  const ic = el('span', 'ic', cine ? '🎬' : '📞'), t = el('div', 't');
  const here = window.kzRoom?.inRoom && window.kzRoom.code === m.code;
  const ended = !here && (S.ended[m.code] || Date.now() - m.ts > 6 * 3600e3 || (m.from === myId && myCall?.code !== m.code && Date.now() - m.ts > 15000));
  t.append(el('b', '', cine ? 'Кинозал' : 'Видеозвонок'), el('span', '', ended ? 'завершён' : m.from === myId ? 'ты зовёшь' : 'зовут присоединиться'));
  w.append(ic, t);
  if (!ended) {
    const b = el('button', 'btn', here ? 'Вернуться' : 'Войти'); b.onclick = () => here ? window.kzRoom.show() : joinCall(m);
    w.append(b);
  }
  return w;
}
function refreshCallCards() { document.querySelectorAll('.callcard').forEach(w => { const m = shown.find(x => x.code === w.dataset.code && x.kind === 'call'); if (m) w.replaceWith(callEl(m)); }); }

// ---------- поле ввода, фото, голосовые и кружочки ----------
let recMode = store.get('mxRec', 'voice') === 'circle' ? 'circle' : 'voice';
function setupInput(sec, c) {
  const ta = $('textarea', sec), btn = $('.rec-btn', sec), hint = $('.rec-hint', sec), file = $('input[type=file]', sec);
  const drafts = setupInput.d ||= {};
  ta.value = drafts[c] || '';
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; };
  const sync = () => {
    const has = !!ta.value.trim();
    btn.innerHTML = has ? IC.send : recMode === 'circle' ? IC.circ : IC.mic;
    btn.title = has ? 'Отправить (Enter)' : recMode === 'circle' ? 'Удерживай — видеосообщение. Клик — переключить на голосовое' : 'Удерживай — голосовое. Клик — переключить на кружочек';
  };
  let lastTyping = 0;
  ta.addEventListener('input', () => {
    drafts[c] = ta.value; fit(); sync();
    if (ta.value && Date.now() - lastTyping > 2500) { lastTyping = Date.now(); sendChat(c, { t: 'typing', chat: c }); }
  });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !TOUCH) { e.preventDefault(); sendText(); } });
  ta.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); sendAny(c, f); } });
  const sendText = () => { const t = ta.value.trim(); if (!t) return; ta.value = ''; drafts[c] = ''; fit(); sync(); post(c, { kind: 'text', text: t.slice(0, 4000) }); };
  $('.clip', sec).onclick = e => {
    e.stopPropagation(); closeMenus(); menuAt = Date.now();
    const r = e.currentTarget.getBoundingClientRect(), mn = el('div', 'menu fabmenu mx-pop');
    Object.assign(mn.style, { position: 'fixed', left: Math.max(8, r.left - 4) + 'px', bottom: innerHeight - r.top + 10 + 'px', top: 'auto', right: 'auto', width: '270px', zIndex: 50 });
    const add = (ic, t, f) => { const b = el('button'); b.append(el('i', '', ic), document.createTextNode(t)); b.onclick = () => { closeMenus(); f(); }; mn.append(b); };
    add('📎', 'Фото или файл', () => file.click());
    if (DESK) add('📁', 'Папка целиком — без архива', () => APP.files.pickDir().then(p => p && sendDir(c, p)));
    add('⏳', 'Капсула времени', () => capsuleDlg(c));
    add('🗓', 'Назначить киносеанс', () => planDlg(c));
    add('👋', 'Постучаться', () => knock(c));
    document.body.append(mn); mn.addEventListener('click', ev => ev.stopPropagation());
  };
  btn.addEventListener('contextmenu', e => e.preventDefault());
  file.onchange = () => { const f = [...file.files]; file.value = ''; if (f.length) sendAny(c, f); };
  // перетащить картинку в чат
  const chat = sec; let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  chat.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); depth++; } });
  chat.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  chat.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); });
  chat.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; sendAny(c, e.dataTransfer.files); });
  // кнопка справа: есть текст — «отправить»; нет — удерживать для записи, клик — сменить голос/кружочек.
  // Пока держишь: вверх — запись без рук, влево — отмена, просто отпустил — отправить.
  // Жест считаем с первого движения, даже если микрофон ещё не открылся (getUserMedia бывает долгим):
  // запись заводится сразу, а «без рук» или «отмена» применятся к ней, как только она начнётся.
  // Движение слушаем на всём окне: на телефоне палец уходит с кнопки, а захват указателя иногда теряется.
  const LOCK = 70, CANCEL = 110;
  let hold = 0, press = null;
  const say = t => { hint.textContent = t; hint.classList.add('on'); clearTimeout(say.h); say.h = setTimeout(() => hint.classList.remove('on'), 1800); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch (e) {} };
  const finish = () => {
    clearTimeout(hold); hold = 0; press = null;
    removeEventListener('pointermove', move, true); removeEventListener('pointerup', release, true); removeEventListener('pointercancel', lost, true);
    btn.classList.remove('hold'); btn.style.removeProperty('--gx'); btn.style.removeProperty('--gy'); gestHide();
  };
  const begin = () => {
    clearTimeout(hold); hold = 0; if (!press || press.on) return;
    press.on = true; btn.classList.add('hold'); gestShow(btn); buzz(10);
    const p = press;
    startRec(c, recMode).then(() => { if (!rec && press === p) finish(); });   // нет микрофона — убираем подсказки
  };
  const lockNow = () => { finish(); buzz(15); if (rec) { rec.locked = true; showRecBar(); } };
  const move = e => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.on) { if (Math.hypot(dx, dy) > 12) begin(); else return; }
    const upw = Math.max(0, -dy), left = Math.max(0, -dx), vert = upw >= left;   // одна ось за раз — куда тянут сильнее
    btn.style.setProperty('--gx', vert ? '0px' : -Math.min(left, CANCEL) + 'px');
    btn.style.setProperty('--gy', vert ? -Math.min(upw, LOCK) + 'px' : '0px');
    gestPaint(vert ? upw / LOCK : 0, vert ? 0 : left / CANCEL, btn.style.getPropertyValue('--gx'), btn.style.getPropertyValue('--gy'));
    if (vert && upw >= LOCK) lockNow();
    else if (!vert && left >= CANCEL) { finish(); buzz(25); stopRec(false); }
  };
  const release = e => {
    if (!press || e.pointerId !== press.id) return;
    const was = press.on; finish();
    if (!was) { recMode = recMode === 'voice' ? 'circle' : 'voice'; store.set('mxRec', recMode); sync(); say(recMode === 'circle' ? 'Кружочек: удерживай кнопку и говори в камеру' : 'Голосовое: удерживай кнопку и говори'); return; }
    if (rec && !rec.locked) stopRec(true);
  };
  // палец «отняла» система (окно разрешения на микрофон, жест браузера) — запись не теряем: дальше без рук
  const lost = e => { if (!press || e.pointerId !== press.id) return; const was = press.on; finish(); if (was && rec) { rec.locked = true; showRecBar(); } };
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0 || ta.value.trim() || press || rec) return;
    e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (er) {}
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
    addEventListener('pointermove', move, true); addEventListener('pointerup', release, true); addEventListener('pointercancel', lost, true);
    hold = setTimeout(begin, 230);
  });
  btn.addEventListener('click', () => { if (ta.value.trim()) sendText(); });
  fit(); sync();
}
// фото: уменьшаем до 1600 px, WebP; GIF — как есть
async function sendImages(c, files) {
  for (const f of [...files].filter(x => /^image\//.test(x.type))) {
    try {
      if (f.type === 'image/gif' && f.size <= 6e6) { const bm = await createImageBitmap(f).catch(() => null); await post(c, { kind: 'img', w: bm?.width, h: bm?.height }, f); continue; }
      const bm = await createImageBitmap(f); const k = Math.min(1, 1600 / Math.max(bm.width, bm.height));
      const cv = el('canvas'); cv.width = Math.max(1, Math.round(bm.width * k)); cv.height = Math.max(1, Math.round(bm.height * k));
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height); bm.close?.();
      let b = await new Promise(r => cv.toBlob(r, 'image/webp', .86)); if (!b || b.type !== 'image/webp') b = await new Promise(r => cv.toBlob(r, 'image/jpeg', .86));
      if (!b || b.size > LIMIT) { toast('Картинка слишком большая'); continue; }
      await post(c, { kind: 'img', w: cv.width, h: cv.height }, b);
    } catch (e) { toast('Не получилось открыть «' + f.name + '»'); }
  }
}
let rec = null;
async function startRec(c, kind) {
  if (rec) return;
  const r = rec = { c, kind, chunks: [], levels: [], start: 0, locked: false, cancelled: false };
  const micId = store.get('mic', ''), camId = store.get('cam', '');
  const audio = { echoCancellation: store.get('ec', 'all') === 'voices' ? true : 'all', noiseSuppression: true, autoGainControl: true, ...(micId ? { deviceId: { ideal: micId } } : {}) };
  try {
    r.stream = await navigator.mediaDevices.getUserMedia(kind === 'circle'
      ? { audio, video: { width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: { ideal: 1 }, frameRate: { ideal: 30 }, ...(camId && camId !== 'off' ? { deviceId: { ideal: camId } } : {}) } }
      : { audio });
  } catch (e) {
    if (e?.name === 'TypeError' && audio.echoCancellation === 'all') { audio.echoCancellation = true; rec = null; store.set('ec', 'voices'); return startRec(c, kind); }
    rec = null; toast(kind === 'circle' ? 'Нет доступа к камере или микрофону' + (window.kzRoom?.inRoom ? ' — камера занята звонком' : '') : 'Нет доступа к микрофону'); return;
  }
  if (r.cancelled || rec !== r) { r.stream.getTracks().forEach(t => t.stop()); if (rec === r) rec = null; return; }
  const types = kind === 'circle' ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  r.mr = new MediaRecorder(r.stream, { mimeType: mime, audioBitsPerSecond: kind === 'circle' ? 64000 : 32000, ...(kind === 'circle' ? { videoBitsPerSecond: 900000 } : {}) });
  r.mr.ondataavailable = e => { if (e.data.size) r.chunks.push(e.data); };
  // уровень громкости — для «волны» голосового
  try {
    const ac = r.ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(new MediaStream(r.stream.getAudioTracks())).connect(an);
    const buf = new Float32Array(1024);
    r.lv = setInterval(() => { an.getFloatTimeDomainData(buf); let p = 0; for (const x of buf) p = Math.max(p, Math.abs(x)); r.levels.push(p); paintRec(); }, 80);
  } catch (e) {}
  r.mr.start(500); r.start = performance.now();
  r.max = kind === 'circle' ? 60 : 600;
  r.timer = setInterval(() => { paintRec(); if ((performance.now() - r.start) / 1000 >= r.max) stopRec(true); }, 200);
  showRecBar();   // жест «без рук», сделанный до этой минуты, уже лежит в r.locked
}
// подсказки жеста над кнопкой записи: замок «без рук» (заполняется, пока тянешь вверх) и «отмена» слева
function gestShow(btn) {
  gestHide();
  const r = btn.getBoundingClientRect(), g = el('div', 'rec-gest');
  // копия кнопки — поверх затемнения при записи кружочка (сама кнопка остаётся под ним)
  g.innerHTML = `<div class="lockp"><span class="lk">${IC.lock}</span><span class="ar">${IC.up}</span><span class="tx">без рук</span></div><div class="cancp"><span class="ar">${IC.back}</span>отмена</div><div class="gbtn">${recMode === 'circle' ? IC.circ : IC.mic}</div>`;
  g.classList.toggle('circ', recMode === 'circle');
  g.style.left = r.left + r.width / 2 + 'px'; g.style.top = r.top + r.height / 2 + 'px';
  document.body.append(g);
}
function gestPaint(lp, cp, gx, gy) {
  const g = document.querySelector('.rec-gest'); if (!g) return;
  g.style.setProperty('--lp', Math.min(1, lp).toFixed(3)); g.style.setProperty('--cp', Math.min(1, cp).toFixed(3));
  if (gx) g.style.setProperty('--gx', gx); if (gy) g.style.setProperty('--gy', gy);
  g.classList.toggle('near-lock', lp > .75); g.classList.toggle('near-cancel', cp > .6);
}
function gestHide() { document.querySelectorAll('.rec-gest').forEach(g => g.remove()); }
function showRecBar() {
  const r = rec; if (!r) return;
  if (r.kind === 'circle') { showCircleRec(); return; }
  if (!r.locked && !r.mr) return;   // микрофон ещё открывается — пока хватает подсказок у кнопки
  document.querySelector('.recbar')?.remove();
  const bar = el('div', 'recbar' + (r.locked ? ' locked' : ''));
  bar.innerHTML = `<i class="rd"></i><span class="tm">0:00</span><span class="hint"></span><div class="lv"></div>`;
  bar.querySelector('.hint').textContent = r.locked ? 'запись без рук' : 'отпусти — отправить';
  if (r.locked) {
    const del = el('button', 'ib del'); del.innerHTML = IC.trash; del.title = 'Удалить запись'; del.onclick = () => stopRec(false);
    const snd = el('button', 'send'); snd.innerHTML = IC.send; snd.title = 'Остановить и отправить'; snd.onclick = () => stopRec(true);
    bar.prepend(del); bar.append(snd);
  }
  $('.mx-input')?.append(bar); paintRec();
}
function showCircleRec() {
  const r = rec; if (!r) return;
  let ov = document.querySelector('.circrec');
  if (!ov) {
    ov = el('div', 'circrec');
    ov.innerHTML = `<div class="box"><div class="cv"><video muted playsinline autoplay></video><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg></div><div class="row"><i class="rd" style="width:12px;height:12px;border-radius:50%;background:#ff4b3a"></i><span class="tm">0:00</span><span class="hint" style="color:var(--mute);font-weight:500"></span></div><div class="row act"></div></div>`;
    document.body.append(ov);
  }
  const v = ov.querySelector('video');   // камера могла ещё не открыться — подключим, когда будет
  if (r.stream && !v.srcObject) { v.srcObject = new MediaStream(r.stream.getVideoTracks()); v.play().catch(() => {}); }
  ov.querySelector('.hint').textContent = r.locked ? 'запись без рук' : r.mr ? 'отпусти — отправить' : 'включаю камеру…';
  const act = ov.querySelector('.act'); act.textContent = '';
  if (r.locked) { const no = el('button', 'btn', 'Удалить'); no.onclick = () => stopRec(false); const yes = el('button', 'btn pri', 'Отправить'); yes.onclick = () => stopRec(true); act.append(no, yes); }
  paintRec();
}
function paintRec() {
  const r = rec; if (!r) return;
  const s = r.start ? (performance.now() - r.start) / 1000 : 0;
  document.querySelectorAll('.recbar .tm, .circrec .tm').forEach(t => t.textContent = fmtDur(s) + (r.kind === 'circle' ? ' / 1:00' : ''));
  const lv = document.querySelector('.recbar .lv');
  if (lv) { const n = Math.floor(lv.clientWidth / 5); lv.textContent = ''; for (const x of r.levels.slice(-n)) { const i = el('i'); i.style.height = Math.max(8, Math.min(100, x * 160)) + '%'; lv.append(i); } }
  const ring = document.querySelector('.circrec svg circle'); if (ring) ring.style.strokeDashoffset = 100 - Math.min(100, s / r.max * 100);
}
function stopRec(sendIt) {
  const r = rec; if (!r) return;
  r.cancelled = !sendIt; rec = null;
  document.querySelector('.recbar')?.remove(); document.querySelector('.circrec')?.remove(); gestHide();
  clearInterval(r.timer); clearInterval(r.lv); try { r.ac?.close(); } catch (e) {}
  if (!r.mr) {   // отпустили раньше, чем открылся микрофон
    r.cancelled = true; r.stream?.getTracks().forEach(t => t.stop());
    if (sendIt) toast(r.kind === 'circle' ? 'Камера ещё включалась — удерживай кнопку, пока записываешь' : 'Микрофон ещё включался — удерживай кнопку, пока говоришь');
    return;
  }
  const dur = (performance.now() - r.start) / 1000;
  r.mr.onstop = async () => {
    r.stream.getTracks().forEach(t => t.stop());
    if (!sendIt) return;
    if (dur < 0.7) { toast(r.kind === 'circle' ? 'Удерживай кнопку, чтобы записать кружочек' : 'Удерживай кнопку, пока говоришь'); return; }
    const blob = new Blob(r.chunks, { type: r.mr.mimeType || (r.kind === 'circle' ? 'video/webm' : 'audio/webm') });
    if (blob.size > LIMIT) { toast('Запись слишком длинная'); return; }
    const lv = r.levels, n = 48, wave = [];
    const peak = Math.max(.02, ...lv);
    for (let i = 0; i < n; i++) { const a = lv.slice(Math.floor(i * lv.length / n), Math.max(Math.floor(i * lv.length / n) + 1, Math.floor((i + 1) * lv.length / n))); wave.push(Math.round(Math.max(0, ...a) / peak * 100)); }
    const type = blob.type.split(';')[0] || (r.kind === 'circle' ? 'video/webm' : 'audio/webm');
    await post(r.c, { kind: r.kind, dur: Math.round(dur * 10) / 10, ...(r.kind === 'voice' ? { wave } : {}) }, new Blob([blob], { type }));
  };
  try { r.mr.stop(); } catch (e) {}
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && rec) { e.stopPropagation(); stopRec(false); } }, true);

// ---------- время: «через 2 ч 5 мин», «завтра в 9:00» ----------
function left(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  if (d) return d + ' дн' + (h ? ' ' + h + ' ч' : '');
  if (h) return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  if (m) return m + ' мин' + (m < 5 && s % 60 ? ' ' + s % 60 + ' с' : '');
  return s + ' с';
}
function whenText(ts) {
  const d = new Date(ts), n = new Date(), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(n)) / 864e5);
  const date = diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : diff === -1 ? 'вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return date + ' в ' + hm(ts);
}
const dtLocal = ts => new Date(ts - new Date(ts).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

// ---------- очередь мелочей: реакции и удаления ждут, пока собеседник появится в сети ----------
function sendOrQueue(u, p) { if (send(u, p)) return; const q = (S.outq ||= {})[u] ||= []; q.push(p); if (q.length > 300) q.shift(); save(); dial(u); }
function flushQ(u) { const q = S.outq?.[u]; if (!q?.length) return; delete S.outq[u]; save(); for (const p of q) sendOrQueue(u, p); }

// ---------- реакции ----------
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🍿'];
const cleanEmoji = e => { e = String(e || ''); return e.length <= 16 && /\p{Extended_Pictographic}/u.test(e) ? e : ''; };
const hasRx = m => Object.values(m.rx || {}).some(v => v && v[0]);
async function setReact(m, e) {   // моя реакция; та же ещё раз — снять
  if ((m.rx?.[myId]?.[0] || '') === e) e = '';
  const ts = Date.now(); (m.rx ||= {})[myId] = [e, ts];
  const d = await msgGet(m.id); if (!d) return; d.rx = m.rx; await msgPut(d); paintRx(m);
  for (const u of members(m.chat)) if (u !== myId || hasDevs()) sendOrQueue(u, { t: 'react', id: m.id, chat: m.chat, e, ts });
}
async function onReact(L, d) {
  const u = L.self && d.by ? normId(d.by) : L.uid;   // с моего устройства: чья реакция — в by, без by — моя
  const m = await msgGet(String(d.id || '')); if (!m || !shares(m.chat, u)) return;
  const e = cleanEmoji(d.e), ts = +d.ts || 0; if (ts <= (m.rx?.[u]?.[1] || 0) || ts > Date.now() + 864e5) return;
  (m.rx ||= {})[u] = [e, ts]; await msgPut(m); paintRx(m);
  if (!L.self && hasDevs()) send(myId, { t: 'react', id: m.id, chat: m.chat, e, ts, by: u });
  const viewing = open === m.chat && document.visibilityState === 'visible' && document.hasFocus() && !root.hidden;
  if (e && u !== myId && m.from === myId && Date.now() - ts < 6e4 && !viewing) notify({ chat: m.chat, from: u, kind: 'text', text: e + ' — реакция на твоё сообщение' });
}
function rxEl(m) {
  const w = el('div', 'rx'), by = {};
  for (const [u, v] of Object.entries(m.rx || {})) if (v && v[0]) (by[v[0]] ||= []).push(u);
  for (const [e, us] of Object.entries(by)) {
    const b = el('button', us.includes(myId) ? 'mine' : '', e + (us.length > 1 ? ' ' + us.length : ''));
    b.title = us.map(u => nameOf(u)).join(', '); b.onclick = ev => { ev.stopPropagation(); setReact(m, e); }; w.append(b);
  }
  return w;
}
function paintRx(m) {
  const i = shown.findIndex(x => x.id === m.id); if (i >= 0) { shown[i].rx = m.rx; m = shown[i]; }
  const row = document.querySelector(`.m[data-id="${CSS.escape(m.id)}"]`); if (!row) return;
  row.querySelector('.rx')?.remove();
  row.querySelector('.plancard')?.replaceWith(planEl(m));
  if (hasRx(m)) { const box = $('.mx-msgs'), stick = box && nearBottom(box); row.querySelector('.b').append(rxEl(m)); if (stick) box.scrollTop = box.scrollHeight; }
}

// ---------- удаление: у себя и у всех ----------
function forget(id) { (S.gone ||= {})[id] = Date.now(); const k = Object.keys(S.gone); if (k.length > 3000) delete S.gone[k[0]]; save(); }
async function dropMsg(m) {
  await delMsg(m.id); forget(m.id);
  delete S.plans?.[m.id]; delete S.caps?.[m.id];
  const ch = S.chats[m.chat];
  if (ch?.last?.id === m.id) { const l = (await chatMsgs(m.chat, 1))[0]; ch.last = l ? { ts: l.ts, from: l.from, kind: l.kind, text: l.text || '', id: l.id, room: l.room, name: l.name, open: l.open } : null; }
  save(); renderList();
  if (open === m.chat && shown.some(x => x.id === m.id)) { shown = shown.filter(x => x.id !== m.id); const box = $('.mx-msgs'), top = box?.scrollTop; await renderChat(); const b2 = $('.mx-msgs'); if (b2 && top != null) requestAnimationFrame(() => { b2.scrollTop = top; }); }
}
async function dropForAll(m) {
  if (!confirm('Удалить сообщение у всех?')) return;
  const mem = members(m.chat); await dropMsg(m);
  for (const u of mem) if (u !== myId || hasDevs()) sendOrQueue(u, { t: 'del', id: m.id, chat: m.chat });
}
async function onDel(L, d) {
  const u = L.self && d.by ? normId(d.by) : L.uid;   // с моего устройства: кто удалил — в by, без by — я
  const id = clean(d.id, 60); if (!id) return;
  const m = await msgGet(id), chat = String(d.chat || '');
  if (!m) { if (shares(chat, u)) forget(id); }
  else if (m.from !== u || !shares(m.chat, u)) return;
  else await dropMsg(m);
  if (!L.self && hasDevs()) send(myId, { t: 'del', id, chat, by: u });
}

// ---------- «тук-тук»: окно собеседника вздрагивает ----------
let knockAt = 0; const knocked = new Map();
function knock(c) {
  if (Date.now() - knockAt < 8000) { toast('Не так часто 🙂'); return; }
  let n = 0; for (const u of members(c)) if (u !== myId && send(u, { t: 'knock', chat: c })) n++;
  if (n) knockAt = Date.now();
  toast(n ? '👋 Тук-тук отправлен' : 'Сейчас не в сети — постучаться не получится');
}
function onKnock(u, d) {
  const c = String(d.chat || ''); if (!shares(c, u) || Date.now() - (knocked.get(u) || 0) < 6000) return;
  knocked.set(u, Date.now());
  document.documentElement.classList.add('kz-shake'); setTimeout(() => document.documentElement.classList.remove('kz-shake'), 700);
  try { navigator.vibrate?.([90, 60, 90]); } catch (e) {}
  alertUser(c, '👋 ' + nameOf(u) + ' стучится');
}

// ---------- ответ на сообщение и «капсула времени» ----------
let replyTo = null, capsule = null;   // сообщение, на которое отвечаю; {chat, ts} — когда откроется следующее
const snip = m => ({ id: m.id, from: m.from, kind: m.kind, text: String(m.kind === 'text' ? m.text || '' : lastText(m.chat, m)[1]).slice(0, 140) });
function setReply(m) { replyTo = m; paintPre(); $('.mx-input textarea')?.focus(); }
function paintPre() {
  const inp = $('.mx-input'); if (!inp) return; inp.querySelector('.mx-pre')?.remove();
  const r = replyTo?.chat === open ? replyTo : null, cp = capsule?.chat === open ? capsule : null; if (!r && !cp) return;
  const w = el('div', 'mx-pre');
  const line = (ic, title, text, off) => { const l = el('div', 'pl'), t = el('div'); t.append(el('b', '', title), el('span', '', text)); const x = el('button', 'ib', '✕'); x.title = 'Убрать'; x.onclick = () => { off(); paintPre(); }; l.append(el('i', '', ic), t, x); w.append(l); };
  if (r) line('↩', 'Ответ · ' + nameOf(r.from), snip(r).text || 'Сообщение', () => { replyTo = null; });
  if (cp) line('⏳', 'Капсула времени', 'следующее сообщение откроется ' + whenText(cp.ts), () => { capsule = null; });
  inp.append(w);
}
// перейти к сообщению; если оно выше нарисованного — сначала дорисуем переписку до него
const rowOf = id => document.querySelector(`.mx-msgs .m[data-id="${CSS.escape(id)}"]`);
const countFrom = (c, ts) => tx('msgs', 'readonly', s => s.index('chat').count(IDBKeyRange.bound([c, ts], [c, Infinity])));
async function jumpTo(id, quiet) {
  let row = rowOf(id), far = false;
  if (!row && open && !shownAll) {
    const m = await msgGet(id);
    if (m?.chat === open) { far = true; jumpAt = Date.now(); await showMore(Math.max(0, await countFrom(open, m.ts) - shown.length) + 30); row = rowOf(id); }
  }
  if (!row) { if (!quiet) toast('Это сообщение удалено или его нет на этом устройстве'); return false; }
  jumpAt = Date.now();
  const box = $('.mx-msgs'), dist = Math.abs(row.getBoundingClientRect().top - box.getBoundingClientRect().top);
  row.scrollIntoView({ block: 'center', behavior: far || dist > box.clientHeight * 3 ? 'auto' : 'smooth' });   // далеко — без долгой прокрутки
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); clearTimeout(row._fl); row._fl = setTimeout(() => row.classList.remove('flash'), 1400);
  return true;
}

// ---------- поиск по переписке: в открытом чате (🔍 в шапке, Ctrl+F) и по всем чатам (поле над списком) ----------
const fold = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
function findText(m) {   // в чём ищем: текст, имя файла, название киносеанса; запечатанную капсулу не открываем
  if (m.kind === 'sys' || (m.open > Date.now() && m.from !== myId)) return '';
  return m.kind === 'file' ? m.name || '' : m.text || '';
}
const allMsgs = c => tx('msgs', 'readonly', s => c ? s.index('chat').getAll(IDBKeyRange.bound([c, -Infinity], [c, Infinity])) : s.getAll());
// подсветка найденного прямо в тексте пузыря
function hilite(node, q) {
  if (!q || !node) return;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), list = [];
  while (w.nextNode()) list.push(w.currentNode);
  for (const t of list) {
    const s = t.nodeValue, f = fold(s); if (f.length !== s.length) continue;
    let i = f.indexOf(q); if (i < 0) continue;
    const frag = document.createDocumentFragment(); let at = 0;
    for (; i >= 0; i = f.indexOf(q, at)) { if (i > at) frag.append(s.slice(at, i)); frag.append(el('mark', 'hl', s.slice(i, i + q.length))); at = i + q.length; }
    if (at < s.length) frag.append(s.slice(at));
    t.replaceWith(frag);
  }
}
function unhilite(root) { root?.querySelectorAll('mark.hl').forEach(m => { const p = m.parentNode; m.replaceWith(m.textContent); p.normalize(); }); }
const findQ = () => find?.chat === open ? find.q : '';
let find = null;   // { chat, raw, q, hits: [id] от новых к старым, i }
function openFind(text, at) {
  if (!open) return;
  if (!find || find.chat !== open) find = { chat: open, raw: '', q: '', hits: [], i: -1 };
  const sec = $('.mx-chat'); if (!sec) return;
  const bar = findBar(sec), inp = $('input', bar);
  if (text != null) { inp.value = text; runFind(at); }
  if (text == null || !TOUCH) { inp.focus(); if (text == null) inp.select(); }   // пришли из общего поиска на телефоне — без клавиатуры
}
function findBar(sec) {
  let bar = $('.mx-find', sec); if (bar) return bar;
  bar = el('div', 'mx-find');
  bar.innerHTML = `<label class="fi">${IC.search}<input type="search" placeholder="Поиск в этом чате" autocomplete="off" spellcheck="false"></label><span class="cnt"></span><button class="ib prev" title="Раньше (Enter, ↑)">${IC.up}</button><button class="ib next" title="Позже (Shift+Enter, ↓)">${IC.down}</button><button class="ib close" title="Закрыть (Esc)">${IC.x}</button>`;
  $('.mx-chead', sec).append(bar); sec.classList.add('finding');
  const inp = $('input', bar); inp.value = find?.raw || '';
  inp.addEventListener('input', () => { clearTimeout(find?.t); if (find) find.t = setTimeout(() => runFind(), 160); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
    else if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); clearTimeout(find?.t); stepFind(e.key === 'ArrowDown' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1); }
  });
  $('.prev', bar).onclick = () => stepFind(1); $('.next', bar).onclick = () => stepFind(-1); $('.close', bar).onclick = closeFind;
  paintFind();
  return bar;
}
async function runFind(at) {
  const f = find, inp = $('.mx-find input'); if (!f || !inp) return;
  const raw = inp.value.trim(), q = fold(raw); f.raw = inp.value;
  if (q === f.q && at == null && f.done) return;
  f.q = q; f.done = false;
  const box = $('.mx-msgs'); unhilite(box);
  if (q) box?.querySelectorAll('.m .txt, .m .filecard b').forEach(n => hilite(n, q));
  if (!q) { f.hits = []; f.i = -1; f.done = true; paintFind(); return; }
  const all = await allMsgs(f.chat);
  if (find !== f || f.q !== q) return;
  f.hits = all.filter(m => fold(findText(m)).includes(q)).sort((a, b) => b.ts - a.ts).map(m => m.id);
  f.done = true;
  f.i = at ? Math.max(0, f.hits.indexOf(at)) : f.hits.length ? 0 : -1;
  paintFind(); if (f.i >= 0) goFind();
}
function stepFind(d) {
  const f = find; if (!f) return;
  if (!f.done) { runFind(); return; }
  if (!f.hits.length) return;
  f.i = (f.i + d + f.hits.length) % f.hits.length;   // по кругу: после самого старого — снова самое новое
  paintFind(); goFind();
}
async function goFind() {
  const f = find, id = f?.hits[f.i]; if (!id) return;
  document.querySelectorAll('.mx-msgs .m.found').forEach(r => r.classList.remove('found'));
  await jumpTo(id, true);
  if (find !== f || f.hits[f.i] !== id) return;
  rowOf(id)?.classList.add('found');
}
function paintFind() {
  const bar = $('.mx-find'), f = find; if (!bar || !f) return;
  const cnt = $('.cnt', bar);
  cnt.textContent = !f.q ? '' : !f.done ? '…' : f.hits.length ? (f.i + 1) + ' из ' + f.hits.length : 'не найдено';
  cnt.classList.toggle('none', !!f.q && f.done && !f.hits.length);
  $('.prev', bar).disabled = $('.next', bar).disabled = !f.hits.length;
}
function closeFind() {
  find = null;
  const sec = $('.mx-chat'); $('.mx-find', sec)?.remove(); sec?.classList.remove('finding');
  unhilite($('.mx-msgs')); document.querySelectorAll('.mx-msgs .m.found').forEach(r => r.classList.remove('found'));
  if (!TOUCH) $('.mx-input textarea')?.focus();
}
document.addEventListener('keydown', e => {
  if (root.hidden || document.querySelector('.mx-modal')) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyF' && open) { e.preventDefault(); openFind(); }
  else if (e.key === 'Escape' && find && !document.querySelector('.mx-pop')) closeFind();
});
// по всем чатам: под найденными чатами — «Сообщения»; клик открывает чат на этом месте
let gfind = { q: '', hits: [] };
async function globalFind() {
  const q = fold($('#mxQ').value.trim());
  if (q.length < 2) { if (gfind.q) { gfind = { q: '', hits: [] }; renderList(); } return; }
  const all = await allMsgs();
  if (fold($('#mxQ').value.trim()) !== q) return;
  const ok = c => S.chats[c] && (isDm(c) ? S.contacts[dmPeer(c)]?.state !== 'blocked' : S.groups[c]);
  gfind = { q, hits: all.filter(m => ok(m.chat) && fold(findText(m)).includes(q)).sort((a, b) => b.ts - a.ts).slice(0, 60) };
  renderList();
}
function hitEl(m, q) {
  const it = el('div', 'ci hit'); it.dataset.chat = m.chat; it.dataset.id = m.id;
  const tx = el('div', 'tx'), r1 = el('div', 'r1'), r2 = el('div', 'r2');
  r1.append(el('span', 'nm', chatTitle(m.chat)), el('span', 'tm', listTime(m.ts)));
  const t = findText(m).replace(/\s+/g, ' '), i = fold(t).indexOf(q), from = i > 24 ? i - 18 : 0;
  const ls = el('span', 'ls'), who = m.from === myId ? 'Ты: ' : !isDm(m.chat) ? nameOf(m.from) + ': ' : '';
  if (who) ls.append(el('b', '', who));
  const tt = el('span', '', (from ? '…' : '') + t.slice(from)); hilite(tt, q); ls.append(tt);
  r2.append(ls); tx.append(r1, r2);
  const w = el('div', 'avwrap'); w.append(avEl(m.chat, 44));
  it.append(w, tx);
  it.onclick = async () => { const raw = $('#mxQ').value.trim(); await openChat(m.chat); if (open === m.chat) openFind(raw, m.id); };
  return it;
}
function capsuleEl(m) {
  const w = el('div', 'capsule'); w.dataset.open = m.open;
  const t = el('div'); t.append(el('b', '', 'Капсула времени'), el('span', 'cd', 'откроется через ' + left(m.open - Date.now())), el('small', '', whenText(m.open)));
  w.append(el('span', 'ic', '⏳'), t); return w;
}
function pickTime(card, start, quick) {   // выбор времени: быстрые кнопки + точная дата
  let ts = start;
  const inp = el('input'); inp.type = 'datetime-local'; inp.value = dtLocal(ts); inp.min = dtLocal(Date.now());
  const chips = el('div', 'chips');
  for (const [t, f] of quick) { const b = el('button', 'btn', t); b.type = 'button'; b.onclick = () => { ts = f(); inp.value = dtLocal(ts); }; chips.append(b); }
  inp.oninput = () => { const v = new Date(inp.value).getTime(); if (v) ts = v; };
  card.append(chips, inp);
  return () => ts;
}
const atHour = (h, addDays = 0) => { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, 0, 0, 0); return d.getTime(); };
function capsuleDlg(c) {
  modal((card, close) => {
    card.append(el('h2', '', '⏳ Капсула времени'), el('p', '', 'Выбери, когда она откроется, и отправь следующее сообщение как обычно: текст, фото, голосовое или кружочек. Собеседник увидит запечатанную капсулу с обратным отсчётом — и сможет открыть её только в назначенное время.'));
    const get = pickTime(card, Date.now() + 3600e3, [['Через минуту', () => Date.now() + 6e4], ['Через час', () => Date.now() + 3600e3], ['Завтра в 9:00', () => atHour(9, 1)], ['Через неделю', () => Date.now() + 7 * 864e5], ['Через год', () => Date.now() + 365 * 864e5]]);
    const err = el('div', 'err'), row = el('div', 'row');
    row.append(btnEl('Отмена', '', close), btnEl('Запечатать следующее', 'pri', () => { const ts = get(); if (!(ts > Date.now() + 20000)) { err.textContent = 'Время должно быть в будущем'; return; } capsule = { chat: c, ts }; close(); paintPre(); $('.mx-input textarea')?.focus(); }));
    card.append(err, row);
  });
}

// ---------- киносеанс по расписанию ----------
const planPhase = m => { const n = Date.now(); return n < m.at - 10 * 6e4 ? 'wait' : n < m.at + 3 * 3600e3 ? 'go' : 'past'; };
function planLine(m) { const n = Date.now(); return n < m.at ? whenText(m.at) + ' · через ' + left(m.at - n) : n < m.at + 3 * 3600e3 ? 'пора! начало было в ' + hm(m.at) : whenText(m.at) + ' · прошёл'; }
function planEl(m) {
  const w = el('div', 'plancard'), ph = planPhase(m); w.dataset.id = m.id; w.dataset.phase = ph;
  const t = el('div', 't'); t.append(el('b', '', (m.room === 'call' ? 'Созвон' : 'Киносеанс') + (m.text ? ' · ' + m.text : '')), el('span', 'cd', planLine(m)));
  const top = el('div', 'top'); top.append(el('span', 'ic', m.room === 'call' ? '📞' : '🍿'), t); w.append(top);
  const row = el('div', 'row'), my = m.rx?.[myId]?.[0];
  if (ph !== 'past') { const y = el('button', 'btn' + (my === '👍' ? ' on' : ''), '👍 Буду'); y.onclick = () => setReact(m, '👍'); const n = el('button', 'btn' + (my === '😢' ? ' on' : ''), '😢 Не смогу'); n.onclick = () => setReact(m, '😢'); row.append(y, n); }
  if (ph === 'go') { const b = el('button', 'btn pri', m.room === 'call' ? 'Начать созвон' : 'В кинозал'); b.onclick = () => planGo(m); row.append(b); }
  if (row.children.length) w.append(row);
  return w;
}
function planGo(m) {   // если кто-то уже открыл зал для этого сеанса — заходим к нему, иначе открываем сами
  const live = Object.entries(S.calls || {}).filter(([code, x]) => x.chat === m.chat && !S.ended[code] && x.ts > m.at - 30 * 6e4 && Date.now() - x.ts < 6 * 3600e3).sort((a, b) => b[1].ts - a[1].ts)[0];
  if (window.kzRoom?.inRoom) window.kzRoom.show();
  else if (live && live[1].from !== myId) joinCall({ code: live[0], chat: m.chat });
  else startCall(m.chat, m.room === 'call' ? 'call' : 'cinema');
}
function planDlg(c) {
  modal((card, close) => {
    let room = 'cinema';
    const name = el('input'); name.type = 'text'; name.maxLength = 80; name.placeholder = 'Что смотрим? (необязательно)';
    const sw = el('div', 'chips'), bc = el('button', 'btn on', '🍿 Кино вместе'), bk = el('button', 'btn', '📞 Созвон');
    bc.onclick = () => { room = 'cinema'; bc.classList.add('on'); bk.classList.remove('on'); name.placeholder = 'Что смотрим? (необязательно)'; };
    bk.onclick = () => { room = 'call'; bk.classList.add('on'); bc.classList.remove('on'); name.placeholder = 'О чём созвон? (необязательно)'; };
    sw.append(bc, bk);
    card.append(el('h2', '', '🗓 Назначить сеанс'), el('p', '', 'В чате появится афиша с обратным отсчётом. Все отметят, придут ли, а за 10 минут и в момент начала Кинозал напомнит каждому.'), sw, name);
    const eve = atHour(21) > Date.now() + 15 * 6e4 ? atHour(21) : atHour(21, 1);
    const get = pickTime(card, eve, [['Через 15 минут', () => Date.now() + 15 * 6e4], ['Через час', () => Date.now() + 3600e3], ['Сегодня в 21:00', () => atHour(21)], ['Завтра в 20:00', () => atHour(20, 1)]]);
    const err = el('div', 'err'), row = el('div', 'row');
    row.append(btnEl('Отмена', '', close), btnEl('Назначить', 'pri', () => { const at = get(); if (!(at > Date.now())) { err.textContent = 'Время должно быть в будущем'; return; } close(); post(c, { kind: 'plan', at, room, text: clean(name.value, 80) }); }));
    card.append(err, row);
  });
}
// обратный отсчёт на карточках — каждую секунду; напоминания — раз в 20 секунд, даже когда чат закрыт
setInterval(() => {
  const now = Date.now(); let redo = false;
  document.querySelectorAll('.capsule').forEach(e => { const t = +e.dataset.open; if (now >= t) redo = true; else e.querySelector('.cd').textContent = 'откроется через ' + left(t - now); });
  document.querySelectorAll('.plancard').forEach(e => { const m = shown.find(x => x.id === e.dataset.id); if (!m) return; if (planPhase(m) !== e.dataset.phase) e.replaceWith(planEl(m)); else e.querySelector('.cd').textContent = planLine(m); });
  if (redo && open) { renderChat(); renderList(); toast('✨ Капсула времени открылась'); }
}, 1000);
function alertUser(c, body) {
  ding(); const title = chatTitle(c);
  if (APP?.notify) { APP.notify({ title, body, chat: c }); APP.flash?.(true); } else sysNotify(title, body, c);
  toast(isDm(c) ? body : title + ': ' + body);
}
function tickAlerts() {
  const now = Date.now(); let ch = false;
  for (const [id, p] of Object.entries(S.plans || {})) {
    const what = (p.room === 'call' ? 'Созвон' : 'Киносеанс') + (p.text ? ' «' + p.text + '»' : '');
    if (!S.chats[p.chat] || now > p.at + 3 * 3600e3) { delete S.plans[id]; ch = true; continue; }
    if (!p.n10 && now >= p.at - 10 * 6e4 && now < p.at - 30000) { p.n10 = 1; ch = true; alertUser(p.chat, '🍿 ' + what + ' — через ' + left(p.at - now)); }
    if (!p.n0 && now >= p.at && now < p.at + 30 * 6e4) { p.n0 = p.n10 = 1; ch = true; alertUser(p.chat, '🎬 ' + what + ' — пора начинать!'); }
  }
  for (const [id, cp] of Object.entries(S.caps || {})) if (now >= cp.open) {
    delete S.caps[id]; ch = true; const chat = S.chats[cp.chat]; if (!chat) continue;
    const viewing = open === cp.chat && document.visibilityState === 'visible' && document.hasFocus() && !root.hidden;
    if (!viewing) { chat.unread = (chat.unread || 0) + 1; alertUser(cp.chat, '⏳ Капсула времени открылась'); }
    renderList();
  }
  if (ch) save();
}
setInterval(tickAlerts, 20000);

// ---------- приглашение: ссылка и QR-код ----------
const inviteLink = () => WEB + '#add=' + myId;
const idFromText = s => { const m = String(s || '').match(/add=([0-9A-Za-z-]{10,13})/); return normId(m ? m[1] : s); };
function addContact(id, alias) {   // вернёт текст ошибки или ''
  if (id.length !== 10) return 'ID — это 10 букв и цифр, например ' + fmtId('7KQ2M9XAB4');
  if (id === myId) return 'Это твой собственный ID 🙂';
  const ct = S.contacts[id];
  if (ct) { if (ct.state !== 'ok') ct.state = ct.state === 'blocked' ? 'pending' : 'ok'; if (alias) ct.alias = alias; }
  else S.contacts[id] = { id, name: '', alias: alias || '', state: 'pending', added: Date.now() };
  ctChanged(S.contacts[id]); openChat(dmId(id)); dial(id); return '';
}
function qrDlg() {
  modal((card, close) => {
    card.style.justifyItems = 'center'; card.style.textAlign = 'center';
    const link = inviteLink(), box = el('div', 'qrbox');
    try { const q = qrcode(0, 'M'); q.addData(link); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }); } catch (e) { box.textContent = link; }
    const l = el('code', 'qrlink', link);
    const row = el('div', 'row'); row.style.justifyContent = 'center';
    row.append(btnEl('Скопировать ссылку', '', () => navigator.clipboard.writeText(link).then(() => toast('Ссылка скопирована')).catch(() => toast(link))));
    if (navigator.share) row.append(btnEl('Поделиться', 'pri', () => navigator.share({ title: 'Кинозал', text: 'Пиши мне в Кинозале!', url: link }).catch(() => {})));
    row.append(btnEl('Готово', navigator.share ? '' : 'pri', close));
    card.append(el('h2', '', 'Мой QR-код'), el('p', '', 'Наведи на него камеру телефона — Кинозал откроется прямо в браузере, и вы сразу в одном чате. Ссылка работает и на компьютере.'), box, l, row);
  });
}
// уведомление системы в веб-версии: на телефоне — только через service worker
async function sysNotify(title, body, chat) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opt = { body, icon: 'icons/icon-192.png', badge: 'icons/badge.png', tag: chat || 'kinozal', renotify: true, data: { chat } };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg?.showNotification) { await reg.showNotification(title, opt); return; } } catch (e) {}
  try { const n = new Notification(title, opt); n.onclick = () => { window.focus(); if (chat) openChat(chat); n.close(); }; } catch (e) {}
}
navigator.serviceWorker?.addEventListener?.('message', e => { const c = e.data?.openChat; if (c && S.chats[c]) { if (window.kzRoom?.inRoom) window.kzRoom.hide(); openChat(c); } });
function askNotify() { if (!APP && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }

// ---------- телефон: долгое нажатие, свайп для ответа, кнопка «Назад» ----------
let menuAt = 0;
function touchRow(row, m) {
  let p = null, lp = 0;
  row.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || e.target.closest('button,a,input,video')) return;
    p = { x: e.clientX, y: e.clientY, sw: false };
    lp = setTimeout(() => { lp = 0; if (p && !p.sw) { p = null; try { navigator.vibrate?.(12); } catch (er) {} msgMenu(m, e); } }, 480);
  });
  row.addEventListener('pointermove', e => {
    if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.sw && (Math.abs(dy) > 10 || dx > 12)) { clearTimeout(lp); p = null; return; }
    if (dx < -12) { p.sw = true; clearTimeout(lp); row.style.transition = 'none'; row.style.transform = 'translateX(' + Math.max(-76, dx) + 'px)'; row.classList.toggle('swiped', dx < -58); }
  });
  const end = e => {
    clearTimeout(lp); if (!p) return;
    const go = p.sw && e.type === 'pointerup' && e.clientX - p.x < -58; p = null;
    row.style.transition = ''; row.style.transform = ''; row.classList.remove('swiped');
    if (go) { try { navigator.vibrate?.(10); } catch (er) {} setReply(m); }
  };
  row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
}
// «Назад» на телефоне: закрывает окно, возвращает из звонка к чатам, из чата — к списку
const narrow = () => innerWidth <= 760;
function backable() {
  if (document.querySelector('.mx-pop')) return 'menu';
  if (document.querySelector('#lb:not([hidden])')) return 'photo';
  if (document.querySelector('.mx-modal:not(.ring):not(.out)')) return 'modal';
  if (S.me && !document.getElementById('room')?.hidden) return 'room';
  if (open && narrow()) return 'chat';
  if (filesOpen && narrow()) return 'files';
  return '';
}
function goBack() {
  const b = backable();
  if (b === 'menu') closeMenus();
  else if (b === 'photo') document.getElementById('lb').hidden = true;
  else if (b === 'modal') [...document.querySelectorAll('.mx-modal:not(.ring):not(.out)')].pop()?.remove();
  else if (b === 'room') window.kzRoom?.hide();
  else if (b === 'chat') closeChat();
  else if (b === 'files') closeFiles();
  return !!b;
}
window.kzBack = goBack;   // приложение для Android спрашивает напрямую; false — закрывать нечего, сворачиваемся
if (TOUCH && !ANDROID) {
  setInterval(() => { if (backable() && !history.state?.kzb) try { history.pushState({ kzb: 1 }, ''); } catch (e) {} }, 350);
  window.addEventListener('popstate', goBack);
}

// ---------- звонки и кинозал ----------
let myCall = null, ringing = null, callT0 = 0;
// где видно идущий звонок: в шапке открытого чата, а если чат не открыт — плашкой над списком чатов
function updCallUi() {
  const inCall = !!window.kzRoom?.inRoom, t = inCall && callT0 ? fmtDur((Date.now() - callT0) / 1000) : '';
  const live = $('.mx-chead .cz.live');
  if (live) { live.hidden = !inCall; $('.mx-chead .cz.call').hidden = $('.mx-chead .cz.cine').hidden = inCall; live.querySelector('.tm').textContent = t; }
  const bar = $('#mxCallbar'); if (bar) { bar.hidden = !inCall || !!live; const s = bar.querySelector('span'); if (s) s.textContent = 'Идёт звонок' + (t ? ' · ' + t : ''); }
}
setInterval(updCallUi, 1000);
async function startCall(c, kind) {
  const R = window.kzRoom; if (!R) return;
  if (R.inRoom) { toast('Ты уже в звонке — вернись к нему или выйди'); R.show(); return; }
  if (R.busy) { toast('Звонок ещё подключается…'); return; }
  toast(kind === 'cinema' ? 'Открываю кинозал…' : 'Звоню…');
  const code = await R.create(kind === 'cinema' ? 'cinema' : 'call', S.me.name);
  if (!code) { toast('Не получилось начать звонок — проверь интернет'); return; }
  myCall = { code, chat: c };
  await post(c, { kind: 'call', room: kind === 'cinema' ? 'cinema' : 'call', code });
}
async function joinCall(m) {
  if (ringing?.code === m.code) send(myId, { t: 'ringoff', code: m.code });   // на других моих устройствах звонок больше не звенит
  stopRing(); markRead(m.chat);
  const R = window.kzRoom; if (!R) return;
  if (R.inRoom) { if (R.code === m.code) { R.show(); return; } toast('Сначала выйди из текущего звонка'); R.show(); return; }
  toast('Подключаюсь…');
  const ok = await R.join(m.code, S.me.name);
  if (!ok) { S.ended[m.code] = Date.now(); save(); refreshCallCards(); toast('Звонок уже закончился'); }
}
// мелодия звонка и короткий «дзынь» сообщения — синтезом, без файлов
let ringAc = null, ringT = 0;
function tone(ac, f, t0, d, v = .12) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d + .05); }
function ding() { if (store.get('mxSound', '1') !== '1') return; try { const ac = new AudioContext(), t = ac.currentTime + .02; tone(ac, 880, t, .18, .08); tone(ac, 1320, t + .12, .25, .07); setTimeout(() => ac.close(), 900); } catch (e) {} }
function ring(m) {
  if (window.kzRoom?.inRoom) { notify(m, nameOf(m.from) + ' звонит — ты уже в звонке'); return; }
  stopRing();
  ringing = m;
  const ov = el('div', 'mx-modal ring'), card = el('div', 'mx-card');
  card.append(avEl(isDm(m.chat) ? m.from : m.chat, 110), el('h2', '', isDm(m.chat) ? nameOf(m.from) : chatTitle(m.chat)),
    el('p', '', (m.room === 'cinema' ? '🎬 зовёт в кинозал' : '📞 видеозвонок') + (isDm(m.chat) ? '' : ' · ' + nameOf(m.from))));
  const row = el('div', 'row'), no = el('div'), yes = el('div');
  const bn = el('button', 'rb no', '✕'); bn.title = 'Отклонить'; const by = el('button', 'rb yes'); by.innerHTML = m.room === 'cinema' ? IC.film : IC.phone; by.title = 'Ответить';
  no.append(bn, el('div', 'rl', 'Отклонить')); yes.append(by, el('div', 'rl', 'Ответить'));
  row.append(no, yes); card.append(row); ov.append(card); document.body.append(ov);
  bn.onclick = () => { send(m.from, { t: 'decline', code: m.code, chat: m.chat }); send(myId, { t: 'ringoff', code: m.code }); stopRing(); };
  by.onclick = () => joinCall(m);
  try { ringAc = new AudioContext(); const loop = () => { if (!ringAc) return; const t = ringAc.currentTime + .05; tone(ringAc, 660, t, .35); tone(ringAc, 880, t + .38, .45); }; loop(); ringT = setInterval(loop, 2200); } catch (e) {}
  APP?.flash?.(true); notify(m, (m.room === 'cinema' ? 'Зовёт в кинозал' : 'Видеозвонок'));
  ringing.to = setTimeout(stopRing, 45000);
}
// ответить или отклонить из уведомления Android
window.kzRing = { answer() { if (ringing) joinCall(ringing); }, decline() { if (ringing) { send(ringing.from, { t: 'decline', code: ringing.code, chat: ringing.chat }); send(myId, { t: 'ringoff', code: ringing.code }); stopRing(); } } };
function stopRing() { if (ringing) APP?.stopRing?.(); clearInterval(ringT); ringT = 0; try { ringAc?.close(); } catch (e) {} ringAc = null; if (ringing) clearTimeout(ringing.to); ringing = null; document.querySelector('.mx-modal.ring')?.remove(); APP?.flash?.(false); }
window.kzOnRoom = (ev, info) => {
  jlog('[зал]', ev, info?.code || ''); setTimeout(actChanged, 400);
  if (ev === 'enter') { callT0 = Date.now(); APP?.inCall?.(true); }
  if (ev === 'enter' || ev === 'show') { root.hidden = true; stopRing(); }
  if (ev === 'hide') { closePanel(true); root.hidden = false; renderList(); updCallUi(); }
  if (ev === 'hostgone') { toast('Звонок завершён'); setTimeout(() => window.kzRoom?.leave(), 1500); }
  if (ev === 'exit') {
    closePanel(true); root.hidden = !S.me; callT0 = 0; updCallUi(); APP?.inCall?.(false);
    if (myCall) { S.ended[myCall.code] = Date.now(); save(); sendChat(myCall.chat, { t: 'callend', code: myCall.code }); myCall = null; }
    refreshCallCards(); if (open) markRead(open);
  }
};

// ---------- статусы активности ----------
// Друзья видят, чем ты занят: «🎧 слушает», «🎬 смотрит кино», «📞 в звонке», «🎮 играет». Свой статус целиком под контролем:
// можно не показывать вообще, показывать только выбранным, выбрать, что именно показывать. Игры определяются по запущенной программе — и только если включишь.
// На статус «слушает» или «в зале» можно нажать «Присоединиться». Статус живёт, пока человек в сети, и гаснет сам.
const ACT_TTL = 110e3;
const acts = new Map();   // id друга → {a, at}
const actCfg = () => (S.actCfg ||= { on: true, who: 'all', allow: [], music: true, room: true, game: false, join: true, games: '' });
const actAllowed = u => { const c = actCfg(), ct = S.contacts[u]; return !!(c.on && ct?.state === 'ok' && (c.who === 'all' || c.allow.includes(u))); };
let gameNow = '', actSent = 'null', actTo = new Set(), actT = 0;
function collectAct() {
  const c = actCfg(); if (!c.on) return null;
  if (c.room && window.kzRoom?.inRoom) return { k: 'room', kind: window.kzRoom.kind, code: c.join ? window.kzRoom.code : '', movie: window.kzRoom.movie || '' };
  if (c.music) { const m = window.kzMusic?.activity?.(c.join); if (m) return { k: 'music', ...m }; }
  if (c.game && gameNow) return { k: 'game', name: gameNow };
  return null;
}
function pushAct(force) {
  const a = collectAct(), key = JSON.stringify(a);
  if (!force && key === actSent) return; actSent = key;
  const now = new Set();
  for (const u of links.keys()) {
    if (u === myId) continue;
    if (a && actAllowed(u)) { send(u, { t: 'act', a }); now.add(u); }
    else if (actTo.has(u)) send(u, { t: 'act', a: null });   // перестал показывать — друг сразу убирает статус
  }
  actTo = now;
}
const actChanged = () => { clearTimeout(actT); actT = setTimeout(() => pushAct(), 600); };
function actHello(L) { if (L.self || actSent === 'null' || !actAllowed(L.uid)) return; try { send(L, { t: 'act', a: JSON.parse(actSent) }); actTo.add(L.uid); } catch (e) {} }
const cleanAct = a => {
  if (!a || typeof a !== 'object') return null;
  if (a.k === 'music') return { k: 'music', title: clean(a.title, 80), artist: clean(a.artist, 60), sid: /^[\w-]{4,20}$/.test(a.sid || '') ? a.sid : '', together: !!a.together };
  if (a.k === 'room') return { k: 'room', kind: a.kind === 'cinema' ? 'cinema' : 'call', code: /^[A-Z0-9]{5}$/.test(a.code || '') ? a.code : '', movie: clean(a.movie, 80) };
  if (a.k === 'game') return { k: 'game', name: clean(a.name, 60) };
  return null;
};
function onAct(L, d) {
  if (L.self) return; const u = L.uid; if (!S.contacts[u] || S.contacts[u].state === 'blocked') return;
  const a = cleanAct(d.a), was = acts.get(u);
  if (!a) { if (was) { acts.delete(u); presence(u); window.kzMusic?.actsChanged?.(); } return; }
  const same = was && JSON.stringify(was.a) === JSON.stringify(a);
  acts.set(u, { a, at: Date.now() });
  if (!same) { presence(u); window.kzMusic?.actsChanged?.(); }
}
const actOf = u => { const x = acts.get(u); return x && Date.now() - x.at < ACT_TTL && isOn(u) ? x.a : null; };
const actIcon = a => a.k === 'music' ? '🎧' : a.k === 'game' ? '🎮' : a.kind === 'cinema' ? '🎬' : '📞';
const actText = a => a.k === 'music' ? (a.together ? 'Слушает вместе: ' : 'Слушает: ') + (a.title || 'музыку') + (a.artist ? ' — ' + a.artist : '')
  : a.k === 'game' ? 'Играет в ' + a.name : a.kind === 'cinema' ? 'Смотрит' + (a.movie ? ': ' + a.movie : ' кино') + ' в зале' : 'В звонке';
const actJoinable = a => !!(a && ((a.k === 'music' && a.sid) || (a.k === 'room' && a.code)));
function actJoin(u, a) {
  if (a.k === 'music' && a.sid) { if (!window.kzMusic?.joinFrom) { toast('Музыка есть только в программе для Windows'); return; } window.kzMusic.joinFrom(u, a.sid, a); return; }
  if (a.k === 'room' && a.code) {
    if (window.kzRoom?.busy) { toast('Сначала выйди из текущего зала'); return; }
    modal((card, close) => {
      card.append(el('h2', '', actIcon(a) + ' ' + nameOf(u)), el('p', '', actText(a) + '. Войти в зал?'));
      const row = el('div', 'row'); row.append(btnEl('Не сейчас', '', close), btnEl('Войти', 'pri', async () => { close(); toast('Подключаюсь к залу…'); const ok = await window.kzRoom.join(a.code, S.me?.name || ''); if (!ok) toast('Зал уже закрыт'); }));
      card.append(row);
    });
  }
}
// что делают друзья прямо сейчас (для ленты)
const friendActs = () => Object.values(S.contacts).filter(ct => ct.state === 'ok' && ct.id !== myId).map(ct => ({ id: ct.id, name: nameOf(ct.id), a: actOf(ct.id) })).filter(x => x.a);
setInterval(() => { pushAct(); for (const [u, x] of acts) if (Date.now() - x.at > ACT_TTL) { acts.delete(u); presence(u); window.kzMusic?.actsChanged?.(); } }, 8000);
setInterval(() => pushAct(true), 45000);   // «я всё ещё тут» — чтобы у друзей статус не гас
// игры: раз в полминуты смотрим запущенные программы (только если включено и только известные игры или добавленные тобой)
async function gameScan() {
  const c = actCfg();
  if (!c.on || !c.game || !APP?.game?.scan) { if (gameNow) { gameNow = ''; actChanged(); } return; }
  try { const g = await APP.game.scan(c.games || ''); if (g !== gameNow) { gameNow = g; jlog('[статус] игра:', g || '—'); actChanged(); } } catch (e) {}
}
setInterval(gameScan, 30000); setTimeout(gameScan, 6000);

function actDlg() {
  modal((card, close) => {
    const c = actCfg(); card.classList.add('mx-act');
    const sw = (label, key, hint) => { const l = el('label', 'switch'), i = el('input'); i.type = 'checkbox'; i.checked = !!c[key]; i.onchange = () => { c[key] = i.checked; save(); pushAct(); gameScan(); paint(); }; l.append(document.createTextNode(label), i); if (hint) l.title = hint; return l; };
    const prev = el('p', 'fhint'), body = el('div', 'act-body');
    const paint = () => {
      body.textContent = '';
      const a = collectAct();
      prev.textContent = !c.on ? 'Сейчас никто не видит, чем ты занят.' : a ? 'Сейчас друзья видят: ' + actIcon(a) + ' ' + actText(a) : 'Сейчас друзья ничего не видят — ты ничем «видимым» не занят.';
      if (!c.on) return;
      body.append(el('h3', 'sec3', 'Что показывать'), sw('🎧 Музыку, которую слушаю', 'music'), sw('🎬 📞 Зал: кино и звонки', 'room'), sw('🎮 Игры (по запущенной программе)', 'game', 'Читается только список запущенных программ на этом компьютере. Друзьям уходит название игры, и только если она в списке известных или ты добавил её ниже.'));
      if (c.game) {
        const ta = el('textarea'); ta.rows = 3; ta.placeholder = 'Свои игры, по одной в строке:\nмояигра.exe = Моя игра'; ta.value = c.games || ''; ta.spellcheck = false; ta.onchange = () => { c.games = ta.value.slice(0, 2000); save(); gameScan(); };
        body.append(el('p', 'fhint', 'Известные игры (CS2, Dota 2, Minecraft, Valorant, Fortnite, GTA V и другие) находятся сами.'), ta);
      }
      body.append(el('h3', 'sec3', 'Кому показывать'));
      const seg = el('div', 'mu-pref');
      for (const [k, t] of [['all', 'Всем моим контактам'], ['some', 'Только выбранным']]) { const b = el('button', c.who === k ? 'on' : '', t); b.onclick = () => { c.who = k; save(); pushAct(true); paint(); }; seg.append(b); }
      body.append(seg);
      if (c.who === 'some') {
        const list = el('div', 'act-list'), cts = Object.values(S.contacts).filter(x => x.state === 'ok' && x.id !== myId).sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), 'ru'));
        for (const x of cts) { const l = el('label', 'switch'), i = el('input'); i.type = 'checkbox'; i.checked = c.allow.includes(x.id); i.onchange = () => { c.allow = i.checked ? [...new Set([...c.allow, x.id])] : c.allow.filter(y => y !== x.id); save(); pushAct(true); paint2(); }; l.append(document.createTextNode(nameOf(x.id)), i); list.append(l); }
        if (!cts.length) list.append(el('p', 'fhint', 'Пока нет контактов.'));
        body.append(list);
      }
      body.append(sw('➕ Друзья могут присоединиться (к музыке и залу)', 'join', 'На твой статус «слушает» или «в зале» друг нажмёт «Присоединиться»'));
    };
    const paint2 = () => { const a = collectAct(); prev.textContent = a ? 'Сейчас друзья видят: ' + actIcon(a) + ' ' + actText(a) : prev.textContent; };
    const master = sw('🟢 Показывать друзьям, чем я занят', 'on');
    master.classList.add('big');
    const row = el('div', 'row'); row.append(btnEl('Готово', 'pri', close));
    card.append(el('h2', '', 'Статус активности'), el('p', '', 'Друзья увидят в списке чатов и в шапке чата, что ты слушаешь, смотришь или во что играешь, и смогут присоединиться. Всё под твоим контролем.'), master, prev, body, row);
    paint();
  });
}

// ---------- уведомления ----------
async function notify(m, override) {
  const title = isDm(m.chat) ? nameOf(m.from) : chatTitle(m.chat);
  const [, t] = lastText(m.chat, m); const body = override || (isDm(m.chat) ? t : nameOf(m.from) + ': ' + t);
  ding();
  if (APP?.notify) { APP.notify({ title, body, chat: m.chat, call: ringing === m }); APP.flash(true); }
  else if (document.hidden || !document.hasFocus()) sysNotify(title, body, m.chat);
}
APP?.onOpenChat?.(c => { if (window.kzRoom?.inRoom) window.kzRoom.hide(); if (S.chats[c]) openChat(c); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && open) markRead(open); });
window.addEventListener('focus', () => { if (open && !root.hidden) markRead(open); });
setInterval(() => { if (open) renderHead(); }, 30000);

// ---------- окна ----------
function modal(build, cls = '') {
  const ov = el('div', 'mx-modal ' + cls), card = el('div', 'mx-card');
  ov.append(card); document.body.append(ov);
  // закрывается не мгновенно, а с коротким затуханием
  const close = () => { if (ov.classList.contains('out')) return; ov.classList.add('out'); setTimeout(() => ov.remove(), 170); };
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  build(card, close);
  setTimeout(() => card.querySelector('input[type=text]')?.focus(), 30);
  return close;
}
const btnEl = (t, cls, f) => { const b = el('button', 'btn ' + (cls || ''), t); b.onclick = f; return b; };
function avatarPicker(get, set) {
  const b = el('button', 'avpick'); b.type = 'button'; b.title = 'Выбрать фото';
  const paint = () => { b.textContent = ''; const a = el('div', 'av'); a.style.setProperty('--h', hash(myId) % 360); const img = get(); if (img) { const i = el('img'); i.src = img; a.append(i); } else a.textContent = '📷'; b.append(a, el('em', '', '+')); };
  const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
  b.onclick = () => inp.click();
  inp.onchange = async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    try { const bm = await createImageBitmap(f); const s = Math.min(bm.width, bm.height), cv = el('canvas'); cv.width = cv.height = 160; cv.getContext('2d').drawImage(bm, (bm.width - s) / 2, (bm.height - s) / 2, s, s, 0, 0, 160, 160); let u = cv.toDataURL('image/webp', .8); if (!u.startsWith('data:image/webp')) u = cv.toDataURL('image/jpeg', .82); set(u); paint(); } catch (e) { toast('Не получилось открыть фото'); }
  };
  paint(); return [b, inp];
}
// первый экран: создать новый профиль или войти в свой по ID и паролю
function helloDlg() {
  const ov = el('div', 'mx-hello'), card = el('div', 'mx-card'); ov.append(card); document.body.append(ov);
  let why = ''; try { why = sessionStorage.getItem('kinozal-why') || ''; sessionStorage.removeItem('kinozal-why'); } catch (e) {}
  let avatar = '';
  const create = () => {
    card.textContent = ''; card.innerHTML = IC.logo;
    const [ap, inp] = avatarPicker(() => avatar, v => { avatar = v; });
    const name = el('input'); name.type = 'text'; name.maxLength = 40; name.placeholder = 'Как тебя зовут?'; name.value = store.get('name', '');
    const go = btnEl('Создать новый профиль', 'pri', () => {
      const n = clean(name.value, 40); if (!n) { name.focus(); return; }
      S.me = { id: myId, name: n, avatar, pts: Date.now() }; store.set('name', n); save();
      ov.remove(); boot();
    });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    card.append(el('h2', '', 'Добро пожаловать в Кинозал'), el('p', '', 'Мессенджер с голосовыми, кружочками и видеозвонками — а ещё можно смотреть кино вместе. Без регистрации: всё напрямую между вами.'));
    if (why) card.append(el('p', 'err', why));
    card.append(ap, inp, name, go, el('div', 'sep'), btnEl('🔑 Войти в свой профиль — по ID и паролю или коду', '', () => join('')));
    if (ANDROID_WEB) { const a = el('a', 'btn', '📲 Удобнее в приложении для Android — уведомления и звонки даже в фоне'); a.href = APK; a.rel = 'noopener'; a.style.textDecoration = 'none'; card.append(a); }
    if (!TOUCH) setTimeout(() => name.focus(), 50);
  };
  const join = () => {
    card.textContent = ''; card.innerHTML = IC.logo;
    const id = el('input'); id.type = 'text'; id.placeholder = 'XXXXX-XXXXX'; id.maxLength = 40; id.autocomplete = 'username'; id.autocapitalize = 'characters'; id.spellcheck = false;
    id.style.cssText = 'letter-spacing:.1em;font-weight:700;text-transform:uppercase';
    const pw = el('input'); pw.type = 'password'; pw.placeholder = 'Пароль'; pw.autocomplete = 'current-password';
    const dn = el('input'); dn.type = 'text'; dn.maxLength = 40; dn.value = devName(); dn.placeholder = 'Как назвать это устройство';
    const st = el('p'), err = el('div', 'err');
    const back = btnEl('Назад', '', create);
    const fields = [id, pw];
    const go = btnEl('Войти', 'pri', async () => {
      err.textContent = ''; for (const x of [go, back, dn, ...fields]) x.disabled = true;
      try { await joinProfile(id.value, clean(dn.value, 40) || devName(), t => { st.textContent = t; }, pw.value); }
      catch (e) { st.textContent = ''; err.textContent = e?.message || String(e); for (const x of [go, back, dn, ...fields]) x.disabled = false; }
    });
    for (const x of fields) x.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    const row = el('div', 'row'); row.style.justifyContent = 'center'; row.append(back, go);
    card.append(el('h2', '', 'Вход в свой профиль'));
    card.append(el('p', '', 'Логин — это ID профиля (виден в профиле на основном устройстве), пароль задаётся там же: Профиль → «Мои устройства» → «Пароль для входа». Основное устройство может быть выключено.'), el('label', '', 'ID профиля'), id, el('label', '', 'Пароль'), pw);
    card.append(el('label', '', 'Название этого устройства'), dn, st, err, row);
    if (!TOUCH) setTimeout(() => fields[0].focus(), 50);
  };
  // пришли из «Добавить профиль» в другом профиле: сразу нужный экран и путь назад; другие профили — переключиться
  let add = null; try { add = JSON.parse(sessionStorage.getItem('kinozal-add') || 'null'); sessionStorage.removeItem('kinozal-add'); } catch (e) {}
  const others = profList().filter(x => x.slot !== SLOT);
  if (others.length) {
    const bar = el('div', 'hprofs'), lab = el('span', '', add ? 'Вернуться:' : 'Профили на этом устройстве:');
    bar.append(lab);
    for (const x of others) { const b2 = el('button', 'fchip', (x.name || 'Профиль') + ' · ' + fmtId(x.id)); b2.onclick = () => { lsSet('kinozal-dropdb', dbName(SLOT)); lsSet('kinozal-slot', x.slot || null); location.hash = ''; location.reload(); }; bar.append(b2); }
    ov.append(bar);
  }
  if (add?.mode === 'join') join(); else create();
}
// профиль → мои устройства: список, подключить новое, отвязать, выйти из профиля на этом устройстве
function devicesDlg() {
  modal((card, close) => {
    const list = el('div', 'mlist');
    const ic = n => /^(Телефон|iPhone|Планшет)/.test(n || '') ? '📱' : '💻';
    const item = (name, sub, on, btn) => {
      const p = el('div', 'pick'), w = el('div', 'avwrap'), a = el('div', 'av'); a.style.setProperty('--s', '38px'); a.style.setProperty('--h', hash(name) % 360); a.textContent = ic(name);
      w.append(a, el('i', 'dot')); if (on) w.classList.add('on');
      const t = el('span'); t.append(document.createTextNode(name), el('small', '', sub)); p.append(w, t); if (btn) p.append(btn); list.append(p);
    };
    const st = d => isDevOn(myId, d) ? 'в сети' : seenText(S.devSeen?.[d]);
    const paint = () => {
      if (!card.isConnected) { if (devsPaint === paint) devsPaint = null; return; }
      list.textContent = '';
      if (myDev) item(S.pname || 'Основное устройство', 'основное · ' + st(''), isDevOn(myId, ''));
      else item(devName(), 'это устройство · основное', true);
      const rv = revSet(myId);
      for (const x of Object.values(S.devs || {}).filter(x => !rv.has(x.dev)).sort((a, b) => (a.added || 0) - (b.added || 0))) {
        const me = x.dev === myDev;
        const b = !myDev ? btnEl('Отвязать', '', () => { if (confirm('Отвязать «' + (x.name || 'устройство') + '» от профиля? Переписка на нём удалится, войти с него снова можно будет только с новым кодом.')) revokeDev(x.dev); }) : null;
        if (b) b.style.minHeight = '34px';
        item(x.name || 'Устройство', me ? 'это устройство' : st(x.dev), me || isDevOn(myId, x.dev), b);
      }
    };
    card.append(el('h2', '', 'Мои устройства'));
    if (myDev) card.append(el('p', '', 'Это устройство вошло в профиль «' + (S.me?.name || '') + '» (ID ' + fmtId(myId) + '). Переписка, контакты и группы сверяются между твоими устройствами, когда они в сети одновременно. Новые устройства подключаются на основном — там, где профиль создан.'));
    else card.append(el('p', '', 'Профиль можно открыть на телефоне или другом компьютере — переписка, контакты и группы будут одни и те же. Ключ профиля хранится на этом устройстве: не удаляй здесь данные Кинозала, иначе новые устройства подключить будет нельзя.'));
    card.append(list);
    if (!myDev) {
      // пароль: войти с другого устройства по ID и паролю, без кода (основное устройство при этом должно быть в сети)
      const pw = el('div', 'pwbox'), info = el('div');
      info.append(el('b', '', S.pwd ? '🔑 Пароль для входа задан' : '🔑 Пароль для входа не задан'), el('span', '', S.pwd ? 'С другого устройства: «Войти в свой профиль» → ID ' + fmtId(myId) + ' и пароль. Это устройство при этом может быть выключено. ' + (S.vaultOn ? '✅ Данные для входа лежат на сервере.' : '⏳ Данные для входа ещё загружаются на сервер — не закрывай Кинозал.') : 'Задай пароль — и с телефона или другого компьютера можно будет войти по ID ' + fmtId(myId) + ' и паролю, даже когда это устройство выключено.'));
      pw.append(info, btnEl(S.pwd ? 'Сменить' : 'Задать пароль', S.pwd ? '' : 'pri', () => { close(); passwordDlg(); }));
      if (S.pwd) pw.append(btnEl('Убрать', '', async () => { if (!confirm('Убрать пароль? Войти в профиль с нового устройства будет нельзя, пока не зададишь новый пароль.')) return; await setPassword(''); close(); devicesDlg(); }));
      card.append(pw);
    }
    else card.append(btnEl('🚪 Выйти из профиля на этом устройстве', '', () => {
      if (!confirm('Выйти из профиля на этом устройстве? Переписка, контакты и настройки профиля здесь удалятся. На других твоих устройствах всё останется, а войти сюда снова можно будет по ID и паролю.')) return;
      close(); jlog('[устройства] выход из профиля на этом устройстве');
      send(myId, { t: 'bye' });   // основное устройство уберёт меня из списка (если оно сейчас в сети)
      setTimeout(() => wipeDevice('Ты вышел(-ла) из профиля на этом устройстве. Можно создать новый профиль или войти снова.'), 600);
    }));
    card.append(btnEl('Войти в другой профиль по ID и паролю', '', () => { close(); addProfile('join'); }));
    const row = el('div', 'row'); row.append(btnEl('Готово', '', close)); card.append(row);
    devsPaint = paint; paint();
  });
}
// основное устройство: задать или сменить пароль для входа с других устройств
function passwordDlg() {
  modal((card, close) => {
    const a = el('input'), b2 = el('input'); a.type = b2.type = 'password'; a.placeholder = 'Новый пароль (не меньше 8 символов)'; b2.placeholder = 'Ещё раз'; a.autocomplete = b2.autocomplete = 'new-password';
    const err = el('div', 'err');
    const ok = btnEl('Сохранить', 'pri', async () => {
      if (a.value.length < 8) { err.textContent = 'Пароль — не меньше 8 символов: его можно подбирать через сервер, длинный подобрать нельзя'; a.focus(); return; }
      if (a.value !== b2.value) { err.textContent = 'Пароли не совпадают'; b2.focus(); return; }
      ok.disabled = true; await setPassword(a.value); toast('Пароль задан. Войти: «Войти в свой профиль» → ID ' + fmtId(myId) + ' и пароль'); close(); devicesDlg();
    });
    b2.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    const row = el('div', 'row'); row.append(btnEl('Отмена', '', () => { close(); devicesDlg(); }), ok);
    card.append(el('h2', '', 'Пароль для входа'), el('p', '', 'С ним на телефоне или другом компьютере можно войти в этот профиль по ID ' + fmtId(myId) + ' и паролю. Это устройство при этом может быть выключено: на сервере Кинозала лежат только зашифрованные запасные места для новых устройств (сам пароль и ключ профиля туда не попадают, расшифровать их без пароля нельзя). Чтобы мест хватало, открывай Кинозал на этом устройстве хотя бы раз в пару недель. После 5 неверных попыток вход закрывается на 15 минут, потом на дольше.'), a, b2, err, row);
  });
}
function addContactDlg() {
  modal((card, close) => {
    const inp = el('input'); inp.type = 'text'; inp.placeholder = 'XXXXX-XXXXX'; inp.maxLength = 200; inp.autocapitalize = 'characters'; inp.autocomplete = 'off'; inp.style.cssText = 'text-align:center;letter-spacing:.12em;font-weight:700;text-transform:uppercase';
    const alias = el('input'); alias.type = 'text'; alias.placeholder = 'Как подписать (необязательно)'; alias.maxLength = 40;
    const err = el('div', 'err');
    const ok = btnEl('Добавить', 'pri', () => {
      const e = addContact(idFromText(inp.value), clean(alias.value, 40));
      if (e) { err.textContent = e; return; }
      close();
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    const row = el('div', 'row'); row.append(btnEl('Отмена', '', close), ok);
    card.append(el('h2', '', 'Новый собеседник'), el('p', '', 'Отправь человеку своё приглашение (кнопка «Скопировать») или покажи QR-код — он откроет ссылку, и чат появится у обоих. Или впиши его ID сам:'), idCard(), el('div', 'sep'), el('label', '', 'ID или ссылка-приглашение собеседника'), inp, alias, err, row);
  });
}
// cine — кнопка «Кинозал» в списке: зал для кого угодно, без добавления в друзья
function codeDlg(cine) {
  modal((card, close) => {
    const inp = el('input'); inp.type = 'text'; inp.placeholder = 'ABCDE'; inp.maxLength = 5; inp.style.cssText = 'text-align:center;letter-spacing:.3em;font-weight:700;text-transform:uppercase';
    const go = btnEl('Войти', 'pri', async () => { const c = inp.value.trim().toUpperCase(); if (!/^[A-Z0-9]{5}$/.test(c)) { toast('Код зала — 5 букв и цифр'); return; } close(); toast('Подключаюсь…'); if (!await window.kzRoom.join(c, S.me.name)) toast('Зал с таким кодом не найден'); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    const mk = (t, k, cls = '') => btnEl(t, cls, async () => { close(); const code = await window.kzRoom.create(k, S.me.name); if (!code) toast('Не получилось создать зал'); });
    if (cine) {
      const big = mk('🎬 Создать кинозал', 'cinema', 'pri'); big.style.width = '100%';
      card.append(el('h2', '', 'Кинозал'), el('p', '', 'Смотрите кино вместе с кем угодно — дружить в Кинозале не нужно. Создай зал и отправь ссылку или код, или войди по коду друга.'), big, el('div', 'sep'), el('label', '', 'Код зала друга'), inp, go);
      return;
    }
    const row = el('div', 'row'); row.style.justifyContent = 'stretch'; row.append(mk('📞 Новый созвон', 'call'), mk('🎬 Новый кинозал', 'cinema'));
    card.append(el('h2', '', 'Созвон по коду'), el('p', '', 'Для тех, кого нет в контактах: создай зал и продиктуй код, или войди в чужой.'), row, el('div', 'sep'), el('label', '', 'Код зала'), inp, go);
  });
}
function groupDlg() {
  const cands = Object.values(S.contacts).filter(c => ['ok', 'pending', 'req', 'member'].includes(c.state));
  if (!cands.length) { toast('Сначала добавь хотя бы одного собеседника'); addContactDlg(); return; }
  modal((card, close) => {
    const name = el('input'); name.type = 'text'; name.placeholder = 'Название группы'; name.maxLength = 60;
    const list = el('div', 'picklist'), sel = new Set();
    for (const c of cands) {
      const l = el('label', 'pick'), cb = el('input'); cb.type = 'checkbox';
      cb.onchange = () => cb.checked ? sel.add(c.id) : sel.delete(c.id);
      const t = el('div'); t.append(document.createTextNode(nameOf(c.id)), el('small', '', fmtId(c.id)));
      l.append(avEl(c.id, 38), t, cb); list.append(l);
    }
    const err = el('div', 'err');
    const ok = btnEl('Создать', 'pri', () => { if (!clean(name.value)) { err.textContent = 'Придумай название'; name.focus(); return; } if (!sel.size) { err.textContent = 'Отметь хотя бы одного участника'; return; } close(); createGroup(name.value, [...sel]); });
    const row = el('div', 'row'); row.append(btnEl('Отмена', '', close), ok);
    card.append(el('h2', '', 'Новая группа'), name, el('label', '', 'Участники'), list, err, row);
  });
}
function settingsDlg() {
  modal((card, close) => {
    let avatar = S.me.avatar || '';
    const [ap, inp] = avatarPicker(() => avatar, v => { avatar = v; });
    const name = el('input'); name.type = 'text'; name.maxLength = 40; name.value = S.me.name;
    const snd = el('label', 'switch'), sc = el('input'); sc.type = 'checkbox'; sc.checked = store.get('mxSound', '1') === '1'; snd.append(document.createTextNode('Звук уведомлений'), sc);
    // профили на этом устройстве: переключиться, добавить (войти в свой по ID и паролю / создать новый), убрать
    const profs = el('details', 'adv profs'), plist = el('div', 'mlist'), all = profList();
    profs.append(el('summary', '', 'Профили на этом устройстве' + (all.length > 1 ? ' · ' + all.length : '')));
    for (const x of all) {
      const pr = el('div', 'pick'), av = el('div', 'av'); av.style.setProperty('--s', '34px'); av.style.setProperty('--h', hash(x.id || '') % 360);
      if (x.avatar) { const i = el('img'); i.src = x.avatar; i.alt = ''; av.append(i); } else av.textContent = (x.name || '?')[0].toUpperCase();
      const t = el('span'); t.append(document.createTextNode(x.name || 'Профиль'), el('small', '', 'ID ' + fmtId(x.id) + (x.slot === SLOT ? ' · сейчас открыт' : x.dev ? ' · вход с другого устройства' : '')));
      pr.append(av, t);
      if (x.slot !== SLOT) {
        pr.append(btnEl('Открыть', 'pri', () => { close(); switchProfile(x.slot); }));
        pr.append(btnEl('Убрать', '', async () => {
          if (!confirm('Убрать профиль «' + (x.name || '') + '» с этого устройства? Его переписка здесь удалится.' + (x.dev ? '' : ' ВНИМАНИЕ: здесь хранится ключ этого профиля — без него в профиль больше не войти ни с одного устройства.'))) return;
          await removeProfile(x); close(); settingsDlg();
        }));
      }
      plist.append(pr);
    }
    profs.append(el('p', '', 'Как аккаунты в Телеграме: в сети — только открытый профиль, остальные догрузят своё, когда в них перейдёшь.'), plist,
      btnEl('🔑 Войти в свой профиль — по ID и паролю или коду', 'pri', () => { close(); addProfile('join'); }),
      btnEl('＋ Создать ещё один профиль', '', () => { close(); addProfile('new'); }));
    card.append(el('h2', '', 'Профиль'), ap, inp, el('label', '', 'Имя'), name, idCard(), btnEl('🎨 Оформление: темы, обои, неон, рамка аватарки', 'pri', () => { close(); openTheme(); }), btnEl('🟢 Статус активности: кто видит, что я слушаю и смотрю', '', () => { close(); actDlg(); }), btnEl(myDev ? '📱 Мои устройства и выход из профиля' : '📱 Мои устройства — войти в профиль с телефона или другого компьютера', '', () => { close(); devicesDlg(); }), el('div', 'sep'), snd);
    let auto = null;
    if (APP?.autostart) { auto = el('input'); auto.type = 'checkbox'; const l = el('label', 'switch'); l.append(document.createTextNode(ANDROID ? 'Работать в фоне — сообщения и звонки приходят, даже когда Кинозал свёрнут' : 'Запускать вместе с Windows — чтобы сообщения доходили'), auto); card.append(l); APP.autostart().then(v => { auto.checked = !!v; }).catch(() => {}); }
    if (ANDROID) APP.info().then(i => {
      if (!i.battery) card.insertBefore(btnEl('🔋 Не ограничивать в фоне — чтобы телефон не усыплял Кинозал', '', () => APP.askBattery()), card.querySelector('.adv'));
      if (!i.fullScreen) card.insertBefore(btnEl('📞 Входящие звонки на весь экран', '', () => APP.askFullScreen()), card.querySelector('.adv'));
      if (!i.notifications) card.insertBefore(btnEl('🔔 Включить уведомления', '', () => APP.openSettings()), card.querySelector('.adv'));
    }).catch(() => {});
    card.append(profs);
    if (APP?.readLog) card.append(btnEl('🧾 Отправить журнал ошибок в чат…', '', () => { close(); sendLogDlg(); }));
    if (!APP) {
      if ('Notification' in window && Notification.permission !== 'granted') card.append(btnEl('🔔 Включить уведомления', '', async () => { const p = await Notification.requestPermission().catch(() => 'denied'); toast(p === 'granted' ? 'Уведомления включены' : 'Браузер не разрешил уведомления — проверь настройки сайта'); }));
      if (window.kzWeb?.canInstall()) card.append(btnEl('📲 Установить как приложение', 'pri', async () => { if (await window.kzWeb.install()) close(); }));
      if (ANDROID_WEB) { const a = el('a', 'btn pri', '📲 Скачать приложение для Android'); a.href = APK; a.rel = 'noopener'; card.append(a); }
      if (!TOUCH) { const a = el('a', 'btn', '⬇ Программа для Windows'); a.href = DOWNLOAD; a.target = '_blank'; a.rel = 'noopener'; card.append(a); }
    }
    // скорость передачи больших файлов — меняется сразу, в том числе посреди передачи
    const xs = el('details', 'adv xspeed'), xsum = el('summary'), seg = el('div', 'seg'), xhint = el('p');
    const paintX = () => {
      xsum.textContent = 'Скорость передачи файлов: ' + XMODES[xMode()];
      for (const b of seg.children) b.classList.toggle('on', b.dataset.v === xMode());
      xhint.textContent = { max: 'Файлы идут так быстро, как позволяет интернет.', soft: 'Всегда не быстрее заданного — интернет остаётся для звонков, фильмов и игр.', auto: 'Щадящий, пока ты в звонке или зале Кинозала, в остальное время — максимум.' + (window.kzRoom?.inRoom ? ' Сейчас ты в зале — действует щадящий.' : '') }[xMode()];
    };
    for (const [v, t] of Object.entries(XMODES)) { const b = btnEl(t, '', () => { setXMode(v); paintX(); }); b.dataset.v = v; seg.append(b); }
    const rng = (k, label, max) => {
      const l = el('label', 'rng'), cap = el('span'), r = el('input'); r.type = 'range'; r.min = '0.5'; r.max = String(max); r.step = '0.5'; r.value = String(xLim(k));
      const show = () => { cap.textContent = label + ': до ' + fmtRate(+r.value); };
      r.oninput = () => { store.set(k, r.value); show(); setXMode(xMode()); };
      show(); l.append(cap, r); return l;
    };
    xs.append(xsum, seg, xhint, el('p', '', 'В щадящем режиме:'), rng('xup', 'Отдача', 20), rng('xdown', 'Скачивание', 50));
    paintX(); card.append(xs);
    // свой TURN-сервер — для сетей, где напрямую не соединяет
    const turn0 =(() => { try { return JSON.parse(localStorage.getItem('kinozal-turn') || 'null') || {}; } catch (e) { return {}; } })();
    const adv = el('details', 'adv'), tu = el('input'), tn = el('input'), tp = el('input');
    for (const [i, ph, v] of [[tu, 'turn:example.com:3478', turn0.url], [tn, 'Логин', turn0.user], [tp, 'Пароль', turn0.pass]]) { i.type = 'text'; i.placeholder = ph; i.value = v || ''; i.autocomplete = 'off'; i.spellcheck = false; }
    adv.append(el('summary', '', 'Связь через свой сервер (TURN)'), el('p', '', 'Обычно не нужно. Если с кем-то не соединяет — так бывает в мобильных сетях и за строгими роутерами, — впиши адрес своего TURN-сервера, и связь пойдёт через него.'), tu, tn, tp);
    card.append(adv);
    card.append(el('p', '', (ANDROID ? 'Кнопка «Назад» на списке чатов сворачивает Кинозал, а не закрывает: он ждёт сообщений в фоне — в шторке виден значок «Кинозал в сети». Если смахнуть его из недавних, сообщения придут при следующем открытии.' : APP ? 'Закрытое окно не выключает Кинозал: он ждёт сообщений у часов на панели задач. Совсем выйти — правый клик по значку → «Выйти».' : window.kzWeb?.standalone() ? 'Сообщения и звонки приходят, пока Кинозал открыт. Всё, что отправили без тебя, догрузится при следующей встрече.' : 'Сообщения и звонки приходят, пока Кинозал открыт. Чтобы он был под рукой, установи его: меню браузера → «Установить приложение» или «На экран „Домой“». Переписка хранится в этом браузере — не очищай данные сайта.') + (appVer ? ' Версия ' + appVer + '.' : '')));
    const row = el('div', 'row');
    row.append(btnEl('Отмена', '', close), btnEl('Сохранить', 'pri', () => {
      const n = clean(name.value, 40); if (!n) { name.focus(); return; }
      if (n !== S.me.name || avatar !== (S.me.avatar || '')) S.me.pts = Date.now();   // свежее имя побеждает на всех моих устройствах
      S.me.name = n; S.me.avatar = avatar; store.set('name', n); store.set('mxSound', sc.checked ? '1' : '0');
      if (auto) APP.autostart(auto.checked);
      const tj = tu.value.trim() ? JSON.stringify({ url: tu.value.trim(), user: tn.value.trim(), pass: tp.value }) : '';
      if (tj !== (localStorage.getItem('kinozal-turn') || '')) { try { tj ? localStorage.setItem('kinozal-turn', tj) : localStorage.removeItem('kinozal-turn'); } catch (e) {} if (!window.kzRoom?.inRoom) startPeer(); }
      for (const g of Object.values(S.groups)) if (g.names) g.names[myId] = n;
      save(); renderMe(); renderList(); renderHead(); profTouch();
      sendProfile();   // собеседникам и моим другим устройствам
      close();
    }));
    card.append(row);
  });
}
// оформление (theme.js): темы, цвета, обои, неон, шрифты; рамка аватарки уходит собеседникам
function openTheme() {
  if (!window.kzTheme) { toast('Оформление не загрузилось'); return; }
  window.kzTheme.open({
    frame: S.me?.frame, avatar: S.me?.avatar, name: S.me?.name,
    onFrame: f => {
      const was = JSON.stringify(S.me.frame || null); S.me.frame = f; save();
      renderMe(); renderList(); if (open) renderChat();
      if (was !== JSON.stringify(f || null)) { S.me.pts = Date.now(); save(); sendProfile(); }
    }
  });
}
// журнал ошибок — файлом в выбранный чат (например, тому, кто чинит программу)
function sendLogDlg() {
  const chats = Object.values(S.chats).filter(ch => (isDm(ch.id) || (S.groups[ch.id] && !S.groups[ch.id].gone))).sort((a, b) => (b.last?.ts || 0) - (a.last?.ts || 0));
  if (!chats.length) { toast('Сначала добавь собеседника'); return; }
  modal((card, close) => {
    const list = el('div', 'picklist');
    for (const ch of chats) {
      const p = el('div', 'pick'); p.style.cursor = 'pointer';
      const t = el('div'); t.append(document.createTextNode(chatTitle(ch.id)));
      p.append(avEl(ch.id, 38), t);
      p.onclick = async () => {
        close();
        const txt = await APP.readLog().catch(() => '');
        if (!txt) { toast('Журнал пока пуст'); return; }
        const name = 'kinozal-log-' + clean(S.me.name, 20).replace(/\s+/g, '_') + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.txt';
        const blob = new Blob(['\ufeff' + txt], { type: 'text/plain' });
        await post(ch.id, { kind: 'file', name: fileName(name), size: blob.size }, blob);
        openChat(ch.id); toast('Журнал отправлен');
      };
      list.append(p);
    }
    card.append(el('h2', '', 'Кому отправить журнал?'), el('p', '', 'В журнале — запуски, сбои окна и видеокарты, ошибки программы. Переписки и фото туда не попадают.'), list, btnEl('Отмена', '', close));
  });
}
function infoDlg(c) {
  modal((card, close) => {
    if (isDm(c)) {
      const u = dmPeer(c), ct = S.contacts[u] || {};
      card.style.justifyItems = 'center'; card.style.textAlign = 'center';
      card.append(avEl(u, 110), el('h2', '', nameOf(u)), el('p', '', (isOn(u) ? 'в сети' : seenText(ct.seen)) + (ct.ver ? ' · Кинозал ' + ct.ver : '')));
      const idc = el('div', 'idcard'), t = el('div'); t.append(el('span', 'lab', 'ID'), el('code', '', fmtId(u))); idc.append(t, btnEl('Скопировать', '', () => navigator.clipboard.writeText(fmtId(u)).then(() => toast('ID скопирован')).catch(() => {}))); card.append(idc);
      const alias = el('input'); alias.type = 'text'; alias.placeholder = 'Подписать по-своему'; alias.maxLength = 40; alias.value = ct.alias || '';
      card.append(alias);
      const row = el('div', 'row'); row.style.justifyContent = 'center';
      row.append(btnEl('📞 Позвонить', '', () => { close(); startCall(c, 'call'); }), btnEl('🎬 Кинозал', '', () => { close(); startCall(c, 'cinema'); }));
      card.append(row);
      const row2 = el('div', 'row'); row2.style.justifyContent = 'center';
      row2.append(btnEl(ct.state === 'blocked' ? 'Разблокировать' : 'Заблокировать', '', () => { close(); ct.state === 'blocked' ? unblock(u) : block(u); }), btnEl('Готово', 'pri', () => { const ct2 = S.contacts[u]; if (ct2) { const a = clean(alias.value, 40); if (a !== (ct2.alias || '')) { ct2.alias = a; ctChanged(ct2); } renderList(); renderHead(); } close(); }));
      card.append(row2);
    } else {
      const g = S.groups[c]; if (!g) return close();
      const name = el('input'); name.type = 'text'; name.value = g.name; name.maxLength = 60; name.disabled = !!g.gone;
      card.append(avEl(c, 80), el('label', '', 'Название'), name, el('label', '', g.members.length + ' ' + plural(g.members.length, 'участник', 'участника', 'участников')));
      const ml = el('div', 'mlist');
      for (const u of g.members) {
        const p = el('div', 'pick'), w = el('div', 'avwrap'); w.append(avEl(u, 38), el('i', 'dot')); if (isOn(u)) w.classList.add('on');
        const t = el('span'); t.append(document.createTextNode(nameOf(u) + (u === myId ? ' (ты)' : '')), el('small', '', u === myId ? '' : isOn(u) ? 'в сети' : fmtId(u)));
        p.append(w, t);
        if (u !== myId) { const b = el('button', 'btn', 'Написать'); b.style.minHeight = '34px'; b.onclick = () => { close(); if (!S.contacts[u]) S.contacts[u] = { id: u, name: g.names[u] || '', state: 'ok', added: Date.now() }; else if (S.contacts[u].state === 'member') S.contacts[u].state = 'ok'; save(); openChat(dmId(u)); }; p.append(b); }
        ml.append(p);
      }
      card.append(ml);
      if (!g.gone) {
        const add = Object.values(S.contacts).filter(x => ['ok', 'pending', 'req', 'member'].includes(x.state) && !g.members.includes(x.id));
        if (add.length) card.append(btnEl('+ Добавить участников', '', () => { close(); addMembersDlg(c); }));
      }
      const row = el('div', 'row');
      if (!g.gone) row.append(btnEl('Выйти из группы', '', () => { close(); leaveGroup(c); }));
      row.append(btnEl('Готово', 'pri', async () => {
        const n = clean(name.value, 60);
        if (!g.gone && n && n !== g.name) { g.name = n; g.ver = Date.now(); save(); pushGroup(g); await post(c, { kind: 'sys', text: S.me.name + ' переименовывает группу в «' + n + '»' }); renderHead(); renderList(); }
        close();
      }));
      card.append(row);
    }
  });
}
function addMembersDlg(c) {
  const g = S.groups[c]; if (!g) return;
  modal((card, close) => {
    const list = el('div', 'picklist'), sel = new Set();
    for (const x of Object.values(S.contacts).filter(x => ['ok', 'pending', 'req', 'member'].includes(x.state) && !g.members.includes(x.id))) {
      const l = el('label', 'pick'), cb = el('input'); cb.type = 'checkbox'; cb.onchange = () => cb.checked ? sel.add(x.id) : sel.delete(x.id);
      const t = el('div'); t.append(document.createTextNode(nameOf(x.id)), el('small', '', fmtId(x.id))); l.append(avEl(x.id, 38), t, cb); list.append(l);
    }
    const row = el('div', 'row');
    row.append(btnEl('Отмена', '', close), btnEl('Добавить', 'pri', async () => {
      if (!sel.size) return close();
      for (const u of sel) { g.members.push(u); g.names[u] = nameOf(u); }
      g.ver = Date.now(); save(); pushGroup(g); close();
      await post(c, { kind: 'sys', text: S.me.name + ' добавляет в группу: ' + [...sel].map(u => nameOf(u)).join(', ') });
      for (const u of sel) dial(u);
      renderHead();
    }));
    card.append(el('h2', '', 'Добавить в «' + g.name + '»'), list, row);
  });
}
async function leaveGroup(c) {
  const g = S.groups[c]; if (!g || !confirm('Выйти из группы «' + g.name + '»? Переписка у тебя удалится.')) return;
  await post(c, { kind: 'sys', text: S.me.name + ' выходит из группы' });
  await sleep(400);
  const old = [...g.members]; g.members = g.members.filter(u => u !== myId); g.ver = Date.now();
  const w = gWire(g); for (const u of old) send(u, { t: 'groups', list: [w] });   // myId — мои другие устройства
  delete S.groups[c]; delete S.chats[c]; save(); await wipeChat(c);
  if (open === c) closeChat(); renderList();
}
// удалённое у себя не должно вернуться сверкой при следующей встрече: запоминаем время последнего сообщения
// и всё, что не новее его, дальше молча отбрасываем (время берём из переписки, а не из часов — часы у всех разные)
async function markCleared(c) {
  const top = (await chatMsgs(c, 1))[0];
  const ts = Math.max(top?.ts || 0, S.chats[c]?.last?.ts || 0, S.cleared?.[c] || 0);
  if (ts) { (S.cleared ||= {})[c] = ts; save(); }
}
async function deleteChat(c) {
  if (!confirm('Удалить переписку у себя? У собеседника она останется.')) return;
  await markCleared(c); await wipeChat(c); const ch = S.chats[c]; if (ch) { ch.last = null; ch.unread = 0; }
  if (!isDm(c) && S.groups[c]?.gone) { delete S.groups[c]; delete S.chats[c]; }
  else if (isDm(c) && S.contacts[dmPeer(c)]?.state === 'req') delete S.chats[c];
  save(); if (open === c) closeChat(); renderList();
}
// удалить чат целиком — пропадает из списка; если собеседник напишет снова, чат появится заново
function removeChat(c) {
  if (!isDm(c) && S.groups[c] && !S.groups[c].gone) return leaveGroup(c);
  const u = isDm(c) ? dmPeer(c) : null;
  modal((card, close) => {
    const cb = el('input'); cb.type = 'checkbox';
    const sw = el('label', 'switch'); sw.append(document.createTextNode('Убрать из собеседников'), cb);
    const row = el('div', 'row');
    row.append(btnEl('Отмена', '', close), btnEl('Удалить', 'pri', async () => { close(); await dropChat(c, !!u && cb.checked); }));
    card.append(el('h2', '', 'Удалить чат?'),
      el('p', '', u ? 'Чат «' + chatTitle(c) + '» и вся переписка удалятся только у тебя — у собеседника останутся. Если он напишет снова, чат появится.' : 'Чат и переписка удалятся у тебя.'),
      ...(u ? [sw] : []), row);
  });
}
async function dropChat(c, forgetContact) {
  await markCleared(c); await wipeChat(c);
  delete S.chats[c]; if (!isDm(c)) delete S.groups[c];
  if (forgetContact) { const u = dmPeer(c); delete S.contacts[u]; closeLinks(u); }
  save(); if (open === c) closeChat(); renderList(); toast('Чат удалён');
}
// меню чата в списке: долгое нажатие на телефоне или правый клик на компьютере
function listMenu(c, x, y) {
  closeMenus(); menuAt = Date.now();
  const mn = el('div', 'menu fabmenu mx-pop');
  Object.assign(mn.style, { position: 'fixed', left: Math.max(8, Math.min(x, innerWidth - 250)) + 'px', top: Math.max(8, Math.min(y, innerHeight - 160)) + 'px', bottom: 'auto', zIndex: 50 });
  const add = (ic, t, f, cls) => { const b = el('button', cls || ''); b.append(el('i', '', ic), document.createTextNode(t)); b.onclick = () => { closeMenus(); f(); }; mn.append(b); };
  add('💬', 'Открыть', () => openChat(c));
  add('🧹', 'Очистить переписку', () => deleteChat(c), 'danger');
  if (!isDm(c) && S.groups[c] && !S.groups[c].gone) add('🚪', 'Выйти из группы', () => leaveGroup(c), 'danger');
  else add('🗑', 'Удалить чат', () => removeChat(c), 'danger');
  document.body.append(mn); mn.addEventListener('click', e => e.stopPropagation());
}
function block(u) { const ct = S.contacts[u] ||= { id: u, name: '', added: Date.now() }; ct.state = 'blocked'; ctChanged(ct); closeLinks(u); renderList(); renderHead(); toast('Заблокировано'); }
function unblock(u) { const ct = S.contacts[u]; if (ct) { ct.state = 'ok'; ctChanged(ct); } save(); dial(u); renderList(); renderHead(); }
function chatMenu(c, anchor) {
  closeMenus();
  const r = anchor.getBoundingClientRect(), mn = el('div', 'menu fabmenu mx-pop');
  Object.assign(mn.style, { position: 'fixed', top: r.bottom + 6 + 'px', left: Math.max(8, r.right - 240) + 'px', bottom: 'auto', zIndex: 50 });
  const add = (ic, t, f, cls) => { const b = el('button', cls || ''); b.append(el('i', '', ic), document.createTextNode(t)); b.onclick = () => { closeMenus(); f(); }; mn.append(b); };
  add(isDm(c) ? '👤' : '👥', isDm(c) ? 'О собеседнике' : 'Участники и название', () => infoDlg(c));
  add('🔍', 'Поиск в чате', () => openFind());
  if (!isDm(c) && !S.groups[c]?.gone) add('➕', 'Добавить участников', () => addMembersDlg(c));
  add('📎', 'Отправить фото или файл', () => $('.mx-input input[type=file]')?.click());
  add('🧹', 'Очистить переписку у себя', () => deleteChat(c), 'danger');
  if (isDm(c) || S.groups[c]?.gone) add('🗑', 'Удалить чат', () => removeChat(c), 'danger');
  if (isDm(c)) { const u = dmPeer(c); add('⛔', S.contacts[u]?.state === 'blocked' ? 'Разблокировать' : 'Заблокировать', () => S.contacts[u]?.state === 'blocked' ? unblock(u) : block(u), 'danger'); }
  else if (!S.groups[c]?.gone) add('🚪', 'Выйти из группы', () => leaveGroup(c), 'danger');
  document.body.append(mn); mn.addEventListener('click', e => e.stopPropagation());
}

// ---------- запуск ----------
function boot() {
  root.hidden = !!window.kzRoom?.inRoom;
  jlog('[мессенджер] запуск, ID', myId, '· контактов', Object.keys(S.contacts).length, '· чатов', Object.keys(S.chats).length, SLOT ? '· профиль ' + SLOT : '');
  profTouch(); backupSoon();
  if (restored) setTimeout(() => toast('Профиль восстановлен из запасной копии — переписка догрузится от собеседников'), 1500);
  try { renderMe(); renderList(); showEmpty(); } catch (e) { console.error('[мессенджер] отрисовка: ' + (e?.stack || e)); }
  startPeer(); tickAlerts();
  if (!myDev) { setTimeout(vaultSync, 5000); setInterval(vaultSync, 30 * 6e4); }   // данные для входа по паролю: пополняем запасные места
  // пришли по ссылке: #add=ID — новый собеседник, #КОД — сразу в зал
  const go = () => {
    const h = location.hash.slice(1); if (!h) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    const a = h.match(/add=([0-9A-Za-z-]{10,13})/);
    if (a) { const e = addContact(normId(a[1])); if (e) toast(e); else toast('Собеседник добавлен — напиши ему'); }
    else if (/^[A-Za-z0-9]{5}$/.test(h) && window.kzRoom && !window.kzRoom.busy) { toast('Подключаюсь к залу ' + h.toUpperCase() + '…'); window.kzRoom.join(h.toUpperCase(), S.me.name).then(ok => { if (!ok) toast('Зал с таким кодом не найден'); }); }
  };
  go(); window.addEventListener('hashchange', go);
  // страховка: если на экране вдруг не видно ни чатов, ни зала, ни приветствия — показываем чаты
  setInterval(() => {
    const room = document.getElementById('room');
    if (S.me && root.hidden && room?.hidden && !document.querySelector('.mx-hello')) { console.warn('[мессенджер] экран был пустым — показываю чаты'); root.hidden = false; renderList(); }
  }, 2000);
}
if (DESK && window.kzMusic) {
  musicApi = window.kzMusic.mount({
    store, toast, modal, btnEl: (...a) => btnEl(...a), host: () => $('#mxMain'), side: root.querySelector('.mx-side'), openSelf: openMusic, close: closeMusic,
    // связь с собеседниками для совместного прослушивания
    net: {
      send, peer: () => peer, nameOf: u => nameOf(u), myName: () => S.me?.name || '',
      canMu: u => linksOf(u).some(L => L.their?.caps.includes('mu')),
      friends: () => Object.values(S.contacts).filter(ct => ct.state !== 'blocked' && ct.id !== myId && isOn(ct.id) && linksOf(ct.id).some(L => L.their?.caps.includes('mu'))).map(ct => ({ id: ct.id, name: nameOf(ct.id) })),
      isOn: u => isOn(u),
      canJoin: u => actAllowed(u) && actCfg().join,
      friendActs, actText, actIcon, joinAct: actJoin, actChanged, openActDlg: actDlg
    }
  });
  if (musicApi) { $('#mxMusic').hidden = false; const rm = document.getElementById('roomMusic'); if (rm) rm.hidden = false; }
}
window.__mx = { get S() { return S; }, myId, myDev, myPeer, links, isOn, openChat, post, devicesDlg, vaultSync, setPassword, get open() { return open; } }; // для диагностики
if (S.me) boot(); else helloDlg();
})().catch(e => {
  // не оставляем пустой тёмный экран: показываем, что случилось, и кнопку перезапуска
  console.error('[мессенджер] не запустился: ' + (e?.stack || e));
  const d = document.createElement('div'); d.className = 'mx-hello';
  const c = document.createElement('div'); c.className = 'mx-card';
  const h = document.createElement('h2'); h.textContent = 'Кинозал не запустился';
  const p = document.createElement('p'); p.textContent = 'Ошибка: ' + (e?.message || e) + '. Перезапусти программу. Если повторится — правый клик по значку у часов → «Открыть журнал ошибок» и пришли файл kinozal.log.';
  const b = document.createElement('button'); b.className = 'btn pri'; b.textContent = 'Перезапустить'; b.onclick = () => location.reload();
  c.append(h, p, b); d.append(c); document.body.append(d);
});
