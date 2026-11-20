// Кинозал — RAW-снимки без тяжёлых библиотек.
// Почти каждая камера кладёт внутрь RAW готовую JPEG-картинку (для своего экрана), часто в полный размер.
// Находим самую большую такую картинку и данные снимка (камера, объектив, ISO, выдержка, поворот).
// Сам RAW не меняется и уходит собеседнику целиком — это только чтобы его было видно.
// Работает и в окне (window.kzRaw), и в фоновой части программы (require('./rawprev.js')).
(function (root) {
'use strict';
const RAW = /\.(cr2|cr3|crw|nef|nrw|arw|srf|sr2|dng|raf|orf|rw2|pef|srw|x3f|3fr|iiq|erf|mef|mos|kdc|rwl)$/i;

// JPEG, начинающийся в u[at] (FF D8): где кончается, размер и вид кодирования (SOF)
function jpegAt(u, at) {
  const n = u.length; let p = at + 2, w = 0, h = 0, sof = -1;
  for (let guard = 0; guard < 2000 && p + 4 <= n; guard++) {
    if (u[p] !== 0xFF) return null;
    let m = u[p + 1];
    while (m === 0xFF && p + 2 < n) { p++; m = u[p + 1]; }
    if (m === 0xD9 || m === 0xD8) return null;
    if ((m >= 0xD0 && m <= 0xD7) || m === 0x01) { p += 2; continue; }
    const len = (u[p + 2] << 8) | u[p + 3]; if (len < 2 || p + 2 + len > n) return null;
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { sof = m; h = (u[p + 5] << 8) | u[p + 6]; w = (u[p + 7] << 8) | u[p + 8]; }
    p += 2 + len;
    if (m !== 0xDA) continue;
    // после SOS — сжатые данные: FF в них всегда идёт с 00 или RST, так что первый другой маркер — конец скана
    const lim = Math.min(n - 1, p + 64e6);
    for (;;) {
      p = u.indexOf(0xFF, p); if (p < 0 || p >= lim) return null;
      const k = u[p + 1];
      if (k === 0x00 || (k >= 0xD0 && k <= 0xD7) || k === 0xFF) { p += 1 + (k !== 0xFF); continue; }
      if (k === 0xD9) return { end: p + 2, w, h, sof };
      break;   // прогрессивный JPEG: дальше следующий сегмент
    }
  }
  return null;
}
// самая большая встроенная картинка, которую умеет показать браузер (обычный или прогрессивный JPEG)
function preview(u) {
  let best = null;
  for (let i = u.indexOf(0xFF); i >= 0 && i + 3 < u.length; i = u.indexOf(0xFF, i + 1)) {
    if (u[i + 1] !== 0xD8 || u[i + 2] !== 0xFF) continue;
    const j = jpegAt(u, i);
    if (!j) continue;
    if ([0xC0, 0xC1, 0xC2].includes(j.sof) && j.w >= 160 && j.h >= 120 && (!best || j.w * j.h > best.w * best.h)) best = { at: i, end: j.end, w: j.w, h: j.h };
    if (j.sof >= 0) i = j.end - 1;   // вложенные (миниатюра внутри EXIF) пропускаем
  }
  return best ? { jpeg: u.subarray(best.at, best.end), w: best.w, h: best.h } : null;
}

// ---- данные снимка из TIFF-структуры (сам RAW, блоки CMT1/CMT2 у CR3, EXIF внутри JPEG) ----
function tiffInfo(u, base, out) {
  if (base + 8 > u.length) return;
  const le = u[base] === 0x49 && u[base + 1] === 0x49, be = u[base] === 0x4D && u[base + 1] === 0x4D; if (!le && !be) return;
  const r16 = o => le ? u[o] | (u[o + 1] << 8) : (u[o] << 8) | u[o + 1];
  const r32 = o => (le ? (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) : ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3])) >>> 0;
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function ifd(off, depth) {
    const at = base + off; if (!off || at + 2 > u.length || depth > 3) return;
    const cnt = r16(at); if (cnt > 500) return;
    for (let k = 0; k < cnt; k++) {
      const e = at + 2 + k * 12; if (e + 12 > u.length) return;
      const tag = r16(e), type = r16(e + 2), num = r32(e + 4), size = (SZ[type] || 1) * num;
      const vo = size <= 4 ? e + 8 : base + r32(e + 8); if (vo + size > u.length) continue;
      const str = () => { let s = ''; for (let q = 0; q < Math.min(num, 120) && u[vo + q]; q++) s += String.fromCharCode(u[vo + q]); return s.trim(); };
      const rat = () => { const a = r32(vo), b = r32(vo + 4); return b ? a / b : 0; };
      const num1 = () => type === 3 ? r16(vo) : r32(vo);
      switch (tag) {
        case 0x010F: out.make ||= str(); break;
        case 0x0110: out.model ||= str(); break;
        case 0x0112: out.orient ||= num1(); break;
        case 0x8769: ifd(r32(vo), depth + 1); break;   // EXIF
        case 0x829A: out.exp ||= rat(); break;
        case 0x829D: out.f ||= rat(); break;
        case 0x8827: out.iso ||= num1(); break;
        case 0x9003: out.date ||= str(); break;
        case 0x920A: out.focal ||= rat(); break;
        case 0xA434: out.lens ||= str(); break;
      }
    }
  }
  ifd(r32(base + 4), 0);
}
function findAscii(u, s, from, to) {
  const c = s.charCodeAt(0);
  for (let i = u.indexOf(c, from); i >= 0 && i < to; i = u.indexOf(c, i + 1)) { let ok = true; for (let k = 1; k < s.length; k++) if (u[i + k] !== s.charCodeAt(k)) { ok = false; break; } if (ok) return i; }
  return -1;
}
function exifInJpeg(j, out) {   // APP1 "Exif\0\0" + TIFF
  let p = 2;
  while (p + 4 < j.length && j[p] === 0xFF) {
    const m = j[p + 1], len = (j[p + 2] << 8) | j[p + 3];
    if (m === 0xE1 && j[p + 4] === 0x45 && j[p + 5] === 0x78 && j[p + 6] === 0x69 && j[p + 7] === 0x66) { tiffInfo(j, p + 10, out); return; }
    if (m === 0xDA) return; p += 2 + len;
  }
}
function info(u, jpeg) {
  const out = {};
  tiffInfo(u, 0, out);                                       // NEF, CR2, ARW, DNG, ORF, RW2, PEF…
  const head = Math.min(u.length, 1 << 20);
  for (const box of ['CMT1', 'CMT2']) { const i = findAscii(u, box, 0, head); if (i >= 0) tiffInfo(u, i + 4, out); }   // CR3
  if (jpeg) exifInJpeg(jpeg, out);                           // RAF и прочие: EXIF внутри встроенной картинки
  if (out.model && out.make && out.model.toLowerCase().startsWith(out.make.split(' ')[0].toLowerCase())) out.make = '';
  return out;
}
function summary(x) {
  const make = (x.make || '').replace(/\b(CORPORATION|Corporation|CO\.,? ?LTD\.?|Imaging|Camera)\b/g, '').replace(/NIKON/, 'Nikon').replace(/\s+/g, ' ').trim();
  const p = [];
  const cam = [make, x.model || ''].filter(Boolean).join(' ').replace(/NIKON/, 'Nikon').trim(); if (cam) p.push(cam);
  if (x.lens) p.push(x.lens);
  if (x.focal) p.push(Math.round(x.focal) + ' мм');
  if (x.f) p.push('f/' + (Math.round(x.f * 10) / 10).toString().replace('.', ','));
  if (x.exp) p.push(x.exp >= 1 ? (Math.round(x.exp * 10) / 10).toString().replace('.', ',') + ' с' : '1/' + Math.round(1 / x.exp));
  if (x.iso) p.push('ISO ' + x.iso);
  return p.join(' · ').slice(0, 160);
}
const api = { isRaw: n => RAW.test(String(n || '')), preview, info, summary };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.kzRaw = api;
})(typeof window !== 'undefined' ? window : globalThis);
