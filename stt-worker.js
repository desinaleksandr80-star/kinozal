// Распознавание речи в отдельном потоке: Whisper (transformers.js), всё считается на устройстве.
// Модель качается один раз и лежит в IndexedDB 'kinozal-stt'; дальше работает без интернета.
import { pipeline, env } from './vendor/stt/transformers.min.js';

// размеры и суммы нужны, чтобы не принять оборванный или подменённый файл
const MODELS = {
  'whisper-tiny': { rev: 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7', files: [
    ['config.json', 2243], ['generation_config.json', 3772], ['preprocessor_config.json', 339], ['tokenizer.json', 2480466], ['tokenizer_config.json', 282683],
    ['onnx/encoder_model_quantized.onnx', 10124990, '2af4a414ca47aa30f61246017e5fe82b0a8d229281d1255ba666a2a7f6b84d19'],
    ['onnx/decoder_model_merged_quantized.onnx', 30719241, '25e807a962b6349356d0ea5d0dfe530b7e5bf0e2a484aeca0359d03143faddd3']] },
  'whisper-base': { rev: '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c', files: [
    ['config.json', 2243], ['generation_config.json', 3832], ['preprocessor_config.json', 339], ['tokenizer.json', 2480466], ['tokenizer_config.json', 282682],
    ['onnx/encoder_model_quantized.onnx', 23201314, '5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46'],
    ['onnx/decoder_model_merged_quantized.onnx', 53693315, 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b']] }
};
// сначала своя копия (huggingface.co из России и Беларуси открывается через раз), потом первоисточник
const HOSTS = [
  (m, rev, f) => 'https://desinaleksandr80-star.github.io/kinozal-models/' + m + '/' + f,
  (m, rev, f) => 'https://huggingface.co/onnx-community/' + m + '/resolve/' + rev + '/' + f
];

const fail = code => Object.assign(new Error(code), { code });
let dbP = null;
const db = () => dbP ||= new Promise((res, rej) => { const r = indexedDB.open('kinozal-stt', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const op = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('files', mode); const r = fn(t.objectStore('files')); t.oncomplete = () => res(r.result); t.onerror = t.onabort = () => rej(t.error); }));
const key = (m, f) => m + '@' + MODELS[m].rev.slice(0, 8) + '/' + f;

async function missing(m) {
  const have = new Set(await op('readonly', s => s.getAllKeys()));
  return MODELS[m].files.filter(([f]) => !have.has(key(m, f)));
}

async function fetchFile(url, size, onBytes) {
  const ac = new AbortController(); let timer = 0;
  const alive = () => { clearTimeout(timer); timer = setTimeout(() => ac.abort(), 30000); };   // полминуты тишины — пробуем другой источник
  try {
    alive();
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    if (!res.ok) throw fail('net');
    const out = new Uint8Array(size), reader = res.body.getReader(); let got = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      if (got + value.length > size) throw fail('net');
      out.set(value, got); got += value.length; alive(); onBytes(got);
    }
    if (got !== size) throw fail('net');
    return out;
  } finally { clearTimeout(timer); ac.abort(); }
}

const hex = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');

async function download(m, progress) {
  const all = MODELS[m].files.reduce((s, f) => s + f[1], 0), need = await missing(m);
  let done = all - need.reduce((s, f) => s + f[1], 0), shown = -1, first = 0;
  const report = extra => { const p = Math.min(99, Math.floor((done + extra) / all * 100)); if (p !== shown) progress(shown = p); };
  report(0);
  for (const [f, size, sha] of need) {
    let data = null;
    for (let i = 0; i < HOSTS.length && !data; i++) {
      const h = (first + i) % HOSTS.length;
      try {
        const got = await fetchFile(HOSTS[h](m, MODELS[m].rev, f), size, n => report(n));
        if (sha && await hex(got) !== sha) throw fail('net');
        data = got; first = h;   // следующий файл — сразу с того источника, что ответил
      } catch (e) { console.warn('[stt] не скачалось', f, e?.message || e); }
    }
    if (!data) throw fail('net');
    try { await op('readwrite', s => s.put(new Blob([data]), key(m, f))); } catch (e) { throw fail('space'); }
    done += size; report(0);
  }
}

let asr = null;
async function load(m) {
  if (asr) return asr;
  env.allowLocalModels = false; env.useBrowserCache = false; env.useFSCache = false; env.useWasmCache = false;
  env.useCustomCache = true;
  env.customCache = {
    match: async k => {
      const f = MODELS[m].files.find(([n]) => String(k).endsWith('/' + n));
      const b = f && await op('readonly', s => s.get(key(m, f[0])));
      return b ? new Response(b, { headers: { 'content-length': String(b.size) } }) : undefined;
    },
    put: async () => {}
  };
  env.fetch = async () => new Response(null, { status: 404 });   // сама библиотека в сеть не ходит: всё нужное уже скачано
  const wasm = env.backends.onnx.wasm;
  wasm.wasmPaths = { mjs: new URL('./vendor/stt/ort-wasm-simd-threaded.mjs', self.location.href).href, wasm: new URL('./vendor/stt/ort-wasm-simd-threaded.wasm', self.location.href).href };
  wasm.numThreads = 1; wasm.proxy = false;
  asr = await pipeline('automatic-speech-recognition', 'onnx-community/' + m, { device: 'wasm', dtype: 'q8' });
  return asr;
}

self.onmessage = async e => {
  const { id, cmd, model, audio } = e.data;
  try {
    if (cmd === 'check') { self.postMessage({ id, result: !(await missing(model)).length }); return; }
    if (cmd === 'download') { await download(model, p => self.postMessage({ id, progress: p })); self.postMessage({ id, result: true }); return; }
    const run = await load(model);
    const out = await run(audio, { language: 'russian', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ id, result: String(out?.text || '').trim() });
  } catch (err) {
    console.error('[stt]', err?.stack || err?.message || String(err));
    const code = typeof err?.code === 'string' ? err.code : /memory|alloc/i.test(String(err?.message || err)) ? 'mem' : 'fail';
    self.postMessage({ id, error: code });
  }
};
