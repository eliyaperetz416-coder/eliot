import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, list, listRow, numberField, openSheet, segmented, showToast } from './components.js';
import { store, saveProfile, bodyweightKg, todayKey } from './store.js';
import { data } from './data.js';
import { validateProfile } from '../core/profile.mjs';
import { formatDate, formatKg, formatNum } from './format.js';
import { levelFromXp } from '../core/game.mjs';
import { view } from '../core/streak.mjs';

function editSheet(rerender) {
  const p = store.profile;
  const form = { name: p.name, sex: p.sex, age: p.age ?? '', weight: String(bodyweightKg() ?? '') };
  const body = h('div', { class: 'stack' });
  let attempted = false;
  const log = [...store.bwLog].sort((a, b) => b.ms - a.ms);
  const sh = openSheet({ title: t('profile.edit'), content: body, tall: true });
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
      } }),
      log.length > 1 ? h('div', { class: 'section-label', text: t('profile.bw.history') }) : null,
      log.length > 1 ? h('div', { class: 'bw-hist' }, list(log.slice(0, 10).map((e) => listRow({ title: formatDate(e.ms), end: h('span', { class: 'num', text: `${formatKg(e.kg)} ${t('unit.kg')}` }) })))) : null);
  }
  draw();
}

/** This month's workouts, for the calendar tile. */
const monthWorkouts = () => { const key = todayKey().slice(0, 7); return store.workouts.filter((w) => w.dateKey?.startsWith(key)).length; };

export function profileScreen() {
  const root = h('main', { class: 'screen' });
  function draw() {
    const p = store.profile, g = store.game;
    const lv = levelFromXp(g.xp), sv = view(g.streak, todayKey());
    const title = data().shop.cosmetics.find((c) => c.id === g.inventory.equipped.title);
    const tile = (href, ic, label, value) => h('a', { class: 'profile-tile', href }, icon(ic), h('span', { class: 'profile-tile-v display num', text: value }), h('span', { class: 'profile-tile-l', text: label }));
    root.replaceChildren(
      h('header', { class: 'profile-head' },
        h('span', { class: 'profile-ring', style: `--p:${Math.round(lv.progress * 100)}%`, role: 'img', 'aria-label': t('today.level.aria', { n: lv.level, into: formatNum(lv.into, 0), need: formatNum(lv.need, 0) }) },
          h('b', { class: 'display', 'aria-hidden': 'true', text: (p.name || '?').trim().charAt(0).toUpperCase() })),
        h('div', { class: 'profile-who' },
          h('h1', { text: p.name }),
          title ? h('div', { class: 'profile-title', text: getLanguage() === 'he' ? title.nameHe : title.nameEn }) : null,
          h('div', { class: 'profile-stats row-sub' },
            h('span', { class: 'num', text: t('game.level', { n: lv.level }) }),
            h('span', { class: 'profile-stat' }, icon('flame'), h('span', { class: 'num', text: String(sv.current) })),
            h('span', { class: 'profile-stat' }, icon('coin'), h('span', { class: 'num', text: formatNum(g.drachmas, 0) })))),
        h('a', { class: 'icon-btn profile-gear', href: '#/settings', 'aria-label': t('set.title') }, icon('settings'))),
      h('nav', { class: 'profile-tiles', 'aria-label': t('tab.profile') },
        tile('#/achievements', 'trophy', t('ach.title'), `${Object.keys(g.achievements.unlocked).length}/${data().achievements.length}`),
        tile('#/shop', 'coin', t('tab.shop'), formatNum(g.drachmas, 0)),
        tile('#/calendar', 'calendar', t('cal.title'), String(monthWorkouts()))),
      list([listRow({ title: t('profile.edit'), icon: 'edit', onClick: () => editSheet(draw) })]));
  }
  draw();
  return root;
}
