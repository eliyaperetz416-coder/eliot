// "Which number do I type?" Hint chip, explanation sheet and the optional bar / machine base weight.
import { h } from './dom.js';
import { t } from '../core/i18n.mjs';
import { button, numberField, openSheet, showToast } from './components.js';
import { weightMode, supportsBase, cleanBase, BASE_PRESETS } from '../core/load.mjs';
import { baseOf, saveBase } from './store.js';
import { formatKg } from './format.js';

export const weightHint = (ex) => { const m = weightMode(ex); return m ? t(`weight.mode.${m}`) : ''; };

/** Small tappable line under the exercise name. null for exercises where it makes no sense (holds, cardio, bodyweight). */
export function weightChip(ex, onChange) {
  const m = weightMode(ex);
  if (!m || m === 'added') return null;
  const base = supportsBase(ex) ? baseOf(ex.id) : 0;
  const label = base > 0 ? t('weight.chip.base', { n: formatKg(base) }) : t(m === 'perhand' ? 'weight.chip.perhand' : 'weight.chip.total');
  return h('button', { class: 'chip chip-select weight-chip', type: 'button', onclick: () => openWeightSheet(ex, onChange) }, label);
}

export function openWeightSheet(ex, onDone) {
  const can = supportsBase(ex);
  const mode = weightMode(ex);
  const body = h('div', { class: 'stack' }, h('p', { text: weightHint(ex) }));
  let sh;
  if (can) {
    const f = numberField({ id: 'wb-input', label: t('weight.base.label'), unit: t('unit.kg'), value: baseOf(ex.id) ? String(baseOf(ex.id)) : '' });
    const input = f.querySelector('input');
    input.placeholder = '0';
    const chips = h('div', { class: 'chips-wrap' }, BASE_PRESETS[mode].map((n) => h('button', { class: 'chip chip-select', type: 'button', onclick: () => { input.value = n ? String(n) : ''; } }, n ? `${n}` : t('weight.base.none'))));
    body.append(
      h('div', { class: 'section-label', text: t('weight.base.title') }),
      h('p', { class: 'row-sub', text: t('weight.base.hint') }),
      f, chips,
      button({ label: t('common.save'), block: true, onClick: async () => { await saveBase(ex.id, cleanBase(input.value)); sh.close(); showToast({ message: t('weight.base.saved') }); onDone?.(); } }));
  }
  sh = openSheet({ title: t('weight.sheet.title'), content: body });
}
