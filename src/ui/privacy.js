import { h } from './dom.js';
import { icon } from './icons.js';
import { backLink } from './components.js';
import { t } from '../core/i18n.mjs';

/** The privacy page (#/privacy). Texts live in the dictionaries as privacy.sN.t (title) and privacy.sN.b (body);
 *  a body line that starts with "- " becomes a list item. It describes what the server really stores (supabase/migrations). */
const SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6'];

function body(text) {
  const out = [];
  let ul = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      if (!ul) { ul = h('ul', { class: 'numbers-list' }); out.push(ul); }
      ul.append(h('li', { text: line.slice(2) }));
    } else if (line.trim()) {
      ul = null;
      out.push(h('p', { text: line }));
    }
  }
  return out;
}

export function privacyScreen() {
  return h('main', { class: 'screen numbers' },
    backLink('#/settings', t('set.title')),
    h('header', { class: 'screen-head' }, icon('shield', 'mark'), h('h1', { text: t('privacy.title') })),
    h('p', { class: 'row-sub', text: t('privacy.updated') }),
    ...SECTIONS.map((s, i) => h('details', { class: 'card', open: i === 0 }, h('summary', { text: t(`privacy.${s}.t`) }), ...body(t(`privacy.${s}.b`)))));
}
