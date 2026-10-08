// "My role model": a person you train towards. You type their name and links yourself; nothing is fetched from them.
// OUR DESIGN. Pure: no DOM, no storage (see src/ui/model.js).

export const MODEL_LIMITS = Object.freeze({ name: 40, note: 140, tip: 140, tips: 20, goalMax: 7 });
export const MODEL_LINKS = Object.freeze({
  youtube: ['youtube.com', 'youtu.be'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
});

/** Keeps only a https link on the right site, without tracking parameters. '' when empty, null when not valid. */
export function cleanLink(kind, raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  if (!MODEL_LINKS[kind].some((d) => host === d || host.endsWith(`.${d}`))) return null;
  return `https://${u.hostname.toLowerCase()}${u.pathname}`.replace(/\/+$/, '');
}

/** { ok: true, model } or { ok: false, errors: { field: 'required' | 'link' } }. */
export function cleanModel(input, now = Date.now()) {
  const name = String(input?.name ?? '').trim().slice(0, MODEL_LIMITS.name);
  const note = String(input?.note ?? '').trim().slice(0, MODEL_LIMITS.note);
  const errors = {};
  if (!name) errors.name = 'required';
  const links = {};
  for (const k of Object.keys(MODEL_LINKS)) {
    const v = cleanLink(k, input?.links?.[k]);
    if (v === null) errors[k] = 'link';
    else if (v) links[k] = v;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const tips = cleanTips(input?.tips);
  const g = Math.round(Number(input?.weeklyGoal));
  const weeklyGoal = Number.isFinite(g) ? Math.min(MODEL_LIMITS.goalMax, Math.max(0, g)) : 0;
  return { ok: true, model: { name, note, links, tips, weeklyGoal, photoBlobId: input?.photoBlobId ?? null, updatedMs: now } };
}

/** Tips you typed from your model's videos: one per line (or an array), trimmed, no empties or duplicates, at most 20. */
export function cleanTips(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/\r?\n/);
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const tip = String(x ?? '').trim().replace(/\s+/g, ' ').slice(0, MODEL_LIMITS.tip);
    if (tip && !seen.has(tip)) { seen.add(tip); out.push(tip); }
    if (out.length >= MODEL_LIMITS.tips) break;
  }
  return out;
}

/** The tip for a day: they rotate through your list, one per day. null when there are none. */
export function tipOfDay(tips, dayNumber) {
  return tips?.length ? tips[((dayNumber % tips.length) + tips.length) % tips.length] : null;
}
