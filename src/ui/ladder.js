// The rank path: every tier from Wood to Greek God with where you are and what is left (OUR DESIGN).
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { rankLadder, TIER_COLORS } from '../core/ranks.mjs';
import { emblem } from './emblem.js';
import { backLink } from './components.js';
import { store, shownOverall } from './store.js';
import { formatNum } from './format.js';

const tierName = (id) => t(`tier.${id}`);
const rangeText = (x) => (x.end ? `${formatNum(x.floor, 0)}–${formatNum(x.end - 1, 0)}` : `${formatNum(x.floor, 0)}+`);

/** What to say about where you are: "Diamond III · 640" and the points left. */
function summary(L) {
  const c = L.current;
  if (c.unranked) return [h('div', { class: 'ladder-now display', text: t('rank.unranked') }), h('p', { class: 'row-sub', text: store.overall.pending ? t('rank.pending', { n: store.overall.remaining }) : t('ladder.start') })];
  const here = c.tier === 'greekgod' ? tierName('greekgod') : `${tierName(c.tier)} ${c.division}`;
  const next = L.tiers.findIndex((x) => x.id === c.tier) + 1;
  const lines = [h('div', { class: 'ladder-now display', style: `color:${TIER_COLORS[c.tier]}`, text: here }), h('div', { class: 'row-sub num' }, t('ladder.rating', { n: formatNum(c.rating, 0) }))];
  if (L.toNextDivision != null && c.divisionIndex < 4) lines.push(h('p', { text: t('ladder.toDivision', { n: formatNum(L.toNextDivision, 0), name: `${tierName(c.tier)} ${['IV', 'III', 'II', 'I'][c.divisionIndex]}` }) }));
  if (L.toNextTier != null) lines.push(h('p', { text: t('ladder.toTier', { n: formatNum(L.toNextTier, 0), name: tierName(L.tiers[next].id) }) }));
  else lines.push(h('p', { text: t('ladder.top') }));
  return lines;
}

/** A compact path for the Progress tab: ten small emblems on a line, filled up to you. Tap it for the full path. */
export function ladderStrip() {
  const L = rankLadder(shownOverall().pending ? 0 : shownOverall().rating);
  const curIdx = L.tiers.findIndex((x) => x.status === 'current');
  const dots = L.tiers.map((x, i) => h('li', { class: `ladder-dot ${x.status}`, 'aria-label': `${tierName(x.id)}: ${rangeText(x)}${x.status === 'current' ? `, ${t('ladder.you')}` : ''}`, style: `--c:${TIER_COLORS[x.id]}` },
    emblem({ tier: x.id, divisionIndex: 2, size: x.status === 'current' ? 40 : 28, label: tierName(x.id) }),
    h('span', { class: 'ladder-floor num', dir: 'ltr', text: formatNum(x.floor, 0) })));
  return h('a', { class: 'card ladder-strip', href: '#/ladder', 'aria-label': t('ladder.title') },
    h('div', { class: 'bonus-head' }, h('span', { class: 'row-title', text: t('ladder.title') }), h('span', { class: 'row-sub', text: t('ladder.open') })),
    h('ol', { class: 'ladder-track', style: `--filled:${curIdx < 0 ? 0 : ((curIdx + (L.tiers[curIdx].pct / 100)) / 9) * 100}%` }, dots),
    ...summary(L).slice(0, 3));
}

export function ladderScreen() {
  const L = rankLadder(shownOverall().pending ? 0 : shownOverall().rating);
  const rows = [...L.tiers].reverse().map((x) => h('li', { class: `ladder-row ${x.status}`, style: `--c:${TIER_COLORS[x.id]}`, 'aria-current': x.status === 'current' ? 'step' : null },
    emblem({ tier: x.id, divisionIndex: x.status === 'current' ? L.current.divisionIndex : 2, size: 56, label: tierName(x.id) }),
    h('div', { class: 'ladder-info' },
      h('div', { class: 'row-title' }, tierName(x.id), x.status === 'current' ? h('span', { class: 'chip chip-leader', text: t('ladder.you') }) : null),
      h('div', { class: 'row-sub num', dir: 'ltr', text: rangeText(x) }),
      x.divisions.length ? h('div', { class: 'ladder-divs' }, x.divisions.map((d) => h('span', { class: `ladder-div ${d.status}`, title: `${d.label} · ${formatNum(d.from, 0)}` }, d.label))) : h('div', { class: 'row-sub', text: t('ladder.gg') }),
      x.status === 'current' && x.end ? h('div', { class: 'lp', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': x.pct, 'aria-label': tierName(x.id) }, h('span', { class: 'lp-fill', style: `width:${x.pct}%` })) : null),
    x.status === 'done' ? h('span', { class: 'ladder-check', 'aria-hidden': 'true' }, icon('check')) : null));
  return h('main', { class: 'screen' },
    backLink('#/ranks', t('tab.ranks')),
    h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('ladder.title') })),
    h('section', { class: 'card ladder-summary' }, ...summary(L)),
    h('p', { class: 'row-sub', text: t('ladder.how') }),
    h('ol', { class: 'ladder-list' }, rows),
    h('a', { class: 'btn btn-secondary btn-block', href: '#/weakest' }, t('ladder.weakest')));
}
