// Кинозал — поиск собеседника сразу через два сервера.
//
// Звук, видео и сообщения идут напрямую между устройствами, сервер нужен только чтобы найти друг друга.
// Общий 0.peerjs.com закрыт для Беларуси и России (Cloudflare отвечает «Sorry, you have been blocked»),
// поэтому каждое устройство встаёт в сеть и там, и на своём сервере Кинозала (Cloudflare Workers,
// проект kinozal-vpn\signal). Кто где смог — там его и найдут:
//   • входящие соединения принимаются с обоих серверов;
//   • исходящее пробуется сначала там, где собеседника видели в прошлый раз (иначе на peerjs.com —
//     он сразу отвечает «такого нет»), а если сервер ответил «такого нет» — на следующем.
// Подменяет window.Peer, так что мессенджер и залы ничего об этом не знают. Старые версии Кинозала
// (только peerjs.com) по-прежнему находятся через peerjs.com.
(() => {
'use strict';
const Base = window.Peer;
if (typeof Base !== 'function' || Base.kzDual) return;
const EE = Object.getPrototypeOf(Base.prototype).constructor;   // EventEmitter внутри PeerJS

const SERVERS = [
  { name: 'peerjs.com', opts: {} },
  { name: 'сервер Кинозала', opts: { host: 'kinozal-signal.kinozal-signal.workers.dev', port: 443, secure: true, path: '/', key: 'peerjs' } },
];
const NET = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected']);
const SETTLE_MS = 3000;   // сколько ждать второй сервер, когда первый уже ответил
const where = new Map();  // ID собеседника -> номер сервера, где он нашёлся в последний раз
const jlog = (...a) => { try { (window.kinozalApp || window.kzAndroid)?.log?.(...a); } catch (e) {} };
const rid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return 'kz' + [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 18); };
const err = (type, msg) => Object.assign(new Error(msg), { type });

// Исходящее соединение (connect) или звонок (call). Снаружи выглядит как обычное соединение PeerJS:
// свойства и методы берутся у текущей попытки, обработчики событий переезжают на следующую попытку.
// Свои поля, которые программа вешает на соединение, остаются на обёртке.
class Out extends EE {
  constructor(kp, kind, id, args, order) {
    super();
    this.kp = kp; this.kind = kind; this.peerId = id; this.args = args; this.order = order; this.n = -1;
    this.cur = null; this.x = null; this.opened = false; this.evs = new Set();
    this.local = Object.create(null);
    const self = this;
    this.proxy = new Proxy(this, {
      get(t, k) {
        if (k in self.local) return self.local[k];
        if (k === 'on' || k === 'addListener' || k === 'once') return (ev, fn, ctx) => { self._watch(ev); EE.prototype[k].call(self, ev, fn, ctx); return self.proxy; };
        if (k === 'off' || k === 'removeListener' || k === 'removeAllListeners' || k === 'emit' || k === 'listeners' || k === 'listenerCount') return (...a) => { const r = EE.prototype[k].apply(self, a); return r === self ? self.proxy : r; };
        if (k === 'kzServer') return self.x?.s.name;
        const c = self.cur, v = c?.[k];
        return typeof v === 'function' ? v.bind(c) : v;
      },
      set(t, k, v) { self.local[k] = v; return true; },
      has(t, k) { return k in self.local || (!!self.cur && k in self.cur); },
    });
    this._next();
  }
  _watch(ev) {
    if (this.evs.has(ev)) return;
    this.evs.add(ev);
    const c = this.cur; if (c) c.on(ev, (...a) => { if (this.cur === c) this.emit(ev, ...a); });
  }
  // следующий сервер; false — серверов больше нет
  _next() {
    for (;;) {
      const x = this.order[++this.n];
      if (!x) return false;
      if (x.st !== 'open' || !x.p || x.p.disconnected) continue;
      let c = null;
      try { c = this.kind === 'call' ? x.p.call(this.peerId, ...this.args) : x.p.connect(this.peerId, ...this.args); } catch (e) {}
      if (!c) continue;
      const old = this.cur;
      this.cur = c; this.x = x;
      if (old) try { old.close(); } catch (e) {}   // его события уже никуда не идут
      for (const ev of this.evs) c.on(ev, (...a) => { if (this.cur === c) this.emit(ev, ...a); });
      const ok = () => { if (this.cur !== c || this.opened) return; this.opened = true; where.set(this.peerId, x.i); this.kp._unpend(this); };
      c.on(this.kind === 'call' ? 'stream' : 'open', ok);
      c.on('iceStateChanged', st => { if (st === 'connected' || st === 'completed') ok(); });
      c.on('close', () => { if (this.cur === c) this.kp._unpend(this); });
      this.kp._pend(this);
      if (old) { jlog('[сеть] ' + this.peerId + ' — пробую через ' + x.s.name); this.emit('kzswitch', c); }
      return true;
    }
  }
  // сервер x сказал «такого нет»
  _expired(x) {
    if (this.opened || this.x !== x) return false;
    if (this.cur?.peerConnection?.remoteDescription) { this.opened = true; this.kp._unpend(this); return false; }   // собеседник уже ответил
    if (this._next()) return false;
    this.kp._unpend(this);
    return true;   // везде нет — пусть программа узнает
  }
}

class KzPeer extends EE {
  constructor(id, options) {
    super();
    if (id && typeof id === 'object') { options = id; id = undefined; }
    this._id = id || rid();
    this._o = options || {};
    this._open = false; this._destroyed = false; this._st = 0;
    this._pending = new Map();   // ID собеседника -> Set(Out), ждущие ответа
    this._subs = SERVERS.map((s, i) => ({ i, s, p: null, st: 'down', tries: 0, t: 0, first: true }));
    for (const x of this._subs) this._start(x);
  }
  get id() { return this._id; }
  get options() { return this._o; }
  get open() { return this._subs.some(x => x.st === 'open'); }
  get destroyed() { return this._destroyed; }
  get disconnected() { return this._destroyed || !this.open; }
  get kzServers() { return this._subs.map(x => ({ name: x.s.name, state: x.st })); }

  _start(x) {
    clearTimeout(x.t); x.t = 0;
    if (this._destroyed) return;
    try { x.p?.destroy(); } catch (e) {}
    let p;
    // повторные попытки к недоступному серверу — без ошибок PeerJS в журнале
    try { p = x.p = new Base(this._id, { ...this._o, ...x.s.opts, ...(x.tries ? { debug: 0 } : {}) }); } catch (e) { x.p = null; this._down(x, err('browser-incompatible', String(e?.message || e))); return; }
    x.st = 'wait';
    const mine = () => x.p === p && !this._destroyed;
    p.on('open', () => {
      if (!mine()) return;
      x.st = 'open'; x.tries = 0;
      jlog('[сеть] ' + x.s.name + ': в сети');
      this._settle();
    });
    p.on('connection', c => { if (!mine()) return; where.set(c.peer, x.i); this.emit('connection', c); });
    p.on('call', c => { if (!mine()) return; where.set(c.peer, x.i); this.emit('call', c); });
    p.on('disconnected', () => { if (mine()) this._down(x, null); });
    p.on('close', () => { if (mine()) this._down(x, null); });
    p.on('error', e => { if (mine()) this._err(x, e); });
  }
  _err(x, e) {
    const t = e?.type;
    if (t === 'peer-unavailable') {
      const m = String(e.message || '').match(/peer (\S+)/);
      const set = m && this._pending.get(m[1]);
      if (!set) return;   // старая попытка, которую уже перенесли на другой сервер
      let gone = false;
      for (const o of [...set]) if (o._expired(x)) gone = true;
      if (gone) this.emit('error', e);
      return;
    }
    if (t === 'unavailable-id') {
      // при первом входе — по-настоящему занято (зал с таким кодом, профиль открыт в другом окне)
      if (x.first && !this._open) { this.emit('error', e); this._kill(); return; }
      this._down(x, null); return;   // своё же старое место, ещё не освободилось — попробуем позже
    }
    if (NET.has(t)) { this._down(x, e); return; }
    this.emit('error', e);
  }
  _down(x, e) {
    if (this._destroyed || x.st === 'down') return;
    const was = x.st; x.st = 'down'; x.first = false;
    if (was === 'open' || !x.tries) jlog('[сеть] ' + x.s.name + ': нет связи' + (e?.type ? ' (' + e.type + ')' : '') + ' — буду пробовать ещё');
    const delay = Math.min(300000, 5000 * 2 ** Math.min(x.tries++, 6));   // 5 с, 10 с … до 5 мин
    x.t = setTimeout(() => this._start(x), delay);
    // соединения, которые ждали ответа через этот сервер, пробуем через другой
    for (const set of [...this._pending.values()]) for (const o of [...set]) if (o.x === x && !o.opened) o._expired(x);
    const all = this._subs.every(s => s.st === 'down');
    if (!this._open) { if (all) { if (e) this.emit('error', e); } else this._settle(); return; }
    if (all) { this._open = false; if (e) this.emit('error', e); this.emit('disconnected', this._id); }
  }
  // «в сети» — когда первый сервер ответил и второй тоже определился (или ждали его SETTLE_MS)
  _settle() {
    if (this._open || this._destroyed || !this.open) return;
    const fire = () => {
      clearTimeout(this._st); this._st = 0;
      if (this._open || this._destroyed || !this.open) return;
      this._open = true;
      jlog('[сеть] через: ' + this._subs.filter(s => s.st === 'open').map(s => s.s.name).join(' + '));
      this.emit('open', this._id);
    };
    if (this._subs.every(s => s.st !== 'wait')) fire();
    else if (!this._st) this._st = setTimeout(fire, SETTLE_MS);
  }
  _pend(o) { let s = this._pending.get(o.peerId); if (!s) this._pending.set(o.peerId, s = new Set()); s.add(o); }
  _unpend(o) { const s = this._pending.get(o.peerId); if (!s) return; s.delete(o); if (!s.size) this._pending.delete(o.peerId); }
  _out(kind, id, args) {
    const w = where.get(id);
    const order = this._subs.filter(x => x.st === 'open').sort((a, b) => (b.i === w) - (a.i === w) || a.i - b.i);
    if (!order.length) { this.emit('error', err('disconnected', 'Cannot connect to new Peer after disconnecting from server.')); return undefined; }
    const o = new Out(this, kind, id, args, order);
    return o.cur ? o.proxy : undefined;
  }
  connect(id, opts) { return this._out('connect', id, [opts]); }
  call(id, stream, opts) { return this._out('call', id, [stream, opts]); }
  reconnect() {
    if (this._destroyed) return;
    for (const x of this._subs) if (x.st === 'down') { x.tries = 0; this._start(x); }
  }
  _kill() {
    if (this._destroyed) return;
    this._destroyed = true; this._open = false; clearTimeout(this._st);
    for (const x of this._subs) { clearTimeout(x.t); x.st = 'down'; try { x.p?.destroy(); } catch (e) {} }
    this._pending.clear();
  }
  disconnect() { this._kill(); }
  destroy() { if (this._destroyed) return; this._kill(); this.emit('close'); }
}
KzPeer.kzDual = true;
KzPeer.Base = Base;
window.Peer = KzPeer;
})();
