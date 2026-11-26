// The rank pyramid on Progress (OUR DESIGN, redesign): ten steps, Greek God on top (46 % wide) down to Wood (100 %).
// The step you are on is filled with its tier colour and shows the division and your rating, with a thin bar to the
// next division; tiers below you are filled quietly, tiers above are outlines. Tap your step for the full path.
import { h } from './dom.js';
import { t } from '../core/i18n.mjs';
import { rankLadder, TIER_COLORS, GREEK_GOD_GRADIENT } from '../core/ranks.mjs';
import { inkFor } from '../core/themes.mjs';
import { formatNum } from './format.js';

/** pyramid({ rating }) -> <ol class="pyramid">. rating 0 / pending: no step is yours yet. */
export function pyramid({ rating = 0 } = {}) {
  const L = rankLadder(rating);
  const steps = [...L.tiers].reverse(); // top first
  return h('ol', { class: 'pyramid', 'aria-label': t('ladder.title') }, steps.map((x, i) => {
    const width = `${46 + i * 6}%`;
    const name = t(`tier.${x.id}`);
    if (x.status !== 'current') {
      return h('li', { class: `pyr-step ${x.status}`, style: `width:${width}`, 'aria-label': `${name}${x.status === 'done' ? `, ${t('pyr.reached')}` : ''}` }, h('span', { text: name }));
    }
    const gg = x.id === 'greekgod';
    const bg = gg ? `linear-gradient(135deg, ${GREEK_GOD_GRADIENT[0]}, ${GREEK_GOD_GRADIENT[1]})` : TIER_COLORS[x.id];
    const ink = inkFor(gg ? GREEK_GOD_GRADIENT[0] : TIER_COLORS[x.id]);
    const label = gg ? name : `${name} · ${L.current.division}`;
    const divPct = gg ? 100 : L.current.lp;
    return h('li', { class: 'pyr-step current', 'aria-current': 'step', style: `width:${width};--pyr-bg:${bg};--pyr-ink:${ink};--pyr-glow:${gg ? GREEK_GOD_GRADIENT[1] : TIER_COLORS[x.id]}` },
      h('a', { href: '#/ladder', 'aria-label': `${label}, ${t('ladder.rating', { n: formatNum(rating, 0) })}. ${t('pyr.open')}` },
        h('span', { class: 'pyr-name', text: label }), h('span', { class: 'pyr-rating num', text: formatNum(rating, 0) }),
        h('i', { class: 'pyr-lp', style: `width:${divPct}%`, 'aria-hidden': 'true' })));
  }));
}

/** The line under the pyramid: points to the next division / tier, or how many exercises are still missing. */
export function pyramidNote(overall) {
  if (overall.pending) return t('rank.pending', { n: overall.remaining });
  const L = rankLadder(overall.rating);
  if (L.toNextDivision != null && L.current.divisionIndex < 4) return t('pyr.toDivision', { n: formatNum(L.toNextDivision, 0) });
  if (L.toNextTier != null) { const next = L.tiers[L.tiers.findIndex((x) => x.id === L.current.tier) + 1]; return t('pyr.toTier', { n: formatNum(L.toNextTier, 0), name: t(`tier.${next.id}`) }); }
  return t('ladder.top');
}
