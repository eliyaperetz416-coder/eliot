// Workout history (inside Profile): list, open, edit (ratings recalculated), delete with confirmation.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import * as W from '../core/workout.mjs';
import { tierFor } from '../core/ranks.mjs';
import { button, emptyState, openSheet, showToast } from './components.js';
import { data } from './data.js';
import { store, commitHistory } from './store.js';
import { formatDate, formatDateTime, formatDuration, formatKg, formatNum } from './format.js';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);

export function historyScreen() {
  const list = [...store.workouts].reverse();
  const byId = data().byId;
  const back = h('a', { class: 'back-link', href: '#/profile' }, icon('chevron', 'chev back-chev'), t('tab.profile'));
  if (!list.length) return h('main', { class: 'screen' }, back, h('h1', { class: 'ex-title', text: t('hist.title') }), emptyState({ icon: 'history', title: t('hist.empty.title'), body: t('hist.empty.body') }));
  return h('main', { class: 'screen' }, back, h('h1', { class: 'ex-title', text: t('hist.title') }),
    h('div', { class: 'list', style: 'margin-block-start:12px' }, list.map((w) => h('a', { class: 'row hist-row', href: `#/history/${w.id}` },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title', text: w.name || formatDate(w.startedMs) }),
        h('span', { class: 'row-sub', text: w.entries.slice(0, 3).map((e) => nameOf(byId[e.exerciseId])).join(' · ') }),
        h('span', { class: 'row-sub num', text: `${w.name ? formatDate(w.startedMs) + ' · ' : ''}${t('common.sets', { n: w.stats?.workingSets ?? 0 })} · ${formatNum(w.stats?.volume ?? 0, 0)} ${t('unit.kg')}` })),
      (w.stats?.prs ?? 0) ? h('span', { class: 'pr-badge pr-all', text: t('hist.pr', { n: w.stats.prs }) }) : null,
      icon('chevron', 'chev')))));
}

export function historyDetailScreen(id) {
  const orig = store.workouts.find((x) => x.id === id);
  const byId = data().byId;
  if (!orig) return h('main', { class: 'screen' }, emptyState({ icon: 'history', title: t('hist.notfound'), body: '' }), h('a', { class: 'btn btn-secondary btn-block', href: '#/history' }, t('hist.title')));
  const w = structuredClone(orig);
  let dirty = false;
  const body = h('div', { class: 'stack' });
  const save = button({ label: t('common.save'), block: true, disabled: true, onClick: async () => {
    const list = store.workouts.map((x) => (x.id === id ? w : structuredClone(x)));
    w.entries = w.entries.filter((e) => e.sets.length);
    await commitHistory(list);
    dirty = false; save.disabled = true;
    showToast({ message: t('hist.saved') });
    location.hash = '#/history';
  } });
  const mark = () => { dirty = true; save.disabled = !w.entries.some((e) => e.sets.length); };

  function setLine(entry, s) {
    const ex = byId[entry.exerciseId];
    const tr = s.rating > 0 ? tierFor(s.rating) : null;
    const info = [];
    if (tr && s.type !== 'warmup') info.push(`${formatNum(s.rating, 0)} · ${t(`tier.${tr.tier}`)}${tr.division ? ' ' + tr.division : ''}`);
    if (s.prAllTime) info.push(t('fb.pr.all')); else if (s.prWeekly) info.push(t('fb.pr.week')); else if (s.prFirst) info.push(t('fb.pr.first'));
    const field = (key, integer, label) => {
      const el = h('input', { class: 'set-input', type: 'text', inputmode: integer ? 'numeric' : 'decimal', 'aria-label': label, dir: 'ltr', value: s[key] ?? '' });
      el.addEventListener('input', () => { const n = el.value.trim() === '' ? null : Number(el.value.replace(',', '.')); s[key] = Number.isFinite(n) ? n : null; mark(); });
      return el;
    };
    const typeBtn = h('button', { class: `set-num type-${s.type}`, type: 'button', 'aria-label': t('settype.title'), onclick: () => {
      const sh = openSheet({ title: t('settype.title'), content: h('div', { class: 'list' }, W.SET_TYPES.map((type) => h('button', { class: 'row', type: 'button', onclick: () => { s.type = type; mark(); sh.close(); draw(); } }, h('span', { class: 'row-title', text: t(`settype.${type}`) }), s.type === type ? icon('check') : null))) });
    } }, s.type === 'normal' ? String(s.idx + 1) : { warmup: 'W', drop: 'D', failure: 'F' }[s.type]);
    const cells = [typeBtn];
    const showW = ex.type === 'weight' || ex.type === 'bodyweight';
    if (showW) cells.push(field('weight', false, t('col.kg')));
    cells.push(field('reps', true, t(ex.type === 'time' ? 'col.sec' : ex.type === 'cardio' ? 'col.sec' : 'col.reps')));
    cells.push(h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('set.delete'), onclick: () => { entry.sets = entry.sets.filter((x) => x !== s); entry.sets.forEach((x, i) => { x.idx = i; }); mark(); draw(); } }, icon('trash')));
    return h('div', { class: 'set-wrap' }, h('div', { class: `hist-set${showW ? '' : ' no-weight'}` }, cells), info.length ? h('div', { class: 'set-fb' }, info.join(' · ')) : null);
  }

  function draw() {
    body.replaceChildren(...w.entries.filter((e) => e.sets.length).map((entry) => h('section', { class: 'card ent-card' },
      h('a', { class: 'ent-name', href: `#/exercise/${entry.exerciseId}` }, nameOf(byId[entry.exerciseId])),
      entry.sets.map((s) => setLine(entry, s)))));
    if (!w.entries.some((e) => e.sets.length)) body.replaceChildren(h('p', { class: 'row-sub', text: t('hist.nosets') }));
  }
  draw();
  const del = button({ label: t('common.delete'), variant: 'danger', icon: 'trash', block: true, onClick: () => {
    const sh = openSheet({ title: t('hist.delete.title'), content: h('div', { class: 'stack' }, h('p', { text: t('hist.delete.confirm') }),
      button({ label: t('common.delete'), variant: 'danger', block: true, onClick: async () => {
        sh.close();
        await commitHistory(store.workouts.filter((x) => x.id !== id).map((x) => structuredClone(x)), [id]);
        showToast({ message: t('hist.deleted') });
        location.hash = '#/history';
      } }), button({ label: t('common.cancel'), variant: 'secondary', block: true, onClick: () => sh.close() })) });
  } });
  const stats = orig.stats ?? {};
  return h('main', { class: 'screen' },
    h('a', { class: 'back-link', href: '#/history' }, icon('chevron', 'chev back-chev'), t('hist.title')),
    h('h1', { class: 'ex-title', text: orig.name || formatDate(orig.startedMs) }),
    h('p', { class: 'ex-title-alt num', text: `${formatDateTime(orig.startedMs)} · ${formatDuration(stats.durationSec ?? 0)} · ${formatNum(stats.volume ?? 0, 0)} ${t('unit.kg')}` }),
    orig.notes ? h('p', { class: 'ent-notes', text: orig.notes }) : null,
    body, h('p', { class: 'row-sub', text: t('hist.recalc') }),
    h('div', { class: 'stack', style: 'padding-block-start:12px' }, save, del));
}
