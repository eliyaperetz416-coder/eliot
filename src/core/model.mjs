// "My role model": a person you train towards. You type their name and links yourself; nothing is fetched from them.
// OUR DESIGN. Pure: no DOM, no storage (see src/ui/model.js).

export const MODEL_LIMITS = Object.freeze({ name: 40, note: 140 });
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
  return { ok: true, model: { name, note, links, photoBlobId: input?.photoBlobId ?? null, updatedMs: now } };
}
