import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { searchExercises } from '../core/search.mjs';
import { emptyState, openSheet, segmented } from './components.js';
import { loadData, data } from './data.js';
import { muscleMap } from './muscle-map.js';
import { store } from './store.js';
import { e1rmSeries } from '../core/charts.mjs';
import { tierFor } from '../core/ranks.mjs';
import { openNeedSheet } from './need.js';
import { button } from './components.js';
import { openMissingSheet } from './missing.js';
import { openRenameSheet } from './rename.js';
import { formatKg, formatNum } from './format.js';

const GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'other'];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'ez-bar', 'bodyweight', 'other'];
const state = { q: '', group: null, equipment: null, ranked: 'all', mine: false };

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const otherName = (ex) => (getLanguage() === 'he' ? ex.nameEn : ex.nameHe);
const haystack = (ex) => {
  const f = data().families[ex.family];
  return [ex.nameEn, ex.nameHe, t(`equipment.${ex.equipment}`), t(`group.${ex.muscleGroup}`), f?.nameEn, f?.nameHe, ...(ex.aliases ?? [])];
};

function filtered() {
  let list = data().exercises;
  if (state.group) list = list.filter((e) => e.muscleGroup === state.group);
  if (state.equipment) list = list.filter((e) => e.equipment === state.equipment);
  if (state.ranked === 'ranked') list = list.filter((e) => e.ranked);
  if (state.ranked === 'unranked') list = list.filter((e) => !e.ranked);
  if (state.mine) list = list.filter((e) => e.custom);
  return searchExercises(list, state.q, haystack);
}

const activeFilters = () => (state.group ? 1 : 0) + (state.equipment ? 1 : 0) + (state.ranked !== 'all' ? 1 : 0) + (state.mine ? 1 : 0);

function row(ex) {
  const img = ex.image ? h('img', { src: ex.image, alt: '', loading: 'lazy', decoding: 'async', width: 56, height: 56 }) : h('span', { class: 'thumb-fallback' }, icon('workout'));
  img.addEventListener?.('error', () => { img.replaceWith(h('span', { class: 'thumb-fallback' }, icon('workout'))); });
  return h('a', { class: 'ex-row', href: `#/exercise/${ex.id}` },
    h('span', { class: 'thumb' }, img),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title', text: nameOf(ex) }),
      h('span', { class: 'row-sub', text: `${t(`group.${ex.muscleGroup}`)} · ${t(`equipment.${ex.equipment}`)}${ex.custom ? ` · ${t('custom.mine')}` : ''}` })),
    ex.ranked ? h('span', { class: 'ranked-dot', title: t('exercises.filter.ranked'), 'aria-label': t('exercises.filter.ranked') }, icon('ranks')) : null,
    icon('chevron', 'chev'));
}

