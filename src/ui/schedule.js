// "Plan my week": for each weekday choose a strength workout, rest or another activity. OUR DESIGN.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { backLink, button, list as list_, listRow, openSheet } from './components.js';
import { store, saveSchedule } from './store.js';
import { ACTIVITIES, MAX_PER_DAY, addEntry, removeEntry, clearDay } from '../core/schedule.mjs';
import { activePlan } from './routines.js';
import { syncPlan } from './crew-state.js';

const weekdayName = (d) => new Intl.DateTimeFormat(getLanguage() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 11 + d)); // 2026-10-11 is a Sunday

/** Short text for one planned item. */
export function entryText(e) {
  if (e.kind === 'rest') return t('sched.rest');
  if (e.kind === 'activity') return e.label || t(`sched.act.${e.type}`);
  if (e.ref === 'plan') return t('sched.plan');
  if (e.ref === 'free') return t('sched.free');
  const r = store.routines.find((x) => x.id === e.ref);
  return r ? (r.name || t('routines.untitled')) : t('sched.free');
}
/** Text for a whole day: items joined with " + ". */
export const planText = (list) => (list?.length ? list.map(entryText).join(' + ') : t('sched.none'));
const newId = () => Math.random().toString(36).slice(2, 8);

export function scheduleScreen() {
  const root = h('main', { class: 'screen' });
  const order = getLanguage() === 'he' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const save = async (next) => { await saveSchedule(next); syncPlan(); draw(); };

  function pick(d) {
    const body = h('div', { class: 'stack' });
    const sh = openSheet({ title: weekdayName(d), content: body, tall: true });
    const row = (title, sub, ic, fn) => listRow({ title, sub, icon: ic, onClick: fn });
    const add = async (entry) => { await save(addEntry(store.schedule, d, entry, newId())); drawBody(); };
    const drawBody = () => {
      const list = store.schedule.days[d] ?? [];
      const full = list.length >= MAX_PER_DAY;
      const label = h('input', { class: 'text-input', type: 'text', maxlength: 30, placeholder: t('sched.label.ph'), 'aria-label': t('sched.label') });
      const workouts = [
        activePlan() ? row(t('sched.plan'), t('sched.plan.sub'), 'bolt', () => add({ kind: 'workout', ref: 'plan' })) : null,
        ...store.routines.map((r) => row(r.name || t('routines.untitled'), t('routines.count', { n: r.entries.length }), 'workout', () => add({ kind: 'workout', ref: r.id }))),
        row(t('sched.free'), t('sched.free.sub'), 'workout', () => add({ kind: 'workout', ref: 'free' })),
      ].filter(Boolean);
      body.replaceChildren(
        list.length ? h('div', { class: 'section-label', text: t('sched.planned') }) : null,
        list.length ? h('div', { class: 'list sched-items' }, list.map((e) => h('div', { class: 'row sched-item' },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: entryText(e) }), h('span', { class: 'row-sub', text: t(`sched.kind.${e.kind}`) })),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${t('common.delete')}: ${entryText(e)}`, onclick: async () => { await save(removeEntry(store.schedule, d, e.id)); drawBody(); } }, icon('close'))))) : null,
        full ? h('p', { class: 'row-sub', text: t('sched.full', { n: MAX_PER_DAY }) }) : h('div', { class: 'stack' },
          h('div', { class: 'section-label', text: t('sched.add') }),
          h('div', { class: 'section-label', text: t('sched.kind.workout') }), list_(workouts),
          h('div', { class: 'section-label', text: t('sched.kind.activity') }),
          h('div', { class: 'chips-wrap' }, ACTIVITIES.map((a) => h('button', { class: 'chip chip-select', type: 'button', onclick: () => add({ kind: 'activity', type: a, label: label.value }) }, t(`sched.act.${a}`)))),
          h('div', { class: 'field', style: 'padding-block-start:8px' }, h('label', { text: t('sched.label') }), h('div', { class: 'field-box' }, label), h('p', { class: 'row-sub', text: t('sched.label.hint') })),
          h('div', { class: 'section-label', text: t('sched.kind.rest') }), list_([row(t('sched.rest'), t('sched.rest.sub'), 'history', () => add({ kind: 'rest' }))])),
        list.length ? button({ label: t('sched.clear'), variant: 'ghost', block: true, onClick: async () => { await save(clearDay(store.schedule, d)); sh.close(); } }) : null,
        button({ label: t('common.done'), block: true, onClick: () => sh.close() }));
    };
    drawBody();
  }

  function draw() {
    const today = new Date().getDay();
    root.replaceChildren(
      backLink('#/workout', t('tab.workout')),
      h('header', { class: 'screen-head' }, icon('history', 'mark'), h('h1', { text: t('sched.title') })),
      h('p', { class: 'row-sub', text: t('sched.intro') }),
      h('div', { class: 'list sched-list', style: 'margin-block-start:12px' }, order.map((d) => {
        const list = store.schedule.days[d] ?? [];
        return h('button', { class: `row sched-row${d === today ? ' today' : ''}`, type: 'button', onclick: () => pick(d) },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: weekdayName(d) }), h('span', { class: `row-sub sched-${list.length ? (list.some((e) => e.kind === 'activity') ? 'activity' : list[0].kind) : 'none'}`, text: planText(list) })),
          icon('chevron', 'chev'));
      })));
  }
  draw();
  return root;
}
