// Backup file format, validation and merge rules. Pure: no DOM, no storage (see src/ui/backup.js).
export const BACKUP_FORMAT = 'demigod-backup';
export const BACKUP_VERSION = 1;
export const EXPORT_REMINDER_DAYS = 28; // OUR DESIGN: nag after 4 weeks without a backup
const DAY = 86400000;

/** cyrb53: small, fast, non-cryptographic hash. It only detects damaged or hand-edited files. */
export function checksum(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export const EMPTY_DATA = Object.freeze({ profile: null, bodyweight: [], workouts: [], routines: [], folders: [], plans: [], custom: [], blobs: {}, game: null, settings: {}, renames: {}, requests: [], bases: {}, model: null, schedule: null });
const ARRAYS = ['bodyweight', 'workouts', 'routines', 'folders', 'plans', 'custom', 'requests'];

export function buildBackup({ data, appVersion, now }) {
  const d = { ...EMPTY_DATA, ...data };
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_VERSION, appVersion, exportedAt: now, checksum: checksum(JSON.stringify(d)), data: d };
}

/** Returns { ok: true, backup } or { ok: false, error } with error one of: json, format, newer, checksum, shape. */
export function validateBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch { return { ok: false, error: 'json' }; }
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT || !b.data || typeof b.data !== 'object') return { ok: false, error: 'format' };
  if (!Number.isInteger(b.schemaVersion) || b.schemaVersion < 1) return { ok: false, error: 'format' };
  if (b.schemaVersion > BACKUP_VERSION) return { ok: false, error: 'newer' };
  if (b.checksum !== checksum(JSON.stringify(b.data))) return { ok: false, error: 'checksum' };
  const d = b.data;
  for (const k of ARRAYS) if (d[k] != null && !Array.isArray(d[k])) return { ok: false, error: 'shape' };
  if (d.blobs != null && (typeof d.blobs !== 'object' || Array.isArray(d.blobs))) return { ok: false, error: 'shape' };
  for (const k of ['renames', 'bases']) if (d[k] != null && (typeof d[k] !== 'object' || Array.isArray(d[k]))) return { ok: false, error: 'shape' };
  if (d.profile != null && typeof d.profile !== 'object') return { ok: false, error: 'shape' };
  if (d.model != null && (typeof d.model !== 'object' || Array.isArray(d.model))) return { ok: false, error: 'shape' };
  for (const w of d.workouts ?? []) if (!w || typeof w.id !== 'string' || !Number.isFinite(w.startedMs)) return { ok: false, error: 'shape' };
  for (const k of ['routines', 'folders', 'plans', 'custom', 'requests']) for (const x of d[k] ?? []) if (!x || typeof x.id !== 'string') return { ok: false, error: 'shape' };
  for (const e of d.bodyweight ?? []) if (!e || typeof e.dateKeyTime !== 'string') return { ok: false, error: 'shape' };
  return { ok: true, backup: { ...b, data: { ...EMPTY_DATA, ...d, blobs: d.blobs ?? {}, settings: d.settings ?? {}, renames: d.renames ?? {}, requests: d.requests ?? [], bases: d.bases ?? {} } } };
}

export function summarize(data) {
  const d = { ...EMPTY_DATA, ...data };
  return { workouts: d.workouts.length, sets: d.workouts.reduce((n, w) => n + (w.stats?.workingSets ?? 0), 0), routines: d.routines.length, plans: d.plans.length, custom: d.custom.length, bodyweight: d.bodyweight.length };
}

const union = (cur, inc, key) => { const seen = new Set(cur.map(key)); return [...cur, ...inc.filter((x) => !seen.has(key(x)))]; };

/**
 * Merge keeps everything you already have and adds what is missing (matched by id).
 * Profile, game progress and settings stay as they are on this phone, except achievements (union) and the
 * best rank reached (max). If this phone has no workouts yet, the backup's profile and game are taken as they are.
 */
export function mergeData(cur, inc) {
  const c = { ...EMPTY_DATA, ...cur };
  const i = { ...EMPTY_DATA, ...inc };
  const fresh = c.workouts.length === 0;
  const out = {
    ...c,
    workouts: union(c.workouts, i.workouts, (w) => w.id),
    bodyweight: union(c.bodyweight, i.bodyweight, (e) => e.dateKeyTime),
    routines: union(c.routines, i.routines, (x) => x.id),
    folders: union(c.folders, i.folders, (x) => x.id),
    plans: union(c.plans, i.plans, (x) => x.id),
    custom: union(c.custom, i.custom, (x) => x.id),
    blobs: { ...i.blobs, ...c.blobs },
    renames: { ...i.renames, ...c.renames },
    bases: { ...i.bases, ...c.bases },
    requests: union(c.requests, i.requests, (x) => x.id),
    model: c.model ?? i.model ?? null, // the one on this phone wins
    schedule: Object.keys(c.schedule?.days ?? {}).length ? c.schedule : (i.schedule ?? c.schedule ?? null),
  };
  if (fresh || !c.profile) out.profile = i.profile ?? c.profile;
  if (fresh || !c.game) out.game = i.game ?? c.game;
  else if (i.game) {
    out.game = { ...c.game, achievements: { unlocked: { ...(i.game.achievements?.unlocked ?? {}), ...(c.game.achievements?.unlocked ?? {}) } }, maxRankIndex: Math.max(c.game.maxRankIndex ?? -1, i.game.maxRankIndex ?? -1) };
  }
  return out;
}

export function daysSince(ms, now) { return ms == null ? null : Math.max(0, Math.floor((now - ms) / DAY)); }

/** True when there is something worth saving and the last backup (or the first workout) is 4+ weeks old. */
export function exportDue({ lastExportAt, workouts, snoozedUntil = null, now }) {
  if (!workouts.length) return false;
  if (snoozedUntil != null && now < snoozedUntil) return false;
  const ref = lastExportAt ?? Math.min(...workouts.map((w) => w.startedMs));
  return now - ref >= EXPORT_REMINDER_DAYS * DAY;
}
