// Ranks tab: overall rank, muscle map (rank / recovery), muscle ratings, per-exercise table, links.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { TIER_COLORS, RANK_GROUPS, muscleRatings, tierFor } from '../core/ranks.mjs';
import { ratingsOf } from '../core/post.mjs';
import { MAP_COLORS, GROUP_OF_MUSCLE } from '../core/muscles.mjs';
import { freshnessByMuscle, freshColor } from '../core/recovery.mjs';
import { exerciseRankTable, muscleBestExercises } from '../core/views.mjs';
import { list, listRow, segmented } from './components.js';
import { data } from './data.js';
import { store } from './store.js';
import { rankCard } from './rank-card.js';
import { consistencyBonus, BONUS } from '../core/consistency.mjs';
import { muscleMap } from './muscle-map.js';
import { emblem } from './emblem.js';
import { openNeedSheet } from './need.js';
import { formatDate, formatDateTime, formatKg, formatNum } from './format.js';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const tierText = (tr) => (tr.division ? `${t(`tier.${tr.tier}`)} ${tr.division}` : t(`tier.${tr.tier}`));
const view = { mode: 'rank', sort: 'rating' };

function setText(ex, b) {
  const w = Number(b.weight) > 0 ? `${formatKg(b.weight)}` : '';
  const sets = ex.type === 'bodyweight' ? `${w ? '+' + w : ''}${w ? '×' : ''}${b.reps}` : `${w}×${b.reps}`;
  return `${sets} · ${t('ranks.oneRM')} ${formatKg(b.oneRM)}`;
}

/** How the consistency bonus is made up (OUR DESIGN). */
function bonusCard() {
  const b = consistencyBonus(store.workouts, Date.now());
  return h('section', { class: 'card bonus-card' },
    h('div', { class: 'bonus-head' }, h('span', { class: 'row-title', text: t('bonus.title') }), h('b', { class: 'num bonus-total', dir: 'ltr', text: `+${b.total} / ${BONUS.MAX}` })),
    h('div', { class: 'row-sub', text: t('bonus.days', { n: b.days, pts: b.dayPoints, cap: BONUS.DAY_POINTS_CAP }) }),
    h('div', { class: 'row-sub', text: t('bonus.streak', { n: b.streakWeeks, pts: b.streakPoints, cap: BONUS.STREAK_POINTS_CAP }) }),
    h('p', { class: 'row-sub bonus-note', text: t('bonus.note') }));
}

