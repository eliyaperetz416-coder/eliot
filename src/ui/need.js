// "What do I need?" sheet: load for the next division and tier at a chosen number of reps.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { nextTargets } from '../core/views.mjs';
import { tierFor } from '../core/ranks.mjs';
import { openSheet } from './components.js';
import { store, bodyweightKg } from './store.js';
import { emblem } from './emblem.js';
import { formatKg, formatNum } from './format.js';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const tierLabel = (x) => (x.division ? `${t(`tier.${x.tier}`)} ${x.division}` : t(`tier.${x.tier}`));

export function openNeedSheet(ex) {
  const best = store.bests[ex.id];
  const rating = best?.rating ?? 0;
  let reps = Math.min(30, Math.max(1, best?.reps ?? 5));
  const body = h('div', { class: 'stack' });
  const sh = openSheet({ title: nameOf(ex), content: body });
  function draw() {
    const nt = nextTargets(ex, rating, bodyweightKg(), store.profile.sex, reps);
    const cur = nt.current;
    const stepper = h('div', { class: 'stepper', role: 'group', 'aria-label': t('need.reps') },
      h('button', { class: 'icon-btn', type: 'button', dir: 'ltr', 'aria-label': '−', onclick: () => { reps = Math.max(1, reps - 1); draw(); } }, '−'),
      h('div', { class: 'stepper-v' }, h('span', { class: 'display num', text: String(reps) }), h('span', { class: 'row-sub', text: t('need.reps') })),
      h('button', { class: 'icon-btn', type: 'button', dir: 'ltr', 'aria-label': '+', onclick: () => { reps = Math.min(30, reps + 1); draw(); } }, '+'));
    const quick = h('div', { class: 'chips-wrap' }, [1, 3, 5, 8, 10, 12].map((n) => h('button', { type: 'button', class: 'chip chip-select', 'aria-pressed': String(n === reps), onclick: () => { reps = n; draw(); } }, String(n))));
    const target = (label, x) => h('div', { class: 'need-card' },
      emblem({ tier: x.tier, divisionIndex: tierFor(x.rating).divisionIndex ?? 0, size: 48, label: tierLabel(x) }),
      h('div', { class: 'need-main' },
        h('div', { class: 'row-sub', text: label }),
        h('div', { class: 'row-title', text: `${tierLabel(x)} · ${formatNum(x.rating, 0)}` }),
        h('div', { class: 'need-load display num', text: x.bodyweightEnough ? t('need.bwEnough') : `${formatKg(x.load)} ${t('unit.kg')} × ${reps}` }),
        ex.perHand && !x.bodyweightEnough ? h('div', { class: 'row-sub', text: t('exercise.curve.perhand') }) : null,
        ex.bwFactor && !x.bodyweightEnough ? h('div', { class: 'row-sub', text: t('need.added') }) : null));
    const kids = [
      h('div', { class: 'row-sub', text: cur.unranked ? t('need.noBest') : `${t('need.current')}: ${tierLabel(cur)} · ${formatNum(rating, 0)}` }),
      stepper, quick];
    if (cur.tier === 'greekgod') kids.push(h('p', { class: 'need-top', text: t('need.top', { n: formatNum(rating, 0) }) }));
    if (nt.division) kids.push(target(t('need.nextDivision'), nt.division));
    if (nt.tier) kids.push(target(t('need.nextTier'), nt.tier));
    kids.push(h('p', { class: 'row-sub', text: t('need.note', { kg: formatKg(bodyweightKg()) }) }),
      h('div', { class: 'list' },
        h('a', { class: 'row', href: `#/exercise/${ex.id}`, onclick: () => sh.close() }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: t('need.open') })), icon('chevron', 'chev')),
        best ? h('a', { class: 'row', href: `#/progress/${ex.id}`, onclick: () => sh.close() }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: t('progress.title') })), icon('chevron', 'chev')) : null));
    body.replaceChildren(...kids);
  }
  draw();
  return sh;
}
