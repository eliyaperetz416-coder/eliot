import { h } from './dom.js';
import { getSettings, updateSettings } from './storage.js';
import { crew, syncPlan } from './crew-state.js';
import { exportDue, daysSince } from '../core/backup.mjs';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import * as W from '../core/workout.mjs';
import { button, card } from './components.js';
import { data } from './data.js';
import { store, setDraft, todayKey, activeMakeup, clearMakeup, saveSchedule } from './store.js';
import { openExercisePicker } from './picker.js';
import { formatDate, formatNum } from './format.js';
import { keepAwake } from './wakelock.js';
import { unlockAudio } from './rest-timer.js';
import { list, listRow } from './components.js';
import { openChooseWorkout, startFromRoutine, startFromPlanDay, activePlan, startMakeup } from './routines.js';
import { nextPlanDay, planProgress } from '../core/generator.mjs';
import { planDayLabel } from './plan-names.js';
import { modelCard } from './model.js';
import { planFor, markDone, isDone, dayDone } from '../core/schedule.mjs';
import { planText } from './schedule.js';
import { gameStrip, questsCard, streakCard } from './game-ui.js';
import { byDay, weekKeys } from '../core/calendar.mjs';
import { view } from '../core/streak.mjs';

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

/** What the big card offers: the next day of the plan, else the saved workout you used last, else a free workout. */
function nextUp() {
  const byId = data().byId;
  const planned = planFor(store.schedule, todayKey()).find((x) => x.kind === 'workout');
  const count0 = (entries) => ({ exercises: entries.length, sets: entries.reduce((n, e) => n + (e.sets ?? 0), 0) });
  if (planned?.kind === 'workout' && planned.ref !== 'plan' && planned.ref !== 'free') {
    const sr = store.routines.find((x) => x.id === planned.ref);
    if (sr?.entries.length) return { kind: 'routine', scheduled: true, title: sr.name || t('routines.untitled'), sub: t('home.saved'), ...count0(sr.entries), image: byId[sr.entries[0]?.exerciseId]?.image, start: () => startFromRoutine(sr) };
  }
  const plan = activePlan();
  const day = plan ? nextPlanDay(plan) : null;
  const count = (entries) => ({ exercises: entries.length, sets: entries.reduce((n, e) => n + (e.sets ?? 0), 0) });
  if (plan && day) return { kind: 'plan', title: planDayLabel(plan, day), sub: t('choose.plan.sub', { week: day.week, day: day.day }), ...count(day.entries), image: byId[day.entries[0]?.exerciseId]?.image, start: () => startFromPlanDay(plan, day) };
  const lastW = [...store.workouts].reverse().find((w) => w.routineId && store.routines.some((r) => r.id === w.routineId));
  const r = (lastW && store.routines.find((x) => x.id === lastW.routineId)) ?? store.routines[store.routines.length - 1];
  if (r && r.entries.length) return { kind: 'routine', title: r.name || t('routines.untitled'), sub: t('home.saved'), ...count(r.entries), image: byId[r.entries[0]?.exerciseId]?.image, start: () => startFromRoutine(r) };
  return { kind: 'free', title: t('home.free'), sub: t('home.free.sub'), start: openChooseWorkout };
}

function heroCard() {
  const n = nextUp();
  const startBtn = button({ label: t('home.start'), icon: 'workout', block: true, onClick: n.start });
  if (n.kind === 'free') startBtn.classList.add('choose-other'); // this one opens the chooser
  const meta = n.exercises ? `${t('home.exercises', { n: n.exercises })} · ${t('common.sets', { n: n.sets })}` : null;
  return h('section', { class: `hero${n.kind === 'plan' ? ' plan-next' : ''}` },
    n.image ? h('img', { class: 'hero-img', src: n.image, alt: '', decoding: 'async' }) : null,
    h('div', { class: 'hero-body' },
      h('div', { class: 'hero-kicker', text: t(n.scheduled ? 'home.sched.today' : n.kind === 'free' ? 'home.new' : 'home.next') }),
      h('div', { class: 'hero-title', text: n.title }),
      h('div', { class: 'hero-sub' }, n.sub, meta ? ` · ${meta}` : ''),
      startBtn,
      n.kind === 'free' ? null : h('button', { class: 'btn btn-ghost btn-block choose-other', type: 'button', onclick: openChooseWorkout }, t('home.other'))));
}

