// The ban (OUR DESIGN, v1.33): while the crew leader has suspended you, the whole app is covered by a lock screen.
// The end time is kept on this phone, so it also holds offline; the server is asked again every few seconds while locked and when the app is opened.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { crew, onCrew, fetchView } from './crew-state.js';
import { button, showToast } from './components.js';
import { formatDateTime } from './format.js';

const YEAR_MS = 365 * 24 * 3600 * 1000;

function leftText(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min >= 2 * 24 * 60) return t('crew.days', { n: Math.ceil(min / (24 * 60)) });
  if (min >= 60) return t('crew.hours', { n: Math.ceil(min / 60) });
  return t('lock.minutes', { n: min });
}

export function installLock() {
  let el = null, timer = null, poll = null;
  const roots = () => [document.getElementById('app'), document.getElementById('nav-root'), document.getElementById('rest-root')].filter(Boolean);
  const hide = () => {
    if (!el) return;
    el.remove(); el = null; clearInterval(timer); clearInterval(poll); timer = poll = null;
    for (const r of roots()) r.inert = false;
  };
  const check = async (manual = false) => {
    try { await fetchView(); if (manual && crew.lockUntil && crew.lockUntil > Date.now()) showToast({ message: t('lock.still') }); }
    catch { if (manual) showToast({ message: t('crew.err.offline') }); }
  };
  function draw() {
    const until = crew.lockUntil;
    if (!until || until <= Date.now()) { hide(); return; }
    const forever = until - Date.now() > YEAR_MS;
    const text = () => (forever ? t('lock.forever') : t('lock.body', { time: formatDateTime(until), left: leftText(until - Date.now()) }));
    if (!el) {
      const body = h('p', { class: 'lock-body', id: 'lock-body' });
      el = h('div', { class: 'app-lock', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'lock-title', 'aria-describedby': 'lock-body' },
        h('div', { class: 'lock-card' }, icon('lock', 'lock-icon'), h('h1', { id: 'lock-title', class: 'display', text: t('lock.title') }), body,
          h('p', { class: 'row-sub', text: t('lock.note') }),
          button({ label: t('lock.check'), variant: 'secondary', block: true, onClick: () => check(true) })));
      document.body.append(el);
      for (const r of roots()) r.inert = true;
      timer = setInterval(draw, 30000);
      poll = setInterval(() => check(false), 20000);
    }
    el.querySelector('#lock-body').textContent = text();
  }
  onCrew(draw);
  draw();
}
