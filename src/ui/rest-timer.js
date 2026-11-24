// Rest timer UI. Truth = end timestamp saved in the draft; the display loop only reads the clock.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { startRest, remainingSec, isExpired, adjustRest, progress, formatClock, REST_STEP, restAlertPlan } from '../core/timer.mjs';
import { getSettings } from './storage.js';
import { scheduleRestAlarm, cancelRestAlarm } from './push.js';
import { store, touchDraft } from './store.js';
import { data } from './data.js';
import { playSound } from './sounds.js';

let root, tick = null, doneUntil = 0, audio = null, nextLabel = '';

/** Call from a user gesture (tapping V): iOS only allows audio that was started by a gesture. */
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}
/** The equipped timer sound (+ a short vibration), for the WOD timer too. */
export function beep() {
  if (!audio) return;
  const id = data().shop.cosmetics.find((c) => c.id === store.game.inventory.equipped.sound)?.sound ?? 'beep';
  playSound(audio, id);
  try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
}
/** End of rest (OUR DESIGN, spec 4.6): a full-screen flash with the next set, the sound twice, a long vibration. */
function restDone() {
  const plan = restAlertPlan(getSettings());
  const el = h('div', { class: 'rest-done', role: 'alert', onclick: () => el.remove() },
    icon('bolt'), h('p', { class: 'rest-done-title', text: t('rest.done.title') }), nextLabel ? h('p', { class: 'rest-done-next', text: nextLabel }) : null);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
  if (plan.sound && audio) {
    const id = data().shop.cosmetics.find((c) => c.id === store.game.inventory.equipped.sound)?.sound ?? 'beep';
    playSound(audio, id); setTimeout(() => playSound(audio, id), 450);
  }
  if (plan.vibrate) { try { navigator.vibrate?.(plan.vibrate); } catch { /* ignore */ } }
}
const alarmText = () => [t('rest.done'), nextLabel ? t('rest.done.next', { name: nextLabel }) : t('rest.done.title')];

/** next = the name of what comes next (shown at the end of the rest and in the notification). */
/** The server reminder is for a locked or hidden phone. When the app is on screen at the end it shows its own alert, so the
 *  reminder is withdrawn a few seconds before (no double alert); if the app is hidden in those seconds, it is sent again. */
const EARLY_CANCEL_MS = 3000;
let earlyCancel = null;
function remind() {
  clearTimeout(earlyCancel);
  const t = store.draft?.timer;
  if (!t) return;
  if (t.endAt - Date.now() <= EARLY_CANCEL_MS) { cancelRestAlarm(); return; } // ends now (or the rest was cut to 0): the app alerts itself
  scheduleRestAlarm(t.endAt, ...alarmText());
  const endAt = t.endAt;
  earlyCancel = setTimeout(() => { if (document.visibilityState === 'visible' && store.draft?.timer?.endAt === endAt) cancelRestAlarm(); }, endAt - Date.now() - EARLY_CANCEL_MS);
}
document.addEventListener('visibilitychange', () => {
  const t = store.draft?.timer;
  if (document.visibilityState === 'hidden' && t && t.endAt - Date.now() > 1000 && t.endAt - Date.now() <= EARLY_CANCEL_MS) scheduleRestAlarm(t.endAt, ...alarmText());
});

export function startRestTimer(seconds, next = '') {
  if (!store.draft) return;
  nextLabel = next;
  store.draft.timer = startRest(Date.now(), seconds);
  touchDraft(); loop();
  remind();
}
export function skipRest() { clearTimeout(earlyCancel); if (store.draft?.timer) cancelRestAlarm(); if (store.draft) { store.draft.timer = null; touchDraft(); } doneUntil = 0; paint(); }
function adjust(delta) {
  if (!store.draft?.timer) return;
  store.draft.timer = adjustRest(store.draft.timer, delta, Date.now());
  touchDraft();
  remind(); // before paint(): a rest cut to 0 ends there, and the server reminder must be withdrawn first
  paint();
}

function paint() {
  if (!root) return;
  const timer = store.draft?.timer, now = Date.now();
  if (timer && isExpired(timer, now)) {
    store.draft.timer = null; touchDraft(); doneUntil = now + 4000;
    if (!document.hidden) restDone();
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
