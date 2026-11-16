// Кинозал в браузере и на телефоне: установка как приложения, экран не гаснет в звонке,
// клавиатура не закрывает поле ввода. В программе для Windows из этого работает только «экран не гаснет».
(() => {
  'use strict';
  const H = document.documentElement, isApp = !!window.kinozalApp;
  const touch = matchMedia('(pointer:coarse)').matches;
  H.classList.toggle('touch', touch); H.classList.toggle('web', !isApp);
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) H.classList.add('ios');

  // высота видимой части экрана: iOS не сжимает страницу, когда выезжает клавиатура
  const vv = window.visualViewport;
  const fit = () => { H.style.setProperty('--kzh', Math.round(vv ? vv.height : innerHeight) + 'px'); if (vv && vv.offsetTop) scrollTo(0, 0); };
  if (touch) { fit(); vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit); addEventListener('orientationchange', () => setTimeout(fit, 350)); }

  // работа без сети и «установить как приложение»
  if (!isApp && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  addEventListener('appinstalled', () => { deferred = null; });
  window.kzWeb = {
    isApp, touch,
    standalone: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    canInstall: () => !!deferred,
    async install() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; return r?.outcome === 'accepted'; }
  };
  // переписка лежит в браузере — просим не выбрасывать её при нехватке места
  if (!isApp) try { navigator.storage?.persist?.().catch(() => {}); } catch (e) {}

  // в звонке и на киносеансе экран не гаснет
  let lock = null;
  setInterval(async () => {
    const want = !!window.kzRoom?.inRoom && document.visibilityState === 'visible';
    if (want && !lock && navigator.wakeLock) { try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (e) {} }
    else if (!want && lock) { const l = lock; lock = null; try { await l.release(); } catch (e) {} }
  }, 3000);
})();
