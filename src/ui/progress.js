// Progress: estimated 1RM over time for one exercise, weekly volume, bodyweight.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { e1rmSeries, exercisesWithData, weeklyVolume, bodyweightSeries } from '../core/charts.mjs';
import { button, emptyState } from './components.js';
import { data } from './data.js';
import { store } from './store.js';
import { lineChart, barChart, chartCard } from './charts.js';
import { openExercisePicker } from './picker.js';
import { formatNum } from './format.js';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const back = () => h('a', { class: 'back-link', href: '#/ranks' }, icon('chevron', 'chev back-chev'), t('tab.ranks'));

export function progressScreen(exId) {
  const d = data();
  const ids = exercisesWithData(store.workouts, d.byId);
  const root = h('main', { class: 'screen' });
  const bw = bodyweightSeries(store.bwLog);
  if (!ids.length && bw.length < 2) {
    return h('main', { class: 'screen' }, back(), h('h1', { class: 'ex-title', text: t('progress.title') }), emptyState({ icon: 'history', title: t('progress.empty.title'), body: t('progress.empty.body') }));
  }
  const ex = d.byId[exId] && ids.includes(exId) ? d.byId[exId] : d.byId[ids[0]];
  const kids = [back(), h('h1', { class: 'ex-title', text: t('progress.title') })];
  if (ex) {
    const series = e1rmSeries(store.workouts, ex.id, d.byId);
    const unit = ex.type === 'time' || ex.type === 'cardio' ? (ex.type === 'time' ? t('col.sec.short') : t('col.sec.short')) : (ex.ranked || ex.type === 'weight' ? t('unit.kg') : '');
    kids.push(
      h('div', { class: 'ent-card card' }, h('div', { class: 'row-sub', text: t('progress.exercise') }), h('div', { class: 'row-title', text: nameOf(ex) }),
        button({ label: t('progress.change'), variant: 'secondary', block: true, onClick: () => openExercisePicker({ title: t('progress.change'), multi: false, ids, onPick: ([e]) => { location.hash = `#/progress/${e.id}`; } }) })),
      chartCard({ title: ex.ranked ? t('progress.e1rm') : t('progress.best'), subtitle: ex.ranked ? t('progress.e1rm.sub') : null,
        chart: lineChart({ series, unit, title: `${t('progress.e1rm')}: ${nameOf(ex)}` }), empty: series.length ? null : t('progress.nodata') }));
  }
  const vol = weeklyVolume(store.workouts, Date.now(), 12);
  kids.push(chartCard({ title: t('progress.volume'), subtitle: t('progress.volume.sub', { n: formatNum(vol.reduce((n, b) => n + b.v, 0), 0) }), chart: barChart({ series: vol, title: t('progress.volume') }) }));
  kids.push(chartCard({ title: t('profile.bw'), chart: lineChart({ series: bw, unit: t('unit.kg'), title: t('profile.bw') }), empty: bw.length ? null : t('progress.nodata') }));
  root.append(...kids);
  return root;
}
