// Кинозал — оформление: авторские темы, свои цвета, обои (в том числе своё фото), неон, шрифты, форма, рамка аватарки.
// Тема — это набор CSS-переменных на <html> плюс классы для неона и обоев. Хранится в localStorage,
// фото обоев — в IndexedDB. Подключается в <head>, чтобы при запуске не мигала тема по умолчанию.
(() => {
'use strict';
const LS = 'kinozal-theme', LSM = 'kinozal-mythemes';

// ---------- авторские темы ----------
const W = (type, x = {}) => ({ type, c1: '#2b0f2a', c2: '#5a1d2c', c3: '#a1452a', ang: 160, blur: 0, dim: 0, glow: true, img: '', all: false, op: 1, ...x });
const N = (on, x = {}) => ({ on, c1: '#ff2bd6', c2: '#22e6ff', rainbow: false, pulse: false, w: 2, glow: 14, av: true, bub: false, panel: false, btn: false, input: false, cam: false, text: false, ...x });
const PRESETS = [
  { id: 'kinozal', name: 'Кинозал', bg: '#0e1416', side: '#111a1c', main: '#0c1214', card: '#141e20', field: '#0b1214', line: '#223033', ink: '#eef3f1', mute: '#93a5a3', acc: '#ff6b4a', acc2: '#5fd4c4',
    mine1: '#ff7652', mine2: '#ff5f3d', mineInk: '#1d0a04', bub: '#1d2a2d', bubInk: '#eef3f1', wall: W('dots'), neon: N(false), font: 'Manrope', hfont: 'Unbounded', fs: 15, rad: 18, avR: 50 },
  { id: 'noir', name: 'Неон-нуар', bg: '#07060c', side: '#0b0912', main: '#07060b', card: '#110e1b', field: '#0a0812', line: '#2a1f3d', ink: '#f4ecff', mute: '#9d8fb8', acc: '#ff2bd6', acc2: '#22e6ff',
    mine1: '#ff2bd6', mine2: '#8a2bff', mineInk: '#ffffff', bub: '#161225', bubInk: '#f4ecff', wall: W('grid'), neon: N(true, { c1: '#ff2bd6', c2: '#22e6ff', w: 2, glow: 16, bub: true, panel: true, btn: true, input: true, cam: true, text: true }), font: 'Manrope', hfont: 'Unbounded', fs: 15, rad: 16, avR: 50 },
  { id: 'cyber', name: 'Киберпанк', bg: '#0a0a0c', side: '#0f0f12', main: '#09090b', card: '#141418', field: '#0b0b0e', line: '#33331a', ink: '#f5f5e8', mute: '#a0a08a', acc: '#fcee0a', acc2: '#00f0ff',
    mine1: '#fcee0a', mine2: '#ffb800', mineInk: '#111100', bub: '#18181d', bubInk: '#f5f5e8', wall: W('diag'), neon: N(true, { c1: '#fcee0a', c2: '#00f0ff', w: 1, glow: 10, av: false, panel: true, btn: true, input: true, cam: true }), font: 'Rubik', hfont: 'Russo One', fs: 15, rad: 4, avR: 14 },
  { id: 'matrix', name: 'Матрица', bg: '#020602', side: '#031003', main: '#010501', card: '#061206', field: '#020a02', line: '#0f3a12', ink: '#b6ffb9', mute: '#4fa356', acc: '#2bff5b', acc2: '#9dff3a',
    mine1: '#0f7d2a', mine2: '#0a5c1e', mineInk: '#d6ffd9', bub: '#0a1d0c', bubInk: '#b6ffb9', wall: W('scan', { glow: false }), neon: N(true, { c1: '#2bff5b', c2: '#2bff5b', w: 1, glow: 10, bub: true, input: true, text: true }), font: 'JetBrains Mono', hfont: 'JetBrains Mono', fs: 14, rad: 6, avR: 20 },
  { id: 'midnight', name: 'Полночь', bg: '#0a0f24', side: '#0d1330', main: '#080c1e', card: '#121a3d', field: '#070b1c', line: '#1f2a55', ink: '#e8ecff', mute: '#8d97c4', acc: '#8ab4ff', acc2: '#c792ea',
    mine1: '#5b7cfa', mine2: '#8a5cf6', mineInk: '#ffffff', bub: '#161f47', bubInk: '#e8ecff', wall: W('stars'), neon: N(true, { c1: '#8ab4ff', c2: '#c792ea', w: 1, glow: 12 }), font: 'Nunito', hfont: 'Unbounded', fs: 15, rad: 20, avR: 50 },
  { id: 'sunset', name: 'Закат', bg: '#1a0d12', side: '#1f1015', main: '#170b10', card: '#26131a', field: '#140a0e', line: '#3d1f28', ink: '#fff1ea', mute: '#c99a8c', acc: '#ff8a3d', acc2: '#ffd166',
    mine1: '#ff5e62', mine2: '#ff9966', mineInk: '#2a0705', bub: '#2a161d', bubInk: '#fff1ea', wall: W('gradient', { c1: '#2b0f2a', c2: '#5a1d2c', c3: '#a1452a', ang: 165, dim: .15, glow: false }), neon: N(false), font: 'Comfortaa', hfont: 'Comfortaa', fs: 15, rad: 22, avR: 50 },
  { id: 'aurora', name: 'Северное сияние', bg: '#051215', side: '#071a1e', main: '#041013', card: '#0a2227', field: '#041013', line: '#12363c', ink: '#e6fffa', mute: '#7fb3ad', acc: '#39ffb0', acc2: '#6c8cff',
    mine1: '#1fd1a5', mine2: '#3a7bd5', mineInk: '#001a14', bub: '#0d2a30', bubInk: '#e6fffa', wall: W('gradient', { c1: '#061b2b', c2: '#0b3d3a', c3: '#1a2a5a', ang: 200, glow: true }), neon: N(true, { rainbow: true, pulse: true, w: 2, glow: 16, cam: true }), font: 'Manrope', hfont: 'Unbounded', fs: 15, rad: 18, avR: 50 },
  { id: 'sakura', name: 'Сакура', bg: '#1b1016', side: '#22131b', main: '#180e14', card: '#2a1721', field: '#160c12', line: '#43263a', ink: '#fff0f6', mute: '#c99ab0', acc: '#ff8fb3', acc2: '#ffc2d4',
    mine1: '#ff8fb3', mine2: '#ff5f9e', mineInk: '#2a0a16', bub: '#2e1a25', bubInk: '#fff0f6', wall: W('dots'), neon: N(true, { c1: '#ff8fb3', c2: '#ffc2d4', w: 2, glow: 12 }), font: 'Comfortaa', hfont: 'Comfortaa', fs: 15, rad: 24, avR: 50 },
  { id: 'vhs', name: 'Ретро-VHS', bg: '#110a1e', side: '#160d26', main: '#0e0819', card: '#1d1233', field: '#0c0716', line: '#352257', ink: '#fdf0ff', mute: '#a68fc2', acc: '#ff4fd8', acc2: '#3cf0ff',
    mine1: '#ff4fd8', mine2: '#ff9f43', mineInk: '#1a0418', bub: '#1f1338', bubInk: '#fdf0ff', wall: W('scan'), neon: N(true, { c1: '#ff4fd8', c2: '#3cf0ff', pulse: true, w: 2, glow: 14, bub: true, btn: true, text: true }), font: 'Rubik', hfont: 'Russo One', fs: 15, rad: 10, avR: 30 },
  { id: 'fire', name: 'Огонь', bg: '#140806', side: '#1a0a07', main: '#110605', card: '#22100b', field: '#0f0504', line: '#40190f', ink: '#fff2e8', mute: '#c28f7a', acc: '#ff5a1f', acc2: '#ffb21f',
    mine1: '#ff5a1f', mine2: '#d7261e', mineInk: '#fff2e8', bub: '#26120c', bubInk: '#fff2e8', wall: W('gradient', { c1: '#1a0604', c2: '#3a0d06', c3: '#120403', ang: 180, glow: true }), neon: N(true, { c1: '#ff5a1f', c2: '#ffb21f', pulse: true, w: 2, glow: 18, btn: true, cam: true }), font: 'Montserrat', hfont: 'Russo One', fs: 15, rad: 14, avR: 50 },
  { id: 'graphite', name: 'Графит', bg: '#121212', side: '#161616', main: '#101010', card: '#1c1c1c', field: '#0d0d0d', line: '#2a2a2a', ink: '#f2f2f2', mute: '#9a9a9a', acc: '#e6e6e6', acc2: '#bdbdbd',
    mine1: '#3d3d3d', mine2: '#2f2f2f', mineInk: '#ffffff', bub: '#1f1f1f', bubInk: '#f2f2f2', wall: W('none', { glow: false }), neon: N(false), font: 'Montserrat', hfont: 'Montserrat', fs: 15, rad: 14, avR: 50 }
];
const FONTS = { 'Manrope': 'Manrope:wght@400;500;600;700;800', 'Unbounded': 'Unbounded:wght@500;700', 'Comfortaa': 'Comfortaa:wght@400;600;700', 'Rubik': 'Rubik:wght@400;500;600;700', 'Nunito': 'Nunito:wght@400;600;700;800',
  'Montserrat': 'Montserrat:wght@400;500;600;700', 'JetBrains Mono': 'JetBrains+Mono:wght@400;600;700', 'Russo One': 'Russo+One', 'Oswald': 'Oswald:wght@400;600', 'Caveat': 'Caveat:wght@500;700',
  'Lobster': 'Lobster', 'PT Serif': 'PT+Serif:wght@400;700', 'Press Start 2P': 'Press+Start+2P', 'Системный': '' };
const FRAMES = [['none', 'Без рамки'], ['neon', 'Неон'], ['duo', 'Два цвета'], ['rainbow', 'Радуга'], ['gold', 'Золото'], ['fire', 'Огонь'], ['ice', 'Лёд']];

const clone = o => JSON.parse(JSON.stringify(o));
const hex = v => /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : null;
function normalize(x) {
  const b = clone(PRESETS[0]), t = { ...b, ...(x && typeof x === 'object' ? x : {}) };
  t.wall = { ...b.wall, ...(x?.wall || {}) }; t.neon = { ...b.neon, ...(x?.neon || {}) };
  for (const k of ['bg', 'side', 'main', 'card', 'field', 'line', 'ink', 'mute', 'acc', 'acc2', 'mine1', 'mine2', 'mineInk', 'bub', 'bubInk']) t[k] = hex(t[k]) || b[k];
  for (const k of ['c1', 'c2', 'c3']) t.wall[k] = hex(t.wall[k]) || b.wall[k];
  for (const k of ['c1', 'c2']) t.neon[k] = hex(t.neon[k]) || b.neon[k];
  if (!(t.font in FONTS)) t.font = b.font; if (!(t.hfont in FONTS)) t.hfont = b.hfont;
  const num = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  t.fs = num(t.fs, 12, 20, 15); t.rad = num(t.rad, 0, 28, 18); t.avR = num(t.avR, 0, 50, 50);
  t.wall.blur = num(t.wall.blur, 0, 40, 0); t.wall.dim = num(t.wall.dim, 0, .9, 0); t.wall.ang = num(t.wall.ang, 0, 360, 160); t.wall.op = num(t.wall.op, .1, 1, 1);
  t.neon.w = num(t.neon.w, 1, 6, 2); t.neon.glow = num(t.neon.glow, 0, 40, 14);
  return t;
}
let T = (() => { try { return normalize(JSON.parse(localStorage.getItem(LS) || 'null')); } catch (e) { return normalize(null); } })();

// ---------- фото обоев (IndexedDB) ----------
let idb = null;
const db = () => idb ||= new Promise((res, rej) => { const r = indexedDB.open('kinozal-theme', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const imgOp = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('img', mode); const r = fn(t.objectStore('img')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }));
const imgGet = k => imgOp('readonly', s => s.get(k));
const imgPut = (k, b) => imgOp('readwrite', s => s.put(b, k));
const imgDel = k => imgOp('readwrite', s => s.delete(k));
let wallUrl = { key: '', url: '' };
async function wallImage(key) {
  if (!key) return '';
  if (wallUrl.key === key) return wallUrl.url;
  const b = await imgGet(key).catch(() => null); if (!b) return '';
  if (wallUrl.url) URL.revokeObjectURL(wallUrl.url);
  wallUrl = { key, url: URL.createObjectURL(b) }; return wallUrl.url;
}

// ---------- применение ----------
const fontsLoaded = new Set(['Manrope', 'Unbounded']);
function loadFont(f) {
  if (!FONTS[f] || fontsLoaded.has(f)) return; fontsLoaded.add(f);
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[f] + '&display=swap'; document.head.append(l);
}
const ff = f => f === 'Системный' ? 'system-ui' : '"' + f + '"';
const STARS = [[23, 31, 1.4], [131, 77, 1], [201, 18, 1.2], [61, 151, .9], [173, 199, 1.5], [97, 221, 1], [229, 117, .8], [11, 97, 1.1]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}px ${y}px,color-mix(in srgb,var(--ink) 85%,transparent),transparent) 0 0/240px 240px`).join(',');
function wallCss(w, url) {
  const tint = (c, p) => `color-mix(in srgb,${c} ${p}%,transparent)`;
  switch (w.type) {
    case 'dots': return `radial-gradient(${tint('var(--ink)', 6)} 1px,transparent 1.3px) 0 0/22px 22px`;
    case 'grid': return `linear-gradient(${tint('var(--acc)', 10)} 1px,transparent 1px) 0 0/34px 34px,linear-gradient(90deg,${tint('var(--acc)', 10)} 1px,transparent 1px) 0 0/34px 34px`;
    case 'diag': return `repeating-linear-gradient(45deg,${tint('var(--acc)', 8)} 0 2px,transparent 2px 18px)`;
    case 'stars': return STARS;
    case 'scan': return `repeating-linear-gradient(0deg,${tint('var(--ink)', 5)} 0 1px,transparent 1px 4px)`;
    case 'hearts': return `radial-gradient(circle at 50% 50%,${tint('var(--acc)', 12)} 2px,transparent 2.5px) 0 0/28px 28px,radial-gradient(circle at 50% 50%,${tint('var(--acc2)', 10)} 1.5px,transparent 2px) 14px 14px/28px 28px`;
    case 'gradient': return `linear-gradient(${w.ang}deg,${w.c1},${w.c2},${w.c3})`;
    case 'image': return url ? `url("${url}") center/cover no-repeat` : 'none';
    default: return 'none';
  }
}
let applyN = 0;
async function apply(t = T) {
  const n = ++applyN, r = document.documentElement, st = r.style, set = (k, v) => st.setProperty(k, v);
  for (const k of ['bg', 'side', 'main', 'card', 'field', 'ink', 'mute', 'acc', 'acc2', 'mine1', 'mine2', 'mineInk', 'bub', 'bubInk']) set('--' + k, t[k]);
  set('--line', t.line); set('--line2', t.line); set('--panel', t.card); set('--panel2', `color-mix(in srgb,${t.card},${t.ink} 7%)`);
  set('--fs', t.fs + 'px'); set('--rad', t.rad + 'px'); set('--avR', t.avR + '%'); set('--font', ff(t.font)); set('--hfont', ff(t.hfont));
  loadFont(t.font); loadFont(t.hfont);
  const w = t.wall;
  set('--wallBlur', w.blur + 'px'); set('--wallDim', w.dim); set('--wallOp', w.op);
  set('--wallGlow', w.glow ? 'radial-gradient(1200px 500px at 85% -10%,color-mix(in srgb,var(--acc) 13%,transparent),transparent 60%),radial-gradient(900px 600px at -10% 110%,color-mix(in srgb,var(--acc2) 9%,transparent),transparent 60%)' : 'linear-gradient(transparent,transparent)');
  const url = w.type === 'image' ? await wallImage(w.img) : '';
  if (n !== applyN) return;
  set('--wall', wallCss(w, url));
  r.classList.toggle('wall-all', !!w.all && w.type !== 'none');
  const nn = t.neon;
  set('--neon', nn.c1); set('--neon2', nn.c2); set('--nw', nn.w + 'px'); set('--ng', nn.glow + 'px');
  r.classList.toggle('neon-on', !!nn.on);
  for (const k of ['av', 'bub', 'panel', 'btn', 'input', 'cam', 'text']) r.classList.toggle('neon-' + k, !!nn.on && !!nn[k]);
  r.classList.toggle('neon-rainbow', !!nn.on && !!nn.rainbow); r.classList.toggle('neon-pulse', !!nn.on && !!nn.pulse);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
}
function save(t) { T = normalize(t); try { localStorage.setItem(LS, JSON.stringify(T)); } catch (e) {} apply(T); gcImages(); }
async function gcImages() {
  const keep = new Set([T.wall.img, ...mine().map(m => m.theme?.wall?.img)].filter(Boolean));
  try { const keys = await imgOp('readonly', s => s.getAllKeys()); for (const k of keys || []) if (!keep.has(k)) imgDel(k); } catch (e) {}
}
const mine = () => { try { const a = JSON.parse(localStorage.getItem(LSM) || '[]'); return Array.isArray(a) ? a.slice(0, 40) : []; } catch (e) { return []; } };
const setMine = a => { try { localStorage.setItem(LSM, JSON.stringify(a.slice(0, 40))); } catch (e) {} };
apply(T);

// ---------- рамка аватарки (её видят все собеседники) ----------
function cleanFrame(f) {
  if (!f || typeof f !== 'object' || !FRAMES.some(x => x[0] === f.type) || f.type === 'none') return null;
  return { type: f.type, c1: hex(f.c1) || '#ff2bd6', c2: hex(f.c2) || '#22e6ff' };
}
function frameAv(el, f) {
  f = cleanFrame(f); for (const c of [...el.classList]) if (c.startsWith('fr-')) el.classList.remove(c);
  if (!f) return el;
  el.classList.add('fr-' + f.type); el.style.setProperty('--f1', f.c1); el.style.setProperty('--f2', f.c2);
  return el;
}

// ---------- редактор ----------
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function open(opts = {}) {
  if (document.querySelector('.kzt')) return;
  const saved = clone(T);
  let D = clone(T), frame = cleanFrame(opts.frame) || { type: 'none', c1: '#ff2bd6', c2: '#22e6ff' }, tab = 'themes';
  const ov = h('div', 'mx-modal kzt'), card = h('div', 'mx-card kzt-card');
  const head = h('div', 'kzt-head'), tabs = h('div', 'kzt-tabs'), body = h('div', 'kzt-body'), foot = h('div', 'row kzt-foot');
  head.append(h('h2', '', 'Оформление'), tabs);
  // живой образец переписки: рисуется теми же переменными, что и настоящий чат, — сразу видно, что ставишь
  const lv = h('div', 'kzt-live'); lv.setAttribute('aria-hidden', 'true');
  lv.innerHTML = '<div class="kzt-lw"></div><div class="kzt-lg"></div><div class="kzt-lc"><div class="kzt-lh"><span class="kzt-la">А</span><b>Собеседник</b><small>в сети</small></div>' +
    '<div class="kzt-lm them">Привет! Что смотрим?</div><div class="kzt-lm me">Давай кино 🍿</div><div class="kzt-li">Сообщение…</div></div>';
  card.append(head, lv, body, foot); ov.append(card); document.body.append(ov);
  const TABS = [['themes', '✨ Темы'], ['colors', '🎨 Цвета'], ['wall', '🖼 Обои'], ['neon', '💡 Неон'], ['shape', '🔤 Шрифт и форма'], ...(opts.onFrame ? [['frame', '👤 Моя рамка']] : [])];
  // смена вкладки — содержимое мягко проявляется (перезапуск анимации через reflow)
  for (const [k, t] of TABS) { const b = h('button', 'kzt-tab', t); b.dataset.k = k; b.onclick = () => { tab = k; render(); body.classList.remove('sw'); void body.offsetWidth; body.classList.add('sw'); }; tabs.append(b); }
  let raf = 0; const live = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => apply(D).then(() => body.querySelector('.kzt-walls')?.paint?.())); };
  const get = p => p.split('.').reduce((o, k) => o?.[k], D);
  const put = (p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], D)[last] = v; live(); };
  // элементы управления
  const color = (label, p) => { const l = h('label', 'kzt-color'), i = h('input'); i.type = 'color'; i.value = get(p); i.oninput = () => put(p, i.value); l.append(i, h('span', '', label)); return l; };
  const range = (label, p, min, max, step, fmt) => {
    const l = h('label', 'kzt-range'), t = h('span'), i = h('input'), v = h('b');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get(p);
    const show = () => { v.textContent = fmt ? fmt(+i.value) : i.value; };
    i.oninput = () => { put(p, +i.value); show(); }; show();
    t.append(document.createTextNode(label), v); l.append(t, i); return l;
  };
  const check = (label, p, after) => { const l = h('label', 'switch'), i = h('input'); i.type = 'checkbox'; i.checked = !!get(p); i.onchange = () => { put(p, i.checked); after?.(); }; l.append(document.createTextNode(label), i); return l; };
  const chips = (p, list, after) => {
    const w = h('div', 'kzt-chips');
    for (const [v, t] of list) { const b = h('button', 'kzt-chip' + (get(p) === v ? ' on' : ''), t); b.type = 'button'; b.onclick = () => { put(p, v); w.querySelectorAll('.kzt-chip').forEach(x => x.classList.toggle('on', x === b)); after?.(); }; w.append(b); }
    return w;
  };
  const select = (label, p, list) => { const l = h('label', 'kzt-sel'), s = h('select'); for (const v of list) { const o = h('option', '', v); o.value = v; o.style.fontFamily = ff(v); s.append(o); } s.value = get(p); s.onchange = () => put(p, s.value); l.append(h('span', '', label), s); return l; };
  const sec = (title, ...kids) => { const s = h('section', 'kzt-sec'); if (title) s.append(h('h3', '', title)); s.append(...kids); return s; };
  const grid = (...kids) => { const g = h('div', 'kzt-grid'); g.append(...kids); return g; };
  function preview(t, name, active, onClick, onDel) {
    const c = h('button', 'kzt-pv' + (active ? ' on' : '')); c.type = 'button';
    const m = h('div', 'kzt-pvm');
    m.style.background = t.wall.type === 'gradient' ? `linear-gradient(${t.wall.ang}deg,${t.wall.c1},${t.wall.c2},${t.wall.c3})` : t.main;
    const side = h('i', 'kzt-pvs'); side.style.background = t.side; side.style.borderColor = t.neon.on && t.neon.panel ? t.neon.c1 : t.line;
    const a = h('i', 'kzt-pva'); a.style.background = `linear-gradient(135deg,${t.acc},${t.acc2})`; a.style.borderRadius = t.avR + '%'; if (t.neon.on && t.neon.av) a.style.boxShadow = `0 0 0 2px ${t.neon.c1},0 0 10px ${t.neon.c1}`;
    const b1 = h('i', 'kzt-pvb'); b1.style.background = t.bub; b1.style.borderRadius = Math.min(t.rad, 12) + 'px'; if (t.neon.on && t.neon.bub) b1.style.boxShadow = `0 0 0 1px ${t.neon.c1},0 0 8px ${t.neon.c1}`;
    const b2 = h('i', 'kzt-pvb me'); b2.style.background = `linear-gradient(135deg,${t.mine1},${t.mine2})`; b2.style.borderRadius = Math.min(t.rad, 12) + 'px'; if (t.neon.on && t.neon.bub) b2.style.boxShadow = `0 0 0 1px ${t.neon.c2},0 0 8px ${t.neon.c2}`;
    if (t.neon.on && t.neon.rainbow) c.classList.add('rb');
    m.append(side, a, b1, b2);
    const n = h('span', 'kzt-pvn', name); n.style.fontFamily = ff(t.hfont); loadFont(t.hfont);
    c.append(m, n); c.onclick = onClick;
    if (onDel) { const x = h('span', 'kzt-del', '✕'); x.title = 'Удалить'; x.onclick = e => { e.stopPropagation(); onDel(); }; c.append(x); }
    return c;
  }
  const same = (a, b) => JSON.stringify({ ...a, id: 0, name: 0 }) === JSON.stringify({ ...b, id: 0, name: 0 });
  function render() {
    tabs.querySelectorAll('.kzt-tab').forEach(b => b.classList.toggle('on', b.dataset.k === tab));
    body.textContent = ''; body.scrollTop = 0;
    if (tab === 'themes') {
      const g = h('div', 'kzt-pvs-grid');
      for (const p of PRESETS) g.append(preview(p, p.name, same(normalize(p), D), () => { D = normalize(clone(p)); live(); render(); }));
      body.append(sec('Авторские темы', g));
      const my = mine(), g2 = h('div', 'kzt-pvs-grid');
      my.forEach((m, i) => g2.append(preview(normalize(m.theme), m.name, same(normalize(m.theme), D), () => { D = normalize(clone(m.theme)); live(); render(); }, () => { const a = mine(); a.splice(i, 1); setMine(a); render(); })));
      const nm = h('input'); nm.type = 'text'; nm.placeholder = 'Название моей темы'; nm.maxLength = 30;
      const sv = h('button', 'btn', 'Сохранить как мою тему'); sv.onclick = () => { const n = nm.value.trim() || 'Моя тема ' + (mine().length + 1); const a = mine(); a.unshift({ name: n, theme: clone(D) }); setMine(a); render(); };
      const row = h('div', 'kzt-line'); row.append(nm, sv);
      body.append(sec('Мои темы', my.length ? g2 : h('p', '', 'Настрой всё на других вкладках и сохрани сюда — можно сделать сколько угодно своих тем.'), row));
      const code = h('input'); code.type = 'text'; code.placeholder = 'Вставь код темы от друга';
      const cp = h('button', 'btn', 'Скопировать код моей темы'); cp.onclick = async () => { const t = clone(D); if (t.wall.type === 'image') { t.wall.type = 'gradient'; t.wall.img = ''; } const s = 'KZT1:' + btoa(unescape(encodeURIComponent(JSON.stringify(t)))); try { await navigator.clipboard.writeText(s); note('Код темы скопирован — отправь его другу' + (D.wall.type === 'image' ? ' (своё фото в код не попадает)' : '')); } catch (e) { code.value = s; code.select(); } };
      const ap = h('button', 'btn', 'Применить код'); ap.onclick = () => { try { const s = code.value.trim().replace(/^KZT1:/, ''); D = normalize(JSON.parse(decodeURIComponent(escape(atob(s))))); live(); render(); note('Тема из кода применена'); } catch (e) { note('Не похоже на код темы'); } };
      const r2 = h('div', 'kzt-line'); r2.append(code, ap);
      body.append(sec('Поделиться темой', cp, r2));
    }
    if (tab === 'colors') {
      body.append(sec('Главные', grid(color('Акцент', 'acc'), color('Второй акцент', 'acc2'), color('Текст', 'ink'), color('Приглушённый текст', 'mute'))),
        sec('Фон', grid(color('Фон программы', 'bg'), color('Список чатов', 'side'), color('Фон переписки', 'main'), color('Окна и меню', 'card'), color('Поля ввода', 'field'), color('Линии и рамки', 'line'))),
        sec('Сообщения', grid(color('Мои — цвет 1', 'mine1'), color('Мои — цвет 2', 'mine2'), color('Текст моих', 'mineInk'), color('Чужие', 'bub'), color('Текст чужих', 'bubInk'))));
    }
    if (tab === 'wall') {
      const more = h('div');
      const fill = () => {
        more.textContent = ''; const w = D.wall;
        if (w.type === 'gradient') more.append(grid(color('Цвет 1', 'wall.c1'), color('Цвет 2', 'wall.c2'), color('Цвет 3', 'wall.c3')), range('Направление', 'wall.ang', 0, 360, 5, v => v + '°'));
        if (w.type === 'image') {
          const up = h('button', 'btn pri', w.img ? 'Выбрать другое фото' : 'Загрузить фото'), inp = h('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
          up.onclick = () => inp.click();
          inp.onchange = async () => {
            const f = inp.files[0]; inp.value = ''; if (!f) return;
            try {
              const bm = await createImageBitmap(f), k = Math.min(1, 2560 / Math.max(bm.width, bm.height)), cv = h('canvas');
              cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
              const b = await new Promise(r => cv.toBlob(r, 'image/webp', .9)) || await new Promise(r => cv.toBlob(r, 'image/jpeg', .9));
              const key = 'w-' + Date.now().toString(36); await imgPut(key, b); put('wall.img', key); fill(); note('Фото поставлено на фон');
            } catch (e) { note('Не получилось открыть фото'); }
          };
          more.append(h('div', 'kzt-line'), up, inp);
          if (!w.img) more.append(h('p', '', 'Подойдёт любая картинка: фото, арт, скриншот. Её видишь только ты.'));
        }
        if (w.type !== 'none') more.append(range('Размытие', 'wall.blur', 0, 40, 1, v => v + ' px'), range('Затемнение', 'wall.dim', 0, .9, .05, v => Math.round(v * 100) + '%'), range('Яркость узора/картинки', 'wall.op', .1, 1, .05, v => Math.round(v * 100) + '%'));
      };
      // обои — плитками с образцом узора, а не просто словами
      const WALLS = [['none', 'Без обоев'], ['dots', 'Точки'], ['grid', 'Сетка'], ['diag', 'Полосы'], ['stars', 'Звёзды'], ['scan', 'Сканлайны'], ['hearts', 'Горошек'], ['gradient', 'Градиент'], ['image', 'Своё фото']];
      const wg = h('div', 'kzt-walls');
      const paintWalls = () => wg.querySelectorAll('.kzt-wall').forEach(b => {
        const k = b.dataset.k, sw = b.firstChild;
        b.classList.toggle('on', D.wall.type === k);
        const url = k === 'image' && wallUrl.key && wallUrl.key === D.wall.img ? wallUrl.url : '';
        sw.textContent = k === 'image' && !url ? '📷' : '';
        sw.style.background = k === 'none' || (k === 'image' && !url) ? 'var(--main)' : wallCss({ ...D.wall, type: k }, url) + ',var(--main)';
      });
      for (const [k, t] of WALLS) {
        const b = h('button', 'kzt-wall'); b.type = 'button'; b.dataset.k = k;
        b.append(h('i'), h('span', '', t));
        b.onclick = () => { put('wall.type', k); paintWalls(); fill(); };
        wg.append(b);
      }
      paintWalls(); wg.paint = paintWalls;
      body.append(sec('Фон переписки', wg, more),
        sec('', check('Свечение акцентом по углам', 'wall.glow'), check('Обои под всем окном (и под списком чатов)', 'wall.all')));
      fill();
    }
    if (tab === 'neon') {
      const more = h('div');
      const fill = () => {
        more.textContent = ''; if (!D.neon.on) { more.append(h('p', '', 'Включи неон — и выбери, что будет светиться.')); return; }
        more.append(grid(color('Неон 1', 'neon.c1'), color('Неон 2 (мои сообщения)', 'neon.c2')),
          check('Радуга — цвет переливается', 'neon.rainbow'), check('Пульсирует', 'neon.pulse'),
          range('Толщина обводки', 'neon.w', 1, 6, 1, v => v + ' px'), range('Сила свечения', 'neon.glow', 0, 40, 1, v => v + ' px'),
          h('h3', '', 'Что светится'),
          grid(check('Аватарки', 'neon.av'), check('Сообщения', 'neon.bub'), check('Панели и окна', 'neon.panel'), check('Кнопки', 'neon.btn'), check('Поле ввода и поиск', 'neon.input'), check('Камеры в звонке', 'neon.cam'), check('Заголовки', 'neon.text')));
      };
      body.append(sec('Неоновые обводки', check('Неон включён', 'neon.on', fill), more)); fill();
    }
    if (tab === 'shape') {
      body.append(sec('Шрифт', grid(select('Текст', 'font', Object.keys(FONTS)), select('Заголовки', 'hfont', Object.keys(FONTS))), range('Размер текста', 'fs', 12, 20, 1, v => v + ' px')),
        sec('Форма', range('Скругление сообщений', 'rad', 0, 28, 1, v => v + ' px'), range('Форма аватарок: квадрат → круг', 'avR', 0, 50, 1, v => v >= 50 ? 'круг' : v === 0 ? 'квадрат' : v + '%')));
    }
    if (tab === 'frame') {
      const pv = h('div', 'kzt-frame-pv'), av = h('div', 'av'); av.style.setProperty('--s', '110px'); av.style.setProperty('--h', '200');
      if (opts.avatar) { const i = h('img'); i.src = opts.avatar; av.append(i); } else av.textContent = (opts.name || '?').trim()[0]?.toUpperCase() || '?';
      pv.append(av);
      const paint = () => frameAv(av, frame);
      const ch = h('div', 'kzt-chips');
      for (const [v, t] of FRAMES) { const b = h('button', 'kzt-chip' + (frame.type === v ? ' on' : ''), t); b.type = 'button'; b.onclick = () => { frame.type = v; ch.querySelectorAll('.kzt-chip').forEach(x => x.classList.toggle('on', x === b)); paint(); }; ch.append(b); }
      const c1 = h('input'), c2 = h('input'); c1.type = c2.type = 'color'; c1.value = frame.c1; c2.value = frame.c2;
      c1.oninput = () => { frame.c1 = c1.value; paint(); }; c2.oninput = () => { frame.c2 = c2.value; paint(); };
      const l1 = h('label', 'kzt-color'), l2 = h('label', 'kzt-color'); l1.append(c1, h('span', '', 'Цвет 1')); l2.append(c2, h('span', '', 'Цвет 2'));
      body.append(sec('Рамка вокруг твоей аватарки', h('p', '', 'Её видят все собеседники — в чатах, в списке и при звонке.'), pv, ch, grid(l1, l2)));
      paint();
    }
  }
  let nt = 0; const note = t => { const n = card.querySelector('.kzt-note') || h('div', 'kzt-note'); n.textContent = t; foot.prepend(n); clearTimeout(nt); nt = setTimeout(() => n.remove(), 3500); };
  const close = () => { cancelAnimationFrame(raf); ov.classList.add('out'); setTimeout(() => ov.remove(), 170); };
  const reset = h('button', 'btn', 'Как было в Кинозале'); reset.onclick = () => { D = normalize(clone(PRESETS[0])); live(); render(); };
  const cancel = h('button', 'btn', 'Отмена'); cancel.onclick = () => { apply(saved); close(); };
  const ok = h('button', 'btn pri', 'Сохранить'); ok.onclick = () => { save(D); if (opts.onFrame) opts.onFrame(frame.type === 'none' ? null : cleanFrame(frame)); close(); };
  foot.append(reset, h('span', 'grow'), cancel, ok);
  ov.addEventListener('mousedown', e => { if (e.target === ov) { apply(saved); close(); } });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); apply(saved); close(); } });
  render();
}
window.kzTheme = { open, apply: () => apply(T), get: () => clone(T), frameAv, cleanFrame, presets: PRESETS.map(p => p.name) };
})();
