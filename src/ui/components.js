import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';

export function button({ label, variant = 'primary', icon: ic, block, onClick, type = 'button', disabled }) {
  return h('button', { class: `btn btn-${variant}${block ? ' btn-block' : ''}`, type, onclick: onClick, disabled },
    ic ? icon(ic) : null, label);
}

export function card({ title, body, accent, children = [] } = {}) {
  return h('section', { class: `card${accent ? ' card-accent' : ''}` },
    title ? h('h2', { text: title }) : null,
    body ? h('p', { text: body }) : null,
    children);
}

export function listRow({ title, sub, icon: ic, end, onClick }) {
  const inner = [
    ic ? h('span', { class: 'row-icon' }, icon(ic)) : null,
    h('span', { class: 'row-main' }, h('div', { class: 'row-title', text: title }), sub ? h('div', { class: 'row-sub', text: sub }) : null),
    end != null ? h('span', { class: 'row-end' }, end) : null,
    onClick ? icon('chevron', 'chev') : null,
  ];
  return onClick ? h('button', { class: 'row', type: 'button', onclick: onClick }, inner) : h('div', { class: 'row' }, inner);
}

export function list(rows) { return h('div', { class: 'list' }, rows); }

export function segmented({ options, value, onChange, label }) {
  const root = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const o of options) {
    root.append(h('button', {
      type: 'button', 'aria-pressed': String(o.value === value), lang: o.lang,
      onclick: () => onChange(o.value),
    }, o.label));
  }
  return root;
}

/** Numeric input: decimal keypad for weights, integer keypad for reps. */
export function numberField({ id, label, unit, value = '', integer = false }) {
  const input = h('input', {
    id, type: 'text', inputmode: integer ? 'numeric' : 'decimal', pattern: integer ? '[0-9]*' : '[0-9]*[.,]?[0-9]*',
    enterkeyhint: 'done', autocomplete: 'off', value, dir: 'ltr',
  });
  return h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    h('div', { class: 'field-box' }, input, unit ? h('span', { class: 'field-unit', text: unit }) : null));
}

export function emptyState({ icon: ic, title, body }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-art' }, icon(ic)),
    h('h2', { text: title }),
    h('p', { text: body }));
}

/** Exercise photo thumbnail with an icon fallback (OUR DESIGN). */
export function exThumb(ex, size = 56) {
  const fallback = () => h('span', { class: 'thumb-fallback' }, icon('workout'));
  const img = ex?.image ? h('img', { src: ex.image, alt: '', loading: 'lazy', decoding: 'async', width: size, height: size }) : fallback();
  img.addEventListener?.('error', () => { img.replaceWith(fallback()); });
  return h('span', { class: 'thumb', style: size === 56 ? null : `width:${size}px;height:${size}px` }, img);
}

/** A consistent "back" link at the top of every sub-screen (OUR DESIGN). */
export function backLink(href, label) {
  return h('a', { class: 'back-link', href }, icon('chevron', 'chev back-chev'), label);
}

export function tabBar({ tabs, current, badges = {} }) {
  return h('nav', { class: 'tabbar', 'aria-label': t('nav.label') },
    tabs.map((tab) => h('a', {
      class: 'tab', href: `#/${tab.id}`, 'aria-current': tab.id === current ? 'page' : null,
    }, icon(tab.icon), badges[tab.id] ? h('i', { class: 'tab-dot', 'aria-label': t('crew.unread.label') }) : null, h('span', { text: t(`tab.${tab.id}`) }))));
}

/* ---------- sheet ---------- */
// OUR DESIGN, after Apple's fluid interfaces: the sheet comes up from the bottom edge and leaves the same way; it can be dragged
// down by its grabber/title row, tracks the finger 1:1, resists when pulled up (rubber band), and on release uses the finger's
// velocity to decide (projected end point) and to continue the motion. While a sheet is open everything behind it is inert.
let openSheets = 0;
const reducedMotion = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const behind = () => ['app', 'nav-root', 'rest-root'].map((id) => document.getElementById(id)).filter(Boolean);
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
const project = (v, d = 0.99) => ((v / 1000) * d) / (1 - d); // v in px/s; 0.99 = Apple's snappier rate (0.998 is for long scrolls)

