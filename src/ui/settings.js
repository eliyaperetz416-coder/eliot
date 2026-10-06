import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, list, listRow, openSheet, segmented, showToast } from './components.js';
import { getSettings, updateSettings, requestPersistence, storageInfo } from './storage.js';
import { exportBackup, readBackupFile, applyImport, resetAll } from './backup.js';
import { summarize } from '../core/backup.mjs';
import { formatDate, formatNum } from './format.js';
import { APP_VERSION } from '../version.js';

const mb = (n) => `${formatNum(n / 1048576, n < 10485760 ? 1 : 0)} MB`;

function importFlow(file, done) {
  readBackupFile(file).then((r) => {
    if (!r.ok) { showToast({ message: t(`set.import.err.${r.error}`), duration: 6000 }); return; }
    const { backup } = r;
    const s = summarize(backup.data);
    const body = h('div', { class: 'stack' });
    const run = async (mode) => {
      try { await applyImport(backup, mode); } catch { showToast({ message: t('set.import.failed'), duration: 6000 }); sh.close(); return; }
      sh.close();
      showToast({ message: t('set.import.done') });
      setTimeout(() => location.reload(), 600);
    };
    const choose = () => body.replaceChildren(
      h('p', { text: t('set.import.summary', { date: formatDate(backup.exportedAt), version: backup.appVersion }) }),
      h('p', { class: 'row-sub', text: t('set.import.counts', s) }),
      list([
        listRow({ title: t('set.import.merge'), sub: t('set.import.merge.sub'), icon: 'plus', onClick: () => run('merge') }),
        listRow({ title: t('set.import.replace'), sub: t('set.import.replace.sub'), icon: 'refresh', onClick: confirm }),
      ]),
      button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() }));
    const confirm = () => body.replaceChildren(
      h('p', { text: t('set.import.confirm') }),
      button({ label: t('set.import.confirm.yes'), variant: 'danger', block: true, onClick: () => run('replace') }),
      button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: choose }));
    const sh = openSheet({ title: t('set.import.title'), content: body });
    choose();
    done?.();
  });
}

function resetFlow() {
  const word = t('set.reset.word');
  const input = h('input', { class: 'text-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', 'aria-label': t('set.reset.type', { word }) });
  const go = button({ label: t('set.reset.go'), variant: 'danger', block: true, disabled: true, onClick: async () => {
    await resetAll();
    sh.close();
    showToast({ message: t('set.reset.done') });
    setTimeout(() => { location.hash = ''; location.reload(); }, 500);
  } });
  input.addEventListener('input', () => { go.disabled = input.value.trim().toLowerCase() !== word.toLowerCase(); });
  const sh = openSheet({ title: t('set.reset.title'), content: h('div', { class: 'stack' },
    h('p', { text: t('set.reset.body') }), h('p', { class: 'row-sub', text: t('set.reset.type', { word }) }),
    h('div', { class: 'field-box' }, input), go,
    button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
}

/** Hidden file input + importFlow, used by the "restore from backup" button on the first onboarding screen. */
export function pickBackupFile() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'data-testid': 'onboarding-import-file', 'aria-label': t('set.backup.import') });
  input.addEventListener('change', () => { const f = input.files?.[0]; input.remove(); if (f) importFlow(f); });
  document.body.append(input);
  input.click();
}

