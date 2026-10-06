// Custom exercise form: name, equipment, muscles (with live map), type, "count like", own photo.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { buildCustomExercise, fitSize, CUSTOM_TYPES, EQUIPMENT_IDS, PICKABLE_MUSCLES, countsLikeOptions } from '../core/custom.mjs';
import { button, openSheet, segmented, showToast } from './components.js';
import { data } from './data.js';
import { store, saveCustom, deleteCustom, customUsage } from './store.js';
import { muscleMap } from './muscle-map.js';
import { openExercisePicker } from './picker.js';
import { uid } from '../core/workout.mjs';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);

/** Photo -> blob with the longer side at most 800 px (WebP, or JPEG where WebP encoding is unavailable). */
export async function downscalePhoto(file, max = 800) {
  const bmp = await createImageBitmap(file);
  const { width, height } = fitSize(bmp.width, bmp.height, max);
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  c.getContext('2d').drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const toBlob = (type, q) => new Promise((res) => c.toBlob(res, type, q));
  let blob = await toBlob('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  return blob;
}

export function customFormScreen(id) {
  const d = data();
  const existing = id && id !== 'new' ? d.byId[id] : null;
  if (id && id !== 'new' && !existing?.custom) return h('main', { class: 'screen' }, h('a', { class: 'back-link', href: '#/exercises' }, icon('chevron', 'chev back-chev'), t('exercises.back')), h('p', { text: t('exercise.notfound') }));
  const f = { name: existing?.nameEn ?? '', equipment: existing?.equipment ?? 'machine', type: existing?.type ?? 'weight', primary: [...(existing?.primaryMuscles ?? [])], secondary: [...(existing?.secondaryMuscles ?? [])], countsLike: existing?.countsLike ?? null, notes: (existing?.instructionsEn ?? []).join('\n'), imageBlobId: existing?.imageBlobId ?? null };
  let newBlob = null, previewUrl = existing?.image || '';
  let attempted = false;
  const root = h('main', { class: 'screen' });
  const exId = existing?.id ?? `custom-${uid()}`;

  function draw() {
    const res = buildCustomExercise(f, d.byId, { id: exId });
    const err = (k, key) => (attempted && res.errors[k] ? h('p', { class: 'field-error', role: 'alert', text: t(key) }) : null);
    const name = h('input', { class: 'text-input', type: 'text', maxlength: 60, value: f.name, placeholder: t('custom.namePlaceholder'), 'aria-label': t('custom.name'), id: 'cx-name' });
    name.addEventListener('input', () => { f.name = name.value; });

    const roleOf = (m) => (f.primary.includes(m) ? 'primary' : f.secondary.includes(m) ? 'secondary' : null);
    const cycle = (m) => {
      const r = roleOf(m);
      f.primary = f.primary.filter((x) => x !== m); f.secondary = f.secondary.filter((x) => x !== m);
      if (!r) f.primary.push(m); else if (r === 'primary') f.secondary.push(m);
      draw();
    };
    const muscleChips = h('div', { class: 'chips-wrap' }, PICKABLE_MUSCLES.map((m) => h('button', { type: 'button', class: `chip chip-cycle ${roleOf(m) ? 'chip-' + roleOf(m) : ''}`, 'data-muscle': m, 'aria-pressed': String(!!roleOf(m)), onclick: () => cycle(m) }, t(`muscle.${m}`))));
    const preview = f.primary.length ? muscleMap({ muscles: d.muscles, exercise: { primaryMuscles: f.primary, secondaryMuscles: f.secondary } }) : h('p', { class: 'row-sub', text: t('custom.muscles.hint') });

    const rankable = f.type === 'weight' || f.type === 'bodyweight';
    const likeEx = f.countsLike ? d.byId[f.countsLike] : null;
    const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'cx-photo', 'aria-label': t('custom.photo') });
    file.addEventListener('change', async () => {
      const picked = file.files?.[0]; if (!picked) return;
      try { newBlob = await downscalePhoto(picked); f.imageBlobId = f.imageBlobId ?? `img-${uid()}`; previewUrl = URL.createObjectURL(newBlob); draw(); } catch { showToast({ message: t('custom.photo.error') }); }
    });

    root.replaceChildren(
      h('a', { class: 'back-link', href: existing ? `#/exercise/${existing.id}` : '#/exercises' }, icon('chevron', 'chev back-chev'), t('exercises.back')),
      h('h1', { class: 'ex-title', text: existing ? t('custom.edit') : t('custom.new') }),
      h('div', { class: 'stack', style: 'padding-block-start:12px' },
        h('div', { class: 'field' }, h('label', { for: 'cx-name', text: t('custom.name') }), h('div', { class: 'field-box' }, name), err('name', 'custom.err.name')),
        h('div', { class: 'field' }, h('label', { text: t('custom.equipment') }), h('div', { class: 'chips-wrap' }, EQUIPMENT_IDS.map((q) => h('button', { type: 'button', class: 'chip chip-select', 'aria-pressed': String(f.equipment === q), onclick: () => { f.equipment = q; draw(); } }, t(`equipment.${q}`))))),
        h('div', { class: 'field' }, h('label', { text: t('custom.type') }), segmented({ label: t('custom.type'), value: f.type, onChange: (v) => { f.type = v; if (!(v === 'weight' || v === 'bodyweight')) f.countsLike = null; draw(); }, options: CUSTOM_TYPES.map((v) => ({ value: v, label: t(`exercise.type.${v}`) })) })),
        h('div', { class: 'field' }, h('label', { text: t('custom.muscles') }), h('p', { class: 'row-sub', text: t('custom.muscles.help') }), muscleChips, err('primary', 'custom.err.primary')),
        preview,
        h('div', { class: 'field' }, h('label', { text: t('custom.countsLike') }),
          h('p', { class: 'row-sub', text: rankable ? t('custom.countsLike.help') : t('custom.countsLike.na') }),
          rankable ? h('div', { class: 'btn-pair' },
            button({ label: likeEx ? nameOf(likeEx) : t('custom.countsLike.choose'), variant: 'secondary', onClick: () => openExercisePicker({ title: t('custom.countsLike'), multi: false, ids: countsLikeOptions(d.exercises).map((e) => e.id), onPick: ([e]) => { f.countsLike = e.id; draw(); } }) }),
            likeEx ? button({ label: t('custom.countsLike.clear'), variant: 'ghost', onClick: () => { f.countsLike = null; draw(); } }) : null) : null,
          err('countsLike', 'custom.err.countsLike')),
        h('div', { class: 'field' }, h('label', { text: t('custom.photo') }),
          previewUrl ? h('img', { class: 'custom-photo', src: previewUrl, alt: t('custom.photo') }) : null,
          h('div', { class: 'btn-pair' }, h('label', { class: 'btn btn-secondary', for: 'cx-photo', role: 'button', tabindex: 0, text: previewUrl ? t('custom.photo.change') : t('custom.photo.choose') }), file,
            previewUrl ? button({ label: t('custom.photo.remove'), variant: 'ghost', onClick: () => { previewUrl = ''; newBlob = null; f.imageBlobId = null; draw(); } }) : null),
          h('p', { class: 'row-sub', text: t('custom.photo.hint') })),
        h('div', { class: 'field' }, h('label', { for: 'cx-notes', text: t('custom.notes') }), h('textarea', { class: 'notes-input', id: 'cx-notes', rows: 3, placeholder: t('custom.notes.ph'), oninput: (e) => { f.notes = e.target.value; } }, f.notes)),
        button({ label: t('common.save'), block: true, onClick: async () => {
          attempted = true;
          const r = buildCustomExercise(f, d.byId, { id: exId, now: existing?.createdMs ?? Date.now() });
          if (!r.ok) { draw(); return; }
          await saveCustom(r.exercise, newBlob);
          location.hash = `#/exercise/${r.exercise.id}`;
        } }),
        existing ? button({ label: t('common.delete'), variant: 'danger', block: true, onClick: () => {
          const use = customUsage(existing.id);
          const used = use.workouts + use.routines + use.plans > 0;
          const sh = openSheet({ title: t('custom.delete.title'), content: h('div', { class: 'stack' },
            h('p', { text: used ? t('custom.delete.used', use) : t('custom.delete.confirm') }),
            used ? null : button({ label: t('common.delete'), variant: 'danger', block: true, onClick: async () => { sh.close(); await deleteCustom(existing.id); location.hash = '#/exercises'; } }),
            button({ label: t('common.cancel'), variant: 'secondary', block: true, onClick: () => sh.close() })) });
        } }) : null));
  }
  draw();
  return root;
}
