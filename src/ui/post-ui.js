// Finishing a workout: summary sheet -> post -> result screen -> rank-up reveal.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import * as W from '../core/workout.mjs';
import { postWorkout, rankIndex } from '../core/post.mjs';
import { applyPost } from '../core/gamestate.mjs';
import { rewardsCard } from './game-ui.js';
import { tierFor } from '../core/ranks.mjs';
import { button, emptyState, openSheet } from './components.js';
import { data } from './data.js';
import { store, commitPost, clearDraft } from './store.js';
import { skipRest } from './rest-timer.js';
import { keepAwake } from './wakelock.js';
import { emblem } from './emblem.js';
import { rankCard } from './rank-card.js';
import { formatDuration, formatNum } from './format.js';

let lastResult = null;
const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const reducedMotion = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

function statTile(label, value) { return h('div', { class: 'stat' }, h('span', { class: 'stat-v display num', text: value }), h('span', { class: 'stat-l', text: label })); }

export function openFinishSheet() {
  const w = store.draft;
  const byId = data().byId;
  const s = W.stats(w, byId, Date.now());
  const done = w.entries.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const total = w.entries.reduce((n, e) => n + e.sets.length, 0);
  const body = h('div', { class: 'stack' });
  const sh = openSheet({ title: t('fin.title'), content: body });
  body.append(h('div', { class: 'stats-grid' },
    statTile(t('fin.duration'), formatDuration(s.durationSec)), statTile(t('fin.sets'), String(s.workingSets)),
    statTile(t('fin.volume'), `${formatNum(s.volume, 0)} ${t('unit.kg')}`), statTile(t('fin.prs'), String(s.prs))));
  if (total - done > 0 && done > 0) body.append(h('p', { class: 'row-sub', text: t('fin.unfinished', { n: total - done }) }));
  if (done === 0) {
    body.append(h('p', { text: t('fin.empty') }));
  } else {
    body.append(button({ label: t('fin.post'), block: true, onClick: async (e) => {
      e.currentTarget.disabled = true;
      const now = Date.now();
      const result = postWorkout({ draft: w, workouts: store.workouts, now, byId, sex: store.profile.sex });
      const after = result.summary.overallAfter;
      const g = applyPost({ game: store.game, workout: result.workout, workouts: result.workouts, byId, now, overallRankIndex: after.pending ? -1 : rankIndex(after.rating), customCount: store.custom.length, plansCount: store.plans.length, achievements: data().achievements, pool: data().quests });
      await commitPost(result, g.game);
      lastResult = { ...result, game: g.game, rewards: g.rewards };
      skipRest(); keepAwake(false);
      sh.close();
      location.hash = '#/result';
    } }));
  }
  body.append(
    button({ label: t('fin.keep'), variant: 'secondary', block: true, onClick: () => sh.close() }),
    button({ label: t('fin.discard'), variant: 'danger', block: true, onClick: () => {
      sh.close();
      const c = h('div', { class: 'stack' }, h('p', { text: t('fin.discard.confirm') }),
        button({ label: t('fin.discard'), variant: 'danger', block: true, onClick: async () => { c2.close(); skipRest(); keepAwake(false); await clearDraft(); location.hash = '#/workout'; } }),
        button({ label: t('common.cancel'), variant: 'secondary', block: true, onClick: () => c2.close() }));
      const c2 = openSheet({ title: t('fin.discard'), content: c });
    } }));
}

