import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import * as W from '../core/workout.mjs';
import { button } from './components.js';
import { data } from './data.js';
import { store, setDraft, todayKey } from './store.js';
import { openExercisePicker } from './picker.js';
import { formatNum } from './format.js';
import { keepAwake } from './wakelock.js';
import { unlockAudio } from './rest-timer.js';
import { openChooseWorkout, startFromRoutine, startFromPlanDay, activePlan } from './routines.js';
import { nextPlanDay } from '../core/generator.mjs';
import { planDayLabel } from './plan-names.js';
import { planFor, dayDone, nextScheduledWorkout, workoutSize } from '../core/schedule.mjs';
import { byDay, weekKeys } from '../core/calendar.mjs';
import { view } from '../core/streak.mjs';
import { levelFromXp } from '../core/game.mjs';
import { questBoard } from '../core/quests.mjs';
import { tierFor } from '../core/ranks.mjs';
import { emblem } from './emblem.js';
import { shownOverall } from './store.js';
import { openBellSheet, openQuestsSheet, bellCount } from './today-sheets.js';

const nameOf = (ex) => (ex ? (getLanguage() === 'he' ? ex.nameHe : ex.nameEn) : t('exercise.unknown')); // a deleted custom exercise must not break a list

export function startWorkout({ repeat } = {}) {
  unlockAudio();
  const w = repeat ? W.repeatWorkout(repeat) : W.newWorkout();
  setDraft(w);
  keepAwake(true);
  if (location.hash === '#/workout') window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/workout';
  if (!repeat) setTimeout(() => openExercisePicker({ title: t('pick.title'), onPick: (list) => { list.forEach((ex) => W.addEntry(w, ex)); setDraft(w); window.dispatchEvent(new HashChangeEvent('hashchange')); } }), 250);
}

/** What the big card offers: the nearest workout you planned this week, else the next day of the plan, else the saved workout you used last, else a free workout. */
function nextUp() {
  const byId = data().byId;
  const count = (entries) => workoutSize(entries) ?? {};
  const plan = activePlan();
  const day = plan ? nextPlanDay(plan) : null;
  const today = todayKey();
  const todays = store.workouts.filter((w) => w.dateKey === today);
  const doneToday = (e) => (e.ref === 'free' ? todays.length > 0 : e.ref === 'plan' ? todays.some((w) => w.planDayId) : todays.some((w) => w.routineId === e.ref));
  const sched = nextScheduledWorkout(store.schedule, today, { doneToday, usable: (e) => (e.ref === 'plan' ? !!(plan && day) : e.ref === 'free' || store.routines.some((r) => r.id === e.ref && r.entries.length)) });
  if (sched) {
    const when = { when: sched.offset === 0 ? t('home.sched.today') : sched.offset === 1 ? t('home.sched.tomorrow') : t('home.sched.on', { day: new Intl.DateTimeFormat(getLanguage() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(+sched.dateKey.slice(0, 4), +sched.dateKey.slice(5, 7) - 1, +sched.dateKey.slice(8, 10))) }) };
    if (sched.entry.ref === 'free') return { kind: 'free', scheduled: true, ...when, title: t('home.free'), sub: t('home.free.sub'), start: openChooseWorkout };
    if (sched.entry.ref === 'plan') return { kind: 'plan', scheduled: true, ...when, title: planDayLabel(plan, day), sub: t('choose.plan.sub', { week: day.week, day: day.day }), ...count(day.entries), image: byId[day.entries[0]?.exerciseId]?.image, start: () => startFromPlanDay(plan, day) };
    const sr = store.routines.find((x) => x.id === sched.entry.ref);
    return { kind: 'routine', scheduled: true, ...when, title: sr.name || t('routines.untitled'), sub: t('home.saved'), ...count(sr.entries), image: byId[sr.entries[0]?.exerciseId]?.image, start: () => startFromRoutine(sr) };
  }
  if (plan && day) return { kind: 'plan', title: planDayLabel(plan, day), sub: t('choose.plan.sub', { week: day.week, day: day.day }), ...count(day.entries), image: byId[day.entries[0]?.exerciseId]?.image, start: () => startFromPlanDay(plan, day) };
  const lastW = [...store.workouts].reverse().find((w) => w.routineId && store.routines.some((r) => r.id === w.routineId));
  const r = (lastW && store.routines.find((x) => x.id === lastW.routineId)) ?? store.routines[store.routines.length - 1];
  if (r && r.entries.length) return { kind: 'routine', title: r.name || t('routines.untitled'), sub: t('home.saved'), ...count(r.entries), image: byId[r.entries[0]?.exerciseId]?.image, start: () => startFromRoutine(r) };
  return { kind: 'free', title: t('home.free'), sub: t('home.free.sub'), start: openChooseWorkout };
}

const dayLabel = (k, style) => new Intl.DateTimeFormat(getLanguage() === 'he' ? 'he-IL' : 'en-GB', { weekday: style, timeZone: 'UTC' }).format(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)));

