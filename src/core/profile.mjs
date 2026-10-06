// Profile + onboarding validation. Pure.
export const PROFILE_VERSION = 1;
export const WEIGHT_MIN = 25, WEIGHT_MAX = 350, AGE_MIN = 10, AGE_MAX = 100;

export const parseNumber = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
};

/** Returns { ok, errors: {name?, sex?, weight?, age?}, value } . Age is optional and is NOT used in any calculation. */
export function validateProfile({ name, sex, weight, age }) {
  const errors = {};
  const n = String(name ?? '').trim();
  if (!n) errors.name = 'name';
  if (sex !== 'm' && sex !== 'f') errors.sex = 'sex';
  const w = parseNumber(weight);
  if (w == null || w < WEIGHT_MIN || w > WEIGHT_MAX) errors.weight = 'weight';
  const a = parseNumber(age);
  if (String(age ?? '').trim() !== '' && (a == null || !Number.isInteger(a) || a < AGE_MIN || a > AGE_MAX)) errors.age = 'age';
  return {
    ok: Object.keys(errors).length === 0, errors,
    value: { name: n.slice(0, 40), sex, weight: w == null ? null : Math.round(w * 10) / 10, age: a },
  };
}

export function makeProfile({ name, sex, age, lang }, now = Date.now()) {
  return { id: 'me', name, sex, age: age ?? null, lang, createdAt: new Date(now).toISOString(), schemaVersion: PROFILE_VERSION };
}

export function bodyweightEntry(kg, now = Date.now()) {
  const d = new Date(now);
  const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dateKeyTime: `${dateKey}T${String(now).padStart(14, '0')}`, dateKey, at: new Date(now).toISOString(), ms: now, kg };
}

/** Latest bodyweight (kg) from the log, or null. */
export const latestBodyweight = (log) => (log.length ? [...log].sort((a, b) => a.ms - b.ms)[log.length - 1].kg : null);
