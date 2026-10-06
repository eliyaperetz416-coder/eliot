import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, numberField, segmented } from './components.js';
import { pickBackupFile } from './settings.js';
import { emblem } from './emblem.js';
import { validateProfile, makeProfile } from '../core/profile.mjs';

/** 3 steps: language -> you (name, curve, age, bodyweight) -> how ranks work. onLanguage(lang) switches the app language. */
export function onboarding({ onLanguage, onDone }) {
  const form = { name: '', sex: null, age: '', weight: '' };
  let step = 0;
  let attempted = false;
  const root = h('main', { class: 'screen onboarding' });

  const dots = () => h('div', { class: 'ob-dots', role: 'presentation' }, [0, 1, 2].map((i) => h('span', { class: `ob-dot${i === step ? ' on' : ''}${i < step ? ' done' : ''}` })));
  const mark = () => h('div', { class: 'ob-mark' }, icon('bolt'));

  function render() {
    root.replaceChildren(dots(), [stepLang, stepYou, stepTour][step]());
    root.scrollTo?.(0, 0); window.scrollTo(0, 0);
  }

  function stepLang() {
    const opt = (lang, label) => h('button', { type: 'button', class: 'lang-card', lang, 'aria-pressed': String(getLanguage() === lang), onclick: () => { onLanguage(lang); render(); } },
      h('span', { class: 'lang-name', text: label }), getLanguage() === lang ? icon('check') : null);
    return h('div', { class: 'ob-step' }, mark(),
      h('h1', { class: 'display ob-title', text: t('app.name') }),
      h('p', { class: 'ob-lead', text: t('app.tagline') }),
      h('div', { class: 'section-label', text: t('ob.lang.title') }),
      h('div', { class: 'stack' }, opt('he', t('lang.he')), opt('en', t('lang.en'))),
      h('div', { class: 'ob-actions' }, button({ label: t('common.continue'), block: true, onClick: () => { step = 1; render(); } }), button({ label: t('ob.restore'), variant: 'ghost', icon: 'upload', block: true, onClick: pickBackupFile })));
  }

  function stepYou() {
    const errEls = {};
    const err = (k, msgKey) => { errEls[k] = h('p', { class: 'field-error', role: 'alert', text: t(msgKey), hidden: true }); return errEls[k]; };
    const sync = () => { const v = validateProfile(form); for (const [k, el] of Object.entries(errEls)) el.hidden = !(attempted && v.errors[k]); };
    const name = h('input', { class: 'text-input', id: 'ob-name', type: 'text', autocomplete: 'given-name', enterkeyhint: 'next', placeholder: t('ob.name.ph'), maxlength: 40, value: form.name });
    name.addEventListener('input', () => { form.name = name.value; sync(); });
    const age = numberField({ id: 'ob-age', label: t('ob.age'), integer: true, value: form.age });
    const weight = numberField({ id: 'ob-weight', label: t('ob.weight'), unit: t('unit.kg'), value: form.weight });
    age.querySelector('input').addEventListener('input', (e) => { form.age = e.target.value; sync(); });
    weight.querySelector('input').addEventListener('input', (e) => { form.weight = e.target.value; sync(); });
    const view = h('div', { class: 'ob-step' },
      h('h1', { class: 'ob-title', text: t('ob.you.title') }),
      h('div', { class: 'stack' },
        h('div', { class: 'field' }, h('label', { for: 'ob-name', text: t('ob.name') }), h('div', { class: 'field-box' }, name), err('name', 'ob.err.name')),
        h('div', { class: 'field' }, h('label', { text: t('ob.curve') }),
          segmented({ label: t('ob.curve'), value: form.sex, onChange: (x) => { form.sex = x; render(); }, options: [{ value: 'm', label: t('ob.curve.m') }, { value: 'f', label: t('ob.curve.f') }] }),
          h('p', { class: 'row-sub', text: t('ob.curve.hint') }), err('sex', 'ob.err.sex')),
        h('div', { class: 'field' }, weight, h('p', { class: 'row-sub', text: t('ob.weight.hint') }), err('weight', 'ob.err.weight')),
        h('div', { class: 'field' }, age, h('p', { class: 'row-sub', text: t('ob.age.hint') }), err('age', 'ob.err.age'))),
      h('div', { class: 'ob-actions' },
        button({ label: t('common.continue'), block: true, onClick: () => { attempted = true; if (validateProfile(form).ok) { step = 2; render(); } else sync(); } }),
        button({ label: t('common.back'), variant: 'ghost', block: true, onClick: () => { step = 0; render(); } })));
    sync();
    return view;
  }

  function stepTour() {
    const points = ['ob.tour.1', 'ob.tour.2', 'ob.tour.3'];
    return h('div', { class: 'ob-step' },
      h('h1', { class: 'ob-title', text: t('ob.tour.title') }),
      h('div', { class: 'tour-emblems' }, emblem({ tier: 'bronze', divisionIndex: 2, size: 70 }), emblem({ tier: 'gold', divisionIndex: 4, size: 84 }), emblem({ tier: 'greekgod', size: 70 })),
      h('ol', { class: 'tour-list' }, points.map((k, i) => h('li', {}, h('span', { class: 'tour-n display', text: String(i + 1) }), h('span', { text: t(k) })))),
      h('div', { class: 'ob-actions' },
        button({ label: t('ob.start'), block: true, onClick: () => {
          const r = validateProfile(form);
          if (!r.ok) { step = 1; attempted = true; render(); return; }
          onDone({ profile: makeProfile({ name: r.value.name, sex: r.value.sex, age: r.value.age, lang: getLanguage() }), weight: r.value.weight });
        } }),
        button({ label: t('common.back'), variant: 'ghost', block: true, onClick: () => { step = 1; render(); } })));
  }

  render();
  return root;
}