export function openRankUp({ change, before, after }) {
  const to = change.to;
  const first = change.kind === 'first';
  const em = emblem({ tier: to.tier, divisionIndex: to.divisionIndex ?? 0, size: 200, label: t(`tier.${to.tier}`) });
  em.classList.add('reveal');
  const num = h('div', { class: 'ru-num display num', text: formatNum(first ? 0 : before) });
  const close = () => { ov.remove(); document.getElementById('app').inert = false; };
  const ov = h('div', { class: 'rankup', role: 'dialog', 'aria-modal': 'true', 'aria-label': first ? t('ru.first') : t('ru.up') },
    h('div', { class: 'ru-rays', 'aria-hidden': 'true' }),
    h('div', { class: 'ru-body' },
      h('div', { class: 'ru-kicker display', text: first ? t('ru.first') : t('ru.up') }),
      h('div', { class: 'ru-emblem' }, em),
      h('div', { class: 'ru-tier display', text: to.tier === 'greekgod' ? t('tier.greekgod') : `${t(`tier.${to.tier}`)} ${to.division}` }),
      num,
      button({ label: t('ru.continue'), block: true, onClick: close })));
  if (store.game.inventory.equipped.effect === 'fx_dust' && !reducedMotion()) for (let i = 0; i < 36; i++) ov.append(h('span', { class: 'dust', style: `left:${Math.round(Math.random() * 100)}%;animation-delay:${(Math.random() * 2).toFixed(2)}s;animation-duration:${(2 + Math.random() * 2).toFixed(2)}s` }));
  document.getElementById('overlay-root').append(ov);
  document.getElementById('app').inert = true;
  ov.querySelector('button').focus();
  // count-up
  const target = after, start = first ? 0 : before, dur = reducedMotion() ? 0 : 1300;
  if (!dur) { num.textContent = formatNum(target, 0); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    num.textContent = formatNum(Math.round(start + (target - start) * e), 0);
    if (k < 1 && ov.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function resultScreen() {
  const r = lastResult;
  const byId = data().byId;
  if (!r) return h('main', { class: 'screen' }, emptyState({ icon: 'workout', title: t('res.none'), body: '' }), button({ label: t('res.done'), block: true, onClick: () => { location.hash = '#/workout'; } }));
  const { summary: s } = r;
  const kids = [
    h('header', { class: 'screen-head' }, icon('check', 'mark'), h('h1', { text: t('res.title') })),
    h('div', { class: 'stats-grid' },
      statTile(t('fin.duration'), formatDuration(s.stats.durationSec)), statTile(t('fin.sets'), String(s.stats.workingSets)),
      statTile(t('fin.volume'), `${formatNum(s.stats.volume, 0)} ${t('unit.kg')}`), statTile(t('fin.prs'), String(s.stats.prs))),
    h('div', { class: 'section-label', text: t('rewards.title') }),
    rewardsCard(r.rewards, r.game),
    h('div', { class: 'section-label', text: t('res.overall') }),
    rankCard(s.overallAfter, { title: false }),
  ];
  if (s.overallAfter.pending) kids.push(h('p', { class: 'row-sub', text: t('rank.pending', { n: s.overallAfter.remaining }) }));
  if (s.ratingChanges.length) {
    kids.push(h('div', { class: 'section-label', text: t('res.ratings') }),
      h('div', { class: 'list' }, s.ratingChanges.map((c) => {
        const tr = tierFor(c.after);
        return h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: nameOf(byId[c.exerciseId]) }),
          h('span', { class: 'row-sub' }, h('bdi', { class: 'num', text: `${c.before ? formatNum(c.before, 0) : '–'} → ${formatNum(c.after, 0)} · ${t(`tier.${tr.tier}`)}${tr.division ? ` ${tr.division}` : ''}` }))), icon('bolt', 'up-icon'));
      })));
  }
  if (s.prs.length) {
    kids.push(h('div', { class: 'section-label', text: t('res.prs') }),
      h('div', { class: 'list' }, s.prs.map((p) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: nameOf(byId[p.exerciseId]) })),
        h('span', { class: `pr-badge pr-${p.kind === 'allTime' ? 'all' : p.kind === 'weekly' ? 'week' : 'first'}`, text: t(p.kind === 'allTime' ? 'fb.pr.all' : p.kind === 'weekly' ? 'fb.pr.week' : 'fb.pr.first') })))));
  }
  kids.push(h('div', { class: 'stack', style: 'padding-block-start:16px' }, button({ label: t('res.done'), block: true, onClick: () => { location.hash = '#/workout'; } })));
  const root = h('main', { class: 'screen' }, kids);
  if (s.rankChange && !r.shown) {
    r.shown = true;
    setTimeout(() => openRankUp({ change: s.rankChange, before: s.overallBefore.rating, after: s.overallAfter.rating }), 350);
  }
  return root;
}
