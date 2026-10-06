// Training calendar helpers. Pure. Days are local date keys "YYYY-MM-DD" (the workout's own dateKey), so time zones and DST cannot move a day.
import { dateKey } from './workout.mjs';

const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

/** Weeks of 7 cells for a month. firstDay: 0 = Sunday first, 1 = Monday first. Cells outside the month have inMonth false. */
export function monthGrid(year, m0, firstDay = 0) {
  const lead = (new Date(Date.UTC(year, m0, 1)).getUTCDay() - firstDay + 7) % 7;
  const dim = new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + dim) / 7) * 7;
  const weeks = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, m0, i - lead + 1));
    const cell = { key: keyOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m0 };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

export function addMonths(year, m0, n) {
  const t = year * 12 + m0 + n;
  return { year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 };
}

const dayOf = (w) => w.dateKey ?? dateKey(w.startedMs);

/** Map of dateKey -> workouts of that day, oldest first. */
export function byDay(workouts) {
  const map = new Map();
  for (const w of [...workouts].sort((a, b) => a.startedMs - b.startedMs)) {
    const k = dayOf(w);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(w);
  }
  return map;
}

const prCount = (w) => w.stats?.prs ?? 0;
export function monthStats(workouts, year, m0) {
  const prefix = `${year}-${pad(m0 + 1)}-`;
  const list = workouts.filter((w) => dayOf(w).startsWith(prefix));
  return {
    days: new Set(list.map(dayOf)).size, workouts: list.length,
    sets: list.reduce((n, w) => n + (w.stats?.workingSets ?? 0), 0),
    volume: list.reduce((n, w) => n + (w.stats?.volume ?? 0), 0),
    prs: list.reduce((n, w) => n + prCount(w), 0),
  };
}

/** The first month that has a workout (so the back button stops there), or the given month when there is none. */
export function firstMonth(workouts, fallback) {
  if (!workouts.length) return fallback;
  const k = workouts.map(dayOf).sort()[0];
  return { year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) - 1 };
}
