import { h } from './dom.js';
import { icon } from './icons.js';
import { backLink } from './components.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { data } from './data.js';

/** **bold**, *italic*, `code` -> DOM nodes (no innerHTML). */
function inline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) out.push(h('strong', { text: m[1] }));
    else if (m[2] != null) out.push(h('code', { dir: 'ltr', text: m[2] }));
    else out.push(h('em', { text: m[3] }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function numbersScreen() {
  const sections = data().numbers[getLanguage()] ?? data().numbers.en;
  return h('main', { class: 'screen numbers' },
    backLink('#/profile', t('tab.profile')),
    h('header', { class: 'screen-head' }, icon('info', 'mark'), h('h1', { text: t('numbers.title') })),
    h('p', { class: 'row-sub', text: t('numbers.intro') }),
    ...sections.map((s, i) => h('details', { class: 'card', open: i === 0 }, h('summary', { text: s.title.replace(/`/g, '') }),
      ...s.blocks.map((b) => (b.type === 'ul' ? h('ul', { class: 'numbers-list' }, ...b.items.map((i) => h('li', {}, ...inline(i)))) : h('p', {}, ...inline(b.text)))))));
}
