import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, list, listRow, numberField, openSheet, segmented, showToast } from './components.js';
import { store, saveProfile, bodyweightKg } from './store.js';
import { data } from './data.js';
import { validateProfile } from '../core/profile.mjs';
import { rankCard } from './rank-card.js';
import { formatDate, formatKg, formatNum } from './format.js';
import { APP_VERSION } from '../version.js';
import { levelBar, gameStrip } from './game-ui.js';

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function editSheet(rerender) {
  const p = store.profile;
  const form = { name: p.name, sex: p.sex, age: p.age ?? '', weight: String(bodyweightKg() ?? '') };
  const body = h('div', { class: 'stack' });
  let attempted = false;
  const sh = openSheet({ title: t('profile.edit'), content: body });
  function draw() {
    const errEls = {};
    const err = (k, key) => { errEls[k] = h('p', { class: 'field-error', role: 'alert', text: t(key), hidden: true }); return errEls[k]; };
    const sync = () => { const v = validateProfile(form); for (const [k, el] of Object.entries(errEls)) el.hidden = !(attempted && v.errors[k]); };
    const name = h('input', { class: 'text-input', type: 'text', maxlength: 40, value: form.name, 'aria-label': t('ob.name') });
    name.addEventListener('input', () => { form.name = name.value; sync(); });
    const age = numberField({ id: 'pe-age', label: t('ob.age'), integer: true, value: form.age });
    const weight = numberField({ id: 'pe-weight', label: t('ob.weight'), unit: t('unit.kg'), value: form.weight });
    age.querySelector('input').addEventListener('input', (e) => { form.age = e.target.value; sync(); });
    weight.querySelector('input').addEventListener('input', (e) => { form.weight = e.target.value; sync(); });
    body.replaceChildren(
      h('div', { class: 'field' }, h('label', { text: t('ob.name') }), h('div', { class: 'field-box' }, name), err('name', 'ob.err.name')),
      h('div', { class: 'field' }, h('label', { text: t('ob.curve') }), segmented({ label: t('ob.curve'), value: form.sex, onChange: (x) => { form.sex = x; draw(); }, options: [{ value: 'm', label: t('ob.curve.m') }, { value: 'f', label: t('ob.curve.f') }] }), h('p', { class: 'row-sub', text: t('profile.curve.note') })),
      h('div', { class: 'field' }, weight, err('weight', 'ob.err.weight')),
      h('div', { class: 'field' }, age, h('p', { class: 'row-sub', text: t('ob.age.hint') }), err('age', 'ob.err.age')),
      button({ label: t('common.save'), block: true, onClick: async () => {
        attempted = true;
        const r = validateProfile(form);
        if (!r.ok) { sync(); return; }
        await saveProfile({ ...p, name: r.value.name, sex: r.value.sex, age: r.value.age }, r.value.weight);
        sh.close(); showToast({ message: t('profile.saved') }); rerender();
      } }));
  }
  draw();
}

function weightSheet(rerender) {
  const f = numberField({ id: 'bw-new', label: t('ob.weight'), unit: t('unit.kg'), value: String(bodyweightKg() ?? '') });
  const msg = h('p', { class: 'field-error', role: 'alert' });
  const sh = openSheet({ title: t('profile.bw.update'), content: h('div', { class: 'stack' }, f, h('p', { class: 'row-sub', text: t('profile.bw.note') }), msg,
    button({ label: t('common.save'), block: true, onClick: async () => {
      const v = validateProfile({ name: store.profile.name, sex: store.profile.sex, weight: f.querySelector('input').value, age: store.profile.age ?? '' });
      if (v.errors.weight) { msg.textContent = t('ob.err.weight'); return; }
      await saveProfile(store.profile, v.value.weight);
      sh.close(); rerender();
    } })) });
  f.querySelector('input').focus();
}

