// Кинозал — смотреть файлы прямо в окне, без сторонних библиотек.
// Текст и код (с подсветкой), JSON, CSV, Markdown, архивы ZIP/JAR/mrpack (список и один файл наружу),
// Word (DOCX) и Excel (XLSX) — это тоже ZIP с XML внутри, распаковывает сам браузер (DecompressionStream),
// теги и обложки музыки (MP3, FLAC, M4A).
// «Источник» файла — { size, read(off, len) → Uint8Array }: из переписки, с диска или свой отправленный.
(function (root) {
'use strict';
const td = (enc, fatal) => new TextDecoder(enc, { fatal: !!fatal });

// ---------- текст ----------
// UTF-8, UTF-16 по метке; если UTF-8 не подходит — Windows-1251 (старые русские файлы)
function decodeText(u) {
  if (u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF) return td('utf-8').decode(u.subarray(3));
  if (u[0] === 0xFF && u[1] === 0xFE) return td('utf-16le').decode(u.subarray(2));
  if (u[0] === 0xFE && u[1] === 0xFF) return td('utf-16be').decode(u.subarray(2));
  try { return td('utf-8', true).decode(u); } catch (e) {
    // последний символ мог обрезаться на границе куска — пробуем без хвоста
    try { return td('utf-8', true).decode(u.subarray(0, Math.max(0, u.length - 3))); } catch (e2) { return td('windows-1251').decode(u); }
  }
}
const isBinary = u => { let z = 0; const n = Math.min(u.length, 8000); for (let i = 0; i < n; i++) if (u[i] === 0) z++; return z > n / 50; };

// подсветка: комментарии, строки, числа, ключевые слова — грубо, но для чтения хватает
const KW = new Set('const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false def lambda pass elif None True False and or not is with as yield global nonlocal public private protected static void int long float double char boolean string String final package interface enum struct fn mut pub use impl match loop where type func go chan defer select map range echo then fi done esac local function end nil local require module SELECT FROM WHERE INSERT UPDATE DELETE INTO VALUES CREATE TABLE AND OR NOT NULL ORDER BY GROUP LIMIT JOIN'.split(' '));
const HASH = /\.(py|sh|bash|rb|ya?ml|toml|conf|cfg|properties|r|pl|ps1|mcfunction)$/i, SEMI = /\.(ini|cfg)$/i;
function highlight(text, name) {
  const frag = document.createDocumentFragment(), hash = HASH.test(name || ''), semi = SEMI.test(name || ''), xml = /\.(xml|html?|svg|xaml)$/i.test(name || '');
  const re = xml ? /(<!--[\s\S]*?-->)|("[^"\n]*"|'[^'\n]*')|(<\/?[\w:.-]+)|(\b\d[\d.]*\b)/g
    : new RegExp('(' + ['\\/\\*[\\s\\S]*?\\*\\/', '\\/\\/[^\\n]*', hash ? '#[^\\n]*' : null, semi ? '^\\s*;[^\\n]*' : null, '--\\s[^\\n]*'].filter(Boolean).join('|') + ')|("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)|(\\b[A-Za-z_][\\w]*\\b)|(\\b\\d[\\d._]*(?:e[+-]?\\d+)?\\b)', 'gm');
  let last = 0, m;
  const put = (s, c) => { if (!s) return; if (!c) { frag.append(s); return; } const e = document.createElement('span'); e.className = c; e.textContent = s; frag.append(e); };
  while ((m = re.exec(text))) {
    if (m.index > last) put(text.slice(last, m.index));
    if (m[1]) put(m[1], 'hc'); else if (m[2]) put(m[2], 'hs');
    else if (m[3]) put(m[3], xml ? 'hk' : KW.has(m[3]) ? 'hk' : null); else put(m[4], 'hn');
    last = re.lastIndex; if (m[0] === '') re.lastIndex++;
  }
  put(text.slice(last)); return frag;
}
function csv(text) {
  const first = text.slice(0, 2000).split('\n')[0] || '';
  const d = ['\t', ';', ','].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length && rows.length < 2000; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// Markdown → DOM без innerHTML: заголовки, списки, цитаты, код, жирный, курсив, ссылки (текстом)
function markdown(text) {
  const out = document.createDocumentFragment(), lines = text.split(/\r?\n/);
  const inline = (s, el) => {
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)]+\))/g; let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) el.append(s.slice(last, m.index));
      const t = m[0], e = document.createElement(m[1] ? 'code' : m[2] ? 'b' : m[3] ? 'i' : 'u');
      e.textContent = m[4] ? t.replace(/^\[([^\]]+)\]\(([^)]+)\)$/, '$1') : m[1] ? t.slice(1, -1) : m[2] ? t.slice(2, -2) : t.slice(1, -1);
      if (m[4]) e.title = t.replace(/^\[[^\]]+\]\(([^)]+)\)$/, '$1');
      el.append(e); last = re.lastIndex;
    }
    el.append(s.slice(last)); return el;
  };
  let list = null, para = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) { const code = []; for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]); const pre = document.createElement('pre'); pre.append(highlight(code.join('\n'), '.' + (l.slice(3).trim() || 'txt'))); out.append(pre); list = para = null; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)/);
    if (h) { out.append(inline(h[2], document.createElement('h' + Math.min(4, h[1].length + 1)))); list = para = null; continue; }
    const li = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)/);
    if (li) { if (!list) { list = document.createElement(/\d/.test(li[1]) ? 'ol' : 'ul'); out.append(list); } list.append(inline(li[2], document.createElement('li'))); para = null; continue; }
    if (/^>\s?/.test(l)) { out.append(inline(l.replace(/^>\s?/, ''), document.createElement('blockquote'))); list = para = null; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { out.append(document.createElement('hr')); list = para = null; continue; }
    if (!l.trim()) { list = para = null; continue; }
    if (!para) { para = document.createElement('p'); out.append(para); } else para.append(' ');
    inline(l, para); list = null;
  }
  return out;
}

