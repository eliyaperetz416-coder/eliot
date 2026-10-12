// "Where am I weakest and what do I need?" (OUR DESIGN, v1.36): the weakest muscle groups with the next step for each,
// and the bonus points you are not full on. Opens from the rank path.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { backLink } from './components.js';
import { data } from './data.js';
import { store, bodyweightKg } from './store.js';
import { emblem } from './emblem.js';
import { openNeedSheet } from './need.js';
import { ratingsOf } from '../core/post.mjs';
import { isDuration, TIER_COLORS } from '../core/ranks.mjs';
import { weakestGroups, bonusTips } from '../core/weakest.mjs';
import { formatKg, formatNum } from './format.js';

const nameOf = (ex) => (ex ? (getLanguage() === 'he' ? ex.nameHe : ex.nameEn) : '');
const tierName = (x) => `${t(`tier.${x.tier}`)}${x.division ? ` ${x.division}` : ''}`;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function targetText(row) {
  const x = row.target;
  if (!x) return t('weak.start', { ex: nameOf(row.ex) });
  const what = isDuration(row.ex) ? `${mmss(x.seconds)} ${t('need.minutes')}` : x.bodyweightEnough ? t('need.bwEnough') : `${formatKg(x.load)} ${t('unit.kg')} × ${row.reps}`;
  return t('weak.next', { tier: tierName(x), what, ex: nameOf(row.ex) });
}

export function weakestScreen() {
  const d = data();
  const ratings = ratingsOf(store.bests);
  const rows = weakestGroups({ ratings, bests: store.bests, byId: d.byId, exercises: d.exercises, bodyweightKg: bodyweightKg(), sex: store.profile?.sex ?? 'm' });
  const tips = bonusTips({ workouts: store.workouts, byId: d.byId, ratings });
  const groupName = (g) => t(`group.${g}`);

  const card = (row, i) => {
    const hasRating = row.rating > 0;
    return h('button', { class: `card weak-card${i === 0 ? ' weakest' : ''}`, type: 'button', disabled: !row.ex, onclick: () => row.ex && openNeedSheet(row.ex) },
      emblem({ tier: row.tier ? row.tier.tier : 'unranked', divisionIndex: row.tier?.divisionIndex ?? 0, size: 48, label: groupName(row.group) }),
      h('span', { class: 'weak-main' },
        h('span', { class: 'row-title' }, groupName(row.group), i === 0 ? h('span', { class: 'chip chip-warn', text: t('weak.weakest') }) : null),
        h('span', { class: 'row-sub', style: hasRating ? `color:${TIER_COLORS[row.tier.tier]}` : '', text: hasRating ? `${tierName(row.tier)} · ${formatNum(row.rating, 0)}` : t('weak.untrained') }),
        h('span', { class: 'weak-next', text: targetText(row) })),
      icon('chevron', 'chev'));
  };

  const tipText = (x) => {
    if (x.id === 'cover') return t('weak.tip.cover', { names: x.groups.slice(0, 4).map(groupName).join(', ') });
    return t(`weak.tip.${x.id}`, x.args);
  };
  return h('main', { class: 'screen' },
    backLink('#/ladder', t('ladder.title')),
    h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('weak.title') })),
    h('p', { class: 'row-sub', text: t('weak.intro') }),
    h('div', { class: 'section-label', text: t('weak.groups') }),
    h('div', { class: 'stack weak-list' }, rows.map(card)),
    h('div', { class: 'section-label', text: t('weak.tips') }),
    tips.length
      ? h('div', { class: 'list' }, tips.map((x) => h('div', { class: 'row weak-tip' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: tipText(x) }), h('span', { class: 'row-sub num', dir: 'ltr', text: `+${x.points} / ${x.max}` })))))
      : h('p', { class: 'row-sub', text: t('weak.tips.full') }));
}
