// Exercise search: Hebrew + English, tolerant of spelling (niqqud, final letters, spaces, vowel letters, one typo).
const FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/[̀-֑ͯ-ׇ]/g, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINAL[c])
    .replace(/[׳'`´’"״]/g, '')
    .replace(/[^a-z0-9א-ת]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}
/** Hebrew "skeleton": drops vowel letters so כתיב חסר/מלא match (דדליפט/דדליפט, סקוואט/סקוואט/סקווט). */
export const skeleton = (s) => s.replace(/[וי]/g, '');

export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tokenScore(q, hay) {
  // hay: { text, compact, skel, tokens }
  if (hay.text.includes(q)) return hay.tokens.some((t) => t.startsWith(q)) ? 4 : 3;
  const qs = skeleton(q);
  if (qs.length >= 2 && hay.skel.includes(qs)) return 2.5;
  if (q.length >= 3 && hay.compact.includes(q.replace(/ /g, ''))) return 2;
  if (q.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    for (const t of hay.tokens) {
      if (editDistance(q, t.slice(0, q.length), max) <= max || editDistance(q, t, max) <= max) return 1;
      if (editDistance(skeleton(q), skeleton(t), max) <= max && skeleton(q).length >= 3) return 1;
    }
  }
  return 0;
}

export function buildHaystack(...texts) {
  const text = normalize(texts.join(' '));
  const tokens = text.split(' ').filter(Boolean);
  return { text, tokens, compact: text.replace(/ /g, ''), skel: skeleton(text) };
}

/** Returns exercises matching all query words, best first. `haystackOf(ex)` => array of strings to search. */
export function searchExercises(list, query, haystackOf) {
  const q = normalize(query);
  if (!q) return list;
  const words = q.split(' ');
  const scored = [];
  for (const ex of list) {
    const hay = buildHaystack(...haystackOf(ex));
    let total = 0;
    for (const w of words) {
      const s = tokenScore(w, hay);
      if (!s) { total = 0; break; }
      total += s;
    }
    if (total) scored.push([total, ex]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, ex]) => ex);
}
