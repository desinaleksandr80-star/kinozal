// Кинозал — мессенджер.
// Без серверов: каждый участник — это ключ ECDSA P-256 на его компьютере, ID — кусок хэша открытого ключа.
// Компьютеры соединяются напрямую (WebRTC через PeerJS), при встрече проверяют подписи друг друга
// и досинхронизируют переписку: что есть у одного и нет у другого — досылается. История живёт в IndexedDB.
// Звонок и кинозал — это обычный зал по коду (код в index.html), приглашение уходит сообщением в чат.
(async () => {
'use strict';
const APP = window.kinozalApp || null;
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] };
const LIMIT = 25e6;                 // самый большой файл в сообщении (кружочек ~5 МБ, фото до 8 МБ, документ до 25 МБ)
const SYNC_DEPTH = 300;             // сколько последних сообщений чата сверяем при встрече
const DOWNLOAD = 'https://github.com/desinaleksandr80-star/kinozal/releases/latest/download/Kinozal-Setup.exe';

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
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.6-1.3-.6-2.1 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7" r="1.2" fill="currentColor"/></svg>',
  logo: '<svg class="logo" viewBox="0 0 480 300" role="img" aria-label="Кинозал"><defs><linearGradient id="mxbeam" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6b4a" stop-opacity=".55"/><stop offset="1" stop-color="#ff6b4a" stop-opacity="0"/></linearGradient><linearGradient id="mxscr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd2c4"/><stop offset=".6" stop-color="#ff8a6c"/><stop offset="1" stop-color="#e2553a"/></linearGradient></defs><polygon points="440,262 40,26 300,26" fill="url(#mxbeam)"/><rect x="40" y="26" width="260" height="150" rx="10" fill="url(#mxscr)"/><circle cx="440" cy="262" r="12" fill="#ff6b4a"/><g fill="#1c282b" stroke="#2a3639"><rect x="30" y="226" width="64" height="58" rx="18"/><rect x="110" y="226" width="64" height="58" rx="18"/><rect x="190" y="226" width="64" height="58" rx="18"/></g><g fill="#5fd4c4"><circle cx="62" cy="214" r="14"/><circle cx="142" cy="210" r="15"/><circle cx="222" cy="214" r="14"/></g></svg>'
};

// ---------- хранилище ----------
const db = await new Promise((res, rej) => {
  const r = indexedDB.open('kinozal-mx', 1);
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
    r.onsuccess = () => { const c = r.result; if (c) { bl.delete(c.value.id); c.delete(); c.continue(); } };
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
const delMsg = id => new Promise(res => { const t = db.transaction(['msgs', 'blobs'], 'readwrite'); t.objectStore('msgs').delete(id); t.objectStore('blobs').delete(id); t.oncomplete = res; t.onerror = res; });

// состояние: я, контакты, группы, чаты (сами сообщения — отдельно, в msgs)
let S = await kvGet('state') || null;
if (!S) S = { me: null, contacts: {}, groups: {}, chats: {}, ended: {} };
S.ended ||= {};
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => kvSet('state', S).catch(e => console.warn('save', e)), 250); }