// ---------- ZIP (и всё, что внутри ZIP: JAR, mrpack, DOCX, XLSX, EPUB) ----------
const u16 = (u, o) => u[o] | (u[o + 1] << 8), u32 = (u, o) => (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0;
const u64 = (u, o) => u32(u, o) + u32(u, o + 4) * 4294967296;
async function zipList(src) {
  const tail = Math.min(src.size, 65557 + 20), t = await src.read(src.size - tail, tail);
  let e = -1; for (let i = t.length - 22; i >= 0; i--) if (u32(t, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('это не ZIP-архив или он повреждён');
  let count = u16(t, e + 10), cdSize = u32(t, e + 12), cdOff = u32(t, e + 16);
  if ((count === 0xFFFF || cdOff === 0xFFFFFFFF) && e >= 20 && u32(t, e - 20) === 0x07064b50) {   // ZIP64
    const z = await src.read(u64(t, e - 20 + 8), 56);
    if (u32(z, 0) === 0x06064b50) { count = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48); }
  }
  if (cdSize > 64e6) throw new Error('слишком большой список файлов в архиве');
  const cd = await src.read(cdOff, cdSize), out = [];
  for (let p = 0; p + 46 <= cd.length && out.length < 100000; ) {
    if (u32(cd, p) !== 0x02014b50) break;
    const flags = u16(cd, p + 8), method = u16(cd, p + 10), nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32);
    let csize = u32(cd, p + 20), usize = u32(cd, p + 24), off = u32(cd, p + 42);
    const nb = cd.subarray(p + 46, p + 46 + nl);
    let name; if (flags & 0x800) name = td('utf-8').decode(nb); else { try { name = td('utf-8', true).decode(nb); } catch (er) { name = td('ibm866').decode(nb); } }
    for (let x = p + 46 + nl; x + 4 <= p + 46 + nl + xl; ) {   // ZIP64: настоящие размеры в доп. поле
      const id = u16(cd, x), sz = u16(cd, x + 2);
      if (id === 1) { let q = x + 4; if (usize === 0xFFFFFFFF) { usize = u64(cd, q); q += 8; } if (csize === 0xFFFFFFFF) { csize = u64(cd, q); q += 8; } if (off === 0xFFFFFFFF) off = u64(cd, q); }
      x += 4 + sz;
    }
    out.push({ name, dir: name.endsWith('/'), method, csize, size: usize, off, enc: !!(flags & 1) });
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function inflate(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function zipGet(src, e) {
  if (e.enc) throw new Error('файл в архиве зашифрован паролем');
  if (e.size > 300e6) throw new Error('файл в архиве слишком большой, чтобы открыть его здесь');
  const h = await src.read(e.off, 30); if (u32(h, 0) !== 0x04034b50) throw new Error('архив повреждён');
  const data = await src.read(e.off + 30 + u16(h, 26) + u16(h, 28), e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) return inflate(data);
  throw new Error('такое сжатие в архиве (' + e.method + ') здесь не открыть');
}
const memSrc = u => ({ size: u.length, read: async (o, n) => u.subarray(o, o + n) });

// ---------- Word (DOCX) ----------
const xmlDoc = u => new DOMParser().parseFromString(td('utf-8').decode(u), 'application/xml');
const kids = (n, name) => [...n.childNodes].filter(c => c.localName === name);
const kid = (n, name) => kids(n, name)[0];
const attr = (n, name) => n?.getAttribute('w:' + name) ?? n?.getAttribute(name);
async function docx(src) {
  const list = await zipList(src), get = n => list.find(e => e.name === n);
  const main = get('word/document.xml'); if (!main) throw new Error('внутри нет текста документа');
  const doc = xmlDoc(await zipGet(src, main)), rels = {};
  const re = get('word/_rels/document.xml.rels');
  if (re) for (const r of xmlDoc(await zipGet(src, re)).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  const imgs = {}, urls = [];
  async function imgUrl(id) {
    if (imgs[id] !== undefined) return imgs[id];
    const t = rels[id], e = t && get('word/' + t.replace(/^\/?(word\/)?/, ''));
    if (!e) return (imgs[id] = '');
    const ext = (t.match(/\.(\w+)$/) || [])[1] || 'png', u = URL.createObjectURL(new Blob([await zipGet(src, e)], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) })); urls.push(u); return (imgs[id] = u);
  }
  const out = document.createElement('div'); out.className = 'kdocx';
  async function para(p) {
    const ps = kid(p, 'pPr'), style = attr(kid(ps || p, 'pStyle'), 'val') || '';
    const hm = style.match(/(?:Heading|Заголовок|heading)\s*(\d)/i), isList = ps && kid(ps, 'numPr');
    const el = document.createElement(hm ? 'h' + Math.min(4, +hm[1] + 1) : style === 'Title' ? 'h1' : isList ? 'li' : 'p');
    for (const r of p.getElementsByTagNameNS('*', 'r')) {
      const rp = kid(r, 'rPr'); let target = el;
      const wrap = tag => { const w = document.createElement(tag); target.append(w); target = w; };
      if (rp && kid(rp, 'b') && attr(kid(rp, 'b'), 'val') !== '0') wrap('b');
      if (rp && kid(rp, 'i') && attr(kid(rp, 'i'), 'val') !== '0') wrap('i');
      if (rp && kid(rp, 'u') && attr(kid(rp, 'u'), 'val') !== 'none') wrap('u');
      for (const c of r.childNodes) {
        if (c.localName === 't') target.append(c.textContent);
        else if (c.localName === 'tab') target.append('\t');
        else if (c.localName === 'br') target.append(document.createElement('br'));
        else if (c.localName === 'drawing' || c.localName === 'pict') {
          const b = c.getElementsByTagNameNS('*', 'blip')[0] || c.getElementsByTagNameNS('*', 'imagedata')[0];
          const id = b && (b.getAttribute('r:embed') || b.getAttribute('r:id'));
          const u = id && await imgUrl(id); if (u) { const i = document.createElement('img'); i.src = u; i.alt = ''; target.append(i); }
        }
      }
    }
    return el;
  }
  let ul = null;
  async function block(n, into) {
    for (const c of n.childNodes) {
      if (c.localName === 'p') { const e = await para(c); if (e.tagName === 'LI') { if (!ul) { ul = document.createElement('ul'); into.append(ul); } ul.append(e); } else { ul = null; into.append(e); } }
      else if (c.localName === 'tbl') {
        ul = null; const t = document.createElement('table');
        for (const tr of kids(c, 'tr')) { const row = t.insertRow(); for (const tc of kids(tr, 'tc')) { const td2 = row.insertCell(); await block(tc, td2); } }
        into.append(t);
      } else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) await block(sc, into); }
    }
  }
  const body = doc.getElementsByTagNameNS('*', 'body')[0]; if (body) await block(body, out);
  return { el: out, urls };
}

// ---------- Excel (XLSX) ----------
async function xlsx(src, maxRows = 1000, maxCols = 60) {
  const list = await zipList(src), get = n => list.find(e => e.name === n);
  const wb = get('xl/workbook.xml'); if (!wb) throw new Error('внутри нет таблицы');
  const wdoc = xmlDoc(await zipGet(src, wb)), rels = {};
  const r = get('xl/_rels/workbook.xml.rels');
  if (r) for (const x of xmlDoc(await zipGet(src, r)).getElementsByTagName('Relationship')) rels[x.getAttribute('Id')] = x.getAttribute('Target');
  const ss = [], sst = get('xl/sharedStrings.xml');
  if (sst) for (const si of xmlDoc(await zipGet(src, sst)).getElementsByTagNameNS('*', 'si')) ss.push([...si.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join(''));
  const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const sheets = [];
  for (const s of wdoc.getElementsByTagNameNS('*', 'sheet')) {
    const t = rels[s.getAttribute('r:id')] || ''; const e = get('xl/' + t.replace(/^\/?(xl\/)?/, '')); if (!e) continue;
    const sd = xmlDoc(await zipGet(src, e)), rows = []; let cut = false;
    for (const row of sd.getElementsByTagNameNS('*', 'row')) {
      const ri = (+row.getAttribute('r') || rows.length + 1) - 1; if (ri >= maxRows) { cut = true; break; }
      const cells = [];
      for (const c of row.getElementsByTagNameNS('*', 'c')) {
        const ci = c.getAttribute('r') ? col(c.getAttribute('r')) : cells.length; if (ci >= maxCols) { cut = true; continue; }
        const ty = c.getAttribute('t'), v = c.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? '';
        cells[ci] = ty === 's' ? ss[+v] ?? '' : ty === 'inlineStr' ? [...c.getElementsByTagNameNS('*', 't')].map(x => x.textContent).join('') : ty === 'b' ? (v === '1' ? 'ИСТИНА' : 'ЛОЖЬ') : v;
      }
      rows[ri] = cells;
    }
    sheets.push({ name: s.getAttribute('name') || 'Лист', rows, cut });
  }
  return sheets;
}

// ---------- музыка: теги и обложка ----------
function id3(u) {
  if (!(u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33)) return null;
  const ver = u[3], ss = o => (u[o] << 21) | (u[o + 1] << 14) | (u[o + 2] << 7) | u[o + 3], end = Math.min(u.length, 10 + ss(6)), out = {};
  const txt = b => {   // 0 — по стандарту Latin-1, но в русских MP3 там почти всегда Windows-1251
    const e = b[0]; let d = b.subarray(1), dec;
    if (e === 1) { if (d[0] === 0xFE && d[1] === 0xFF) { dec = td('utf-16be'); d = d.subarray(2); } else { dec = td('utf-16le'); if (d[0] === 0xFF && d[1] === 0xFE) d = d.subarray(2); } }
    else dec = e === 0 ? td('windows-1251') : e === 3 ? td('utf-8') : td('utf-16be');
    return dec.decode(d).split('\0')[0].trim();
  };
  for (let p = 10; p + 10 <= end; ) {
    const id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = ver >= 4 ? ss(p + 4) : u32be(u, p + 4), b = u.subarray(p + 10, p + 10 + size);
    if (id === 'TIT2') out.title = txt(b); else if (id === 'TPE1') out.artist = txt(b); else if (id === 'TALB') out.album = txt(b);
    else if (id === 'TYER' || id === 'TDRC') out.year = txt(b).slice(0, 4);
    else if (id === 'TRCK') out.track = parseInt(txt(b), 10) || 0;
    else if (id === 'APIC' && !out.cover) {
      const e = b[0]; let q = 1; while (q < b.length && b[q]) q++; const mime = td('latin1').decode(b.subarray(1, q)) || 'image/jpeg'; q += 2;
      if (e === 1 || e === 2) { while (q + 1 < b.length && (b[q] || b[q + 1])) q += 2; q += 2; } else { while (q < b.length && b[q]) q++; q++; }
      out.cover = new Blob([b.slice(q)], { type: mime.includes('/') ? mime : 'image/' + mime.toLowerCase() });
    }
    p += 10 + size;
  }
  return out;
}
const u32be = (u, o) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
function flac(u) {
  if (!(u[0] === 0x66 && u[1] === 0x4C && u[2] === 0x61 && u[3] === 0x43)) return null;
  const out = {};
  for (let p = 4, last = false; !last && p + 4 <= u.length; ) {
    last = !!(u[p] & 0x80); const type = u[p] & 0x7F, len = (u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3], b = u.subarray(p + 4, p + 4 + len);
    if (type === 4) { let q = 4 + u32(b, 0); const n = u32(b, q); q += 4; for (let i = 0; i < n && q < b.length; i++) { const l = u32(b, q), s = td('utf-8').decode(b.subarray(q + 4, q + 4 + l)); q += 4 + l; const k = s.split('=')[0].toUpperCase(), v = s.slice(k.length + 1); if (k === 'TITLE') out.title = v; else if (k === 'ARTIST') out.artist = v; else if (k === 'ALBUM') out.album = v; else if (k === 'DATE') out.year = v.slice(0, 4); } }
    if (type === 6 && !out.cover) { let q = 4; const ml = u32be(b, q); const mime = td('latin1').decode(b.subarray(q + 4, q + 4 + ml)); q += 4 + ml; q += 4 + u32be(b, q) + 16; const dl = u32be(b, q); out.cover = new Blob([b.slice(q + 4, q + 4 + dl)], { type: mime || 'image/jpeg' }); }
    p += 4 + len;
  }
  return out;
}
function m4a(u) {   // moov → udta → meta → ilst
  const out = {}, find = (s, e, path) => {
    for (let p = s; p + 8 <= e; ) {
      let size = u32be(u, p); const t = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]); if (size < 8) size = e - p;
      if (path.length) { if (t === path[0]) return find(p + 8 + (t === 'meta' ? 4 : 0), Math.min(e, p + size), path.slice(1)); }
      else {
        const d = p + 8, dt = String.fromCharCode(u[d + 4], u[d + 5], u[d + 6], u[d + 7]);
        if (dt === 'data') { const v = u.subarray(d + 16, p + size), k = t.replace('©', '©');
          if (k === '©nam') out.title = td('utf-8').decode(v); else if (k === '©ART') out.artist = td('utf-8').decode(v); else if (k === '©alb') out.album = td('utf-8').decode(v); else if (k === '©day') out.year = td('utf-8').decode(v).slice(0, 4);
          else if (t === 'covr' && !out.cover) out.cover = new Blob([v.slice()], { type: u[d + 11] === 14 ? 'image/png' : 'image/jpeg' }); }
      }
      p += size;
    }
  };
  find(0, u.length, ['moov', 'udta', 'meta', 'ilst']);
  return Object.keys(out).length ? out : null;
}
async function audioTags(src, name) {
  const n = String(name || '').toLowerCase();
  if (/\.(m4a|mp4|aac|alac)$/.test(n)) { const u = src.size <= 40e6 ? await src.read(0, src.size) : null; return u ? m4a(u) : null; }
  const head = await src.read(0, Math.min(src.size, 12e6));
  return id3(head) || flac(head);
}

