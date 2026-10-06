import { h } from './dom.js';
import { t } from '../core/i18n.mjs';
import { tierFor } from '../core/ranks.mjs';
import { emblem } from './emblem.js';
import { formatNum } from './format.js';

/** Overall rank card: emblem, tier/division, rating and LP bar. Greek God shows the score only. Pending shows how many exercises are missing. */
export function rankCard(overall, { title = true } = {}) {
  if (overall.pending) {
    return h('section', { class: 'card rank-card' },
      emblem({ tier: 'unranked', size: 84, label: t('rank.pending', { n: overall.remaining }) }),
      h('div', { class: 'rank-info' },
        title ? h('div', { class: 'rank-title', text: t('rank.title') }) : null,
        h('div', { class: 'rank-name display', text: t('rank.unranked') }),
        h('p', { class: 'rank-sub', text: t('rank.pending', { n: overall.remaining }) })));
  }
  const tr = tierFor(overall.rating);
  const gg = tr.tier === 'greekgod';
  return h('section', { class: `card rank-card${gg ? ' rank-gg' : ''}` },
    emblem({ tier: tr.tier, divisionIndex: tr.divisionIndex ?? 0, size: 84, label: `${t(`tier.${tr.tier}`)} ${tr.division ?? ''}` }),
    h('div', { class: 'rank-info' },
      title ? h('div', { class: 'rank-title', text: t('rank.title') }) : null,
      h('div', { class: 'rank-name display', text: gg ? t(`tier.${tr.tier}`) : `${t(`tier.${tr.tier}`)} ${tr.division}` }),
      h('div', { class: 'rank-score num', text: gg ? t('rank.score', { n: formatNum(tr.rating, 0) }) : t('rank.rating', { n: formatNum(tr.rating, 0) }) }),
      gg ? null : h('div', { class: 'lp', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': tr.lp, 'aria-label': t('rank.lp', { n: tr.lp }) },
        h('span', { class: 'lp-fill', style: `width:${tr.lp}%` }), h('span', { class: 'lp-text num', text: t('rank.lp', { n: tr.lp }) }))));
}
