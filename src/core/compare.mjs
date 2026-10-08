// "You lifted the weight of an elephant": fun comparisons for the total volume of a workout. OUR DESIGN. Pure.
// Typical adult weights, rounded. The picture is an emoji (see src/ui/post-ui.js).
export const COMPARISONS = Object.freeze([
  { id: 'cat', kg: 4, icon: '🐈' }, { id: 'dog', kg: 30, icon: '🐕' }, { id: 'panda', kg: 100, icon: '🐼' }, { id: 'lion', kg: 190, icon: '🦁' },
  { id: 'moto', kg: 250, icon: '🏍️' }, { id: 'horse', kg: 450, icon: '🐎' }, { id: 'cow', kg: 700, icon: '🐄' }, { id: 'car', kg: 1000, icon: '🚗' },
  { id: 'hippo', kg: 1500, icon: '🦛' }, { id: 'rhino', kg: 2300, icon: '🦏' }, { id: 'elephant', kg: 5000, icon: '🐘' }, { id: 'trex', kg: 8000, icon: '🦖' },
  { id: 'bus', kg: 12000, icon: '🚌' }, { id: 'humpback', kg: 30000, icon: '🐋' }, { id: 'bluewhale', kg: 150000, icon: '🐳' },
]);

/**
 * The biggest thing you matched or passed, how many of it, and the next one to reach.
 * null below the first comparison. next is null after the last one.
 */
export function compareVolume(kg) {
  const v = Number(kg);
  if (!Number.isFinite(v) || v < COMPARISONS[0].kg) return null;
  let i = 0;
  while (i + 1 < COMPARISONS.length && COMPARISONS[i + 1].kg <= v) i++;
  const item = COMPARISONS[i];
  const next = COMPARISONS[i + 1] ?? null;
  return { item, ratio: Math.round((v / item.kg) * 10) / 10, next, remaining: next ? Math.ceil(next.kg - v) : 0 };
}