export function ranksScreen() {
  const d = data();
  const root = h('main', { class: 'screen' });

  function draw() {
    const ratings = ratingsOf(store.bests);
    const groups = muscleRatings(ratings, d.byId);
    const panel = h('div', { class: 'mmap-panel' });
    const muscleName = (id) => t(`muscle.${id.replace(/^(left|right)-soleus$/, 'calves')}`);

    let paint, onSelect;
    if (view.mode === 'rank') {
      paint = (id) => {
        const g = GROUP_OF_MUSCLE[id];
        const r = g ? groups[g] : 0;
        if (!r) return { fill: MAP_COLORS.dim, label: `${muscleName(id)} · ${g ? t('rank.unranked') : t('ranks.notRanked')}` };
        const tr = tierFor(r);
        return { fill: TIER_COLORS[tr.tier], glow: true, label: `${muscleName(id)} · ${tierText(tr)} · ${formatNum(r, 0)}` };
      };
      onSelect = (id) => {
        const g = GROUP_OF_MUSCLE[id];
        if (!g) { panel.replaceChildren(h('p', { class: 'row-sub', text: t('ranks.notRankedHint') })); return; }
        const best = muscleBestExercises(g, store.bests, d.byId, 3);
        panel.replaceChildren(h('div', { class: 'section-label', text: `${t(`group.${g}`)} · ${t('ranks.bestExercises')}` }),
          best.length ? h('div', { class: 'list' }, best.map((b) => h('button', { class: 'row', type: 'button', onclick: () => openNeedSheet(b.ex) },
            h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: nameOf(b.ex) }), h('span', { class: 'row-sub num' }, h('bdi', { text: setText(b.ex, b) }))),
            h('span', { class: 'row-end num', text: formatNum(b.rating, 0) }))))
            : h('p', { class: 'row-sub', text: t('ranks.noneInGroup') }));
      };
    } else {
      const ids = [...d.muscles.anterior, ...d.muscles.posterior].map((m) => m.id);
      const fresh = freshnessByMuscle(store.workouts, d.byId, Date.now(), ids);
      paint = (id) => {
        const f = fresh[id]; const pct = Math.round((f?.freshness ?? 1) * 100);
        return { fill: freshColor(f?.freshness ?? 1), label: f?.trainedAt == null ? `${muscleName(id)} · ${t('recovery.fresh')}` : `${muscleName(id)} · ${t('recovery.pct', { n: pct })}${f.hoursLeft >= 1 ? ` · ${t('recovery.hoursLeft', { n: Math.round(f.hoursLeft) })}` : ''}` };
      };
      onSelect = (id) => {
        const f = fresh[id];
        panel.replaceChildren(h('p', { class: 'row-sub center', text: f?.trainedAt == null ? t('recovery.never') : t('recovery.last', { date: formatDateTime(f.trainedAt) }) }));
      };
    }

    const legend = view.mode === 'recovery'
      ? h('div', { class: 'recov-legend' }, h('span', { class: 'recov-bar' }), h('div', { class: 'recov-ends' }, h('span', { text: t('recovery.tired') }), h('span', { text: t('recovery.fresh') })), h('p', { class: 'row-sub center', text: t('recovery.disclaimer') }))
      : null;

    const table = exerciseRankTable(store.bests, d.byId, view.sort, nameOf);
    const kids = [
      h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('ranks.title') })),
      rankCard(store.overall),
      bonusCard(),
      h('div', { class: 'section-label', text: t('ranks.map') }),
      segmented({ label: t('ranks.map'), value: view.mode, onChange: (m) => { view.mode = m; draw(); }, options: [{ value: 'rank', label: t('ranks.mode.rank') }, { value: 'recovery', label: t('ranks.mode.recovery') }] }),
      h('div', { style: 'padding-block-start:12px' }, muscleMap({ muscles: d.muscles, mode: view.mode, paint, onSelect })),
      legend, panel,
      h('div', { class: 'section-label', text: t('ranks.muscles') }),
      h('div', { class: 'list' }, RANK_GROUPS.map((g) => {
        const r = groups[g]; const tr = r ? tierFor(r) : null;
        return h('div', { class: 'row group-row' },
          emblem({ tier: tr ? tr.tier : 'unranked', divisionIndex: tr?.divisionIndex ?? 0, size: 40, label: t(`group.${g}`) }),
          h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: t(`group.${g}`) }), h('span', { class: 'row-sub', text: tr ? tierText(tr) : t('rank.unranked') })),
          h('span', { class: 'row-end num', text: r ? formatNum(r, 0) : '–' }));
      })),
      h('div', { class: 'section-label', text: t('ranks.exercises') }),
    ];
    if (table.length) {
      kids.push(segmented({ label: t('ranks.sort'), value: view.sort, onChange: (s) => { view.sort = s; draw(); },
        options: [{ value: 'rating', label: t('ranks.sort.rating') }, { value: 'name', label: t('ranks.sort.name') }, { value: 'oneRM', label: t('ranks.sort.oneRM') }, { value: 'recent', label: t('ranks.sort.recent') }] }),
      h('div', { class: 'list', style: 'margin-block-start:12px' }, table.map((r) => {
        const tr = tierFor(r.rating);
        return h('button', { class: 'row ex-rank-row', type: 'button', onclick: () => openNeedSheet(r.ex) },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: nameOf(r.ex) }), h('span', { class: 'row-sub num' }, h('bdi', { text: setText(r.ex, r) })), h('span', { class: 'row-sub', text: formatDate(Date.parse(r.dateKey)) })),
          h('span', { class: 'rank-chip' }, h('span', { class: 'num', text: formatNum(r.rating, 0) }), h('span', { class: 'row-sub', text: tierText(tr) })));
      })));
    } else kids.push(h('p', { class: 'row-sub', text: t('ranks.exercises.empty') }));
    kids.push(h('div', { class: 'section-label', text: t('ranks.more') }),
      list([
        listRow({ title: t('progress.title'), sub: t('progress.sub'), icon: 'history', onClick: () => { location.hash = '#/progress'; } }),
        listRow({ title: t('card.title'), sub: t('card.sub'), icon: 'shield', onClick: () => { location.hash = '#/card'; } }),
      ]));
    root.replaceChildren(...kids.flat().filter(Boolean));
  }
  draw();
  return root;
}