export function exercisesScreen() {
  const root = h('main', { class: 'screen' }, h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('exercises.title') })));
  const listBox = h('div', { class: 'ex-list' });
  const count = h('p', { class: 'ex-count' });
  const active = h('div', { class: 'chips-row' });
  const filterBtn = h('button', { class: 'btn btn-secondary filter-btn', type: 'button', 'aria-label': t('exercises.filters') });
  const search = h('input', { type: 'search', class: 'search-input', inputmode: 'search', enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: t('exercises.search'), 'aria-label': t('exercises.search'), value: state.q });

  function update() {
    const list = filtered();
    count.textContent = t('exercises.count', { n: list.length });
    listBox.replaceChildren(...(list.length
      ? list.map(row)
      : [emptyState({ icon: 'exercises', title: t('exercises.none.title'), body: t('exercises.none.body') })]));
    filterBtn.replaceChildren(icon('filter'), h('span', { text: activeFilters() ? `${t('exercises.filters')} (${activeFilters()})` : t('exercises.filters') }));
    const chips = [];
    if (state.group) chips.push(chip(t(`group.${state.group}`), () => { state.group = null; update(); }));
    if (state.equipment) chips.push(chip(t(`equipment.${state.equipment}`), () => { state.equipment = null; update(); }));
    if (state.mine) chips.push(chip(t('custom.mine'), () => { state.mine = false; update(); }));
    if (state.ranked !== 'all') chips.push(chip(t(`exercises.filter.${state.ranked}`), () => { state.ranked = 'all'; update(); }));
    active.replaceChildren(...chips);
  }
  const chip = (label, onRemove) => h('button', { class: 'chip chip-removable', type: 'button', onclick: onRemove, 'aria-label': `${label} ✕` }, label, icon('close'));

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = search.value; update(); }, 120); });
  filterBtn.addEventListener('click', () => {
    const body = h('div', { class: 'stack' });
    const sheet = { close: () => {} };
    const optChips = (items, key, labelOf) => h('div', { class: 'chips-wrap' }, items.map((v) =>
      h('button', { class: 'chip chip-select', type: 'button', 'aria-pressed': String(state[key] === v), onclick: (e) => {
        state[key] = state[key] === v ? null : v;
        e.currentTarget.parentElement.querySelectorAll('.chip-select').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        if (state[key]) e.currentTarget.setAttribute('aria-pressed', 'true');
        update();
      } }, labelOf(v))));
    body.append(
      h('div', { class: 'chips-wrap' }, h('button', { class: 'chip chip-select', type: 'button', 'aria-pressed': String(state.mine), onclick: (e) => { state.mine = !state.mine; e.currentTarget.setAttribute('aria-pressed', String(state.mine)); update(); } }, t('custom.mine'))),
      h('div', { class: 'section-label', text: t('exercises.filter.group') }), optChips(GROUPS, 'group', (g) => t(`group.${g}`)),
      h('div', { class: 'section-label', text: t('exercises.filter.equipment') }), optChips(EQUIPMENT, 'equipment', (e) => t(`equipment.${e}`)),
      h('div', { class: 'section-label', text: t('exercises.filter.type') }),
      segmented({ label: t('exercises.filter.type'), value: state.ranked, onChange: (v) => { state.ranked = v; s.close(); update(); exercisesFilterReopen(); },
        options: [{ value: 'all', label: t('exercises.filter.all') }, { value: 'ranked', label: t('exercises.filter.ranked') }, { value: 'unranked', label: t('exercises.filter.unranked') }] }));
    const s = openSheet({ title: t('exercises.filters'), content: body });
    Object.assign(sheet, s);
    function exercisesFilterReopen() { /* keep sheet closed after choosing ranking; groups/equipment toggle in place */ }
  });

  root.append(
    h('div', { class: 'search-row' }, h('div', { class: 'search-box' }, icon('search'), search), filterBtn, h('a', { class: 'icon-btn add-custom', href: '#/custom/new', 'aria-label': t('custom.new') }, icon('plus'))),
    active, count, listBox,
    h('div', { class: 'stack', style: 'padding-block-start:12px' }, h('button', { class: 'btn btn-secondary btn-block missing-btn', type: 'button', onclick: () => openMissingSheet() }, icon('plus'), t('missing.cta'))));
  update();
  return root;
}

