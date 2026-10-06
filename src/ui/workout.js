import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import * as W from '../core/workout.mjs';
import { button, card } from './components.js';
import { data } from './data.js';
import { store, setDraft } from './store.js';
import { rankCard } from './rank-card.js';
import { openExercisePicker } from './picker.js';
import { formatDate, formatNum } from './format.js';
import { keepAwake } from './wakelock.js';
import { unlockAudio } from './rest-timer.js';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);

export function startWorkout({ repeat } = {}) {
  unlockAudio();
  const w = repeat ? W.repeatWorkout(repeat) : W.newWorkout();
  setDraft(w);
  keepAwake(true);
  if (location.hash === '#/workout') window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/workout';
  if (!repeat) setTimeout(() => openExercisePicker({ title: t('pick.title'), onPick: (list) => { list.forEach((ex) => W.addEntry(w, ex)); setDraft(w); window.dispatchEvent(new HashChangeEvent('hashchange')); } }), 250);
}

export function lastWorkoutCard(w) {
  const byId = data().byId;
  const names = w.entries.slice(0, 3).map((e) => nameOf(byId[e.exerciseId])).join(' · ');
  return h('a', { class: 'card last-card', href: `#/history/${w.id}` },
    h('div', { class: 'row-sub', text: t('wk.last') }),
    h('div', { class: 'row-title', text: w.name || formatDate(w.endedMs ?? w.startedMs) }),
    h('div', { class: 'row-sub', text: names }),
    h('div', { class: 'row-sub num', text: `${t('common.sets', { n: w.stats?.workingSets ?? 0 })} · ${formatNum(w.stats?.volume ?? 0, 0)} ${t('unit.kg')}` }));
}

export function startScreen() {
  const last = store.workouts[store.workouts.length - 1];
  return h('main', { class: 'screen' },
    h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('workout.title') })),
    rankCard(store.overall),
    h('div', { class: 'stack', style: 'padding-block:16px' },
      button({ label: t('wk.start'), icon: 'workout', block: true, onClick: () => startWorkout() }),
      last ? button({ label: t('wk.repeat'), variant: 'secondary', icon: 'refresh', block: true, onClick: () => startWorkout({ repeat: last }) }) : null),
    last ? lastWorkoutCard(last) : card({ title: t('workout.empty.title'), body: t('workout.empty.body') }));
}
