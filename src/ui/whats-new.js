// "What's new" (OUR DESIGN, Elia 27.11, launch day): a card behind the bell on Today for everyone, with a "details"
// button that explains the update; the same list is the last catch-up screen for a phone that moved its data to the
// account. The bell shows a dot until the details were seen once. NEWS_ID changes when there is something new again.
import { h } from './dom.js';
import { t } from '../core/i18n.mjs';
import { button, openSheet } from './components.js';
import { dbGet, dbPut } from './db.js';

export const NEWS_ID = '1.50';
const ITEMS = ['news.1', 'news.2', 'news.3', 'news.4', 'news.5', 'news.6', 'news.7', 'news.8'];
let seen = true;

/** Call once at start (before the first render). */
export async function loadNews() { seen = (await dbGet('kv', 'news-seen').catch(() => null)) === NEWS_ID; }
export const newsUnseen = () => !seen;
export function markNewsSeen() {
  if (seen) return;
  seen = true;
  dbPut('kv', NEWS_ID, 'news-seen').catch(() => {});
  document.querySelectorAll('.today-bell .bell-dot').forEach((d) => d.remove()); // the bell on Today, without a re-render
}

export function newsList() {
  return h('ol', { class: 'tour-list news-list' }, ITEMS.map((k, i) => h('li', {}, h('span', { class: 'tour-n display', text: String(i + 1) }), h('span', { text: t(k) }))));
}

export function openNewsSheet() {
  markNewsSeen();
  const sh = openSheet({ title: t('news.title'), tall: true, content: h('div', { class: 'stack' }, newsList(),
    button({ label: t('common.close'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
  return sh;
}

/** The card behind the bell. */
export function newsCard(close) {
  return h('section', { class: `card news-card${seen ? '' : ' card-accent'}` },
    h('div', { class: 'row-title', text: t('news.card.title') }),
    h('div', { class: 'row-sub', text: t('news.card.body') }),
    button({ label: t('news.more'), variant: 'secondary', block: true, onClick: () => { close(); openNewsSheet(); } }));
}
