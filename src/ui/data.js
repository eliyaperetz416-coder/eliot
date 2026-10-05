// Static data, fetched once and cached (also precached by the service worker).
let cache = null;
export async function loadData() {
  if (cache) return cache;
  const get = (p) => fetch(p).then((r) => r.json());
  const [ex, cal, muscles] = await Promise.all([get('src/data/exercises.json'), get('src/data/calibration.json'), get('src/data/muscles.json')]);
  cache = { exercises: ex.exercises, byId: Object.fromEntries(ex.exercises.map((e) => [e.id, e])), families: cal.families, muscles };
  return cache;
}
export const data = () => cache;