export function settingsScreen({ onLanguage }) {
  const root = h('main', { class: 'screen' });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'data-testid': 'import-file', 'aria-label': t('set.backup.import') });
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; fileInput.value = ''; if (f) importFlow(f); });
  let info = { persisted: false, usage: null };
  function draw() {
    const s = getSettings();
    root.replaceChildren(
      h('header', { class: 'screen-head' }, icon('settings', 'mark'), h('h1', { text: t('set.title') })),
      h('div', { class: 'section-label', text: t('set.language') }),
      segmented({ label: t('set.language'), value: getLanguage(), onChange: (l) => onLanguage(l), options: [{ value: 'he', label: t('lang.he'), lang: 'he' }, { value: 'en', label: t('lang.en'), lang: 'en' }] }),
      h('div', { class: 'section-label', text: t('set.accent') }),
      segmented({ label: t('set.accent'), value: s.accentMode, onChange: async (v) => { await updateSettings({ accentMode: v }); draw(); }, options: [{ value: 'rank', label: t('set.accent.rank') }, { value: 'fixed', label: t('set.accent.fixed') }] }),
      h('div', { class: 'section-label', text: t('set.motion') }),
      segmented({ label: t('set.motion'), value: s.reducedMotion ? 'on' : 'off', onChange: async (v) => { await updateSettings({ reducedMotion: v === 'on' }); draw(); }, options: [{ value: 'off', label: t('set.motion.off') }, { value: 'on', label: t('set.motion.on') }] }),
      h('p', { class: 'row-sub', style: 'padding-block-start:8px', text: t('set.motion.hint') }),
      h('div', { class: 'section-label', text: t('set.autoweight') }),
      segmented({ label: t('set.autoweight'), value: s.autoRoutineWeight === false ? 'off' : 'on', onChange: async (v) => { await updateSettings({ autoRoutineWeight: v === 'on' }); draw(); }, options: [{ value: 'on', label: t('set.autoweight.on') }, { value: 'off', label: t('set.autoweight.off') }] }),
      h('p', { class: 'row-sub', style: 'padding-block-start:8px', text: t('set.autoweight.hint') }),
      h('div', { class: 'section-label', text: t('set.backup') }),
      h('p', { class: 'row-sub', style: 'padding-block-end:8px', text: t('set.backup.note') }),
      list([
        listRow({ title: t('set.backup.export'), sub: s.lastExportAt ? t('set.backup.last', { date: formatDate(s.lastExportAt) }) : t('set.backup.never'), icon: 'download', onClick: async () => {
          try { const r = await exportBackup(); if (r !== 'cancelled') showToast({ message: t(r === 'shared' ? 'set.backup.shared' : 'set.backup.downloaded') }); draw(); } catch { showToast({ message: t('set.backup.failed') }); }
        } }),
        listRow({ title: t('set.backup.import'), sub: t('set.backup.import.sub'), icon: 'upload', onClick: () => fileInput.click() }),
      ]), fileInput,
      h('div', { class: 'section-label', text: t('set.storage') }),
      list([
        listRow({ title: t('set.storage.used'), icon: 'info', end: h('span', { class: 'num', dir: 'ltr', text: info.usage != null ? mb(info.usage) : '-' }) }),
        listRow({ title: t('set.storage.persist'), icon: 'shield', end: t(info.persisted ? 'set.storage.persist.yes' : 'set.storage.persist.no') }),
      ]),
      info.persisted ? null : h('div', { class: 'stack', style: 'padding-block-start:8px' }, button({ label: t('set.storage.ask'), variant: 'secondary', block: true, onClick: async () => {
        const ok = await requestPersistence(); info = await storageInfo();
        showToast({ message: t(ok ? 'set.storage.granted' : 'set.storage.denied') }); draw();
      } })),
      h('div', { class: 'section-label', text: t('set.about') }),
      list([
        listRow({ title: t('set.numbers'), sub: t('set.numbers.sub'), icon: 'info', onClick: () => { location.hash = '#/numbers'; } }),
        listRow({ title: t('app.name'), sub: t('app.tagline'), icon: 'bolt', end: h('span', { class: 'num', dir: 'ltr', text: `${t('profile.version')} ${APP_VERSION}` }) }),
      ]),
      h('section', { class: 'card', style: 'margin-block-start:12px' }, h('h2', { text: t('set.credits') }), h('p', { text: t('set.credits.body') })),
      h('p', { class: 'row-sub', style: 'padding-block:12px', text: t('set.privacy') }),
      list([listRow({ title: t('set.reset'), sub: t('set.reset.sub'), icon: 'trash', onClick: resetFlow })]));
  }
  draw();
  storageInfo().then((i) => { info = i; draw(); });
  return root;
}
