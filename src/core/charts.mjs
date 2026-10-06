// Chart data builders and layout maths. Pure; the SVG itself is drawn in src/ui/charts.js.
import { dateKey } from './workout.mjs';

/** Best estimated 1RM (or comparable metric) per workout for one exercise, oldest first: [{t, v, workoutId}] */
export function e1rmSeries(workouts, exerciseId, byId) {
  const ex = byId[exerciseId];
  const out = [];
  for (const w of workouts) {
    let best = 0;
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue;
      for (const s of e.sets) {
        if (!s.done || s.type === 'warmup') continue;
        const v = ex?.ranked && s.oneRM > 0 ? s.oneRM : s.metric ?? 0;
        if (v > best) best = v;
      }
    }
    if (best > 0) out.push({ t: w.startedMs, v: Math.round(best * 10) / 10, workoutId: w.id });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Exercise ids that have chartable data, most recently trained first. */
export function exercisesWithData(workouts, byId) {
  const last = new Map();
  for (const w of workouts) for (const e of w.entries) if (byId[e.exerciseId] && e.sets.some((s) => s.done && s.type !== 'warmup')) last.set(e.exerciseId, Math.max(last.get(e.exerciseId) ?? 0, w.startedMs));
  return [...last.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Local Monday 00:00 of the week containing ms (time-zone and DST safe: uses local calendar fields). */
export function weekStart(ms) {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

/** Total volume (kg) per local week for the last `weeks` weeks, ending with the current week: [{t (week start), v}] */
export function weeklyVolume(workouts, nowMs, weeks = 12) {
  const start = new Date(weekStart(nowMs));
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) buckets.push({ t: new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7 * i).getTime(), v: 0 });
  const index = new Map(buckets.map((b, i) => [dateKey(b.t), i]));
  for (const w of workouts) {
    const k = dateKey(weekStart(w.startedMs));
    if (index.has(k)) buckets[index.get(k)].v += w.stats?.volume ?? 0;
  }
  return buckets;
}

export const bodyweightSeries = (log) => [...log].sort((a, b) => a.ms - b.ms).map((e) => ({ t: e.ms, v: e.kg }));

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min, max, count = 4) {
  if (!(max > min)) { const c = min || 1; min = c * 0.9; max = c * 1.1; }
  const rough = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * Layout for a line or bar chart inside width x height. rtl: time flows right to left and the value axis sits on the right.
 * Returns { points: [{x, y, t, v}], yTicks: [{y, v}], xTicks: [{x, t}], plot: {x0, x1, y0, y1}, axisX }.
 */
export function layoutSeries(series, { width = 340, height = 200, pad = { l: 36, r: 12, t: 14, b: 26 }, rtl = false, zeroBase = false, bars = false } = {}) {
  const left = rtl ? pad.r : pad.l, right = width - (rtl ? pad.l : pad.r);
  const top = pad.t, bottom = height - pad.b;
  if (!series.length) return { points: [], yTicks: [], xTicks: [], plot: { x0: left, x1: right, y0: top, y1: bottom }, axisX: rtl ? right : left };
  const vs = series.map((p) => p.v);
  let lo = zeroBase ? 0 : Math.min(...vs), hi = Math.max(...vs);
  if (!zeroBase) { const span = hi - lo || hi * 0.2 || 1; lo -= span * 0.15; hi += span * 0.15; }
  const yTicks0 = niceTicks(lo, hi, 4);
  const yMin = yTicks0[0], yMax = yTicks0[yTicks0.length - 1];
  const y = (v) => bottom - ((v - yMin) / (yMax - yMin || 1)) * (bottom - top);
  const t0 = series[0].t, t1 = series[series.length - 1].t;
  const inner = bars ? (right - left) / series.length : 0;
  const x = (t, i) => {
    let k;
    if (bars) k = (i + 0.5) / series.length;
    else k = series.length === 1 || t1 === t0 ? 0.5 : (t - t0) / (t1 - t0);
    const base = bars ? k : 0.04 + k * 0.92;
    return rtl ? right - base * (right - left) : left + base * (right - left);
  };
  const points = series.map((p, i) => ({ x: x(p.t, i), y: y(p.v), t: p.t, v: p.v }));
  const nX = Math.min(series.length, 4);
  const xTicks = [];
  for (let i = 0; i < nX; i++) { const idx = nX === 1 ? 0 : Math.round((i * (series.length - 1)) / (nX - 1)); if (!xTicks.some((tk) => tk.idx === idx)) xTicks.push({ idx, x: points[idx].x, t: series[idx].t }); }
  return { points, yTicks: yTicks0.map((v) => ({ y: y(v), v })), xTicks: xTicks.map(({ x: tx, t }) => ({ x: tx, t })), plot: { x0: left, x1: right, y0: top, y1: bottom }, axisX: rtl ? right : left, barWidth: inner * 0.62, yMin, yMax };
}

export function linePath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}
export function areaPath(points, baseY) {
  if (!points.length) return '';
  return `${linePath(points)} L${points[points.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L${points[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}
