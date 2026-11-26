// The two sheets behind the Today screen (OUR DESIGN, redesign Today / artboard E5): the bell (what is waiting for you:
// crew messages, a make-up workout, today's planned rest/activities/benchmarks) and the trophy (quests and streak).
import { h } from './dom.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, openSheet } from './components.js';
import { data } from './data.js';
import { store, todayKey, activeMakeup, clearMakeup, saveSchedule } from './store.js';
import { crew, syncPlan } from './crew-state.js';
import { startMakeup } from './routines.js';
import { planFor, markDone, isDone } from '../core/schedule.mjs';
import { planText } from './schedule.js';
import { questsCard, streakCard } from './game-ui.js';

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

/** Today's rest or other activities, each with a done button (strength workouts are the "next workout" row). */
function scheduleCard(close) {
  const key = todayKey();
  const items = planFor(store.schedule, key).filter((e) => e.kind !== 'workout');
  if (!items.length) return null;
  return h('section', { class: 'card sched-card' },
    h('div', { class: 'row-sub', text: t('home.sched.today') }),
    ...items.map((e) => {
      const done = isDone(store.schedule, key, e.id);
      return h('div', { class: 'sched-item-home' },
        h('div', { class: 'row-title', text: planText([e]) }),
        e.kind === 'wod' ? wodTodayButton(e, key, close) : null,
        e.kind === 'activity' ? button({ label: done ? t('home.sched.undo') : t('home.sched.done'), variant: done ? 'secondary' : 'primary', block: true, onClick: async () => { await saveSchedule(markDone(store.schedule, key, e.id, !done)); syncPlan(); close(); rerender(); } }) : null);
    }));
}

/** A planned benchmark workout: start it, or see it was done today (a saved result counts). */
function wodTodayButton(e, key, close) {
  const done = store.workouts.some((w) => w.wod?.id === e.ref && w.dateKey === key);
  return button({ label: done ? t('home.sched.wodDone') : t('wod.start'), icon: 'bolt', variant: done ? 'secondary' : 'primary', block: true, onClick: () => { close(); location.hash = `#/wod/${e.ref}`; } });
}

/** "Make up what you missed": exercises you did not get to last time, as a one-time workout. */
function makeupCard(close) {
  const m = activeMakeup();
  if (!m) return null;
  const byId = data().byId;
  const names = m.entries.map((e) => byId[e.exerciseId]).filter(Boolean).map((ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn));
  return h('section', { class: 'card makeup-card' },
    h('div', { class: 'row-title', text: t('makeup.title') }),
    h('div', { class: 'row-sub', text: t(m.entries.length === 1 ? 'makeup.sub.one' : 'makeup.sub', { n: m.entries.length, name: m.name || t('makeup.last') }) }),
    h('div', { class: 'row-sub makeup-names', text: names.slice(0, 3).join(' · ') + (names.length > 3 ? ' …' : '') }),
    h('div', { class: 'btn-pair' },
      button({ label: t('makeup.start'), icon: 'workout', onClick: () => { close(); startMakeup(m); } }),
      button({ label: t('makeup.dismiss'), variant: 'secondary', onClick: async () => { await clearMakeup(); close(); rerender(); } })));
}

function crewCard(close) {
  if (!(crew.local && crew.unread)) return null;
  return h('a', { class: 'card card-accent crew-unread', href: '#/crew', onclick: () => close() },
    h('b', { text: t('crew.unread.card', { n: crew.unread }) }), h('span', { class: 'row-sub', text: t('crew.unread.open') }));
}

/** How many things wait behind the bell (the dot on it). */
export function bellCount() {
  const key = todayKey();
  return (crew.local && crew.unread ? 1 : 0) + (activeMakeup() ? 1 : 0)
    + planFor(store.schedule, key).filter((e) => e.kind !== 'workout' && e.kind !== 'rest' && !isDone(store.schedule, key, e.id)).length;
}

export function openBellSheet() {
  let sh = null;
  const close = () => sh?.close();
  const items = [crewCard(close), makeupCard(close), scheduleCard(close)].filter(Boolean);
  sh = openSheet({ title: t('today.bell'), content: h('div', { class: 'stack bell-list' },
    items.length ? items : h('p', { class: 'row-sub center', text: t('today.bell.empty') })) });
  return sh;
}

export function openQuestsSheet() {
  const box = h('div', { class: 'stack' });
  const changed = () => { draw(); rerender(); }; // a claim also updates the trophy dot behind the sheet
  const draw = () => { box.replaceChildren(streakCard(changed), questsCard(changed)); };
  draw();
  return openSheet({ title: t('home.quests'), content: box, tall: true });
}
