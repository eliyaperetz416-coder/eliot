import { h } from './dom.js';
import { getSettings, updateSettings } from './storage.js';
import { crew } from './crew-state.js';
import { exportDue, daysSince } from '../core/backup.mjs';
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
import { list, listRow } from './components.js';
import { openChooseWorkout, startFromRoutine, startFromPlanDay, activePlan } from './routines.js';
import { nextPlanDay, planProgress } from '../core/generator.mjs';
import { planDayLabel } from './plan-names.js';
import { gameStrip, questsCard, streakCard } from './game-ui.js';

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

function backupReminder() {
  const now = Date.now();
  const st = getSettings();
  if (!exportDue({ lastExportAt: st.lastExportAt, workouts: store.workouts, snoozedUntil: st.reminderSnoozedUntil, now })) return null;
  const days = daysSince(st.lastExportAt, now);
  const box = h('section', { class: 'card card-accent backup-reminder', role: 'status' },
    h('h2', { text: t('backup.reminder.title') }),
    h('p', { text: days == null ? t('backup.reminder.never') : t('backup.reminder.body', { days }) }),
    h('div', { class: 'stack', style: 'grid-template-columns:repeat(2,minmax(0,1fr));padding-block-start:8px' },
      button({ label: t('backup.reminder.go'), icon: 'download', onClick: () => { location.hash = '#/settings'; } }),
      button({ label: t('backup.reminder.later'), variant: 'secondary', onClick: () => { updateSettings({ reminderSnoozedUntil: now + 3 * 86400000 }); box.remove(); } })));
  return box;
}

export function startScreen() {
  const last = store.workouts[store.workouts.length - 1];
  const plan = activePlan();
  const next = plan ? nextPlanDay(plan) : null;
  const kids = [
    h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('workout.title') })),
    backupReminder(),
    crew.local && crew.unread ? h('a', { class: 'card card-accent crew-unread', href: '#/crew' }, h('b', { text: t('crew.unread.card', { n: crew.unread }) }), h('span', { class: 'row-sub', text: t('crew.unread.open') })) : null,
    gameStrip(),
    rankCard(store.overall),
    h('div', { class: 'stack', style: 'padding-block:16px' }, button({ label: t('wk.start'), icon: 'workout', block: true, onClick: openChooseWorkout })),
  ];
  if (plan && next) {
    kids.push(h('section', { class: 'card card-accent plan-next' },
      h('div', { class: 'row-sub', text: t('choose.plan') }),
      h('div', { class: 'row-title', text: planDayLabel(plan, next) }),
      h('div', { class: 'row-sub', text: `${t('choose.plan.sub', { week: next.week, day: next.day })} · ${planProgress(plan).done}/${planProgress(plan).total}` }),
      h('div', { class: 'stack', style: 'padding-block-start:8px' }, button({ label: t('routines.start'), block: true, onClick: () => startFromPlanDay(plan, next) }))));
  }
  const questBox = h('div', {});
  const redraw = () => { questBox.replaceChildren(streakCard(redraw), questsCard(redraw)); };
  redraw();
  kids.push(questBox);
  kids.push(h('div', { class: 'section-label', text: t('choose.mine') }));
  if (store.routines.length) {
    kids.push(list(store.routines.slice(-4).reverse().map((r) => h('div', { class: 'row routine-row' },
      h('a', { class: 'row-main routine-link', href: `#/routine/${r.id}` }, h('span', { class: 'row-title', text: r.name || t('routines.untitled') }), h('span', { class: 'row-sub', text: t('routines.count', { n: r.entries.length }) })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('routines.start'), disabled: !r.entries.length, onclick: () => startFromRoutine(r) }, icon('bolt'))))));
  } else kids.push(card({ title: t('routines.empty.title'), body: t('routines.empty.body') }));
  kids.push(list([
    listRow({ title: t('routines.title'), sub: t('routines.sub'), icon: 'workout', end: h('span', { class: 'num', text: String(store.routines.length) }), onClick: () => { location.hash = '#/routines'; } }),
    listRow({ title: t('plans.title'), sub: t('plans.sub'), icon: 'bolt', end: h('span', { class: 'num', text: String(store.plans.length) }), onClick: () => { location.hash = '#/plans'; } }),
  ]));
  if (last) kids.push(h('div', { style: 'padding-block-start:12px' }, lastWorkoutCard(last)));
  return h('main', { class: 'screen' }, kids);
}
