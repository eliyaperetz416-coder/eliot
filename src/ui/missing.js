// "I can't find my exercise": make it yourself right now, or send a request that Claude adds properly in an update.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { list, listRow, openSheet } from './components.js';

export function openMissingSheet(onGo) {
  const go = (hash) => { sh.close(); onGo?.(); location.hash = hash; };
  const sh = openSheet({ title: t('missing.title'), content: h('div', { class: 'stack' },
    h('p', { class: 'row-sub', text: t('missing.body') }),
    list([
      listRow({ title: t('missing.now'), sub: t('missing.now.sub'), icon: 'plus', onClick: () => go('#/custom/new') }),
      listRow({ title: t('missing.ask'), sub: t('missing.ask.sub'), icon: 'info', onClick: () => go('#/requests') }),
    ])) });
}