// ---------- личность: ключ и подписи ----------
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function b32(bytes) { let bits = 0, val = 0, out = ''; for (const b of bytes) { val = ((val << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } return out; }
const normId = s => String(s || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V').replace(/[^0-9A-Z]/g, '');
const fmtId = id => id ? id.slice(0, 5) + '-' + id.slice(5) : '';
const pid = id => 'kzm-' + id.toLowerCase();
async function idFromPub(p) { const h = await crypto.subtle.digest('SHA-256', enc(String(p.x) + '.' + String(p.y))); return b32(new Uint8Array(h)).slice(0, 10); }
let keys = await kvGet('keys');
if (!keys) {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', k.publicKey);
  keys = { pub: { kty: 'EC', crv: 'P-256', x: j.x, y: j.y }, priv: k.privateKey };
  await kvSet('keys', keys);
}
const myId = await idFromPub(keys.pub);
const sign = async s => b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.priv, enc(s)));
async function verify(pub, sig, s) {
  try { const k = await crypto.subtle.importKey('jwk', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, unb64(sig), enc(s)); }
  catch (e) { return false; }
}
let appVer = '';
APP?.version?.().then(v => { appVer = String(v || ''); }).catch(() => {});

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
const links = new Map();    // id -> связь {c, authed, outgoing, nonce, uid, their, q}
const dialing = new Map();  // id -> когда начали звонить
const typing = new Map();   // chat|uid -> до какого времени «печатает»
function startPeer() {
  if (typeof Peer === 'undefined') { setNet('off'); setTimeout(startPeer, 5000); return; }
  try { peer?.destroy(); } catch (e) {}
  setNet('wait');
  const p = peer = new Peer(pid(myId), { config: ICE, debug: 0 });
  p.on('open', () => { if (peer !== p) return; idTaken = 0; setNet('on'); dialAll(); });
  p.on('connection', c => {
    const u = c.peer.startsWith('kzm-') ? normId(c.peer.slice(4)) : '';
    if (!u || u.length !== 10 || S.contacts[u]?.state === 'blocked') { setTimeout(() => { try { c.close(); } catch (e) {} }, 100); return; }
    wire(c, false, u);
  });
  p.on('disconnected', () => { if (peer !== p) return; setNet('wait'); setTimeout(() => { if (peer === p && !p.destroyed && p.disconnected) try { p.reconnect(); } catch (e) {} }, 2000); });
  p.on('error', e => {
    if (peer !== p) return;
    if (e.type === 'peer-unavailable') { const m = String(e.message || '').match(/kzm-([0-9a-z]+)/i); if (m) dialing.delete(normId(m[1])); return; }
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
  set.delete(myId); return [...set];
}
function dial(u) {
  if (!peer || net !== 'on' || u === myId || S.contacts[u]?.state === 'blocked') return;
  const l = links.get(u); if (l?.c.open) return;
  const t = dialing.get(u); if (t && Date.now() - t < 20000) return;
  dialing.set(u, Date.now());
  try { wire(peer.connect(pid(u), { reliable: true, metadata: { v: 1 } }), true, u); } catch (e) { dialing.delete(u); }
}
async function dialAll() { for (const u of dialList()) { dial(u); await sleep(120); } }
setInterval(dialAll, 40000);
window.addEventListener('focus', () => { if (net === 'on') dialAll(); });
function wire(c, outgoing, u) {
  const L = { c, outgoing, authed: false, nonce: b64(rnd(18)), uid: u, their: null, q: Promise.resolve() };
  c.on('open', () => { c.send({ t: 'hello', v: 1, id: myId, pub: keys.pub, name: S.me?.name || '', avatar: S.me?.avatar || '', frame: S.me?.frame || null, nonce: L.nonce, ver: appVer }); });
  c.on('data', d => { L.q = L.q.then(() => onData(L, d)).catch(e => console.error('[сообщение] ' + (e?.stack || e))); });
  const end = () => {
    if (outgoing) dialing.delete(u);
    if (links.get(u) === L) { links.delete(u); jlog('[связь] нет с', u); if (S.contacts[u]) { S.contacts[u].seen = Date.now(); save(); } presence(u); }
  };
  c.on('close', end); c.on('error', end);
  setTimeout(() => { if (!L.authed) { try { c.close(); } catch (e) {} end(); } }, 25000);
}
const isOn = u => !!links.get(u)?.authed && links.get(u).c.open;
function send(u, m) { const l = links.get(u); if (!l?.authed || !l.c.open) return false; try { l.c.send(m); return true; } catch (e) { return false; } }
function sendChat(c, m) { for (const u of members(c)) if (u !== myId) send(u, m); }

async function onData(L, d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'hello') {
    if (L.their || !d.pub || normId(d.id) !== L.uid) return;
    const pub = { kty: 'EC', crv: 'P-256', x: String(d.pub.x || ''), y: String(d.pub.y || '') };
    if (await idFromPub(pub) !== L.uid) { console.warn('чужой ключ', L.uid); L.c.close(); return; }
    L.their = { pub, name: clean(d.name, 40), avatar: cleanAvatar(d.avatar), ver: clean(d.ver, 20), frame: window.kzTheme?.cleanFrame(d.frame) || null };
    L.c.send({ t: 'proof', sig: await sign(String(d.nonce || '') + '|' + myId) });
    return;
  }
  if (d.t === 'proof') {
    if (!L.their || L.authed) return;
    if (!await verify(L.their.pub, d.sig, L.nonce + '|' + L.uid)) { console.warn('подпись не сошлась', L.uid); L.c.close(); return; }
    L.authed = true; return linkUp(L);
  }
  if (!L.authed) return;
  const u = L.uid;
  switch (d.t) {
    case 'msg': return onMsg(u, d);
    case 'ack': for (const id of [].concat(d.ids || []).slice(0, 500)) { const m = await msgGet(String(id)); if (m && m.from === myId && !m.ack) { m.ack = 1; await msgPut(m); const l = S.chats[m.chat]?.last; if (l?.id === m.id) { l.ack = 1; save(); } tick(m); } } return;
    case 'read': { const c = String(d.chat || ''); if (!shares(c, u)) return; const ch = ensureChat(c); const ts = +d.ts || 0; if (ts > (ch.seen[u] || 0)) { ch.seen[u] = ts; save(); ticksAll(c); renderList(); } return; }
    case 'sync': return onSync(u, d);
    case 'groups': for (const g of [].concat(d.list || []).slice(0, 100)) mergeGroup(g, u); return;
    case 'profile': { const ct = S.contacts[u]; const n = clean(d.name, 40); if (ct) { if (n) ct.name = n; ct.avatar = cleanAvatar(d.avatar); ct.frame = window.kzTheme?.cleanFrame(d.frame) || null; } for (const g of groupsWith(u)) if (n) g.names[u] = n; save(); renderList(); renderHead(); return; }
    case 'typing': { const c = String(d.chat || ''); if (!shares(c, u)) return; typing.set(c + '|' + u, Date.now() + 4500); renderHead(); renderList(); setTimeout(() => { renderHead(); renderList(); }, 4700); return; }
    case 'decline': if (myCall && d.code === myCall.code) toast(nameOf(u) + ' сейчас не может ответить'); return;
    case 'callend': { const code = clean(d.code, 8); if (!code) return; S.ended[code] = Date.now(); save(); if (ringing?.code === code) stopRing(); refreshCallCards(); return; }
  }
}
function linkUp(L) {
  const u = L.uid, ex = links.get(u);
  if (ex && ex !== L && ex.authed && ex.c.open) {
    // двое позвонили друг другу одновременно — оставляем соединение того, у кого ID меньше
    const exO = ex.outgoing ? myId : u, myO = L.outgoing ? myId : u;
    if (exO < myO) { setTimeout(() => L.c.close(), 300); return; }
    setTimeout(() => ex.c.close(), 300);
  }
  links.set(u, L); dialing.delete(u); jlog('[связь] есть с', u, L.their?.ver || '');
  const t = L.their; let ct = S.contacts[u];
  if (ct) { if (t.name) ct.name = t.name; ct.avatar = t.avatar; ct.ver = t.ver; ct.frame = t.frame; if (ct.state === 'pending') ct.state = 'ok'; }
  else S.contacts[u] = ct = { id: u, name: t.name, avatar: t.avatar, ver: t.ver, frame: t.frame, state: groupsWith(u).length ? 'member' : 'req', added: Date.now() };
  for (const g of groupsWith(u)) if (t.name) g.names[u] = t.name;
  save(); presence(u);
  const gl = groupsWith(u).map(gWire); if (gl.length) send(u, { t: 'groups', list: gl });
  for (const c of sharedChats(u)) { const ch = S.chats[c]; if (ch?.myRead) send(u, { t: 'read', chat: c, ts: ch.myRead }); }
  sendSync(u);
}
async function sendSync(u) {
  const have = {};
  for (const c of sharedChats(u)) have[c] = (await chatMsgs(c)).map(m => m.id);
  send(u, { t: 'sync', have });
}
async function onSync(u, d) {
  const have = d.have && typeof d.have === 'object' ? d.have : {};
  for (const c of sharedChats(u)) {
    const theirs = new Set([].concat(have[c] || []).slice(0, 2000));
    for (const m of await chatMsgs(c)) if (!theirs.has(m.id)) { if (!await push(u, m)) return; await sleep(5); }
  }
}
const wireMsg = m => ({ id: m.id, chat: m.chat, from: m.from, ts: m.ts, kind: m.kind, text: m.text, mime: m.mime, dur: m.dur, wave: m.wave, code: m.code, room: m.room, blob: m.blob, w: m.w, h: m.h, name: m.name, size: m.size });
async function push(u, m) {
  if (!isOn(u)) return false;
  let b = null;
  if (m.blob) { const bl = await blobGet(m.id); if (bl) b = await bl.arrayBuffer(); }
  return send(u, { t: 'msg', m: wireMsg(m), b });
}
const KINDS = ['text', 'img', 'voice', 'circle', 'call', 'sys', 'file'];
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
    m.blob = 1; m.mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(x.mime || '')) ? String(x.mime) : 'application/octet-stream';
    m.name = fileName(x.name); m.size = Math.max(0, +x.size || 0);
  }
  if (m.kind === 'call') { m.code = clean(x.code, 8).toUpperCase(); m.room = x.room === 'cinema' ? 'cinema' : 'call'; if (!/^[A-Z0-9]{5}$/.test(m.code)) return null; }
  return m;
}
async function onMsg(u, d) {
  const m = cleanMsg(d.m); if (!m) return;
  if (isDm(m.chat)) { if (m.chat !== dmId(u) || (m.from !== u && m.from !== myId)) return; }
  else if (!shares(m.chat, u) || !members(m.chat).includes(m.from)) return;
  if (await msgGet(m.id)) { send(u, { t: 'ack', ids: [m.id] }); return; }
  if (m.blob) {
    const b = d.b instanceof ArrayBuffer ? d.b : ArrayBuffer.isView(d.b) ? d.b.buffer.slice(d.b.byteOffset, d.b.byteOffset + d.b.byteLength) : null;
    if (!b || !b.byteLength || b.byteLength > LIMIT) return;
    await blobPut(m.id, new Blob([b], { type: m.mime }));
  }
  if (m.from === myId) m.ack = 1;
  await msgPut(m);
  send(u, { t: 'ack', ids: [m.id] });
  arrived(m);
}
// новое сообщение (своё или чужое) — в список, в открытый чат, в уведомления
function arrived(m) {
  const ch = ensureChat(m.chat);
  if (!ch.last || m.ts >= ch.last.ts) ch.last = { ts: m.ts, from: m.from, kind: m.kind, text: m.text || '', id: m.id, room: m.room, ack: m.ack, name: m.name };
  const mine = m.from === myId;
  const viewing = open === m.chat && document.visibilityState === 'visible' && document.hasFocus() && $('#mx') && !$('#mx').hidden;
  if (!mine && m.ts > (ch.myRead || 0) && !viewing) ch.unread = (ch.unread || 0) + 1;
  if (isDm(m.chat) && !mine) { const u = dmPeer(m.chat); if (!S.contacts[u]) S.contacts[u] = { id: u, name: '', state: 'req', added: Date.now() }; }
  save(); renderList();
  if (open === m.chat) appendMsg(m);
  if (viewing && !mine) markRead(m.chat);
  if (!mine && Date.now() - m.ts < 5 * 6e4) {
    if (m.kind === 'call' && Date.now() - m.ts < 90000 && !S.ended[m.code]) ring(m);
    else if (!viewing && m.kind !== 'sys') notify(m);
  }
}

