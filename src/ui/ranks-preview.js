// Debug route #/ranks-preview: every tier x division, every tier colour.
import { h } from './dom.js';
import { icon } from './icons.js';
import { backLink } from './components.js';
import { t } from '../core/i18n.mjs';
import { TIERS, DIVISIONS, TIER_COLORS } from '../core/ranks.mjs';
import { emblem } from './emblem.js';

export function ranksPreviewScreen() {
  const kids = [backLink('#/ranks', t('tab.ranks')), h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('ranksPreview.title') }))];
  kids.push(h('div', { class: 'section-label', text: t('ranksPreview.colors') }),
    h('div', { class: 'swatches' }, TIERS.map((x) => h('span', { class: 'swatch', style: x.id === 'greekgod' ? 'background:linear-gradient(135deg,#fff1b8,#7df9ff)' : `background:${TIER_COLORS[x.id]}`, title: t(`tier.${x.id}`) }))));
  for (const tier of TIERS) {
    const name = t(`tier.${tier.id}`);
    kids.push(h('div', { class: 'section-label', text: tier.id === 'greekgod' ? name : `${name} · ${t('ranksPreview.divisions')}` }));
    if (tier.id === 'greekgod') {
      kids.push(h('div', { class: 'emblem-grid one' }, h('div', { class: 'emblem-cell' }, emblem({ tier: tier.id, size: 120, label: name }),
        h('span', { class: 'display num', text: t('ranksPreview.score', { n: 1022 }) }))));
    } else {
      kids.push(h('div', { class: 'emblem-grid' }, DIVISIONS.map((d, i) => h('div', { class: 'emblem-cell' },
        emblem({ tier: tier.id, divisionIndex: i, size: 62, label: t('ranksPreview.emblem', { tier: name, division: d }) }),
        h('span', { class: 'display', text: d })))));
    }
  }
  return h('main', { class: 'screen' }, kids);
}
