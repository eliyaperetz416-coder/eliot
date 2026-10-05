import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, card, emptyState, list, listRow, numberField, openSheet, segmented, showToast } from './components.js';
import { APP_VERSION } from '../version.js';

const head = (titleKey, withMark = true) =>
  h('header', { class: 'screen-head' }, withMark ? icon('bolt', 'mark') : null, h('h1', { text: t(titleKey) }));

const emptyScreen = (id, ic) => () =>
  h('main', { class: 'screen' }, head(`${id}.title`),
    emptyState({ icon: ic, title: t(`${id}.empty.title`), body: t(`${id}.empty.body`) }));

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function profile({ onLanguage }) {
  const kids = [
    head('profile.title'),
    h('div', { class: 'section-label', text: t('profile.language') }),
    segmented({
      label: t('profile.language'), value: getLanguage(), onChange: onLanguage,
      options: [{ value: 'he', label: t('lang.he'), lang: 'he' }, { value: 'en', label: t('lang.en'), lang: 'en' }],
    }),
    h('p', { class: 'row-sub', style: 'padding-block-start:8px', text: t('profile.language.hint') }),
  ];
  if (!isStandalone()) {
    kids.push(h('div', { class: 'section-label', text: t('profile.install.title') }),
      h('section', { class: 'card card-accent tip' }, icon('share'), h('p', { text: t('profile.install.body') })));
  }
  kids.push(h('div', { class: 'section-label', text: t('profile.about') }),
    list([
      listRow({ title: t('app.name'), sub: t('app.tagline'), icon: 'shield', end: h('span', { class: 'num', dir: 'ltr', text: `${t('profile.version')} ${APP_VERSION}` }) }),
      listRow({ title: t('profile.local'), icon: 'info' }),
    ]));
  return h('main', { class: 'screen' }, kids);
}

/** Component showcase at #/kit (tested, not linked from the UI). */
function kit() {
  const sheetBtn = button({ label: t('kit.sheet.open'), variant: 'secondary', onClick: () =>
    openSheet({ title: t('kit.sheet.title'), content: h('p', { text: t('kit.sheet.body') }) }) });
  const toastBtn = button({ label: t('kit.toast.show'), variant: 'secondary', onClick: () =>
    showToast({ message: t('kit.toast.message'), actionLabel: t('common.ok') }) });
  return h('main', { class: 'screen' }, head('kit.title'),
    h('div', { class: 'section-label', text: t('kit.buttons') }),
    h('div', { class: 'stack' },
      button({ label: t('kit.primary'), block: true }),
      button({ label: t('kit.secondary'), variant: 'secondary', block: true }),
      button({ label: t('kit.ghost'), variant: 'ghost', block: true }),
      button({ label: t('kit.danger'), variant: 'danger', block: true })),
    h('div', { class: 'section-label', text: t('kit.card') }),
    card({ title: t('kit.card.title'), body: t('kit.card.body'), accent: true }),
    h('div', { class: 'section-label', text: t('kit.rows') }),
    list([
      listRow({ title: t('kit.row.title'), sub: t('kit.row.sub'), icon: 'workout', end: h('span', { class: 'num', text: t('kit.sets', { n: 4 }) }), onClick: () => {} }),
      listRow({ title: t('kit.row.title'), sub: t('kit.row.sub'), icon: 'exercises', end: h('span', { class: 'num', text: t('kit.sets', { n: 1 }) }) }),
    ]),
    h('div', { class: 'section-label', text: t('kit.inputs') }),
    h('div', { class: 'stack', style: 'grid-template-columns:repeat(2,minmax(0,1fr))' },
      numberField({ id: 'kit-w', label: t('kit.weight'), unit: t('unit.kg'), value: '82.5' }),
      numberField({ id: 'kit-r', label: t('kit.reps'), integer: true, value: '8' })),
    h('div', { class: 'section-label', text: t('kit.plural') }),
    h('div', { class: 'kv num' }, ...[1, 2, 5].map((n) => h('b', { text: t('kit.sets', { n }) }))),
    h('div', { class: 'section-label', text: '' }),
    h('div', { class: 'stack' }, sheetBtn, toastBtn));
}

export function buildScreens(ctx) {
  return {
    workout: emptyScreen('workout', 'workout'),
    exercises: emptyScreen('exercises', 'exercises'),
    ranks: emptyScreen('ranks', 'ranks'),
    shop: emptyScreen('shop', 'shop'),
    profile: () => profile(ctx),
    kit,
  };
}
