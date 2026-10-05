// Pure i18n: dictionaries per language, t(key, params) with plural rules. No DOM.
export const LANGS = ['he', 'en'];
export const DEFAULT_LANG = 'en';
export const DIR = { he: 'rtl', en: 'ltr' };

let dicts = {};
let lang = DEFAULT_LANG;
let rules = new Intl.PluralRules(lang);

export function setDictionaries(d) { dicts = d; }
export function getLanguage() { return lang; }
export function setLanguage(l) {
  if (!LANGS.includes(l)) throw new Error(`Unsupported language: ${l}`);
  lang = l;
  rules = new Intl.PluralRules(l);
}
export function detectLanguage(navLang = '') {
  return String(navLang).toLowerCase().startsWith('he') ? 'he' : 'en';
}

function format(str, params) {
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

/** t('key') | t('key', {n: 3}). Plural entries are objects {one, two?, other}, chosen by params.n. */
export function t(key, params = {}) {
  let v = dicts[lang]?.[key];
  if (v === undefined) v = dicts[DEFAULT_LANG]?.[key];
  if (v === undefined) return key;
  if (typeof v === 'object') {
    const cat = rules.select(Number(params.n ?? 0));
    v = v[cat] ?? v.other ?? key;
  }
  return format(v, params);
}
