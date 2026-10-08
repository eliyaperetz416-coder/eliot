// "My role model" screen and the Today card. You type the name and links yourself; the photo comes from your own gallery
// and stays on this phone. Nothing is fetched from the person's channels. OUR DESIGN.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { button, backLink, showToast } from './components.js';
import { store, saveModel, clearModel } from './store.js';
import { cleanModel, MODEL_LINKS, MODEL_LIMITS } from '../core/model.mjs';
import { downscalePhoto } from './custom.js';

const LINK_LABEL = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };

/** Card on Today. null when no role model is set. */
export function modelCard() {
  const m = store.model;
  if (!m) return null;
  const links = Object.keys(MODEL_LINKS).filter((k) => m.links?.[k]).map((k) =>
    h('a', { class: 'chip chip-select model-link', href: m.links[k], target: '_blank', rel: 'noopener noreferrer' }, LINK_LABEL[k]));
  return h('section', { class: `card model-card${store.modelPhotoUrl ? ' has-photo' : ''}` },
    store.modelPhotoUrl ? h('img', { class: 'model-photo', src: store.modelPhotoUrl, alt: '' }) : null,
    h('div', { class: 'model-body' },
      h('div', { class: 'model-kicker', text: t('model.kicker') }),
      h('a', { class: 'model-name', href: '#/model', text: m.name }),
      m.note ? h('p', { class: 'model-note', dir: 'auto', text: m.note }) : null,
      links.length ? h('div', { class: 'model-links' }, links) : null));
}

export function modelScreen() {
  const root = h('main', { class: 'screen' });
  const m = store.model ?? { name: '', note: '', links: {} };
  let photo; // undefined = keep, Blob = new, null = remove
  let preview = store.modelPhotoUrl;
  const field = (id, label, value, attrs = {}) => {
    const input = h('input', { class: 'text-input', type: 'text', id, value: value ?? '', autocomplete: 'off', ...attrs });
    return { input, el: h('div', { class: 'field' }, h('label', { for: id, text: label }), h('div', { class: 'field-box' }, input), h('p', { class: 'field-error', role: 'alert', hidden: true })) };
  };
  const name = field('model-name', t('model.name'), m.name, { maxlength: MODEL_LIMITS.name, placeholder: t('model.name.ph') });
  const note = field('model-note', t('model.note'), m.note, { maxlength: MODEL_LIMITS.note, placeholder: t('model.note.ph') });
  const links = Object.fromEntries(Object.keys(MODEL_LINKS).map((k) => [k, field(`model-${k}`, LINK_LABEL[k], m.links?.[k], { type: 'url', inputmode: 'url', dir: 'ltr', placeholder: `https://${MODEL_LINKS[k][0]}/…` })]));
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': t('model.photo') });
  const photoBox = h('div', { class: 'model-photo-box' });
  const drawPhoto = () => photoBox.replaceChildren(
    preview ? h('img', { class: 'model-photo-preview', src: preview, alt: '' }) : null,
    h('div', { class: 'btn-pair' },
      button({ label: preview ? t('model.photo.change') : t('model.photo.add'), variant: 'secondary', icon: 'upload', onClick: () => fileInput.click() }),
      preview ? button({ label: t('model.photo.remove'), variant: 'ghost', onClick: () => { photo = null; preview = ''; drawPhoto(); } }) : null));
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0]; fileInput.value = '';
    if (!f) return;
    try { photo = await downscalePhoto(f, 900); preview = URL.createObjectURL(photo); drawPhoto(); } catch { showToast({ message: t('custom.photo.error') }); }
  });
  drawPhoto();
  const showErr = (f, key) => { const e = f.el.querySelector('.field-error'); e.textContent = key ? t(key) : ''; e.hidden = !key; };
  const save = async () => {
    const r = cleanModel({ name: name.input.value, note: note.input.value, links: Object.fromEntries(Object.entries(links).map(([k, f]) => [k, f.input.value])), photoBlobId: store.model?.photoBlobId ?? null });
    showErr(name, r.errors?.name ? 'model.err.name' : null);
    for (const [k, f] of Object.entries(links)) showErr(f, r.errors?.[k] ? 'model.err.link' : null);
    if (!r.ok) return;
    await saveModel(r.model, photo);
    showToast({ message: t('model.saved') });
    location.hash = '#/workout';
  };
  root.append(
    backLink('#/profile', t('tab.profile')),
    h('header', { class: 'screen-head' }, icon('trophy', 'mark'), h('h1', { text: t('model.title') })),
    h('p', { class: 'row-sub', text: t('model.intro') }),
    h('div', { class: 'stack', style: 'padding-block-start:12px' },
      name.el, note.el,
      h('div', { class: 'section-label', text: t('model.links') }),
      ...Object.values(links).map((f) => f.el),
      h('div', { class: 'section-label', text: t('model.photo') }),
      h('p', { class: 'row-sub', text: t('model.photo.hint') }),
      fileInput, photoBox,
      button({ label: t('common.save'), block: true, onClick: save }),
      store.model ? button({ label: t('model.remove'), variant: 'danger', block: true, onClick: async () => { await clearModel(); showToast({ message: t('model.removed') }); location.hash = '#/profile'; } }) : null));
  return root;
}
