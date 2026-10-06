// Static data, fetched once and cached (also precached by the service worker).
let cache = null;
export async function loadData() {
  if (cache) return cache;
  const get = (p) => fetch(p).then((r) => r.json());
  const [ex, cal, muscles] = await Promise.all([get('src/data/exercises.json'), get('src/data/calibration.json'), get('src/data/muscles.json')]);
  cache = { exercises: ex.exercises, byId: Object.fromEntries(ex.exercises.map((e) => [e.id, e])), families: cal.families, ratios: cal.ratios, muscles };
  return cache;
}
export const data = () => cache;

/** Custom exercises live next to the library: same lists, same lookups. imageUrl is an object URL made from the stored photo. */
export function registerCustom(ex, imageUrl = '') {
  const d = cache;
  const rec = { ...ex, image: imageUrl, image2: '' };
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
