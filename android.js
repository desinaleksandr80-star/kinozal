// Кинозал как Android-приложение: связывает веб-часть с телефоном — служба «в сети», уведомления,
// звонок поверх блокировки, громкая связь, сохранение файлов, журнал ошибок и обновления.
// В программе для Windows и на сайте этот файл ничего не делает.
(() => {
  'use strict';
  const C = window.Capacitor;
  if (!C || !(C.isNativePlatform ? C.isNativePlatform() : C.platform === 'android')) return;
  const K = C.registerPlugin ? C.registerPlugin('Kinozal') : C.Plugins.Kinozal;
  const H = document.documentElement; H.classList.add('android', 'native');
  const RELEASES = 'https://api.github.com/repos/desinaleksandr80-star/kinozal/releases/latest';
  const store = { get(k, d) { try { const v = localStorage.getItem('kinozal-' + k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('kinozal-' + k, v); } catch (e) {} } };
  const log = (...a) => { try { K.log({ text: a.map(x => typeof x === 'string' ? x : (x?.stack || JSON.stringify(x))).join(' ') }); } catch (e) {} };
  let ver = '', info = {};
  const infoP = K.info().then(i => { info = i; ver = i.version || ''; return i; }).catch(() => ({}));

  // ошибки страницы — в журнал (как в программе для Windows)
  addEventListener('error', e => log('[страница] ошибка:', e.message, (e.filename || '').split('/').pop() + ':' + e.lineno));
  addEventListener('unhandledrejection', e => log('[страница] ошибка:', e.reason?.stack || String(e.reason)));
  const ce = console.error.bind(console); console.error = (...a) => { ce(...a); log('[страница]', ...a); };

  let speakerOn = true;
  window.kzAndroid = {
    android: true,
    version: () => infoP.then(() => ver),
    log: (...a) => log('[страница]', ...a),
    readLog: () => K.readLog().then(r => r.text || ''),
    notify: o => K.notify({ title: o.title || 'Кинозал', body: o.body || '', chat: o.chat || null, call: !!o.call }).catch(() => {}),
    stopRing: () => K.cancelCall().catch(() => {}),
    flash() {},
    unread(n) { if (!n) K.clear({}).catch(() => {}); },
    seen(chat) { K.clear({ chat }).catch(() => {}); },
    onOpenChat(cb) { K.addListener('openChat', d => d?.chat && cb(d.chat)); },
    // «автозапуск» на телефоне — это работа в фоне
    autostart(on) { if (on === undefined) return infoP.then(i => i.background !== false); return K.setBackground({ on: !!on }).catch(() => {}); },
    info: () => K.info(),
    askBattery: () => K.askBattery(),
    askFullScreen: () => K.askFullScreen(),
    openSettings: () => K.openSettings(),
    inCall(on) { K.setCall({ on: !!on, speaker: speakerOn }).catch(e => log('[звонок] служба:', e?.message || e)); },
    async toggleSpeaker() { speakerOn = !speakerOn; const r = await K.speaker({ on: speakerOn }).catch(() => ({})); return r.route || (speakerOn ? 'speaker' : 'earpiece'); },
    get speaker() { return speakerOn; },
    openUrl: url => K.openUrl({ url }),
    // большие файлы и сохранение — кусками в «Загрузки/Кинозал» (тот же набор, что у программы для Windows, без папок целиком)
    files: {
      android: true,
      open: (id, blk) => K.fOpen({ id, blk }).then(r => +r.have || 0),
      write: async (id, off, u8) => { await K.fWrite({ id, off, data: await b64(u8) }); return true; },
      done: (id, name, t) => K.fDone({ id, name, sub: subOf(t), mime: mimeOf(name) }).then(r => r.uri),
      drop: id => K.fDrop({ id }).catch(() => {}),
      save: async (name, u8, t) => { const id = 'save-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); await K.fOpen({ id, blk: 1 }); for (let o = 0; o < u8.length; o += 2 << 20) await K.fWrite({ id, off: o, data: await b64(u8.subarray(o, o + (2 << 20))) }); return (await K.fDone({ id, name, sub: subOf(t), mime: mimeOf(name) })).uri; },
      size: uri => K.fSize({ uri }).then(r => r.size ?? -1),
      slice: async (uri, off, len) => { const out = new Uint8Array(len); let got = 0; while (got < len) { const r = await K.fRead({ uri, off: off + got, len: Math.min(8 << 20, len - got) }); const b = unb64(r.data || ''); if (!b.length) break; out.set(b, got); got += b.length; } return out.subarray(0, got); },
      exists: uri => K.fSize({ uri }).then(r => (r.size ?? -1) >= 0).catch(() => false),
      openPath: uri => K.fView({ uri }).then(() => '').catch(e => e?.message || 'нечем открыть'),
      show: uri => K.fView({ uri }).catch(() => {})
    },
    backup: {
      put: (slot, data) => K.backupPut({ slot, data }).catch(e => log('[копия] не записалась:', e?.message || e)),
      get: slot => K.backupGet({ slot }).then(r => r.data || '').catch(() => ''),
      drop: slot => K.backupDrop({ slot }).catch(() => {})
    }
  };
  const b64 = u8 => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(new Blob([u8])); });
  const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const subOf = t => [].concat(t?.sub || []).map(String).join('/');
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf', zip: 'application/zip', apk: 'application/vnd.android.package-archive', txt: 'text/plain', json: 'application/json', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  const mimeOf = n => MIME[String(n || '').split('.').pop().toLowerCase()] || 'application/octet-stream';

  // ссылки-приглашения kinozal://add/ID и kinozal://room/КОД
  K.addListener('link', d => { if (d?.hash) location.hash = d.hash; });
  // «Ответить» / «Отклонить» в уведомлении о звонке
  K.addListener('callAction', d => { const go = () => d?.act === 'answer' ? window.kzRing?.answer() : window.kzRing?.decline(); window.kzRing ? go() : setTimeout(go, 1500); });

  // первый запуск: разрешить уведомления и работу в фоне
  infoP.then(async i => {
    log('[запуск] Кинозал', ver, '· Android', i.sdk, '·', i.device, '· фон', i.background !== false, '· батарея без ограничений', !!i.battery);
    K.askNotifications().catch(() => {});
    if (i.background !== false) K.setBackground({ on: true }).catch(() => {});
    if (!i.battery && store.get('askedBattery', '') !== '1') { store.set('askedBattery', '1'); setTimeout(() => K.askBattery().catch(() => {}), 2500); }
  });

  // сохранить фото или файл: в WebView ссылки «скачать» не работают — сохраняем сами в «Загрузки/Кинозал»
  document.addEventListener('click', async e => {
    const a = e.target.closest?.('a[download]'); if (!a) return;
    const href = a.href || ''; if (!/^(blob|data):/.test(href)) return;
    e.preventDefault(); e.stopPropagation();
    try {   // кусками по 2 МБ — целиком одной строкой большой файл ронял приложение
      const b = await (await fetch(href)).blob();
      const name = (a.getAttribute('download') || 'kinozal-file').replace(/[\\/:*?"<>|]/g, '_');
      const id = 'dl-' + Date.now().toString(36); await K.fOpen({ id, blk: 1 });
      for (let o = 0; o < b.size; o += 2 << 20) await K.fWrite({ id, off: o, data: await b64(new Uint8Array(await b.slice(o, o + (2 << 20)).arrayBuffer())) });
      const r = await K.fDone({ id, name, sub: '', mime: b.type || mimeOf(name) });
      toast('Сохранено в ' + (r.where || '«Загрузки»'));
    } catch (er) { toast(er?.message || 'Не получилось сохранить'); }
  }, true);
  const toast = t => { const e = document.getElementById('toast'); if (!e) return; e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 3000); };

  // ---------- обновления: раз в 4 часа смотрим последний релиз на GitHub ----------
  const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  let offered = '';
  async function check() {
    try {
      await infoP; if (!ver) return;
      const r = await fetch(RELEASES, { cache: 'no-store' }); if (!r.ok) return;
      const j = await r.json(); const v = String(j.tag_name || '').replace(/^v/, '');
      const apk = (j.assets || []).find(x => /\.apk$/i.test(x.name));
      if (!apk || !newer(v, ver) || offered === v) return;
      offered = v; log('[обновление] есть версия', v); offer(v, apk.browser_download_url);
    } catch (e) {}
  }
  function offer(v, url) {
    const box = document.getElementById('upd'), text = document.getElementById('updText'), go = document.getElementById('updGo'), x = document.getElementById('updX');
    if (!box) return;
    text.textContent = 'Вышла новая версия Кинозала — ' + v + '.'; go.hidden = false; go.disabled = false; go.textContent = 'Скачать и установить'; box.hidden = false;
    x.onclick = () => { box.hidden = true; };
    go.onclick = async () => {
      go.disabled = true; text.textContent = 'Скачиваю обновление…';
      try { await K.update({ url, version: v }); }
      catch (e) {
        go.disabled = false;
        text.textContent = e?.message === 'need-install-permission' ? 'Разреши Кинозалу устанавливать обновления (переключатель на открывшемся экране), вернись и нажми ещё раз.' : (e?.message || 'Не получилось скачать');
      }
    };
  }
  K.addListener('updProgress', d => { const t = document.getElementById('updText'); if (t) t.textContent = 'Скачиваю обновление… ' + (d?.p || 0) + '%'; });
  K.addListener('updDone', d => {
    const t = document.getElementById('updText'), go = document.getElementById('updGo'); if (!t) return;
    if (d?.ok) { t.textContent = 'Готово — подтверди установку. Переписка и настройки сохранятся.'; go.disabled = false; go.textContent = 'Установить'; go.onclick = () => K.installAgain().catch(() => {}); }
    else { t.textContent = 'Обновление не скачалось — проверь интернет и попробуй ещё раз.'; go.disabled = false; }
  });
  addEventListener('load', () => { setTimeout(check, 6000); setInterval(check, 4 * 3600e3); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (check.at || 0) > 3600e3) { check.at = Date.now(); check(); } });
})();
