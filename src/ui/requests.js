import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, showToast } from './components.js';
import { store, saveRequests } from './store.js';
import { buildRequest, requestsMessage } from '../core/requests.mjs';
import { uid } from '../core/workout.mjs';
import { formatDate } from './format.js';

export function requestsScreen() {
  const root = h('main', { class: 'screen' });
  const form = { name: '', linksText: '', notes: '' };
  let attempted = false;
  function draw() {
    const res = buildRequest(form, { id: 'x', now: 0 });
    const name = h('input', { class: 'text-input', type: 'text', maxlength: 80, value: form.name, placeholder: t('req.name.ph'), 'aria-label': t('req.name'), id: 'req-name' });
    name.addEventListener('input', () => { form.name = name.value; });
    const links = h('textarea', { class: 'notes-input', rows: 3, dir: 'ltr', placeholder: t('req.links.ph'), 'aria-label': t('req.links'), id: 'req-links' }, form.linksText);
    links.addEventListener('input', () => { form.linksText = links.value; });
    const notes = h('textarea', { class: 'notes-input', rows: 2, placeholder: t('req.notes.ph'), 'aria-label': t('req.notes'), id: 'req-notes' }, form.notes);
    notes.addEventListener('input', () => { form.notes = notes.value; });
    const msg = store.requests.length ? requestsMessage(store.requests, getLanguage()) : '';
    const out = h('textarea', { class: 'notes-input', rows: 8, readonly: true, dir: 'auto', 'aria-label': t('req.message'), id: 'req-message' }, msg);
    root.replaceChildren(
      h('a', { class: 'back-link', href: '#/exercises' }, icon('chevron', 'chev back-chev'), t('exercises.back')),
      h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('req.title') })),
      h('p', { text: t('req.intro') }),
      h('p', { class: 'row-sub', text: t('req.honest') }),
      h('section', { class: 'card', style: 'margin-block-start:12px' },
        h('div', { class: 'stack' },
          h('div', { class: 'field' }, h('label', { for: 'req-name', text: t('req.name') }), h('div', { class: 'field-box' }, name), attempted && !res.ok ? h('p', { class: 'field-error', role: 'alert', text: t('req.err.name') }) : null),
          h('div', { class: 'field' }, h('label', { for: 'req-links', text: t('req.links') }), links, h('p', { class: 'row-sub', text: t('req.links.hint') })),
          h('div', { class: 'field' }, h('label', { for: 'req-notes', text: t('req.notes') }), notes),
          button({ label: t('req.add'), icon: 'plus', block: true, onClick: async () => {
            attempted = true;
            const r = buildRequest(form, { id: `req-${uid()}`, now: Date.now() });
            if (!r.ok) { draw(); return; }
            await saveRequests([...store.requests, r.value]);
            form.name = ''; form.linksText = ''; form.notes = ''; attempted = false;
            showToast({ message: t('req.added') }); draw();
          } }))),
      store.requests.length ? h('div', { class: 'section-label', text: t('req.list', { n: store.requests.length }) }) : null,
      ...store.requests.map((r) => h('section', { class: 'card req-card' },
        h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('div', { class: 'row-title', text: r.name }), h('div', { class: 'row-sub', text: `${formatDate(r.createdMs)} · ${t('req.videos', { n: r.links.length })}` })),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('req.delete'), onclick: async () => { await saveRequests(store.requests.filter((x) => x.id !== r.id)); draw(); } }, icon('trash'))))),
      store.requests.length ? h('div', { class: 'stack', style: 'padding-block-start:12px' },
        h('div', { class: 'section-label', text: t('req.message') }), out,
        button({ label: t('req.copy'), icon: 'share', block: true, onClick: async () => {
          try { await navigator.clipboard.writeText(msg); showToast({ message: t('req.copied') }); } catch { out.focus(); out.select(); showToast({ message: t('req.copyManual') }); }
        } }),
        h('p', { class: 'row-sub', text: t('req.next') })) : null);
  }
  draw();
  return root;
}
