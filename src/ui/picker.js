// Exercise picker sheet: search + muscle-group chips, single or multi select.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { searchExercises } from '../core/search.mjs';
import { button, openSheet } from './components.js';
import { data } from './data.js';

const GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'other'];
const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);

export function openExercisePicker({ title, multi = true, onPick }) {
  const chosen = new Map();
  let group = null, q = '';
  const list = h('div', { class: 'pick-list' });
  const search = h('input', { type: 'search', class: 'search-input', inputmode: 'search', enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: t('exercises.search'), 'aria-label': t('exercises.search') });
  const addBtn = button({ label: '', onClick: () => { sheet.close(); onPick([...chosen.values()]); } });
  const footer = h('div', { class: 'pick-footer' }, addBtn);

  const groupChips = h('div', { class: 'chips-row pick-groups' }, GROUPS.map((g) =>
    h('button', { type: 'button', class: 'chip chip-select', 'aria-pressed': 'false', onclick: (e) => {
      group = group === g ? null : g;
      groupChips.querySelectorAll('.chip-select').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      if (group) e.currentTarget.setAttribute('aria-pressed', 'true');
      update();
    } }, t(`group.${g}`))));

  function update() {
    let items = data().exercises;
    if (group) items = items.filter((e) => e.muscleGroup === group);
    items = searchExercises(items, q, (ex) => { const f = data().families[ex.family]; return [ex.nameEn, ex.nameHe, t(`equipment.${ex.equipment}`), f?.nameEn, f?.nameHe]; }).slice(0, 80);
    list.replaceChildren(...items.map((ex) => {
      const on = chosen.has(ex.id);
      return h('button', { type: 'button', class: 'pick-row', 'aria-pressed': String(on), onclick: () => {
        if (!multi) { sheet.close(); onPick([ex]); return; }
        chosen.has(ex.id) ? chosen.delete(ex.id) : chosen.set(ex.id, ex);
        update();
      } },
        h('span', { class: 'thumb' }, h('img', { src: ex.image, alt: '', loading: 'lazy', width: 48, height: 48 })),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: nameOf(ex) }), h('span', { class: 'row-sub', text: `${t(`group.${ex.muscleGroup}`)} · ${t(`equipment.${ex.equipment}`)}` })),
        multi ? h('span', { class: `check${on ? ' on' : ''}` }, on ? icon('check') : null) : null);
    }));
    addBtn.replaceChildren(t('pick.add', { n: chosen.size }));
    addBtn.disabled = chosen.size === 0;
    footer.hidden = !multi;
  }
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value; update(); }, 120); });

  const content = h('div', { class: 'picker' },
    h('div', { class: 'search-box' }, icon('search'), search), groupChips, list, footer);
  const sheet = openSheet({ title, content, tall: true });
  update();
  return sheet;
}
