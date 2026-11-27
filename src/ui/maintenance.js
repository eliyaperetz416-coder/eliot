// The update lock screen (OUR DESIGN, spec section 3): the app's bolt in a slow glow, "Updating.", one line that the
// workouts are safe, and when we are back. The only thing to tap is the language switch (Elia 27.11: someone who reads
// only English, or only Hebrew, must understand it too); it changes nothing else. keepEager() makes sure the next release (the unlock) takes
// over by itself: it is checked when the app comes back to the screen and every 30 minutes.
import { h } from './dom.js';
import { t } from '../core/i18n.mjs';
import { BACK_AT, backAtLabel, activateWaiting } from '../core/maintenance.mjs';

const MARK = '<svg viewBox="0 0 64 64" width="88" height="88" aria-hidden="true"><defs><linearGradient id="maint-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".45" stop-color="#f6cf6a"/><stop offset="1" stop-color="#9a6a18"/></linearGradient></defs><path d="M37 4 L14 36 H29 L24 60 L50 26 H35 L41 4 Z" fill="url(#maint-g)"/></svg>';

/** onSwitch: shows the screen in the other language (the button is labelled in that language). */
export function maintenanceScreen({ onSwitch } = {}) {
  const mark = h('div', { class: 'maint-mark' });
  mark.innerHTML = MARK; // a constant, no user text
  const time = backAtLabel(BACK_AT);
  return h('main', { class: 'maint', role: 'status' }, mark,
    h('h1', { class: 'display', text: t('maint.title') }),
    h('p', { text: t('maint.body') }),
    time ? h('p', { class: 'maint-back num', text: t('maint.back', { time }) }) : null,
    onSwitch ? h('button', { class: 'btn btn-ghost maint-lang', type: 'button', onclick: onSwitch, text: t('maint.other') }) : null);
}

export function keepEager() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    activateWaiting(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') activateWaiting(reg); });
    });
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => { /* offline: the lock still shows from the cache */ });
}
