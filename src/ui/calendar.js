// Training calendar: one month at a time, trained days filled, PR days marked, tap a day to see its workouts.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { list, listRow, openSheet } from './components.js';
import { store, todayKey } from './store.js';
import { monthGrid, addMonths, byDay, monthStats, firstMonth } from '../core/calendar.mjs';
import { view } from '../core/streak.mjs';
import { formatNum, formatDate } from './format.js';

const loc = () => (getLanguage() === 'he' ? 'he-IL' : 'en-GB');
const FIRST_DAY = () => (getLanguage() === 'he' ? 0 : 1); // Sunday first in Hebrew, Monday first in English

export function calendarScreen() {
  const today = todayKey();
  const now = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
  const earliest = firstMonth(store.workouts, now);
  let cur = { ...now };
  const days = byDay(store.workouts);
  const root = h('main', { class: 'screen' });

  const atStart = () => cur.year * 12 + cur.month <= earliest.year * 12 + earliest.month;
  const atEnd = () => cur.year * 12 + cur.month >= now.year * 12 + now.month;
  const go = (n) => { cur = addMonths(cur.year, cur.month, n); draw(); };

  function dayCell(c) {
    if (!c.inMonth) return h('span', { class: 'cal-cell out', 'aria-hidden': 'true' });
    const ws = days.get(c.key) ?? [];
    const prs = ws.reduce((n, w) => n + (w.stats?.prs ?? 0), 0);
    const cls = `cal-cell${ws.length ? ' on' : ''}${c.key === today ? ' today' : ''}`;
    const label = new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(+c.key.slice(0, 4), +c.key.slice(5, 7) - 1, c.day));
    if (!ws.length) return h('span', { class: cls, role: 'gridcell', 'aria-label': label }, h('span', { class: 'cal-num num', text: String(c.day) }));
    return h('button', { class: cls, type: 'button', role: 'gridcell', 'aria-label': `${label}: ${t('cal.workouts', { n: ws.length })}`, 'data-day': c.key, onclick: () => openDay(c.key, ws) },
      h('span', { class: 'cal-num num', text: String(c.day) }), prs ? h('span', { class: 'cal-pr', 'aria-hidden': 'true' }) : null);
  }

  function openDay(key, ws) {
    const [y, m, d] = key.split('-').map(Number);
    const title = new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
    const sh = openSheet({ title, content: list(ws.map((w) => listRow({
      title: w.name || formatDate(w.startedMs), icon: 'workout',
      sub: `${t('common.sets', { n: w.stats?.workingSets ?? 0 })} · ${formatNum(w.stats?.volume ?? 0, 0)} ${t('unit.kg')}`,
      onClick: () => { sh.close(); location.hash = `#/history/${w.id}`; },
    }))) });
  }

  function draw() {
    const st = monthStats(store.workouts, cur.year, cur.month);
    const sk = view(store.game.streak, today);
    const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(loc(), { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 7 + ((i + FIRST_DAY()) % 7))));
    const title = new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(cur.year, cur.month, 1));
    root.replaceChildren(
      h('a', { class: 'back-link', href: '#/profile' }, icon('chevron', 'chev back-chev'), t('tab.profile')),
      h('header', { class: 'screen-head' }, h('h1', { text: t('cal.title') })),
      h('div', { class: 'cal-nav' },
        h('button', { class: 'icon-btn cal-prev', type: 'button', 'aria-label': t('cal.prev'), disabled: atStart(), onclick: () => go(-1) }, icon('chevron')),
        h('div', { class: 'cal-month', 'aria-live': 'polite', text: title }),
        h('button', { class: 'icon-btn cal-next', type: 'button', 'aria-label': t('cal.next'), disabled: atEnd(), onclick: () => go(1) }, icon('chevron'))),
      h('section', { class: 'card cal-card' },
        h('div', { class: 'cal-head', role: 'row' }, weekdays.map((d) => h('span', { role: 'columnheader', text: d }))),
        h('div', { class: 'cal-grid', role: 'grid', 'aria-label': title }, monthGrid(cur.year, cur.month, FIRST_DAY()).flat().map(dayCell))),
      h('div', { class: 'cal-legend' },
        h('span', { class: 'cal-key on' }), h('span', { text: t('cal.legend.trained') }),
        h('span', { class: 'cal-key pr' }), h('span', { text: t('cal.legend.pr') })),
      h('div', { class: 'stats-grid', style: 'padding-block-start:16px' },
        stat(t('cal.days'), String(st.days)), stat(t('cal.workouts', { n: st.workouts }), String(st.workouts)),
        stat(t('fin.volume'), `${formatNum(st.volume, 0)} ${t('unit.kg')}`), stat(t('fin.prs'), String(st.prs))),
      h('div', { class: 'cal-streak' }, list([
        listRow({ title: t('cal.streak.title'), sub: t('cal.streak.best', { n: sk.best }), icon: 'flame', end: h('span', { class: 'num', text: t('cal.streak.now', { n: sk.current }) }) }),
      ])));
  }
  draw();
  return root;
}

const stat = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'stat-v display num', text: value }), h('span', { class: 'stat-l', text: label }));
