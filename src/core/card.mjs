// Player card content (pure). Level, streak, achievements and cosmetics are placeholders until Stage 6.
import { tierFor } from './ranks.mjs';

export function cardModel({ profile, overall, workoutsCount = 0 }) {
  const t = overall.pending ? null : tierFor(overall.rating);
  return {
    name: profile?.name ?? '',
    pending: overall.pending, remaining: overall.remaining ?? 0,
    tier: t?.tier ?? null, division: t?.division ?? null, divisionIndex: t?.divisionIndex ?? 0, lp: t?.lp ?? null, rating: overall.pending ? 0 : overall.rating,
    level: null, streak: null, achievements: null, // placeholders, shown as a dash
    workoutsCount,
    slots: [null, null, null], // equipped cosmetics (placeholders)
  };
}

export const cardFileName = (name) => `demigod-${String(name || 'card').toLowerCase().replace(/[^a-z0-9א-ת]+/g, '-').replace(/^-|-$/g, '') || 'card'}.png`;
