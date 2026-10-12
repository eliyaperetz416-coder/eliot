// Consistency bonus on the overall rank. OUR DESIGN: strength stays the main thing, showing up adds a little on top.
// At most 40 points (v1.34; it was 20). It is worked out from your workouts, so it fades by itself if you stop.

export const BONUS = Object.freeze({
  WINDOW_DAYS: 28,       // training days counted in the last 4 weeks
  DAY_POINTS_EACH: 2.5,  // points per training day (rounded), up to the cap (x2.5 in v1.35)
  DAY_POINTS_CAP: 50,
  GAP_DAYS: 3,           // the streak breaks after a gap longer than 3 days (same rule as the game streak)
  STREAK_POINTS_PER_WEEK: 5,
  STREAK_POINTS_CAP: 50, // 5 points per full week of streak, up to 50
  MAX: 100,
});

const DAY = 86400000;
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** { total, days, streakWeeks, dayPoints, streakPoints } for posted workouts as of `now`. */
export function consistencyBonus(workouts, now) {
  const days = [...new Set(workouts.filter((w) => w.endedMs && w.endedMs <= now).map((w) => dayStart(w.endedMs)))].sort((a, b) => b - a);
  const today = dayStart(now);
  const recent = days.filter((d) => today - d < BONUS.WINDOW_DAYS * DAY).length;
  let streakWeeks = 0;
  if (days.length && Math.round((today - days[0]) / DAY) <= BONUS.GAP_DAYS) {
    let first = days[0];
    for (let i = 1; i < days.length && Math.round((days[i - 1] - days[i]) / DAY) <= BONUS.GAP_DAYS; i++) first = days[i];
    streakWeeks = Math.floor((Math.round((days[0] - first) / DAY) + 1) / 7);
  }
  const dayPoints = Math.min(BONUS.DAY_POINTS_CAP, Math.round(recent * BONUS.DAY_POINTS_EACH));
  const streakPoints = Math.min(BONUS.STREAK_POINTS_CAP, streakWeeks * BONUS.STREAK_POINTS_PER_WEEK);
  return { total: Math.min(BONUS.MAX, dayPoints + streakPoints), days: recent, streakWeeks, dayPoints, streakPoints };
}
