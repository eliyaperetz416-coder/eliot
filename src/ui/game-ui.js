// Level bar, streak, quests, rewards and achievements widgets.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { levelFromXp } from '../core/game.mjs';
import { view } from '../core/streak.mjs';
import { questBoard, claimQuest } from '../core/quests.mjs';
import { computeStats, progressOf } from '../core/achievements.mjs';
import { usableRestores, useRestore } from '../core/shop.mjs';
import { button, showToast } from './components.js';
import { data } from './data.js';
import { store, saveGame, todayKey } from './store.js';
import { formatNum, formatDate } from './format.js';

const pick = (o, base) => (getLanguage() === 'he' ? o[`${base}He`] : o[`${base}En`]);
export const itemName = (o) => pick(o, 'name');
export const itemDesc = (o) => pick(o, 'desc');

export function levelBar(game = store.game) {
  const l = levelFromXp(game.xp);
  return h('div', { class: 'level-bar' },
    h('div', { class: 'level-top' }, h('span', { class: 'display level-n', text: t('game.level', { n: l.level }) }), h('bdi', { class: 'row-sub num', text: `${formatNum(l.into, 0)} / ${formatNum(l.need, 0)} XP` })),
    h('div', { class: 'lp', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': l.need, 'aria-valuenow': l.into, 'aria-label': t('game.level', { n: l.level }) }, h('span', { class: 'lp-fill', style: `width:${Math.max(2, l.progress * 100)}%` })));
}

/** Level, drachmas and streak on one line. */
export function gameStrip() {
  const g = store.game, sv = view(g.streak, todayKey());
  const chip = (ic, label, cls = '') => h('span', { class: `game-chip ${cls}` }, icon(ic), h('span', { class: 'num', text: label }));
  return h('div', { class: 'game-strip' },
    chip('bolt', t('game.level', { n: levelFromXp(g.xp).level })),
    chip('coin', formatNum(g.drachmas, 0), 'coin'),
    chip('flame', t('game.streakDays', { n: sv.current }), sv.current ? 'hot' : ''));
}

export function questText(q) {
  const tpl = pick(q, 'text');
  return tpl.replace('{target}', formatNum(q.target, 0)).replace('{group}', q.group ? t(`group.${q.group}`) : '');
}

export function questsCard(rerender) {
  const board = questBoard(data().quests, todayKey(), Date.now(), store.workouts, data().byId, store.game.quests.claimed);
  const row = (q) => h('div', { class: `quest${q.claimed ? ' claimed' : ''}` },
    h('div', { class: 'quest-main' },
      h('div', { class: 'quest-text', text: questText(q) }),
      h('div', { class: 'lp small', 'aria-hidden': 'true' }, h('span', { class: 'lp-fill', style: `width:${(q.progress / q.target) * 100}%` })),
      h('div', { class: 'row-sub num', text: `${formatNum(q.progress, 0)} / ${formatNum(q.target, 0)}` })),
    q.claimed ? h('span', { class: 'pr-badge pr-week', text: t('quest.claimed') })
      : button({ label: q.complete ? t('quest.claim', { n: q.reward }) : t('quest.reward', { n: q.reward }), variant: q.complete ? 'primary' : 'secondary', disabled: !q.complete, onClick: async () => {
        const r = claimQuest(store.game, board, q.claimKey, Date.now());
        if (!r) return;
        await saveGame(r.game);
        showToast({ message: t('quest.got', { n: r.reward }) });
        rerender();
      } }));
  return h('section', { class: 'card quests' },
    h('h2', { text: t('quest.today') }), h('div', { class: 'quest-list' }, board.filter((q) => q.period === 'daily').map(row)),
    h('h2', { text: t('quest.week'), style: 'padding-block-start:12px' }), h('div', { class: 'quest-list' }, board.filter((q) => q.period === 'weekly').map(row)));
}

/** Streak flame, or the "streak broken" prompt with the restores you own. */
export function streakCard(rerender) {
  const g = store.game, today = todayKey();
  const sv = view(g.streak, today);
  if (sv.broken) {
    const usable = usableRestores(g, today);
    return h('section', { class: 'card streak-broken' },
      h('div', { class: 'row-title', text: t('streak.broken.title', { n: sv.broken.lostLength }) }),
      h('p', { class: 'row-sub', text: t('streak.broken.body', { n: sv.broken.daysLeft }) }),
      h('div', { class: 'stack', style: 'padding-block-start:8px' },
        usable.map((k) => button({ label: t('streak.use', { name: itemName(data().shop.consumables.find((c) => c.id === k)) }), block: true, onClick: async () => {
          const r = useRestore(g, k, today);
          if (r.ok) { await saveGame(r.game); showToast({ message: t('streak.restored', { n: r.game.streak.current }) }); rerender(); }
        } })),
        usable.length ? null : h('a', { class: 'btn btn-secondary btn-block', href: '#/shop' }, t('streak.goShop'))));
  }
  return h('section', { class: 'card streak-card' }, icon('flame', 'flame-icon'),
    h('div', {}, h('div', { class: 'row-title num', text: t('game.streakDays', { n: sv.current }) }), h('div', { class: 'row-sub', text: sv.current ? t('streak.alive') : t('streak.start') })),
    h('div', { class: 'row-sub num', style: 'margin-inline-start:auto', text: t('streak.best', { n: sv.best }) }));
}

/** Rewards of a posted workout, for the result screen. */
export function rewardsCard(r, game) {
  if (!r.valid) return h('section', { class: 'card' }, h('div', { class: 'row-title', text: t('rewards.invalid.title') }), h('p', { class: 'row-sub', text: t('rewards.invalid.body') }));
  if (!r.rewarded) return h('section', { class: 'card' }, h('div', { class: 'row-title', text: t('rewards.limit.title') }), h('p', { class: 'row-sub', text: t('rewards.limit.body') }));
  const lvl = levelFromXp(game.xp);
  const line = (label, value, cls = '') => h('div', { class: `reward-line ${cls}` }, h('span', { text: label }), h('bdi', { class: 'num', text: value }));
  const kids = [
    h('div', { class: 'reward-big' },
      h('div', { class: 'reward-num display' }, h('bdi', { class: 'num', text: `+${formatNum(r.xp, 0)}` }), h('span', { class: 'row-sub', text: 'XP' })),
      h('div', { class: 'reward-num display coin' }, h('bdi', { class: 'num', text: `+${formatNum(r.drachmas + r.achievementDrachmas, 0)}` }), h('span', { class: 'row-sub', text: t('game.drachmas') }))),
  ];
  if (r.shake) kids.push(h('p', { class: 'shake-note', text: t('rewards.shake', { base: formatNum(r.xpBase, 0) }) }));
  kids.push(levelBarFrom(lvl, r.levelAfter > r.levelBefore));
  if (r.levelAfter > r.levelBefore) kids.push(h('p', { class: 'levelup', text: t('rewards.levelup', { n: r.levelAfter }) }));
  if (r.breakdown) {
    const b = r.breakdown;
    kids.push(h('div', { class: 'reward-lines' }, line(t('rewards.sets'), `+${b.setXp} XP`), b.prXp ? line(t('rewards.prs'), `+${b.prXp} XP`) : null, line(t('rewards.done'), `+${b.completionXp} XP`)));
  }
  kids.push(h('div', { class: 'streak-line' }, icon('flame', 'flame-icon'), h('span', { text: t('rewards.streak', { n: r.streak }) })));
  for (const m of r.milestones) kids.push(h('p', { class: 'milestone', text: t('rewards.milestone', { days: m.days, n: m.drachmas }) }));
  for (const id of r.achievements) { const a = data().achievements.find((x) => x.id === id); if (a) kids.push(h('div', { class: 'ach-got' }, icon(a.icon), h('div', {}, h('div', { class: 'row-title', text: t('ach.unlocked', { name: itemName(a) }) }), h('div', { class: 'row-sub' }, h('bdi', { text: t('ach.reward', { n: a.reward }) }))))); }
  for (const key of r.questsCompleted) {
    const q = questBoard(data().quests, store.game ? todayKey() : '', Date.now(), store.workouts, data().byId, {}).find((x) => x.claimKey === key);
    if (q) kids.push(h('p', { class: 'quest-done', text: t('quest.complete', { text: questText(q) }) }));
  }
  return h('section', { class: 'card card-accent rewards' }, kids);
}
function levelBarFrom(l, up) {
  return h('div', { class: `level-bar${up ? ' up' : ''}` },
    h('div', { class: 'level-top' }, h('span', { class: 'display level-n', text: t('game.level', { n: l.level }) }), h('bdi', { class: 'row-sub num', text: `${formatNum(l.into, 0)} / ${formatNum(l.need, 0)} XP` })),
    h('div', { class: 'lp' }, h('span', { class: 'lp-fill', style: `width:${Math.max(2, l.progress * 100)}%` })));
}

export function achievementsScreen() {
  const stats = computeStats({ workouts: store.workouts, game: store.game, customCount: store.custom.length, plansCount: store.plans.length });
  const list = data().achievements;
  const unlocked = Object.keys(store.game.achievements.unlocked).length;
  return h('main', { class: 'screen' },
    h('a', { class: 'back-link', href: '#/profile' }, icon('chevron', 'chev back-chev'), t('tab.profile')),
    h('h1', { class: 'ex-title', text: t('ach.title') }),
    h('p', { class: 'row-sub', text: t('ach.count', { n: unlocked, total: list.length }) }),
    h('div', { class: 'list', style: 'margin-block-start:12px' }, list.map((a) => {
      const when = store.game.achievements.unlocked[a.id];
      return h('div', { class: `row ach-row${when ? ' unlocked' : ''}` },
        h('span', { class: 'row-icon' }, icon(when ? a.icon : 'shield')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: itemName(a) }), h('span', { class: 'row-sub', text: itemDesc(a) }),
          when ? h('span', { class: 'row-sub', text: formatDate(Date.parse(when)) }) : h('span', { class: 'lp small', 'aria-hidden': 'true' }, h('span', { class: 'lp-fill', style: `width:${progressOf(a, stats) * 100}%` }))),
        h('bdi', { class: 'row-end num', text: `+${a.reward}` }));
    })));
}
