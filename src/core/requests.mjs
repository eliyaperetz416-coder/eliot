// Requests for exercises that are missing from the library. Pure.
const URL_RE = /^https?:\/\/\S+$/i;

export function parseLinks(text) {
  return String(text ?? '').split(/\s+/).map((x) => x.trim()).filter((x) => URL_RE.test(x)).slice(0, 10);
}

export function buildRequest({ name, linksText, notes }, { id, now }) {
  const n = String(name ?? '').trim().slice(0, 80);
  const errors = {};
  if (!n) errors.name = true;
  const links = parseLinks(linksText);
  return { ok: !errors.name, errors, value: { id, createdMs: now, name: n, links, notes: String(notes ?? '').trim().slice(0, 500) } };
}

/** The message Elia pastes into the chat with Claude. */
export function requestsMessage(list, lang) {
  const he = lang === 'he';
  const head = he ? 'בקשה: להוסיף את התרגילים האלה לספרייה של Demigod' : 'Request: please add these exercises to the Demigod library';
  const lines = [head, ''];
  list.forEach((r, i) => {
    lines.push(`${i + 1}. ${he ? 'שם' : 'Name'}: ${r.name}`);
    if (r.links.length) lines.push(`   ${he ? 'סרטונים' : 'Videos'}: ${r.links.join(' , ')}`);
    if (r.notes) lines.push(`   ${he ? 'הערות' : 'Notes'}: ${r.notes}`);
  });
  return lines.join('\n');
}
