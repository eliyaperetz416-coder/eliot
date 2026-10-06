// Rest timer UI. Truth = end timestamp saved in the draft; the display loop only reads the clock.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { startRest, remainingSec, isExpired, adjustRest, progress, formatClock, REST_STEP } from '../core/timer.mjs';
import { store, touchDraft } from './store.js';

let root, tick = null, doneUntil = 0, audio = null;

/** Call from a user gesture (tapping V): iOS only allows audio that was started by a gesture. */
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}
function beep() {
  if (!audio) return;
  try {
    const now = audio.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, now + d); g.gain.exponentialRampToValueAtTime(0.35, now + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.18);
      o.connect(g).connect(audio.destination); o.start(now + d); o.stop(now + d + 0.2);
    });
  } catch { /* ignore */ }
  try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
}
function flash() {
  const f = h('div', { class: 'rest-flash', 'aria-hidden': 'true' });
  document.body.append(f);
  setTimeout(() => f.remove(), 1000);
}

export function startRestTimer(seconds) {
  if (!store.draft) return;
  store.draft.timer = startRest(Date.now(), seconds);
  touchDraft(); loop();
}
export function skipRest() { if (store.draft) { store.draft.timer = null; touchDraft(); } doneUntil = 0; paint(); }
function adjust(delta) {
  if (!store.draft?.timer) return;
  store.draft.timer = adjustRest(store.draft.timer, delta, Date.now());
  touchDraft(); paint();
}

function paint() {
  if (!root) return;
  const timer = store.draft?.timer, now = Date.now();
  if (timer && isExpired(timer, now)) {
    store.draft.timer = null; touchDraft(); doneUntil = now + 4000;
    if (!document.hidden) { beep(); flash(); }
  }
  const active = store.draft?.timer, over = now < doneUntil;
  root.hidden = !active && !over;
  if (root.hidden) return;
  root.className = `rest-bar${over && !active ? ' over' : ''}`;
  if (over && !active) {
    root.replaceChildren(icon('bolt'), h('span', { class: 'rest-time', text: t('rest.done') }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: skipRest }, icon('close')));
    return;
  }
  const left = remainingSec(active, now);
  root.replaceChildren(
    h('span', { class: 'rest-prog', style: `transform:scaleX(${progress(active, now)})` }),
    h('button', { class: 'rest-btn', type: 'button', dir: 'ltr', onclick: () => adjust(-REST_STEP), 'aria-label': t('rest.minus') }, '−15'),
    h('span', { class: 'rest-mid' }, h('span', { class: 'rest-label', text: t('rest.label') }), h('span', { class: 'rest-time display num', text: formatClock(left) })),
    h('button', { class: 'rest-btn', type: 'button', dir: 'ltr', onclick: () => adjust(REST_STEP), 'aria-label': t('rest.plus') }, '+15'),
    h('button', { class: 'rest-btn rest-skip', type: 'button', onclick: skipRest }, t('rest.skip')));
}

function loop() {
  clearInterval(tick);
  paint();
  tick = setInterval(() => { paint(); if (!store.draft?.timer && Date.now() >= doneUntil) { clearInterval(tick); tick = null; } }, 250);
}

export function initRestTimer(el) {
  root = el;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); }); // recompute from timestamp on return
  loop();
}
export const refreshRestTimer = () => loop();
