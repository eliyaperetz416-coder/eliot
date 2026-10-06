// Rule-based plan generator. No AI, no network, fully deterministic for a given seed. OUR DESIGN, general guidance only.
import { uid } from './workout.mjs';
import { defaultRestSec } from './timer.mjs';

export const GOALS = ['strength', 'hypertrophy', 'general'];
export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'];
export const PLAN_WEEKS = [4, 6, 8];
export const SESSION_MINUTES = [45, 60, 75];
export const GYM_EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'ez-bar', 'bodyweight', 'other'];
export const PLAN_VERSION = 1;

/** OUR DESIGN: weekly working sets per muscle group. Minor groups get half of the major range. */
export const WEEKLY_SETS = { beginner: [8, 10], intermediate: [10, 16], advanced: [14, 20] };
export const MAJOR_GROUPS = ['chest', 'back', 'shoulders', 'quads', 'hamstrings'];
export const rangeFor = (experience, group) => {
  const [lo, hi] = WEEKLY_SETS[experience];
  return MAJOR_GROUPS.includes(group) ? [lo, hi] : [Math.round(lo / 2), Math.round(hi / 2)];
};
export const MIN_SETS = 2, MAX_SETS = 5;
const CAP = { 45: 5, 60: 6, 75: 8 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashSeed(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export const PATTERNS = {
  squat: { g: 'quads', f: ['squat', 'front-squat', 'leg-press', 'hack-machine'], compound: true },
  lunge: { g: 'quads', f: ['lunge-bb', 'lunge-db', 'stepup-db'], compound: true },
  legext: { g: 'quads', f: ['leg-extension'] },
  hinge: { g: 'hamstrings', f: ['rdl', 'good-morning'], compound: true },
  legcurl: { g: 'hamstrings', f: ['leg-curl', 'glute-ham'] },
  deadlift: { g: 'back', f: ['deadlift', 'rack-pull'], compound: true },
  vpull: { g: 'back', f: ['pulldown', 'pullup', 'chinup'], compound: true },
  hrow: { g: 'back', f: ['row-barbell', 'row-db', 'row-cable', 'row-machine', 'row-bodyweight'], compound: true },
  hpress: { g: 'chest', f: ['bench-flat', 'db-bench', 'chest-machine', 'chest-cable-press', 'pushup'], compound: true },
  ipress: { g: 'chest', f: ['bench-incline', 'db-incline'], compound: true },
  fly: { g: 'chest', f: ['fly-db', 'fly-cable', 'pec-deck'] },
  vpress: { g: 'shoulders', f: ['ohp', 'db-press-shoulder', 'machine-shoulder', 'cable-press-shoulder'], compound: true },
  lateral: { g: 'shoulders', f: ['lateral-raise'] },
  rear: { g: 'shoulders', f: ['rear-delt-db', 'rear-delt-machine', 'rear-delt-cable', 'face-pull'] },
  curl: { g: 'biceps', f: ['curl-bb', 'curl-db', 'hammer', 'curl-cable', 'curl-machine'] },
  triceps: { g: 'triceps', f: ['pushdown', 'skull', 'overhead', 'tri-machine', 'tri-kickback', 'close-grip'] },
  calf: { g: 'calves', f: ['calf-standing', 'calf-seated', 'calf-press'] },
  bridge: { g: 'glutes', f: ['hip-thrust', 'cable-glute', 'pull-through'] },
  abs: { g: 'abs', f: ['cable-crunch', 'ab-machine', 'cable-rotation', 'pallof', 'side-bend-db', 'side-bend-bb'], bodyweight: true },
};
const EXCLUDE = /guillotine|neck|behind|sissy|jefferson|zercher|overhead-squat|one-leg|pistol|single|one-arm|alternat|lying-one|bench-pull|rear-pull|mixed|zottman|drag|spider|jm-press|olympic|box-squat|side-split|kneeling|wide-stance|narrow|reverse|lying|incline-hammer|svend|bradford|good-morning-off|hanging-bar|seated-good|t-bar|weighted-bench|bench-dip/;

const S = (p, pri, main = false, only = null) => ({ p, pri, main, only });
/** Session templates. pri: 1 = keep first when time is short ... 5 = first to drop. main = heavy lift for strength rep ranges. */
export const TEMPLATES = {
  fullA: [S('squat', 1, true), S('hpress', 1, true), S('hrow', 2, true), S('vpress', 2), S('legcurl', 3), S('abs', 5)],
  fullB: [S('hinge', 1, true), S('ipress', 2), S('vpull', 2, true), S('lunge', 3), S('lateral', 4), S('triceps', 5), S('deadlift', 3, true, ['strength'])],
  fullC: [S('squat', 1, true), S('vpull', 2, true), S('hpress', 2), S('hrow', 3), S('rear', 4), S('curl', 5), S('calf', 5)],
  upperA: [S('hpress', 1, true), S('hrow', 1, true), S('vpress', 2), S('vpull', 2), S('lateral', 4), S('curl', 5), S('triceps', 5)],
  upperB: [S('ipress', 1), S('vpull', 1, true), S('vpress', 2, true), S('hrow', 2), S('rear', 4), S('curl', 5), S('triceps', 5)],
  lowerA: [S('squat', 1, true), S('hinge', 1, true), S('lunge', 3), S('legcurl', 3), S('calf', 4), S('abs', 5), S('deadlift', 3, true, ['strength'])],
  lowerB: [S('hinge', 1, true), S('squat', 2), S('legext', 3), S('legcurl', 3), S('bridge', 4), S('calf', 5)],
  push: [S('hpress', 1, true), S('ipress', 2), S('vpress', 2, true), S('fly', 4), S('lateral', 3), S('triceps', 4)],
  pull: [S('vpull', 1, true), S('hrow', 1, true), S('rear', 3), S('curl', 4), S('deadlift', 3, true, ['strength'])],
  legs: [S('squat', 1, true), S('hinge', 1, true), S('lunge', 3), S('legcurl', 3), S('legext', 4), S('calf', 5), S('abs', 5)],
};
export const SPLITS = {
  2: ['fullA', 'fullB'], 3: ['fullA', 'fullB', 'fullC'], 4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['push', 'pull', 'legs', 'upperA', 'lowerB'], 6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

function candidates(pattern, ctx, equipSet) {
  const P = PATTERNS[pattern];
  const ratio = (ex) => ctx.ratios?.[ex.id] ?? 1;
  const list = ctx.exercises.filter((ex) => {
    if (ex.muscleGroup !== P.g || !equipSet.has(ex.equipment) || ex.type === 'cardio' || ex.type === 'time') return false;
    if (EXCLUDE.test(ex.id)) return false;
    if (P.f.includes(ex.family)) return true;
    return !!P.bodyweight && ex.muscleGroup === 'abs' && !ex.ranked && ex.type === 'bodyweight' && !/hanging|ab-roller|rollout|knee-hip|jackknife|pike/.test(ex.id);
  });
  const rank = (ex) => { const i = P.f.indexOf(ex.family); return i < 0 ? 99 : i; };
  const std = (ex) => (ratio(ex) >= 0.75 && ratio(ex) <= 1.3 ? 0 : 1);
  return list.sort((a, b) => std(a) - std(b) || rank(a) - rank(b) || Math.abs(ratio(a) - 1) - Math.abs(ratio(b) - 1) || a.id.localeCompare(b.id));
}

let ratioOf = null;
function pick(list, rng, avoid) {
  const pool = list.filter((e) => !avoid.has(e.id));
  const use = pool.length ? pool : list;
  if (!use.length) return null;
  const isStd = (e) => (ratioOf?.[e.id] ?? 1) >= 0.75 && (ratioOf?.[e.id] ?? 1) <= 1.3;
  const std = use.filter(isStd);
  const top = (std.length ? std : use).slice(0, 4);
  return top[Math.floor(rng() ** 2 * top.length)];
}

function repScheme(goal, slot, ex) {
  const compound = !!PATTERNS[slot.p].compound;
  if (goal === 'strength') return slot.main ? { repsMin: 3, repsMax: 6, sets: 4 } : { repsMin: 6, repsMax: 10, sets: 3 };
  if (goal === 'hypertrophy') return compound ? { repsMin: 6, repsMax: 12, sets: 3 } : { repsMin: 10, repsMax: 15, sets: 3 };
  return { repsMin: 8, repsMax: 12, sets: 3 };
}

function groupTotals(sessions) {
  const t = {};
  for (const s of sessions) for (const sl of s.slots) { (t[PATTERNS[sl.p].g] ??= []).push(sl); }
  return t;
}

/** Brings weekly sets of every present muscle group into its range: raise sets, add a slot, lower sets, drop a slot. */
function balance(sessions, experience, ctx, equipSet, warnings) {
  const hasCandidates = (p) => candidates(p, ctx, equipSet).length > 0;
  for (let guard = 0; guard < 400; guard++) {
    const totals = groupTotals(sessions);
    let changed = false;
    for (const [g, slots] of Object.entries(totals)) {
      const [lo, hi] = rangeFor(experience, g);
      const total = slots.reduce((n, x) => n + x.sets, 0);
      if (total > hi) {
        const dec = [...slots].filter((x) => x.sets > MIN_SETS).sort((a, b) => b.sets - a.sets)[0];
        if (dec) { dec.sets--; changed = true; }
        else if (slots.length > 1) { const drop = [...slots].sort((a, b) => b.pri - a.pri)[0]; for (const s of sessions) s.slots = s.slots.filter((x) => x !== drop); changed = true; }
      } else if (total < lo) {
        const inc = [...slots].filter((x) => x.sets < MAX_SETS).sort((a, b) => a.sets - b.sets)[0];
        if (inc) { inc.sets++; changed = true; }
        else {
          const pats = Object.keys(PATTERNS).filter((p) => PATTERNS[p].g === g && hasCandidates(p));
          let best = null;
          for (const p of pats) for (const s of sessions) if (!s.slots.some((x) => x.p === p) && (!best || s.slots.length < best.s.slots.length)) best = { s, p };
          if (best) { best.s.slots.push({ p: best.p, pri: 3, main: false, sets: MIN_SETS, extra: true }); changed = true; }
          else { warnings.push(`range:${g}`); }
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * generatePlan({goal, days, equipment, experience, weeks, sessionMin?, seed?}, {exercises, ratios}) -> plan
 * ctx.exercises: library (+ custom) exercise records; ctx.ratios: calibration ratios by exercise id (optional).
 */
export function generatePlan(input, ctx, now = Date.now()) {
  ratioOf = ctx.ratios ?? null;
  const goal = GOALS.includes(input.goal) ? input.goal : 'hypertrophy';
  const experience = EXPERIENCE.includes(input.experience) ? input.experience : 'beginner';
  const days = Math.min(6, Math.max(2, Math.round(input.days ?? 3)));
  const weeks = PLAN_WEEKS.includes(input.weeks) ? input.weeks : 4;
  const equipment = (input.equipment?.length ? input.equipment : GYM_EQUIPMENT).filter((e) => GYM_EQUIPMENT.includes(e));
  const equipSet = new Set(equipment);
  const sessionMin = SESSION_MINUTES.includes(input.sessionMin) ? input.sessionMin : null;
  const seed = input.seed ?? now;
  const warnings = [];

  const sessions = SPLITS[days].map((type) => {
    const slots = [];
    for (const s of TEMPLATES[type].filter((x) => !x.only || x.only.includes(goal))) {
      if (candidates(s.p, ctx, equipSet).length) { slots.push({ ...s, sets: 0 }); continue; }
      // no exercise for this pattern with the chosen equipment: try another pattern of the same muscle group
      const alt = Object.keys(PATTERNS).find((p) => PATTERNS[p].g === PATTERNS[s.p].g && !slots.some((x) => x.p === p) && !TEMPLATES[type].some((x) => x.p === p) && candidates(p, ctx, equipSet).length);
      if (alt) slots.push({ ...s, p: alt, sets: 0 }); else warnings.push(`missing:${s.p}`);
    }
    return { type, slots };
  });
  if (sessionMin) {
    const cap = CAP[sessionMin];
    for (const s of sessions) while (s.slots.length > Math.max(4, cap)) { const drop = [...s.slots].sort((a, b) => b.pri - a.pri || b.sets - a.sets)[0]; s.slots = s.slots.filter((x) => x !== drop); }
  }
  for (const s of sessions) for (const sl of s.slots) sl.sets = repScheme(goal, sl).sets;
  balance(sessions, experience, ctx, equipSet, warnings);
  for (const s of sessions) s.slots.sort((a, b) => (a.extra ? 1 : 0) - (b.extra ? 1 : 0) || a.pri - b.pri);

  const out = [];
  for (let w = 1; w <= weeks; w++) {
    const deload = w === weeks;
    sessions.forEach((s, di) => {
      const used = new Set();
      const entries = [];
      s.slots.forEach((sl, si) => {
        const block = sl.main ? 0 : Math.floor((w - 1) / 3);
        const rng = mulberry32(hashSeed(`${seed}:${di}:${si}:${sl.p}:${block}`));
        const ex = pick(candidates(sl.p, ctx, equipSet), rng, used);
        if (!ex) return;
        used.add(ex.id);
        const rs = repScheme(goal, sl, ex);
        entries.push({
          exerciseId: ex.id, pattern: sl.p, main: sl.main, group: PATTERNS[sl.p].g,
          sets: deload ? Math.max(1, Math.round(sl.sets * 0.6)) : sl.sets, repsMin: rs.repsMin, repsMax: rs.repsMax,
          restSec: defaultRestSec(ex) + (goal === 'strength' && sl.main ? 60 : 0),
        });
      });
      out.push({ week: w, day: di + 1, type: s.type, deload, entries });
    });
  }
  return { id: uid(), schemaVersion: PLAN_VERSION, goal, daysPerWeek: days, equipment, experience, weeks, sessionMin, seed, createdMs: now, deloadWeek: weeks, days: out, warnings: [...new Set(warnings)], done: [] };
}

/** Working sets per muscle group in one week of a plan. */
export function weeklySets(plan, week = 1) {
  const t = {};
  for (const d of plan.days) if (d.week === week) for (const e of d.entries) t[e.group] = (t[e.group] ?? 0) + e.sets;
  return t;
}

export const planDayId = (plan, week, day) => `${plan.id}:${week}:${day}`;
export function nextPlanDay(plan) {
  return plan.days.find((d) => !plan.done.includes(planDayId(plan, d.week, d.day))) ?? null;
}
export function markPlanDone(plan, id) { if (!plan.done.includes(id)) plan.done.push(id); return plan; }
export const planProgress = (plan) => ({ done: plan.done.length, total: plan.days.length });

/** Preset workouts for the manual builder. Returns [{nameKey, slots:[pattern ids]}] resolved to entries by `templateRoutines`. */
export const ROUTINE_TEMPLATES = {
  ppl: [['push', TEMPLATES.push], ['pull', TEMPLATES.pull], ['legs', TEMPLATES.legs]],
  upperlower: [['upperA', TEMPLATES.upperA], ['lowerA', TEMPLATES.lowerA], ['upperB', TEMPLATES.upperB], ['lowerB', TEMPLATES.lowerB]],
  ab: [['fullA', TEMPLATES.fullA], ['fullB', TEMPLATES.fullB]],
  fullbody: [['fullA', TEMPLATES.fullA]],
  bro: [
    ['chest', ['hpress', 'ipress', 'fly', 'fly'].map((p, i) => S(p, i))], ['back', ['vpull', 'hrow', 'hrow', 'rear'].map((p, i) => S(p, i))],
    ['shoulders', ['vpress', 'lateral', 'rear', 'lateral'].map((p, i) => S(p, i))], ['arms', ['curl', 'triceps', 'curl', 'triceps'].map((p, i) => S(p, i))],
    ['legs', ['squat', 'hinge', 'lunge', 'legext', 'legcurl', 'calf'].map((p, i) => S(p, i))],
  ],
};

export function templateRoutines(templateId, ctx, { equipment = GYM_EQUIPMENT, seed = 1 } = {}) {
  ratioOf = ctx.ratios ?? null;
  const equipSet = new Set(equipment);
  return ROUTINE_TEMPLATES[templateId].map(([nameKey, slots], di) => {
    const used = new Set();
    const entries = [];
    slots.filter((s) => !s.only).forEach((sl, si) => {
      const ex = pick(candidates(sl.p, ctx, equipSet), mulberry32(hashSeed(`${seed}:${templateId}:${di}:${si}`)), used);
      if (!ex) return;
      used.add(ex.id);
      const iso = !PATTERNS[sl.p].compound;
      entries.push({ exerciseId: ex.id, sets: 3, repsMin: iso ? 10 : 8, repsMax: iso ? 15 : 12, restSec: defaultRestSec(ex) });
    });
    return { nameKey, entries };
  });
}
