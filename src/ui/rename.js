// Rename an exercise (per language, library or custom). The original name stays stored so it can be restored.
import { h } from './dom.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, openSheet, showToast } from './components.js';
import { saveExerciseName } from './store.js';

export function openRenameSheet(ex, onDone) {
  const lang = getLanguage();
  const current = lang === 'he' ? ex.nameHe : ex.nameEn;
  const original = lang === 'he' ? ex.origNameHe ?? ex.nameHe : ex.origNameEn ?? ex.nameEn;
  const input = h('input', { class: 'text-input', type: 'text', maxlength: 60, value: current, 'aria-label': t('rename.label'), id: 'rename-input' });
  const save = button({ label: t('common.save'), block: true, onClick: async () => {
    const v = input.value.trim();
    if (!v) return;
    await saveExerciseName(ex.id, lang, v === original ? '' : v);
    sh.close(); showToast({ message: t('rename.saved') }); onDone?.();
  } });
  input.addEventListener('input', () => { save.disabled = !input.value.trim(); });
  const kids = [h('div', { class: 'field-box' }, input), h('p', { class: 'row-sub', text: t('rename.hint') }), save];
  if (current !== original) kids.push(button({ label: t('rename.reset', { name: original }), variant: 'ghost', block: true, onClick: async () => { await saveExerciseName(ex.id, lang, ''); sh.close(); showToast({ message: t('rename.saved') }); onDone?.(); } }));
  const sh = openSheet({ title: t('rename.title'), content: h('div', { class: 'stack' }, kids) });
  input.focus(); input.select();
}
