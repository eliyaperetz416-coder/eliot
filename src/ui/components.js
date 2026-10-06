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

export function tabBar({ tabs, current }) {
  return h('nav', { class: 'tabbar', 'aria-label': t('nav.label') },
    tabs.map((tab) => h('a', {
      class: 'tab', href: `#/${tab.id}`, 'aria-current': tab.id === current ? 'page' : null,
    }, icon(tab.icon), h('span', { text: t(`tab.${tab.id}`) }))));
}

/* ---------- sheet ---------- */
export function openSheet({ title, content, tall = false }) {
  const root = document.getElementById('overlay-root');
  const app = document.getElementById('app');
  const prevFocus = document.activeElement;
  const close = () => {
    ov.remove(); app.inert = false; document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('close'));
  const ov = h('div', { class: 'overlay' },
    h('div', { class: 'overlay-bg', onclick: close }),
    h('div', { class: `sheet${tall ? ' sheet-tall' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-grab' }),
      h('div', { class: 'sheet-head' }, h('h2', { text: title }), closeBtn),
      content));
  root.append(ov);
  app.inert = true;
  document.addEventListener('keydown', onKey);
  if (!tall) closeBtn.focus();
  return { close };
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
