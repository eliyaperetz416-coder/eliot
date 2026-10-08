// "My role model" screen and the Today card. You type the name and links yourself; the photo comes from your own gallery
// and stays on this phone. Nothing is fetched from the person's channels. OUR DESIGN.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { button, backLink, showToast } from './components.js';
import { store, saveModel, clearModel, saveRoutine } from './store.js';
import { data } from './data.js';
import { parseWorkoutText, matchWorkout } from '../core/importwork.mjs';
import { newRoutine } from '../core/routines.mjs';
import { cleanModel, cleanTips, tipOfDay, MODEL_LINKS, MODEL_LIMITS } from '../core/model.mjs';
import { dayNumber } from '../core/streak.mjs';
import { weekKeys } from '../core/calendar.mjs';
import { todayKey } from './store.js';
import { getLanguage } from '../core/i18n.mjs';
import { downscalePhoto } from './custom.js';

/** Workouts done this week (same week as the row on Today). */
export function weekCount() {
  const keys = new Set(weekKeys(todayKey(), getLanguage() === 'he' ? 0 : 1));
  return store.workouts.filter((w) => keys.has(w.dateKey)).length;
}

const LINK_LABEL = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };

/** Card on Today. null when no role model is set. */
export function modelCard() {
  const m = store.model;
  if (!m) return null;
  const tip = tipOfDay(m.tips, dayNumber(todayKey()));
  const links = Object.keys(MODEL_LINKS).filter((k) => m.links?.[k]).map((k) =>
    h('a', { class: 'chip chip-select model-link', href: m.links[k], target: '_blank', rel: 'noopener noreferrer' }, LINK_LABEL[k]));
  return h('section', { class: `card model-card${store.modelPhotoUrl ? ' has-photo' : ''}` },
    store.modelPhotoUrl ? h('img', { class: 'model-photo', src: store.modelPhotoUrl, alt: '' }) : null,
    h('div', { class: 'model-body' },
      h('div', { class: 'model-kicker', text: t('model.kicker') }),
      h('a', { class: 'model-name', href: '#/model', text: m.name }),
      m.note ? h('p', { class: 'model-note', dir: 'auto', text: m.note }) : null,
      m.weeklyGoal ? goalBar(m) : null,
      tip ? h('div', { class: 'model-tip' }, h('span', { class: 'model-tip-label', text: t('model.tip') }), h('p', { dir: 'auto', text: tip })) : null,
      links.length ? h('div', { class: 'model-links' }, links) : null));
}

function goalBar(m) {
  const n = weekCount(), pct = Math.min(100, Math.round((n / m.weeklyGoal) * 100));
  return h('div', { class: 'model-goal' },
    h('div', { class: 'model-goal-top' }, h('span', { text: t('model.goal.line', { name: m.name }) }), h('b', { class: 'num', dir: 'ltr', text: `${n} / ${m.weeklyGoal}` })),
    h('div', { class: 'lp', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': m.weeklyGoal, 'aria-valuenow': Math.min(n, m.weeklyGoal), 'aria-label': t('model.goal.line', { name: m.name }) }, h('span', { class: 'lp-fill', style: `width:${pct}%` })));
}

/** One line on the workout result screen: your model's words for you. null without a model. */
export function modelQuote() {
  const m = store.model;
  if (!m) return null;
  const tip = tipOfDay(m.tips, dayNumber(todayKey()) + 1) ?? m.note;
  return h('section', { class: 'card model-quote' }, h('div', { class: 'model-kicker', text: m.name }), tip ? h('p', { dir: 'auto', text: tip }) : h('p', { text: t('model.quote.default', { name: m.name }) }));
}

/** Paste the exercises from one of your model's videos and get a saved workout. */
function importBox() {
  const name = store.model?.name ?? '';
  const box = h('textarea', { class: 'notes-input', rows: 7, id: 'model-import', placeholder: t('model.import.ph'), 'aria-label': t('model.import') });
  const out = h('div', { class: 'stack', 'aria-live': 'polite' });
  const go = async () => {
    const parsed = parseWorkoutText(box.value);
    const hay = (ex) => { const f = data().families[ex.family]; return [ex.nameEn, ex.nameHe, f?.nameEn, f?.nameHe, ...(ex.aliases ?? [])]; };
    const r = matchWorkout(parsed, data().exercises, hay);
    if (!r.entries.length) { out.replaceChildren(h('p', { class: 'field-error', role: 'alert', text: t('model.import.none') })); return; }
    const routine = newRoutine({ name: `${name ? `${name}: ` : ''}${parsed.name || t('model.import.default')}`.slice(0, 60) });
    routine.entries = r.entries;
    await saveRoutine(routine);
    box.value = '';
    out.replaceChildren(
      h('p', { text: t('model.import.done', { n: r.entries.length, name: routine.name }) }),
      r.unmatched.length ? h('div', { class: 'card' }, h('div', { class: 'row-title', text: t('model.import.missing', { n: r.unmatched.length }) }), h('ul', { class: 'numbers-list' }, r.unmatched.map((x) => h('li', { text: x }))), h('a', { class: 'btn btn-secondary btn-block', href: '#/requests' }, t('model.import.request'))) : null,
      h('a', { class: 'btn btn-primary btn-block', href: `#/routine/${routine.id}` }, t('model.import.open')));
  };
  return h('div', { class: 'stack' }, h('p', { class: 'row-sub', text: t('model.import.hint') }), box, button({ label: t('model.import.go'), variant: 'secondary', block: true, onClick: go }), out);
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
  const tipsBox = h('textarea', { class: 'notes-input', rows: 5, id: 'model-tips', placeholder: t('model.tips.ph'), 'aria-label': t('model.tips') }, (m.tips ?? []).join('\n'));
  let goal = m.weeklyGoal ?? 0;
  const goalBox = h('div', { class: 'chips-wrap' });
  const drawGoal = () => goalBox.replaceChildren(...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => h('button', { class: 'chip chip-select', type: 'button', 'aria-pressed': String(goal === n), onclick: () => { goal = n; drawGoal(); } }, n === 0 ? t('model.goal.none') : String(n))));
  drawGoal();
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
    const r = cleanModel({ name: name.input.value, note: note.input.value, links: Object.fromEntries(Object.entries(links).map(([k, f]) => [k, f.input.value])), tips: tipsBox.value, weeklyGoal: goal, photoBlobId: store.model?.photoBlobId ?? null });
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
      h('div', { class: 'section-label', text: t('model.tips') }), h('p', { class: 'row-sub', text: t('model.tips.hint') }), tipsBox,
      h('div', { class: 'section-label', text: t('model.goal') }), h('p', { class: 'row-sub', text: t('model.goal.hint') }), goalBox,
      h('div', { class: 'section-label', text: t('model.import') }), importBox(),
      h('div', { class: 'section-label', text: t('model.photo') }),
      h('p', { class: 'row-sub', text: t('model.photo.hint') }),
      fileInput, photoBox,
      button({ label: t('common.save'), block: true, onClick: save }),
      store.model ? button({ label: t('model.remove'), variant: 'danger', block: true, onClick: async () => { await clearModel(); showToast({ message: t('model.removed') }); location.hash = '#/profile'; } }) : null));
  return root;
}