// ---------- сторонние библиотеки (vendor/): грузим только когда понадобились ----------
// pdf.js (Mozilla) — PDF; libheif — фото с iPhone (HEIC); UTIF + pako — TIFF целиком
const once = {};
const script = src => once[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete once[src]; rej(new Error('не загрузилась библиотека ' + src)); }; document.head.append(s); });
function pdfjs() {
  return once.pdf ||= import('./vendor/pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href; return m; })
    .catch(e => { delete once.pdf; throw e; });
}
async function pdfOpen(u8) {
  const lib = await pdfjs();
  // isEvalSupported: false — шрифты в PDF не превращаются в исполняемый код (защита от вредных PDF)
  return lib.getDocument({ data: u8, isEvalSupported: false, enableXfa: false }).promise;
}
async function pdfPage(doc, n, width) {
  const page = await doc.getPage(n), v1 = page.getViewport({ scale: 1 }), scale = width / v1.width, vp = page.getViewport({ scale });
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, canvas: cv }).promise; page.cleanup();
  return cv;
}
async function heic(u8) {
  await script('vendor/libheif/libheif-bundle.js');
  const lib = await (once.heifMod ||= root.libheif());
  const dec = new lib.HeifDecoder(), imgs = dec.decode(u8);
  if (!imgs || !imgs.length) throw new Error('в файле HEIC нет картинки');
  const im = imgs[0], w = im.get_width(), h = im.get_height(), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'), id = ctx.createImageData(w, h);
  await new Promise((res, rej) => im.display(id, d => d ? res() : rej(new Error('HEIC не раскодировался'))));
  ctx.putImageData(id, 0, 0); for (const x of imgs) try { x.free(); } catch (e) {}
  return cv;
}
async function tiff(u8) {
  await script('vendor/utif/pako_inflate.min.js'); await script('vendor/utif/UTIF.js');
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), ifds = root.UTIF.decode(buf);
  const main = ifds.filter(x => x.t256 && x.t257).sort((a, b) => b.t256[0] * b.t257[0] - a.t256[0] * a.t257[0])[0];
  if (!main) throw new Error('в TIFF нет картинки');
  root.UTIF.decodeImage(buf, main, ifds);
  const w = main.width, h = main.height, rgba = root.UTIF.toRGBA8(main), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, w * h * 4), w, h), 0, 0);
  return cv;
}

const api = { decodeText, isBinary, highlight, csv, markdown, zipList, zipGet, memSrc, docx, xlsx, audioTags, pdfOpen, pdfPage, heic, tiff };
root.kzView = api;
})(window);