export function openSheet({ title, content, tall = false }) {
  const root = document.getElementById('overlay-root');
  const prevFocus = document.activeElement;
  let closed = false;
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: () => close() }, icon('close'));
  const grab = h('div', { class: 'sheet-grab sheet-drag' });
  const head = h('div', { class: 'sheet-head sheet-drag' }, h('h2', { text: title }), closeBtn);
  const bg = h('div', { class: 'overlay-bg', onclick: () => close() });
  const sheet = h('div', { class: `sheet${tall ? ' sheet-tall' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, grab, head, content);
  const ov = h('div', { class: 'overlay' }, bg, sheet);
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  function close(velocity = 0) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    openSheets = Math.max(0, openSheets - 1);
    if (!openSheets && !document.querySelector('.app-lock')) for (const el of behind()) el.inert = false; // a lock screen keeps them locked
    prevFocus?.focus?.();
    // leaves the DOM's `.sheet` / `.overlay` names at once, so nothing can talk to a sheet that is on its way out
    sheet.classList.replace('sheet', 'sheet-exit'); sheet.removeAttribute('role'); ov.classList.replace('overlay', 'overlay-exit'); ov.inert = true;
    for (const el of sheet.querySelectorAll('[id]')) el.removeAttribute('id'); // ids stay unique if the same sheet opens again at once
    if (reducedMotion()) { ov.remove(); return; }
    const y = currentY();
    const dist = Math.max(1, sheet.offsetHeight + 40 - y);
    const ms = velocity > 0 ? Math.min(320, Math.max(140, (dist / velocity) * 1000 * 1.6)) : 280; // continue at the finger's speed
    sheet.style.animation = 'none';
    sheet.style.transform = `translateY(${y}px)`;
    sheet.getBoundingClientRect(); // start from where it is now (presentation value), never from the target
    sheet.style.transition = `transform ${ms}ms var(--spring)`;
    sheet.style.transform = `translateY(${sheet.offsetHeight + 40}px)`;
    setTimeout(() => ov.remove(), ms + 40);
  }
  const currentY = () => { const m = new DOMMatrixReadOnly(getComputedStyle(sheet).transform); return Number.isFinite(m.m42) ? m.m42 : 0; };

  // drag to dismiss
  let drag = null;
  const onDown = (e) => {
    if (closed || e.button > 0 || e.target.closest('button')) return;
    const y0 = currentY();
    sheet.style.animation = 'none'; sheet.style.transition = 'none'; sheet.style.transform = `translateY(${y0}px)`;
    drag = { id: e.pointerId, startY: e.clientY - y0, hist: [{ y: e.clientY, t: e.timeStamp }] };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const raw = e.clientY - drag.startY;
    const y = raw >= 0 ? raw : rubberband(raw, sheet.offsetHeight); // pulling up resists instead of stopping dead
    sheet.style.transform = `translateY(${y}px)`;
    bg.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / sheet.offsetHeight));
    drag.hist.push({ y: e.clientY, t: e.timeStamp }); if (drag.hist.length > 6) drag.hist.shift();
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const recent = drag.hist.filter((p) => e.timeStamp - p.t <= 100); // only the last 100 ms: a pause before letting go means no momentum
    const h0 = recent[0], h1 = recent[recent.length - 1];
    const v = h0 && h1 && h1.t > h0.t ? ((h1.y - h0.y) / (h1.t - h0.t)) * 1000 : 0; // px/s, down is positive
    drag = null;
    const y = currentY();
    if (y + project(v) > sheet.offsetHeight * 0.45 || v > 1100) { close(Math.max(v, 0)); return; }
    sheet.style.transition = 'transform 360ms var(--spring)'; sheet.style.transform = 'translateY(0)';
    bg.style.transition = 'opacity 360ms var(--spring)'; bg.style.opacity = '1';
  };
  for (const el of [grab, head]) {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  root.append(ov);
  openSheets += 1;
  for (const el of behind()) el.inert = true;
  document.addEventListener('keydown', onKey);
  if (!tall) closeBtn.focus();
  return { close: () => close() };
}

/* ---------- toast ---------- */
export function showToast({ message, actionLabel, onAction, duration = 4000 }) {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', { text: message }));
  const remove = () => el.remove();
  if (actionLabel) el.append(button({ label: actionLabel, variant: 'primary', onClick: () => { onAction?.(); remove(); } }));
  root.append(el);
  if (duration) setTimeout(remove, duration);
  return { remove };
}

/** Compact − value + control. onChange(newValue). */
export function miniStepper({ label, value, min = 1, max = 99, step = 1, format = (v) => String(v), onChange }) {
  const val = h('span', { class: 'ms-v num', text: format(value) });
  let cur = value;
  const set = (v) => { cur = Math.min(max, Math.max(min, v)); val.textContent = format(cur); onChange(cur); };
  return h('div', { class: 'mini-stepper', role: 'group', 'aria-label': label },
    h('span', { class: 'ms-label', text: label }),
    h('div', { class: 'ms-ctrl' },
      h('button', { class: 'ms-btn', type: 'button', dir: 'ltr', 'aria-label': `${label} −`, onclick: () => set(cur - step) }, '−'),
      val,
      h('button', { class: 'ms-btn', type: 'button', dir: 'ltr', 'aria-label': `${label} +`, onclick: () => set(cur + step) }, '+')));
}
