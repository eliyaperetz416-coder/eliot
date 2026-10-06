// Static data, fetched once and cached (also precached by the service worker).
let cache = null;
export async function loadData() {
  if (cache) return cache;
  const get = (p) => fetch(p).then((r) => r.json());
  const [ex, cal, muscles, quests, shop, achievements, numbers] = await Promise.all([get('src/data/exercises.json'), get('src/data/calibration.json'), get('src/data/muscles.json'), get('src/data/quests.json'), get('src/data/shop.json'), get('src/data/achievements.json'), get('src/data/numbers.json')]);
  cache = { exercises: ex.exercises, byId: Object.fromEntries(ex.exercises.map((e) => [e.id, e])), families: cal.families, ratios: cal.ratios, muscles, quests, shop, achievements, numbers };
  return cache;
}
export const data = () => cache;

/** Custom exercises live next to the library: same lists, same lookups. imageUrl is an object URL made from the stored photo. */
export function registerCustom(ex, imageUrl = '') {
  const d = cache;
  const rec = { ...ex, image: imageUrl, image2: '' };
  applyName(rec);
  const i = d.exercises.findIndex((e) => e.id === ex.id);
  if (i >= 0) d.exercises[i] = rec; else d.exercises.push(rec);
  d.byId[ex.id] = rec;
  return rec;
}
export function unregisterCustom(id) {
  const d = cache;
  d.exercises = d.exercises.filter((e) => e.id !== id);
  delete d.byId[id];
}

/** Own names for exercises (OUR DESIGN): per language, kept next to the original so it can be reset. { id: { he?, en? } } */
export const renames = {};
function applyName(ex) {
  ex.origNameHe ??= ex.nameHe; ex.origNameEn ??= ex.nameEn;
  const r = renames[ex.id];
  ex.nameHe = r?.he || ex.origNameHe;
  ex.nameEn = r?.en || ex.origNameEn;
}
export function setRenames(obj) {
  for (const k of Object.keys(renames)) delete renames[k];
  Object.assign(renames, obj ?? {});
  cache?.exercises.forEach(applyName);
}
/** name '' resets that language to the original name. Returns the new renames object. */
export function renameExercise(id, lang, name) {
  const r = { ...renames[id] };
  const v = String(name ?? '').trim().slice(0, 60);
  if (v) r[lang] = v; else delete r[lang];
  if (!r.he && !r.en) delete renames[id]; else renames[id] = r;
  if (cache?.byId[id]) applyName(cache.byId[id]);
  return { ...renames };
}
