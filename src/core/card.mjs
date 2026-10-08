// Player card content (pure).
import { tierFor } from './ranks.mjs';
import { levelFromXp } from './game.mjs';
import { view } from './streak.mjs';

export function cardModel({ profile, overall, workoutsCount = 0, game = null, todayKey = null, shop = null }) {
  const eq = game?.inventory?.equipped ?? {};
  const find = (id) => (id && shop ? shop.cosmetics.find((c) => c.id === id) ?? null : null);
  const t = overall.pending ? null : tierFor(overall.rating);
  return {
    name: profile?.name ?? '',
    pending: overall.pending, remaining: overall.remaining ?? 0,
    tier: t?.tier ?? null, division: t?.division ?? null, divisionIndex: t?.divisionIndex ?? 0, lp: t?.lp ?? null, rating: overall.pending ? 0 : overall.rating,
    level: game ? levelFromXp(game.xp).level : null, streak: game && todayKey ? view(game.streak, todayKey).current : null, achievements: game ? Object.keys(game.achievements.unlocked).length : null,
    workoutsCount,
    titleItem: find(eq.title), // equipped title (text under the name)
    slots: [find(eq.background), find(eq.frame), find(eq.effect)], // equipped cosmetics: background, frame, effect
  };
}

export const cardFileName = (name) => `demigod-${String(name || 'card').toLowerCase().replace(/[^a-z0-9א-ת]+/g, '-').replace(/^-|-$/g, '') || 'card'}.png`;
