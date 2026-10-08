// "Plan my week": for each weekday choose a strength workout, rest or another activity. OUR DESIGN.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { backLink, button, list, listRow, openSheet } from './components.js';
import { store, saveSchedule } from './store.js';
import { ACTIVITIES, setDay } from '../core/schedule.mjs';
import { activePlan } from './routines.js';
import { syncPlan } from './crew-state.js';

const weekdayName = (d) => new Intl.DateTimeFormat(getLanguage() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 11 + d)); // 2026-10-11 is a Sunday

/** Short text for a planned entry. */
export function planText(e) {
  if (!e) return t('sched.none');
  if (e.kind === 'rest') return t('sched.rest');
  if (e.kind === 'activity') return e.label || t(`sched.act.${e.type}`);
  if (e.ref === 'plan') return t('sched.plan');
  if (e.ref === 'free') return t('sched.free');
  const r = store.routines.find((x) => x.id === e.ref);
  return r ? (r.name || t('routines.untitled')) : t('sched.free');
}

export function scheduleScreen() {
  const root = h('main', { class: 'screen' });
  const order = getLanguage() === 'he' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const choose = async (d, entry) => { await saveSchedule(setDay(store.schedule, d, entry)); syncPlan(); draw(); };

  function pick(d) {
    const body = h('div', { class: 'stack' });
    const sh = openSheet({ title: weekdayName(d), content: body, tall: true });
    const done = (entry) => { sh.close(); choose(d, entry); };
    const row = (title, sub, ic, fn) => listRow({ title, sub, icon: ic, onClick: fn });
    const workouts = [
      activePlan() ? row(t('sched.plan'), t('sched.plan.sub'), 'bolt', () => done({ kind: 'workout', ref: 'plan' })) : null,
      ...store.routines.map((r) => row(r.name || t('routines.untitled'), t('routines.count', { n: r.entries.length }), 'workout', () => done({ kind: 'workout', ref: r.id }))),
      row(t('sched.free'), t('sched.free.sub'), 'workout', () => done({ kind: 'workout', ref: 'free' })),
    ].filter(Boolean);
    const label = h('input', { class: 'text-input', type: 'text', maxlength: 30, placeholder: t('sched.label.ph'), 'aria-label': t('sched.label') });
    body.append(
      h('div', { class: 'section-label', text: t('sched.kind.workout') }), list(workouts),
      h('div', { class: 'section-label', text: t('sched.kind.rest') }), list([row(t('sched.rest'), t('sched.rest.sub'), 'history', () => done({ kind: 'rest' }))]),
      h('div', { class: 'section-label', text: t('sched.kind.activity') }),
      h('div', { class: 'chips-wrap' }, ACTIVITIES.map((a) => h('button', { class: 'chip chip-select', type: 'button', onclick: () => done({ kind: 'activity', type: a, label: label.value }) }, t(`sched.act.${a}`)))),
      h('div', { class: 'field', style: 'padding-block-start:8px' }, h('label', { text: t('sched.label') }), h('div', { class: 'field-box' }, label), h('p', { class: 'row-sub', text: t('sched.label.hint') })),
      store.schedule.days[d] ? button({ label: t('sched.clear'), variant: 'ghost', block: true, onClick: () => done(null) }) : null);
  }

  function draw() {
    const today = new Date().getDay();
    root.replaceChildren(
      backLink('#/workout', t('tab.workout')),
      h('header', { class: 'screen-head' }, icon('history', 'mark'), h('h1', { text: t('sched.title') })),
      h('p', { class: 'row-sub', text: t('sched.intro') }),
      h('div', { class: 'list sched-list', style: 'margin-block-start:12px' }, order.map((d) => {
        const e = store.schedule.days[d];
        return h('button', { class: `row sched-row${d === today ? ' today' : ''}`, type: 'button', onclick: () => pick(d) },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: weekdayName(d) }), h('span', { class: `row-sub sched-${e?.kind ?? 'none'}`, text: planText(e) })),
          icon('chevron', 'chev'));
      })));
  }
  draw();
  return root;
}