export function profileScreen({ onLanguage }) {
  const root = h('main', { class: 'screen' });
  function draw() {
    const p = store.profile;
    const log = [...store.bwLog].sort((a, b) => b.ms - a.ms);
    const kids = [
      h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: p.name })),
      rankCard(store.overall),
      h('section', { class: 'card' }, levelBar(), h('div', { style: 'padding-block-start:10px' }, gameStrip())),
      list([listRow({ title: t('ach.title'), sub: t('ach.count', { n: Object.keys(store.game.achievements.unlocked).length, total: data().achievements.length }), icon: 'trophy', onClick: () => { location.hash = '#/achievements'; } }), listRow({ title: t('tab.shop'), sub: t('game.drachmas'), icon: 'coin', end: h('span', { class: 'num', text: formatNum(store.game.drachmas, 0) }), onClick: () => { location.hash = '#/shop'; } })]),
      h('div', { class: 'section-label', text: t('profile.you') }),
      list([
        listRow({ title: t('ob.curve'), icon: 'profile', end: t(p.sex === 'm' ? 'ob.curve.m' : 'ob.curve.f') }),
        p.age ? listRow({ title: t('profile.age'), icon: 'info', end: h('span', { class: 'num', text: String(p.age) }) }) : null,
      ]),
      h('div', { class: 'stack', style: 'padding-block-start:8px' }, button({ label: t('profile.edit'), variant: 'secondary', block: true, onClick: () => editSheet(draw) })),
      h('div', { class: 'section-label', text: t('profile.bw') }),
      h('section', { class: 'card' }, h('div', { class: 'bw-row' },
        h('div', {}, h('div', { class: 'bw-now display num', text: `${formatKg(bodyweightKg() ?? 0)} ${t('unit.kg')}` }), h('div', { class: 'row-sub', text: t('profile.bw.hint') })),
        button({ label: t('profile.bw.update'), variant: 'secondary', onClick: () => weightSheet(draw) }))),
      log.length > 1 ? h('div', { class: 'section-label', text: t('profile.bw.history') }) : null,
      log.length > 1 ? list(log.slice(0, 10).map((e) => listRow({ title: formatDate(e.ms), end: h('span', { class: 'num', text: `${formatKg(e.kg)} ${t('unit.kg')}` }) }))) : null,
      h('div', { class: 'section-label', text: t('hist.title') }),
      list([listRow({ title: t('cal.row'), sub: t('cal.row.sub'), icon: 'history', onClick: () => { location.hash = '#/calendar'; } }), listRow({ title: t('card.title'), sub: t('card.sub'), icon: 'shield', onClick: () => { location.hash = '#/card'; } }), listRow({ title: t('hist.title'), sub: t('common.sets', { n: store.workouts.reduce((n, w) => n + (w.stats?.workingSets ?? 0), 0) }), icon: 'history', end: h('span', { class: 'num', text: formatNum(store.workouts.length, 0) }), onClick: () => { location.hash = '#/history'; } }), listRow({ title: t('set.title'), sub: t('set.backup'), icon: 'settings', onClick: () => { location.hash = '#/settings'; } })]),
      h('div', { class: 'section-label', text: t('profile.language') }),
      segmented({ label: t('profile.language'), value: getLanguage(), onChange: (l) => { onLanguage(l); }, options: [{ value: 'he', label: t('lang.he'), lang: 'he' }, { value: 'en', label: t('lang.en'), lang: 'en' }] }),
      h('p', { class: 'row-sub', style: 'padding-block-start:8px', text: t('profile.language.hint') }),
    ];
    if (!isStandalone()) kids.push(h('div', { class: 'section-label', text: t('profile.install.title') }), h('section', { class: 'card card-accent tip' }, icon('share'), h('p', { text: t('profile.install.body') })));
    kids.push(h('div', { class: 'section-label', text: t('profile.about') }),
      list([listRow({ title: t('app.name'), sub: t('app.tagline'), icon: 'shield', end: h('span', { class: 'num', dir: 'ltr', text: `${t('profile.version')} ${APP_VERSION}` }) }), listRow({ title: t('profile.local'), icon: 'info' })]));
    root.replaceChildren(...kids);
  }
  draw();
  return root;
}