/** Level ring, streak and drachmas, and the bell (OUR DESIGN, artboard E5). */
function topBar() {
  const g = store.game, lv = levelFromXp(g.xp), sv = view(g.streak, todayKey());
  const news = bellCount();
  return h('header', { class: 'today-top' },
    h('a', { class: 'today-level', href: '#/achievements', 'aria-label': t('today.level.aria', { n: lv.level, into: formatNum(lv.into, 0), need: formatNum(lv.need, 0) }) },
      h('span', { class: 'today-ring', style: `--p:${Math.round(lv.progress * 100)}%` }, h('b', { class: 'display num', text: String(lv.level) })),
      h('span', { class: 'today-level-label', text: t('today.level') })),
    h('div', { class: 'today-stats' },
      h('a', { class: 'today-stat', href: '#/calendar', 'aria-label': t('today.streak.aria', { days: t('game.streakDays', { n: sv.current }) }) }, icon('flame'), h('span', { class: 'display num', text: String(sv.current) })),
      h('a', { class: 'today-stat', href: '#/shop', 'aria-label': t('today.drachmas.aria', { n: formatNum(g.drachmas, 0) }) }, icon('coin'), h('span', { class: 'display num', text: formatNum(g.drachmas, 0) })),
      h('button', { class: 'icon-btn today-bell', type: 'button', 'aria-label': news ? t('today.bell.n', { n: news }) : t('today.bell'), onclick: () => openBellSheet() },
        icon('bell'), news ? h('i', { class: 'bell-dot', 'aria-hidden': 'true' }) : null)));
}

/** The crest in the middle: tier and division in Cinzel, and a thin bar to the next division. No sentence. */
function crestBlock() {
  const o = shownOverall();
  const tr = o.pending ? null : tierFor(o.rating);
  const gg = tr?.tier === 'greekgod';
  const name = !tr ? t('rank.unranked') : gg ? t(`tier.${tr.tier}`) : `${t(`tier.${tr.tier}`)} ${tr.division}`;
  const pct = !tr ? Math.round(((3 - (o.remaining ?? 3)) / 3) * 100) : gg ? 100 : tr.lp;
  return h('a', { class: 'today-hero', href: '#/ranks', 'aria-label': !tr ? `${name}. ${t('rank.pending', { n: o.remaining })}` : gg ? name : `${name}, ${t('rank.lp', { n: tr.lp })}` },
    h('div', { class: 'today-rays', 'aria-hidden': 'true' }),
    h('div', { class: 'today-crest' }, emblem({ tier: tr?.tier ?? 'unranked', divisionIndex: tr?.divisionIndex ?? 0, size: 220, label: name })),
    h('div', { class: `today-tier display${tr ? '' : ' plain'}`, 'aria-hidden': 'true', text: name }),
    h('div', { class: 'today-lp', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` })));
}

/** The seven days of this week: done = filled with a check, today = a gold ring named "today". Tap for the calendar. */
function weekRow() {
  const today = todayKey();
  const days = byDay(store.workouts);
  const keys = weekKeys(today, getLanguage() === 'he' ? 0 : 1);
  const done = keys.filter((k) => days.has(k) || dayDone(store.schedule, k));
  return h('a', { class: 'today-week', href: '#/calendar', 'aria-label': t('today.week.aria', { n: done.length }) },
    keys.map((k) => {
      const pl = planFor(store.schedule, k), on = done.includes(k), isToday = k === today;
      return h('span', { class: `day${on ? ' done' : ''}${isToday ? ' today' : ''}${pl.length && pl.every((e) => e.kind === 'rest') ? ' planned-rest' : ''}${pl.some((e) => e.kind !== 'rest') ? ' planned' : ''}`, 'aria-hidden': 'true' },
        h('i', {}, on ? icon('check') : null), h('span', { text: isToday ? t('today.today') : dayLabel(k, 'narrow') }));
    }));
}

/** "Next workout": the one you planned, else the plan's next day, else the saved workout you used last. Tap it to choose another. */
function nextRow(n) {
  if (n.kind === 'free') return null;
  const meta = [n.exercises ? t('home.exercises', { n: n.exercises }) : null, n.minutes ? t('today.minutes', { n: n.minutes }) : null].filter(Boolean);
  const when = n.scheduled ? n.when : n.kind === 'plan' ? `${t('home.next')} · ${n.sub}` : t('home.next');
  return h('button', { class: `today-next choose-other${n.kind === 'plan' ? ' plan-next' : ''}`, type: 'button', onclick: openChooseWorkout,
    'aria-label': t('today.next.aria', { when, title: n.title, meta: meta.join(', ') }) },
    h('span', { class: 'today-next-icon', 'aria-hidden': 'true' }, icon('workout')),
    h('span', { class: 'today-next-main' }, h('span', { class: 'today-next-when', text: when }), h('span', { class: 'today-next-title', text: n.title })),
    h('span', { class: 'today-next-meta' }, meta.map((m) => h('span', { class: 'num', text: m }))),
    icon('chevron', 'chev'));
}

export function startScreen() {
  const n = nextUp();
  const sv = view(store.game.streak, todayKey());
  const claimable = questBoard(data().quests, todayKey(), Date.now(), store.workouts, data().byId, store.game.quests.claimed).filter((q) => q.complete && !q.claimed).length;
  const questDot = claimable > 0 || !!sv.broken;
  const start = h('button', { class: `btn btn-primary today-start${n.kind === 'free' ? ' choose-other' : ''}`, type: 'button', onclick: n.start }, icon('bolt'), h('span', { text: t('home.start') }));
  return h('main', { class: 'screen today-screen' },
    h('h1', { class: 'sr-only', text: t('home.title') }),
    topBar(),
    crestBlock(),
    weekRow(),
    nextRow(n),
    h('div', { class: 'today-actions' }, start,
      h('button', { class: 'today-quests', type: 'button', 'aria-label': claimable ? t('today.quests.ready', { n: claimable }) : t('home.quests'), onclick: () => openQuestsSheet() },
        icon('trophy'), questDot ? h('i', { class: 'quest-dot', 'aria-hidden': 'true' }) : null)));
}