/** Today's rest or other activities, each with a done button (strength workouts show on the big card). OUR DESIGN. */
function scheduleCard() {
  const key = todayKey();
  const items = planFor(store.schedule, key).filter((e) => e.kind !== 'workout');
  if (!items.length) return null;
  return h('section', { class: 'card sched-card' },
    h('div', { class: 'row-sub', text: t('home.sched.today') }),
    ...items.map((e) => {
      const done = isDone(store.schedule, key, e.id);
      return h('div', { class: 'sched-item-home' },
        h('div', { class: 'row-title', text: planText([e]) }),
        e.kind === 'activity' ? button({ label: done ? t('home.sched.undo') : t('home.sched.done'), variant: done ? 'secondary' : 'primary', block: true, onClick: async () => { await saveSchedule(markDone(store.schedule, key, e.id, !done)); syncPlan(); window.dispatchEvent(new HashChangeEvent('hashchange')); } }) : null);
    }));
}

/** One calm card: the days of this week, and how many you trained. Tap it for the calendar. */
function weekCard() {
  const today = todayKey();
  const days = byDay(store.workouts);
  const keys = weekKeys(today, getLanguage() === 'he' ? 0 : 1);
  const done = keys.filter((k) => days.has(k)).length;
  const label = (k) => new Intl.DateTimeFormat(getLanguage() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)));
  return h('a', { class: 'card week-card', href: '#/calendar', 'aria-label': t('cal.title') },
    h('div', { class: 'week-top' }, h('b', { text: t('home.week') }), h('span', { class: 'row-sub', text: t('home.week.count', { n: done }) })),
    h('div', { class: 'week-days' }, keys.map((k) => { const pl = planFor(store.schedule, k); return h('span', { class: `week-day${days.has(k) || dayDone(store.schedule, k) ? ' on' : ''}${k === today ? ' today' : ''}${pl.length && pl.every((e) => e.kind === 'rest') ? ' planned-rest' : ''}${pl.some((e) => e.kind === 'activity') ? ' planned-act' : ''}` }, h('i', {}), h('span', { text: label(k) })); })));
}

/** "Make up what you missed": exercises you did not get to last time, as a one-time workout (OUR DESIGN). */
function makeupCard() {
  const m = activeMakeup();
  if (!m) return null;
  const byId = data().byId;
  const names = m.entries.map((e) => byId[e.exerciseId]).filter(Boolean).map((ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn));
  return h('section', { class: 'card makeup-card' },
    h('div', { class: 'row-title', text: t('makeup.title') }),
    h('div', { class: 'row-sub', text: t(m.entries.length === 1 ? 'makeup.sub.one' : 'makeup.sub', { n: m.entries.length, name: m.name || t('makeup.last') }) }),
    h('div', { class: 'row-sub makeup-names', text: names.slice(0, 3).join(' · ') + (names.length > 3 ? ' …' : '') }),
    h('div', { class: 'btn-pair' },
      button({ label: t('makeup.start'), icon: 'workout', onClick: () => startMakeup(m) }),
      button({ label: t('makeup.dismiss'), variant: 'secondary', onClick: async () => { await clearMakeup(); window.dispatchEvent(new HashChangeEvent('hashchange')); } })));
}

export function startScreen() {
  const last = store.workouts[store.workouts.length - 1];
  const today = new Intl.DateTimeFormat(getLanguage() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now());
  const sv = view(store.game.streak, todayKey());
  const kids = [
    h('header', { class: 'screen-head home-head' }, h('div', {}, h('div', { class: 'row-sub', text: today }), h('h1', { text: t('home.title') }))),
    backupReminder(),
    crew.local && crew.unread ? h('a', { class: 'card card-accent crew-unread', href: '#/crew' }, h('b', { text: t('crew.unread.card', { n: crew.unread }) }), h('span', { class: 'row-sub', text: t('crew.unread.open') })) : null,
    makeupCard(),
    scheduleCard(),
    heroCard(),
    modelCard(),
    weekCard(),
    gameStrip(),
  ];
  const questBox = h('div', {});
  const redraw = () => { questBox.replaceChildren(streakCard(redraw), questsCard(redraw)); };
  redraw();
  const claimable = questBox.querySelectorAll('.quest .btn-primary').length;
  kids.push(h('details', { class: 'home-more', open: !!sv.broken || claimable > 0 },
    h('summary', {}, h('span', { text: t('home.quests') }), claimable ? h('span', { class: 'badge', text: String(claimable) }) : null), questBox));
  kids.push(h('a', { class: 'btn btn-ghost btn-block', href: '#/workouts' }, icon('bolt'), t('home.allWorkouts')));
  if (last) kids.push(h('div', { style: 'padding-block-start:12px' }, lastWorkoutCard(last)));
  return h('main', { class: 'screen' }, kids);
}