export function exerciseDetailScreen(id) {
  const ex = data().byId[id];
  if (!ex) {
    return h('main', { class: 'screen' }, emptyState({ icon: 'exercises', title: t('exercise.notfound'), body: '' }),
      h('a', { class: 'btn btn-secondary btn-block', href: '#/exercises' }, t('exercises.back')));
  }
  const fam = data().families[ex.family];
  let showSecond = false;
  const hasPhoto = !!ex.image;
  const img = h('img', { src: ex.image, alt: nameOf(ex), width: 480, height: 320, decoding: 'async' });
  const imgBtn = h('button', { class: 'ex-photo', type: 'button', 'aria-label': t('exercise.tapImage'), onclick: () => {
    if (!ex.image2) return;
    showSecond = !showSecond; img.src = showSecond ? ex.image2 : ex.image;
  } }, img);
  img.addEventListener('error', () => { imgBtn.replaceChildren(h('span', { class: 'thumb-fallback big' }, icon('workout'))); });

  const curve = [];
  if (ex.ranked) {
    curve.push(h('p', { text: t('exercise.curve.ranked', { family: getLanguage() === 'he' ? fam.nameHe : fam.nameEn }) }));
    if (ex.perHand) curve.push(h('p', { class: 'row-sub', text: t('exercise.curve.perhand') }));
    if (ex.bwFactor) curve.push(h('p', { class: 'row-sub', text: t('exercise.curve.bodyweight') }));
    curve.push(h('p', { class: 'row-sub', text: t('exercise.curve.approx') }));
  } else curve.push(h('p', { text: t('exercise.curve.unranked') }));

  const steps = getLanguage() === 'he' ? ex.instructionsHe : ex.instructionsEn;
  return h('main', { class: 'screen' },
    h('a', { class: 'back-link', href: '#/exercises' }, icon('chevron', 'chev back-chev'), t('exercises.back')),
    h('div', { class: 'ex-title-row' }, h('h1', { class: 'ex-title', text: nameOf(ex) }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('rename.title'), onclick: () => openRenameSheet(ex, () => window.dispatchEvent(new HashChangeEvent('hashchange'))) }, icon('edit'))),
    ex.custom ? null : h('p', { class: 'ex-title-alt', lang: getLanguage() === 'he' ? 'en' : 'he', dir: 'auto', text: otherName(ex) }),
    h('div', { class: 'ex-meta' },
      h('span', { class: 'chip', text: t(`group.${ex.muscleGroup}`) }),
      h('span', { class: 'chip', text: t(`equipment.${ex.equipment}`) }),
      h('span', { class: 'chip', text: t(`exercise.type.${ex.type}`) }),
      ex.custom ? h('span', { class: 'chip chip-primary', text: t('custom.mine') }) : null),
    muscleMap({ muscles: data().muscles, exercise: ex }),
    hasPhoto ? imgBtn : null,
    hasPhoto && ex.image2 ? h('p', { class: 'row-sub center', text: t('exercise.tapImage') }) : null,
    h('div', { class: 'section-label', text: t('exercise.howto') }),
    steps.length ? h('ol', { class: 'steps', lang: getLanguage() }, steps.map((s) => h('li', { text: s }))) : h('p', { class: 'row-sub', text: t('custom.nosteps') }),
    h('div', { class: 'section-label', text: t('exercise.curve') }),
    h('section', { class: 'card' }, curve),
    h('div', { class: 'section-label', text: t('exercise.best') }),
    bestCard(ex),
    ex.custom ? h('div', { class: 'stack', style: 'padding-block-start:12px' }, h('a', { class: 'btn btn-secondary btn-block', href: `#/custom/${ex.id}` }, t('custom.edit'))) : null);
}

function bestCard(ex) {
  const series = e1rmSeries(store.workouts, ex.id, data().byId);
  if (!series.length) return h('section', { class: 'card' }, h('p', { text: t('exercise.best.empty') }));
  const best = Math.max(...series.map((p) => p.v));
  const b = store.bests[ex.id];
  const unit = ex.type === 'weight' || ex.ranked ? ` ${t('unit.kg')}` : ex.type === 'time' || ex.type === 'cardio' ? ` ${t('col.sec.short')}` : '';
  const kids = [h('div', { class: 'bw-now display num', text: `${formatNum(best, 1)}${unit}` }),
    h('p', { class: 'row-sub', text: ex.ranked ? t('exercise.best.e1rm') : t('exercise.best.metric') })];
  if (b) { const tr = tierFor(b.rating); kids.push(h('p', { text: `${t(`tier.${tr.tier}`)}${tr.division ? ' ' + tr.division : ''} · ${formatNum(b.rating, 0)} · ${formatKg(b.weight ?? 0)}×${b.reps}` })); }
  kids.push(h('div', { class: 'stack', style: 'padding-block-start:8px' },
    ex.ranked ? button({ label: t('need.title'), variant: 'secondary', block: true, onClick: () => openNeedSheet(ex) }) : null,
    h('a', { class: 'btn btn-secondary btn-block', href: `#/progress/${ex.id}` }, t('progress.title'))));
  return h('section', { class: 'card' }, kids);
}

export { loadData };