// ---------- отправка ----------
async function post(c, x, blob) {
  if (isDm(c)) { const ct = S.contacts[dmPeer(c)]; if (ct && (ct.state === 'req' || ct.state === 'member')) { ct.state = 'ok'; save(); renderHead(); } }  // ответил — значит, свой
  const m = { id: uid(), chat: c, from: myId, ts: Date.now(), ...x };
  if (blob) { m.blob = 1; m.mime = blob.type; await blobPut(m.id, blob); }
  await msgPut(m); arrived(m);
  for (const u of members(c)) if (u !== myId) { if (isOn(u)) push(u, m); else dial(u); }
  return m;
}
function markRead(c) {
  const ch = S.chats[c]; if (!ch) return;
  const lastTs = ch.last?.ts || 0;
  if ((ch.unread || 0) === 0 && (ch.myRead || 0) >= lastTs) return;
  ch.unread = 0; ch.myRead = Math.max(ch.myRead || 0, lastTs); save(); renderList();
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
function pushGroup(g, extra = []) { const w = gWire(g); for (const u of new Set([...g.members, ...extra])) if (u !== myId) { if (isOn(u)) send(u, { t: 'groups', list: [w] }); else dial(u); } }
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
  <div class="mx-top"><button class="me" id="mxMe" title="Профиль и настройки"></button><h1>Чаты<small id="mxNet"></small></h1><button class="ib" id="mxTheme" title="Оформление: темы, обои, неон">${IC.palette}</button><button class="ib" id="mxAdd" title="Добавить собеседника">${IC.add}</button></div>
  <div class="mx-search"><input id="mxQ" type="search" placeholder="Поиск" autocomplete="off"></div>
  <div class="mx-callbar" id="mxCallbar" hidden><i class="pulse"></i><span>Идёт звонок</span><b>Вернуться →</b></div>
  <div class="mx-list" id="mxList"></div>
  <div class="mx-fab"><div class="fabmenu menu" id="mxFabMenu" hidden>
    <button data-a="contact"><i>👤</i>Новый собеседник</button><button data-a="group"><i>👥</i>Новая группа</button><button data-a="call"><i>📞</i>Созвон по коду</button>
  </div><button class="fab" id="mxFab" title="Новый чат" aria-label="Новый чат">✎</button></div>
</aside>
<main class="mx-main" id="mxMain"></main>`;
document.body.append(root);
setNet(net);
$('#mxQ').oninput = () => renderList();
$('#mxAdd').onclick = () => addContactDlg();
$('#mxTheme').onclick = () => openTheme();
$('#mxMe').onclick = () => settingsDlg();
$('#mxCallbar').onclick = () => window.kzRoom?.show();
$('#mxFab').onclick = e => { e.stopPropagation(); $('#mxFabMenu').hidden = !$('#mxFabMenu').hidden; };
$('#mxFabMenu').onclick = e => { const a = e.target.closest('button')?.dataset.a; $('#mxFabMenu').hidden = true; if (a === 'contact') addContactDlg(); else if (a === 'group') groupDlg(); else if (a === 'call') codeDlg(); };
document.addEventListener('click', () => { $('#mxFabMenu').hidden = true; closeMenus(); });
function closeMenus() { document.querySelectorAll('.mx-pop').forEach(x => x.remove()); }
function renderMe() { const b = $('#mxMe'); b.textContent = ''; if (S.me) b.append(avEl(myId, 40)); }

// ---------- список чатов ----------
function lastText(c, l) {
  if (!l) return ['', isDm(c) ? 'Напиши первым' : 'Группа создана'];
  const who = l.from === myId ? 'Ты: ' : !isDm(c) ? nameOf(l.from) + ': ' : '';
  const t = { img: '🖼 Фото', voice: '🎤 Голосовое сообщение', circle: '⭕ Видеосообщение', call: l.room === 'cinema' ? '🎬 Кинозал' : '📞 Видеозвонок', sys: l.text, file: '📄 ' + (l.name || 'Файл') }[l.kind] || l.text || '';
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
  if (!list.length) {
    const e = el('div', 'mx-nochats');
    if (q) e.append(el('span', '', 'Ничего не нашлось'));
    else { e.append(el('b', '', 'Пока нет чатов'), el('span', '', 'Добавь собеседника по его ID — и пишите, звоните, смотрите кино вместе.')); const b = el('button', 'btn pri', 'Добавить собеседника'); b.onclick = () => addContactDlg(); e.append(b); }
    box.append(e); return;
  }
  for (const ch of list) {
    const it = el('div', 'ci' + (ch.id === open ? ' act' : '')); it.dataset.chat = ch.id;
    const w = el('div', 'avwrap'); w.append(avEl(ch.id, 52), el('i', 'dot'));
    if (isDm(ch.id) && isOn(dmPeer(ch.id))) w.classList.add('on');
    const tx = el('div', 'tx'), r1 = el('div', 'r1'), r2 = el('div', 'r2');
    r1.append(el('span', 'nm', chatTitle(ch.id)));
    const l = ch.last;
    if (l?.from === myId && l.kind !== 'sys') r1.append(el('span', 'tick', readBy(ch.id, l.ts) || l.ack ? '✓✓' : '✓'));
    r1.append(el('span', 'tm', listTime(l?.ts || ch.created)));
    const ls = el('span', 'ls'), ty = typingIn(ch.id);
    if (ty) ls.append(el('span', 'ty', (isDm(ch.id) ? '' : nameOf(ty) + ' ') + 'печатает…'));
    else { const [who, t] = lastText(ch.id, l); if (who) ls.append(el('b', '', who)); ls.append(document.createTextNode(t)); }
    r2.append(ls); if (ch.unread) r2.append(el('span', 'badge', ch.unread > 99 ? '99+' : String(ch.unread)));
    tx.append(r1, r2); it.append(w, tx);
    it.onclick = () => openChat(ch.id);
    box.append(it);
  }
}
const readBy = (c, ts) => Object.entries(S.chats[c]?.seen || {}).some(([u, t]) => u !== myId && t >= ts);
function presence(u) { renderList(); if (open && members(open).includes(u)) renderHead(); }

// ---------- открытый чат ----------
let open = null, shown = [], urls = new Map(), downCount = 0;
function blobUrl(id) { return urls.get(id); }
async function mediaUrl(m) { if (urls.has(m.id)) return urls.get(m.id); const b = await blobGet(m.id); if (!b) return ''; const u = URL.createObjectURL(b); urls.set(m.id, u); return u; }
function freeUrls() { stopVoice(); for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); }
function showEmpty() {
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
  c.append(t, b); return c;
}
async function copyInvite() {
  const text = 'Пиши мне в Кинозале! Мой ID: ' + fmtId(myId) + '\nСкачать Кинозал: ' + DOWNLOAD;
  try { await navigator.clipboard.writeText(text); toast('Скопировано: ID и ссылка на скачивание'); } catch (e) { toast('Твой ID: ' + fmtId(myId)); }
}
async function openChat(c) {
  if (!S.chats[c] && !isDm(c) && !S.groups[c]) return;
  ensureChat(c);
  if (open !== c) { freeUrls(); open = c; }
  root.classList.add('chat-open');
  renderList(); await renderChat();
  markRead(c);
  if (isDm(c)) dial(dmPeer(c)); else for (const u of members(c)) if (u !== myId) dial(u);
  setTimeout(() => $('.mx-input textarea')?.focus(), 30);
}
function closeChat() { freeUrls(); open = null; renderList(); showEmpty(); }
async function renderChat() {
  const c = open; if (!c) return showEmpty();
  const main = $('#mxMain'); main.textContent = '';
  const sec = el('section', 'mx-chat'); sec.innerHTML = `
    <header class="mx-chead"><button class="ib back" title="К чатам">${IC.back}</button><div class="avwrap"></div><div class="who"><b></b><span></span></div>
      <div class="act"><button class="ib call" title="Видеозвонок">${IC.phone}</button><button class="ib cine" title="Кинозал — смотреть вместе">${IC.film}</button><button class="ib more" title="Ещё">${IC.dots}</button></div></header>
    <div class="mx-banner" hidden></div>
    <div class="mx-msgs" tabindex="-1"></div>
    <div class="mx-input"><div class="field"><button class="ib clip" title="Фото или файл">${IC.clip}</button><textarea rows="1" placeholder="Сообщение" maxlength="4000"></textarea></div>
      <button class="rec-btn" title=""></button><div class="rec-hint"></div><input type="file" multiple hidden></div>
    <button class="mx-down" hidden title="Вниз">↓<b hidden></b></button>`;
  main.append(sec);
  $('.back', sec).onclick = closeChat;
  $('.who', sec).onclick = () => infoDlg(c);
  $('.mx-chead .avwrap', sec).onclick = () => infoDlg(c);
  $('.call', sec).onclick = () => startCall(c, 'call');
  $('.cine', sec).onclick = () => startCall(c, 'cinema');
  $('.more', sec).onclick = e => { e.stopPropagation(); chatMenu(c, e.currentTarget); };
  setupInput(sec, c);
  const box = $('.mx-msgs', sec);
  box.addEventListener('scroll', () => { if (nearBottom(box)) { downCount = 0; updDown(); } else $('.mx-down', sec).hidden = false; });
  $('.mx-down', sec).onclick = () => { box.scrollTop = box.scrollHeight; downCount = 0; updDown(); };
  renderHead();
  shown = await chatMsgs(c, 400);
  if (open !== c) return;
  box.textContent = '';
  shown.forEach((m, i) => box.append(...mEls(m, shown[i - 1], shown[i + 1])));
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}
const nearBottom = b => b.scrollHeight - b.scrollTop - b.clientHeight < 140;
function updDown() { const d = $('.mx-down'); if (!d) return; const b = d.querySelector('b'); b.hidden = !downCount; b.textContent = downCount; if (!downCount && nearBottom($('.mx-msgs'))) d.hidden = true; }
function renderHead() {
  const c = open, h = $('.mx-chead'); if (!c || !h) return;
  const w = $('.avwrap', h); w.textContent = ''; w.append(avEl(c, 42), el('i', 'dot'));
  $('.who b', h).textContent = chatTitle(c);
  const st = $('.who span', h); st.className = '';
  const ty = typingIn(c);
  if (isDm(c)) {
    const u = dmPeer(c), on = isOn(u); w.classList.toggle('on', on);
    if (ty) { st.textContent = 'печатает…'; st.className = 'live'; }
    else if (on) { st.textContent = 'в сети'; st.className = 'live'; }
    else st.textContent = S.contacts[u]?.state === 'pending' && !S.contacts[u]?.name ? 'пока не в сети' : seenText(S.contacts[u]?.seen);
  } else {
    const g = S.groups[c], mem = g?.members || [], on = mem.filter(u => u !== myId && isOn(u)).length;
    if (ty) { st.textContent = nameOf(ty) + ' печатает…'; st.className = 'live'; }
    else st.textContent = g?.gone ? 'тебя нет в этой группе' : mem.length + ' ' + plural(mem.length, 'участник', 'участника', 'участников') + (on ? ', ' + on + ' в сети' : '');
  }
  // плашка над перепиской
  const bn = $('.mx-banner'); bn.textContent = ''; bn.hidden = true;
  const btn = (t, f, pri) => { const b = el('button', 'btn' + (pri ? ' pri' : ''), t); b.onclick = f; return b; };
  if (isDm(c)) {
    const u = dmPeer(c), ct = S.contacts[u];
    if (ct?.state === 'req' || ct?.state === 'member') { bn.hidden = false; bn.append(el('span', '', ct.state === 'req' ? 'Этого человека нет в твоих контактах.' : 'Вы вместе в группе, но не в контактах.'), btn('Добавить в контакты', () => { ct.state = 'ok'; save(); renderHead(); }, 1)); if (ct.state === 'req') bn.append(btn('Заблокировать', () => block(u))); }
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
  const row = el('div', 'm' + (mine ? ' mine' : '') + (sameRun(m, next) ? '' : ' tail') + (sameRun(prev, m) ? '' : ' gap') + (m.kind === 'circle' ? ' circ' : ''));
  row.dataset.id = m.id; row.dataset.from = m.from;
  if (grp && !mine) { if (sameRun(m, next)) row.append(el('div', 'ghost')); else row.append(avEl(m.from, 34)); }
  const b = el('div', 'b' + (m.kind === 'img' ? ' media' : ''));
  if (grp && !mine && !sameRun(prev, m)) { const f = el('span', 'from', nameOf(m.from)); f.style.setProperty('--h', hash(m.from) % 360); b.append(f); }
  if (m.kind === 'text') { b.append(textEl(m.text || '')); b.append(metaEl(m)); }
  else if (m.kind === 'img') { const i = el('img'); i.alt = 'Фото'; if (m.w && m.h) { i.width = m.w; i.height = m.h; i.style.aspectRatio = m.w + '/' + m.h; i.style.width = Math.min(360, m.w) + 'px'; i.style.height = 'auto'; } mediaUrl(m).then(u => { i.src = u; }); i.onclick = () => photo(m); b.append(i, metaEl(m)); }
  else if (m.kind === 'voice') { b.append(voiceEl(m), metaEl(m)); }
  else if (m.kind === 'circle') { b.append(circleEl(m)); row.append(b); const mt = metaEl(m); b.append(mt); }
  else if (m.kind === 'call') { b.append(callEl(m), metaEl(m)); }
  else if (m.kind === 'file') { b.append(fileEl(m), metaEl(m)); }
  if (m.kind !== 'circle') row.append(b);
  row.addEventListener('contextmenu', e => { e.preventDefault(); msgMenu(m, e); });
  out.push(row); return out;
}
function textEl(t) {
  const s = el('span', 'txt');
  for (const part of t.split(/(https?:\/\/[^\s<>"]+)/g)) {
    if (/^https?:\/\//.test(part)) { const a = el('a', '', part); a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer'; s.append(a); }
    else if (part) s.append(document.createTextNode(part));
  }
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
  box.append(...mEls(m, last, null));
  if (stick) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  else { downCount++; $('.mx-down').hidden = false; updDown(); }
}
function msgMenu(m, e) {
  closeMenus();
  const mn = el('div', 'menu fabmenu mx-pop'); mn.style.position = 'fixed'; mn.style.left = Math.min(e.clientX, innerWidth - 240) + 'px'; mn.style.top = Math.min(e.clientY, innerHeight - 140) + 'px'; mn.style.bottom = 'auto'; mn.style.zIndex = 50;
  const add = (ic, t, f, cls) => { const b = el('button', cls || ''); b.append(el('i', '', ic), document.createTextNode(t)); b.onclick = () => { closeMenus(); f(); }; mn.append(b); };
  if (m.text && m.kind === 'text') add('📋', 'Копировать текст', () => navigator.clipboard.writeText(m.text).then(() => toast('Скопировано')).catch(() => {}));
  if (m.kind === 'img') add('🖼', 'Открыть фото', () => photo(m));
  add('🗑', 'Удалить у себя', async () => { await delMsg(m.id); shown = shown.filter(x => x.id !== m.id); const ch = S.chats[m.chat]; if (ch?.last?.id === m.id) { const rest = await chatMsgs(m.chat, 1); const l = rest[0]; ch.last = l ? { ts: l.ts, from: l.from, kind: l.kind, text: l.text || '', id: l.id, room: l.room } : null; save(); } renderList(); renderChat(); }, 'danger');
  document.body.append(mn); mn.addEventListener('click', ev => ev.stopPropagation());
}
async function photo(m) { const u = await mediaUrl(m); if (!u) return; $('#lbImg').src = u; const a = $('#lbSave'); a.href = u; a.download = 'kinozal-foto-' + new Date(m.ts).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + (m.mime === 'image/jpeg' ? 'jpg' : m.mime.split('/')[1]); $('#lb').hidden = false; }

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
const fmtSize = n => n < 1024 ? n + ' Б' : n < 1048576 ? Math.round(n / 1024) + ' КБ' : (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';
function fileEl(m) {
  const w = el('a', 'filecard'); w.href = '#'; w.title = 'Сохранить';
  const ext = (m.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toUpperCase();
  const ic = el('span', 'ic', ext || '📄'), t = el('div', 't');
  t.append(el('b', '', m.name), el('span', '', fmtSize(m.size || 0) + ' · сохранить'));
  w.append(ic, t);
  w.onclick = async e => { e.preventDefault(); const u = await mediaUrl(m); if (!u) return; const a = el('a'); a.href = u; a.download = m.name; document.body.append(a); a.click(); a.remove(); };
  return w;
}
async function sendFiles(c, files) {
  for (const f of [...files].slice(0, 10)) {
    if (f.size > LIMIT) { toast('«' + f.name + '» больше 25 МБ — такой файл не отправить'); continue; }
    if (!f.size) continue;
    await post(c, { kind: 'file', name: fileName(f.name), size: f.size }, f.type ? f : new Blob([f], { type: 'application/octet-stream' }));
  }
}
const sendAny = (c, files) => { files = [...files]; const im = files.filter(f => /^image\/(png|jpeg|webp|gif|bmp)$/.test(f.type)); const ot = files.filter(f => !im.includes(f)); if (im.length) sendImages(c, im); if (ot.length) sendFiles(c, ot); };
// приглашение в звонок / кинозал
function callEl(m) {
  const w = el('div', 'callcard'); w.dataset.code = m.code;
  const cine = m.room === 'cinema';
  const ic = el('span', 'ic', cine ? '🎬' : '📞'), t = el('div', 't');
  const ended = S.ended[m.code] || Date.now() - m.ts > 6 * 3600e3;
  t.append(el('b', '', cine ? 'Кинозал' : 'Видеозвонок'), el('span', '', ended ? 'завершён' : m.from === myId ? 'ты зовёшь' : 'зовут присоединиться'));
  w.append(ic, t);
  if (!ended) {
    const here = window.kzRoom?.inRoom && window.kzRoom.code === m.code;
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
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(); } });
  ta.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); sendAny(c, f); } });
  const sendText = () => { const t = ta.value.trim(); if (!t) return; ta.value = ''; drafts[c] = ''; fit(); sync(); post(c, { kind: 'text', text: t.slice(0, 4000) }); };
  $('.clip', sec).onclick = () => file.click();
  file.onchange = () => { const f = [...file.files]; file.value = ''; if (f.length) sendAny(c, f); };
  // перетащить картинку в чат
  const chat = sec; let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  chat.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); depth++; } });
  chat.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  chat.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); });
  chat.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; sendAny(c, e.dataTransfer.files); });
  // кнопка справа: есть текст — «отправить»; нет — удерживать для записи, клик — сменить голос/кружочек
  let hold = 0, press = null;
  const say = t => { hint.textContent = t; hint.classList.add('on'); clearTimeout(say.h); say.h = setTimeout(() => hint.classList.remove('on'), 1800); };
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (ta.value.trim()) return;
    e.preventDefault(); btn.setPointerCapture(e.pointerId);
    press = { x: e.clientX, y: e.clientY, id: e.pointerId };
    hold = setTimeout(() => { hold = 0; btn.classList.add('hold'); startRec(c, recMode); }, 230);
  });
  btn.addEventListener('pointermove', e => {
    if (!press || !rec || rec.locked) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (dx < -110) { press = null; btn.classList.remove('hold'); stopRec(false); }
    else if (dy < -70) { rec.locked = true; btn.classList.remove('hold'); showRecBar(); }
  });
  const up = () => {
    if (!press) return; press = null; btn.classList.remove('hold');
    if (hold) { clearTimeout(hold); hold = 0; recMode = recMode === 'voice' ? 'circle' : 'voice'; store.set('mxRec', recMode); sync(); say(recMode === 'circle' ? 'Кружочек: удерживай кнопку и говори в камеру' : 'Голосовое: удерживай кнопку и говори'); return; }
    if (rec && !rec.locked) stopRec(true);
  };
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
  btn.addEventListener('click', () => { if (ta.value.trim()) sendText(); });
  fit(); sync();
}
// фото: уменьшаем до 1600 px, WebP; GIF — как есть
async function sendImages(c, files) {
  for (const f of [...files].filter(x => /^image\//.test(x.type)).slice(0, 10)) {
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
  const types = kind === 'circle' ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
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
  if (kind === 'circle') showCircleRec(); else showRecBar();
  if (r.locked) showRecBar();
}
function showRecBar() {
  const r = rec; if (!r) return;
  if (r.kind === 'circle') { showCircleRec(); return; }
  document.querySelector('.recbar')?.remove();
  const bar = el('div', 'recbar');
  bar.innerHTML = `<i class="rd"></i><span class="tm">0:00</span><div class="lv"></div><span class="hint"></span>`;
  bar.querySelector('.hint').textContent = r.locked ? '' : '← влево — отмена · ↑ вверх — без рук';
  if (r.locked) {
    const del = el('button', 'ib'); del.innerHTML = IC.trash; del.title = 'Удалить'; del.onclick = () => stopRec(false);
    const snd = el('button', 'send'); snd.innerHTML = IC.send; snd.title = 'Отправить'; snd.onclick = () => stopRec(true);
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
    const v = ov.querySelector('video'); v.srcObject = new MediaStream(r.stream.getVideoTracks()); v.play().catch(() => {});
  }
  ov.querySelector('.hint').textContent = r.locked ? '' : 'отпусти — отправить · влево — отмена · вверх — без рук';
  const act = ov.querySelector('.act'); act.textContent = '';
  if (r.locked) { const no = el('button', 'btn', 'Удалить'); no.onclick = () => stopRec(false); const yes = el('button', 'btn pri', 'Отправить'); yes.onclick = () => stopRec(true); act.append(no, yes); }
  paintRec();
}
function paintRec() {
  const r = rec; if (!r) return;
  const s = (performance.now() - r.start) / 1000;
  document.querySelectorAll('.recbar .tm, .circrec .tm').forEach(t => t.textContent = fmtDur(s) + (r.kind === 'circle' ? ' / 1:00' : ''));
  const lv = document.querySelector('.recbar .lv');
  if (lv) { const n = Math.floor(lv.clientWidth / 5); lv.textContent = ''; for (const x of r.levels.slice(-n)) { const i = el('i'); i.style.height = Math.max(8, Math.min(100, x * 160)) + '%'; lv.append(i); } }
  const ring = document.querySelector('.circrec svg circle'); if (ring) ring.style.strokeDashoffset = 100 - Math.min(100, s / r.max * 100);
}
function stopRec(sendIt) {
  const r = rec; if (!r) return;
  r.cancelled = !sendIt; rec = null;
  document.querySelector('.recbar')?.remove(); document.querySelector('.circrec')?.remove();
  clearInterval(r.timer); clearInterval(r.lv); try { r.ac?.close(); } catch (e) {}
  if (!r.mr) { r.cancelled = true; r.stream?.getTracks().forEach(t => t.stop()); return; }
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
    const type = r.kind === 'circle' ? 'video/webm' : (blob.type.split(';')[0] || 'audio/webm');
    await post(r.c, { kind: r.kind, dur: Math.round(dur * 10) / 10, ...(r.kind === 'voice' ? { wave } : {}) }, new Blob([blob], { type }));
  };
  try { r.mr.stop(); } catch (e) {}
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && rec) { e.stopPropagation(); stopRec(false); } }, true);

// ---------- звонки и кинозал ----------
let myCall = null, ringing = null;
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
  bn.onclick = () => { send(m.from, { t: 'decline', code: m.code, chat: m.chat }); stopRing(); };
  by.onclick = () => joinCall(m);
  try { ringAc = new AudioContext(); const loop = () => { if (!ringAc) return; const t = ringAc.currentTime + .05; tone(ringAc, 660, t, .35); tone(ringAc, 880, t + .38, .45); }; loop(); ringT = setInterval(loop, 2200); } catch (e) {}
  APP?.flash?.(true); notify(m, (m.room === 'cinema' ? 'Зовёт в кинозал' : 'Видеозвонок'));
  ringing.to = setTimeout(stopRing, 45000);
}
function stopRing() { clearInterval(ringT); ringT = 0; try { ringAc?.close(); } catch (e) {} ringAc = null; if (ringing) clearTimeout(ringing.to); ringing = null; document.querySelector('.mx-modal.ring')?.remove(); APP?.flash?.(false); }
window.kzOnRoom = (ev, info) => {
  jlog('[зал]', ev, info?.code || '');
  if (ev === 'enter' || ev === 'show') { root.hidden = true; stopRing(); }
  if (ev === 'hide') { root.hidden = false; $('#mxCallbar').hidden = false; renderList(); }
  if (ev === 'hostgone') { toast('Звонок завершён'); setTimeout(() => window.kzRoom?.leave(), 1500); }
  if (ev === 'exit') {
    root.hidden = !S.me; $('#mxCallbar').hidden = true;
    if (myCall) { S.ended[myCall.code] = Date.now(); save(); sendChat(myCall.chat, { t: 'callend', code: myCall.code }); myCall = null; }
    refreshCallCards(); if (open) markRead(open);
  }
};

// ---------- уведомления ----------
async function notify(m, override) {
  const title = isDm(m.chat) ? nameOf(m.from) : chatTitle(m.chat);
  const [, t] = lastText(m.chat, m); const body = override || (isDm(m.chat) ? t : nameOf(m.from) + ': ' + t);
  ding();
  if (APP?.notify) { APP.notify({ title, body, chat: m.chat }); APP.flash(true); }
  else if ('Notification' in window && Notification.permission === 'granted' && document.hidden) { const n = new Notification(title, { body }); n.onclick = () => { window.focus(); openChat(m.chat); }; }
}
APP?.onOpenChat?.(c => { if (window.kzRoom?.inRoom) window.kzRoom.hide(); if (S.chats[c]) openChat(c); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && open) markRead(open); });
window.addEventListener('focus', () => { if (open && !root.hidden) markRead(open); });
setInterval(() => { if (open) renderHead(); }, 30000);

// ---------- окна ----------
function modal(build, cls = '') {
  const ov = el('div', 'mx-modal ' + cls), card = el('div', 'mx-card');
  ov.append(card); document.body.append(ov);
  const close = () => ov.remove();
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
    try { const bm = await createImageBitmap(f); const s = Math.min(bm.width, bm.height), cv = el('canvas'); cv.width = cv.height = 160; cv.getContext('2d').drawImage(bm, (bm.width - s) / 2, (bm.height - s) / 2, s, s, 0, 0, 160, 160); set(cv.toDataURL('image/webp', .8)); paint(); } catch (e) { toast('Не получилось открыть фото'); }
  };
  paint(); return [b, inp];
}
function helloDlg() {
  const ov = el('div', 'mx-hello'), card = el('div', 'mx-card'); ov.append(card); document.body.append(ov);
  let avatar = '';
  card.innerHTML = IC.logo;
  const [ap, inp] = avatarPicker(() => avatar, v => { avatar = v; });
  const name = el('input'); name.type = 'text'; name.maxLength = 40; name.placeholder = 'Как тебя зовут?'; name.value = store.get('name', '');
  const go = btnEl('Начать', 'pri', () => {
    const n = clean(name.value, 40); if (!n) { name.focus(); return; }
    S.me = { id: myId, name: n, avatar }; store.set('name', n); save();
    ov.remove(); boot();
  });
  name.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
  card.append(el('h2', '', 'Добро пожаловать в Кинозал'), el('p', '', 'Мессенджер с голосовыми, кружочками и видеозвонками — а ещё можно смотреть кино вместе. Без регистрации: всё напрямую между вами.'), ap, inp, name, go);
  setTimeout(() => name.focus(), 50);
}
function addContactDlg() {
  modal((card, close) => {
    const inp = el('input'); inp.type = 'text'; inp.placeholder = 'XXXXX-XXXXX'; inp.maxLength = 16; inp.style.cssText = 'text-align:center;letter-spacing:.12em;font-weight:700;text-transform:uppercase';
    const alias = el('input'); alias.type = 'text'; alias.placeholder = 'Как подписать (необязательно)'; alias.maxLength = 40;
    const err = el('div', 'err');
    const ok = btnEl('Добавить', 'pri', () => {
      const id = normId(inp.value);
      if (id.length !== 10) { err.textContent = 'ID — это 10 букв и цифр, например ' + fmtId('7KQ2M9XAB4'); return; }
      if (id === myId) { err.textContent = 'Это твой собственный ID 🙂'; return; }
      const ct = S.contacts[id];
      if (ct) { if (ct.state !== 'ok') ct.state = ct.state === 'blocked' ? 'pending' : 'ok'; if (alias.value.trim()) ct.alias = clean(alias.value, 40); }
      else S.contacts[id] = { id, name: '', alias: clean(alias.value, 40), state: 'pending', added: Date.now() };
      save(); close(); openChat(dmId(id)); dial(id);
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    const row = el('div', 'row'); row.append(btnEl('Отмена', '', close), ok);
    card.append(el('h2', '', 'Новый собеседник'), el('p', '', 'Попроси у человека его ID — он вверху слева, под словом «Чаты». И отправь ему свой:'), idCard(), el('div', 'sep'), el('label', '', 'ID собеседника'), inp, alias, err, row);
  });
}
function codeDlg() {
  modal((card, close) => {
    const inp = el('input'); inp.type = 'text'; inp.placeholder = 'ABCDE'; inp.maxLength = 5; inp.style.cssText = 'text-align:center;letter-spacing:.3em;font-weight:700;text-transform:uppercase';
    const go = btnEl('Войти', 'pri', async () => { const c = inp.value.trim().toUpperCase(); if (!/^[A-Z0-9]{5}$/.test(c)) { toast('Код зала — 5 букв и цифр'); return; } close(); toast('Подключаюсь…'); if (!await window.kzRoom.join(c, S.me.name)) toast('Зал с таким кодом не найден'); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    const mk = (t, k) => btnEl(t, '', async () => { close(); const code = await window.kzRoom.create(k, S.me.name); if (!code) toast('Не получилось создать зал'); });
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
    card.append(el('h2', '', 'Профиль'), ap, inp, el('label', '', 'Имя'), name, idCard(), btnEl('🎨 Оформление: темы, обои, неон, рамка аватарки', 'pri', () => { close(); openTheme(); }), el('div', 'sep'), snd);
    let auto = null;
    if (APP?.autostart) { auto = el('input'); auto.type = 'checkbox'; const l = el('label', 'switch'); l.append(document.createTextNode('Запускать вместе с Windows — чтобы сообщения доходили'), auto); card.append(l); APP.autostart().then(v => { auto.checked = !!v; }).catch(() => {}); }
    if (APP?.readLog) card.append(btnEl('🧾 Отправить журнал ошибок в чат…', '', () => { close(); sendLogDlg(); }));
    card.append(el('p', '', 'Закрытое окно не выключает Кинозал: он ждёт сообщений у часов на панели задач. Совсем выйти — правый клик по значку → «Выйти».' + (appVer ? ' Версия ' + appVer + '.' : '')));
    const row = el('div', 'row');
    row.append(btnEl('Отмена', '', close), btnEl('Сохранить', 'pri', () => {
      const n = clean(name.value, 40); if (!n) { name.focus(); return; }
      S.me.name = n; S.me.avatar = avatar; store.set('name', n); store.set('mxSound', sc.checked ? '1' : '0');
      if (auto) APP.autostart(auto.checked);
      for (const g of Object.values(S.groups)) if (g.names) g.names[myId] = n;
      save(); renderMe(); renderList(); renderHead();
      for (const u of links.keys()) send(u, { t: 'profile', name: n, avatar, frame: S.me.frame || null });
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
      if (was !== JSON.stringify(f || null)) for (const u of links.keys()) send(u, { t: 'profile', name: S.me.name, avatar: S.me.avatar || '', frame: f || null });
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
      row2.append(btnEl(ct.state === 'blocked' ? 'Разблокировать' : 'Заблокировать', '', () => { close(); ct.state === 'blocked' ? unblock(u) : block(u); }), btnEl('Готово', 'pri', () => { if (S.contacts[u]) { S.contacts[u].alias = clean(alias.value, 40); save(); renderList(); renderHead(); } close(); }));
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
  const w = gWire(g); for (const u of old) if (u !== myId) send(u, { t: 'groups', list: [w] });
  delete S.groups[c]; delete S.chats[c]; save(); await wipeChat(c);
  if (open === c) closeChat(); renderList();
}
async function deleteChat(c) {
  if (!confirm('Удалить переписку у себя? У собеседника она останется.')) return;
  await wipeChat(c); const ch = S.chats[c]; if (ch) { ch.last = null; ch.unread = 0; }
  if (!isDm(c) && S.groups[c]?.gone) { delete S.groups[c]; delete S.chats[c]; }
  else if (isDm(c) && S.contacts[dmPeer(c)]?.state === 'req') delete S.chats[c];
  save(); if (open === c) closeChat(); renderList();
}
function block(u) { const ct = S.contacts[u] ||= { id: u, name: '', added: Date.now() }; ct.state = 'blocked'; save(); links.get(u)?.c.close(); renderList(); renderHead(); toast('Заблокировано'); }
function unblock(u) { const ct = S.contacts[u]; if (ct) ct.state = 'ok'; save(); dial(u); renderList(); renderHead(); }
function chatMenu(c, anchor) {
  closeMenus();
  const r = anchor.getBoundingClientRect(), mn = el('div', 'menu fabmenu mx-pop');
  Object.assign(mn.style, { position: 'fixed', top: r.bottom + 6 + 'px', left: Math.max(8, r.right - 240) + 'px', bottom: 'auto', zIndex: 50 });
  const add = (ic, t, f, cls) => { const b = el('button', cls || ''); b.append(el('i', '', ic), document.createTextNode(t)); b.onclick = () => { closeMenus(); f(); }; mn.append(b); };
  add(isDm(c) ? '👤' : '👥', isDm(c) ? 'О собеседнике' : 'Участники и название', () => infoDlg(c));
  if (!isDm(c) && !S.groups[c]?.gone) add('➕', 'Добавить участников', () => addMembersDlg(c));
  add('📎', 'Отправить фото или файл', () => $('.mx-input input[type=file]')?.click());
  add('🧹', 'Удалить переписку у себя', () => deleteChat(c), 'danger');
  if (isDm(c)) { const u = dmPeer(c); add('⛔', S.contacts[u]?.state === 'blocked' ? 'Разблокировать' : 'Заблокировать', () => S.contacts[u]?.state === 'blocked' ? unblock(u) : block(u), 'danger'); }
  else if (!S.groups[c]?.gone) add('🚪', 'Выйти из группы', () => leaveGroup(c), 'danger');
  document.body.append(mn); mn.addEventListener('click', e => e.stopPropagation());
}

// ---------- запуск ----------
function boot() {
  root.hidden = !!window.kzRoom?.inRoom;
  jlog('[мессенджер] запуск, ID', myId, '· контактов', Object.keys(S.contacts).length, '· чатов', Object.keys(S.chats).length);
  try { renderMe(); renderList(); showEmpty(); } catch (e) { console.error('[мессенджер] отрисовка: ' + (e?.stack || e)); }
  startPeer();
  // страховка: если на экране вдруг не видно ни чатов, ни зала, ни приветствия — показываем чаты
  setInterval(() => {
    const room = document.getElementById('room');
    if (S.me && root.hidden && room?.hidden && !document.querySelector('.mx-hello')) { console.warn('[мессенджер] экран был пустым — показываю чаты'); root.hidden = false; renderList(); }
  }, 2000);
}
window.__mx = { get S() { return S; }, myId, links, openChat, post, get open() { return open; } }; // для диагностики
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
