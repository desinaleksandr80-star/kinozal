// Расшифровка голосовых: очередь, декодирование звука и сторож для потока распознавания (stt-worker.js).
(() => {
'use strict';
const phone = !!window.kzAndroid || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const MODEL = phone ? 'whisper-tiny' : 'whisper-base';   // на телефоне WASM заметно медленнее
const MAX_SEC = phone ? 120 : 600;
const fail = code => Object.assign(new Error(code), { code });

let worker = null, seq = 0, idleT = 0;
const calls = new Map();
function kill(code) {
  clearTimeout(idleT);
  worker?.terminate(); worker = null;
  for (const c of calls.values()) c.rej(fail(code));
  calls.clear();
}
function call(cmd, data = {}, transfer = [], onProgress) {
  clearTimeout(idleT);
  if (!worker) {
    worker = new Worker('stt-worker.js', { type: 'module' });
    worker.onmessage = e => {
      const { id, result, error, progress } = e.data, c = calls.get(id); if (!c) return;
      if (progress != null) { c.onProgress?.(progress); return; }
      calls.delete(id); if (error) c.rej(fail(error)); else c.res(result);
      // модель занимает сотни мегабайт памяти — после простоя выгружаем
      clearTimeout(idleT); if (!calls.size) idleT = setTimeout(() => kill('fail'), 120000);
    };
    worker.onerror = e => { console.error('[stt] поток упал:', e.message || ''); kill('fail'); };
  }
  return new Promise((res, rej) => { const id = ++seq; calls.set(id, { res, rej, onProgress }); worker.postMessage({ id, cmd, model: MODEL, ...data }, transfer); });
}

async function decode(blob) {
  const a = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await blob.arrayBuffer());   // сразу в 16 кГц, как ждёт Whisper
  const out = new Float32Array(a.length), n = a.numberOfChannels;
  for (let c = 0; c < n; c++) { const d = a.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / n; }
  return out;
}

let dl = null;
const watchers = new Set();
function download(onProgress) {
  watchers.add(onProgress);
  dl ||= call('download', {}, [], p => watchers.forEach(f => f(p))).finally(() => { dl = null; watchers.clear(); });
  return dl;
}

let queue = Promise.resolve();   // по одному: два распознавания разом только мешают друг другу
function transcribe(blob) {
  const job = queue.then(async () => {
    const audio = await decode(blob), sec = audio.length / 16000;
    if (sec > MAX_SEC + 5) throw fail('long');
    let peak = 0; for (let i = 0; i < audio.length; i += 4) peak = Math.max(peak, Math.abs(audio[i]));
    if (peak < 0.01) return '';   // на тишине Whisper выдумывает слова
    // сторож: не успели — гасим поток, чтобы анимация не крутилась вечно
    const timer = setTimeout(() => kill('slow'), (90 + sec * (phone ? 5 : 3)) * 1000);
    try { return await call('run', { audio }, [audio.buffer]); } finally { clearTimeout(timer); }
  });
  queue = job.catch(() => {});
  return job;
}

window.kzStt = { sizeMB: phone ? 44 : 80, maxSec: MAX_SEC, ready: () => call('check'), downloading: () => !!dl, download, transcribe };
})();
