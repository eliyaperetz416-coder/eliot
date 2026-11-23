// First run, one question per screen (OUR DESIGN, spec 4.5 + the 22.11 updates): install (iPhone first), Google sign-in with
// consent, moving this phone's data to the account, the profile questions, weekly goal, install, notifications, how ranks work.
// The order lives in core/onboarding-flow.mjs; the progress (skips, answers) is kept in kv 'onboarding' so a reload resumes it.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, numberField, segmented } from './components.js';
import { emblem } from './emblem.js';
import { validateProfile, makeProfile } from '../core/profile.mjs';
import { nextStep, platformOf } from '../core/onboarding-flow.mjs';
import { dbGet, dbPut } from './db.js';
import { store, bodyweightKg } from './store.js';
import { hasData } from './backup.js';
import { getSession, startGoogleSignIn } from './auth.js';
import { syncNow, recordConsent, syncedOnce } from './sync.js';
import { enablePush } from './push.js';
import { crew, enablePush as enableCrewPush } from './crew-state.js';
import { updateSettings } from './storage.js';
import { PRIVACY_VERSION } from './privacy.js';

const KEY = 'onboarding';
const isStandalone = () => matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** onLanguage(lang) switches the app language; onDone({ profile, weight } | null) opens the app; installPrompt() = Android's saved prompt. */
export function onboarding({ onLanguage, onDone, installPrompt = () => null, signInFailed = false }) {
  const root = h('main', { class: 'screen onboarding' });
  let st = null;      // the saved progress
  let session = null;
  let checked = false; // the first look at the account after signing in
  let busy = '';
  let failed = signInFailed;

  const save = () => dbPut('kv', st, KEY).catch(() => {});
  const flowState = () => {
    const p = store.profile ?? st.form;
    return {
      platform: platformOf({ ua: navigator.userAgent, standalone: isStandalone() }),
      installed: isStandalone(), installSkipped: !!st.installSkipped, signedIn: !!session,
      localData: !!store.profile || hasData(), migrated: st.migrated,
      profile: { name: p?.name, sex: p?.sex, weight: store.profile ? bodyweightKg() : Number(st.form.weight) || null, age: p?.age === '' ? null : (p?.age ?? null) },
      ageSkipped: !!st.ageSkipped, goalSet: !!st.goalSet, pushAsked: !!st.pushAsked, toured: !!st.toured,
    };
  };

  const mark = () => h('div', { class: 'ob-mark' }, icon('bolt'));
  const step = (title, ...kids) => h('div', { class: 'ob-step' }, h('h1', { class: 'ob-title', text: title }), ...kids);
  const actions = (...b) => h('div', { class: 'ob-actions' }, ...b);
  const go = async (patch = {}) => { Object.assign(st, patch); await save(); render(); };

  async function render() {
    if (!st) {
      st = { form: { name: '', sex: null, weight: '', age: '' }, ...((await dbGet('kv', KEY).catch(() => null)) ?? {}) };
      session = await getSession();
      st.migrated = await syncedOnce();
    }
    if (session && !checked && !(store.profile || hasData())) { // a new phone: the account may already hold this person's data
      root.replaceChildren(step(t('ob.checking')));
      const res = await syncNow(); // a pull reloads the page with the account's data
      if (res !== 'ok') { // never start as a brand-new person before we know the account is empty
        root.replaceChildren(step(t('ob.check.failed'), mark(), actions(button({ label: t('ob.migrate.retry'), block: true, onClick: () => render() }))));
        return;
      }
      checked = true;
    }
    const id = nextStep(flowState());
    if (id === 'done') { await finish(); return; }
    root.replaceChildren(screens[id]());
    root.scrollTo?.(0, 0); window.scrollTo(0, 0);
  }

  async function finish() {
    await dbPut('kv', true, 'onboarded').catch(() => {});
    if (store.profile) { onDone(null); return; }
    const r = validateProfile(st.form);
    onDone({ profile: makeProfile({ name: r.value.name, sex: r.value.sex, age: r.value.age, lang: getLanguage() }), weight: r.value.weight });
  }

  const langSwitch = () => {
    const other = getLanguage() === 'he' ? 'en' : 'he';
    return h('button', { type: 'button', class: 'btn btn-ghost ob-lang', lang: other, onclick: () => { onLanguage(other); render(); } }, t(`lang.${other}`));
  };

  function installSteps() {
    return h('ol', { class: 'tour-list' },
      h('li', {}, h('span', { class: 'tour-n' }, icon('share')), h('span', { text: t('ob.install.ios.1') })),
      h('li', {}, h('span', { class: 'tour-n' }, icon('plus')), h('span', { text: t('ob.install.ios.2') })),
      h('li', {}, h('span', { class: 'tour-n' }, icon('check')), h('span', { text: t('ob.install.ios.3') })));
  }

  const screens = {
    'install-first': () => step(t('ob.install.title'), mark(), h('p', { class: 'ob-lead', text: t('ob.install.why') }), installSteps(),
      actions(button({ label: t('ob.install.browser'), variant: 'ghost', block: true, onClick: () => go({ installSkipped: true }) }))),

    signin: () => {
      const offline = navigator.onLine === false;
      const consent = h('input', { type: 'checkbox', id: 'consent' });
      const google = h('button', { class: 'btn btn-primary btn-block', id: 'google', type: 'button', disabled: true }, icon('globe'), t('ob.google'));
      consent.addEventListener('change', () => { google.disabled = !consent.checked || offline; });
      google.addEventListener('click', async () => {
        google.disabled = true;
        await recordConsent(PRIVACY_VERSION);
        await startGoogleSignIn();
      });
      return h('div', { class: 'ob-step' }, langSwitch(), mark(),
        h('h1', { class: 'display ob-title', text: t('app.name') }), h('p', { class: 'ob-lead', text: t('app.tagline') }),
        failed ? h('p', { class: 'field-error', role: 'alert', text: t('ob.signin.failed') }) : null,
        offline ? h('p', { class: 'field-error', role: 'alert', text: t('ob.offline') }) : null,
        h('label', { class: 'ob-consent', for: 'consent' }, consent, h('span', {}, `${t('ob.consent')} `, h('a', { href: '#/privacy', text: t('privacy.link') }))),
        actions(google), h('p', { class: 'row-sub center', text: t('ob.once') }));
    },

    migrate: () => {
      const n = store.workouts.length;
      const failed = busy && busy !== 'run';
      const why = { 'too-big': 'ob.migrate.toobig', 'other-user': 'ob.migrate.otheruser' }[busy] ?? 'ob.migrate.failed';
      const status = h('p', { class: failed ? 'field-error' : 'ob-lead', role: 'status', text: failed ? t(why) : t('ob.migrate.count', { n }) });
      const bar = h('div', { class: 'ob-bar' }, h('span', { class: failed ? '' : 'run' }));
      const run = async () => {
        busy = 'run'; root.replaceChildren(screens.migrate());
        const res = await syncNow(); // a merge reloads the page; a push returns 'ok'
        if (res === 'ok' && await syncedOnce()) { busy = ''; await go({ migrated: true }); return; }
        busy = res === 'ok' ? 'offline' : res; render();
      };
      if (!busy) setTimeout(run, 0);
      return step(t('ob.migrate.title'), bar, status,
        failed ? actions(busy === 'too-big' ? null : button({ label: t('ob.migrate.retry'), block: true, onClick: run }), button({ label: t('ob.migrate.later'), variant: busy === 'too-big' ? 'primary' : 'ghost', block: true, onClick: () => finish() })) : null);
    },

    about: () => {
      // Name, curve, body weight and age (optional) on one screen; errors show under each field.
      const form = { ...st.form, name: st.form.name || session?.user?.name?.split(' ')[0] || '' };
      const errs = {};
      const err = (k, key) => (errs[k] = h('p', { class: 'field-error', role: 'alert', text: t(key), hidden: true }));
      const name = h('input', { class: 'text-input', id: 'ob-name', type: 'text', autocomplete: 'given-name', maxlength: 40, value: form.name });
      const weight = numberField({ id: 'ob-weight', label: t('ob.weight'), unit: t('unit.kg'), value: form.weight });
      const age = numberField({ id: 'ob-age', label: t('ob.age'), integer: true, value: form.age });
      const values = () => ({ name: name.value, sex: form.sex, weight: weight.querySelector('input').value, age: age.querySelector('input').value });
      let tried = false;
      const sync = () => { if (!tried) return; const r = validateProfile(values()); for (const [k, el] of Object.entries(errs)) el.hidden = !r.errors[k]; return r; };
      const curve = segmented({ label: t('ob.curve'), value: form.sex, onChange: (x) => { form.sex = x; sync(); }, options: [{ value: 'm', label: t('ob.curve.m') }, { value: 'f', label: t('ob.curve.f') }] });
      for (const el of [name, weight.querySelector('input'), age.querySelector('input')]) el.addEventListener('input', sync);
      return step(t('ob.you.title'),
        h('div', { class: 'stack' },
          h('div', { class: 'field' }, h('label', { for: 'ob-name', text: t('ob.name') }), h('div', { class: 'field-box' }, name), err('name', 'ob.err.name')),
          h('div', { class: 'field' }, h('label', { text: t('ob.curve') }), curve, h('p', { class: 'row-sub', text: t('ob.curve.hint') }), err('sex', 'ob.err.sex')),
          h('div', { class: 'field' }, weight, err('weight', 'ob.err.weight')),
          h('div', { class: 'field' }, age, err('age', 'ob.err.age'))),
        actions(button({ label: t('common.continue'), block: true, onClick: () => {
          tried = true;
          const r = sync();
          if (!r.ok) return;
          go({ form: { name: r.value.name, sex: r.value.sex, weight: String(r.value.weight), age: r.value.age == null ? '' : String(r.value.age) }, ageSkipped: r.value.age == null });
        } })));
    },

    goal: () => {
      let days = st.goalDays ?? 3;
      const big = h('p', { class: 'ob-goal display num', text: String(days) });
      const seg = segmented({ label: t('ob.goal.title'), value: String(days), onChange: (v) => { days = Number(v); big.textContent = v; }, options: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })) });
      return step(t('ob.goal.title'), big, seg,
        actions(button({ label: t('common.continue'), block: true, onClick: async () => { await updateSettings({ weeklyGoal: days }); go({ goalSet: true, goalDays: days }); } })));
    },

    install: () => {
      const prompt = installPrompt();
      return step(t('ob.install.title'), mark(), h('p', { class: 'ob-lead', text: t(prompt ? 'ob.install.android' : 'ob.install.menu') }),
        actions(prompt ? button({ label: t('ob.install.go'), icon: 'download', block: true, onClick: async () => { try { await prompt.prompt(); await prompt.userChoice; } catch { /* dismissed */ } go({ installSkipped: true }); } }) : null,
          button({ label: t('ob.later'), variant: 'ghost', block: true, onClick: () => go({ installSkipped: true }) })));
    },

    notify: () => step(t('ob.notify.title'), mark(), h('p', { class: 'ob-lead', text: t('ob.notify.body') }),
      actions(button({ label: t('ob.notify.on'), block: true, onClick: async () => {
        await enablePush();
        if (crew.local) { try { await enableCrewPush(); } catch { /* the crew switch stays in the crew settings */ } }
        go({ pushAsked: true });
      } }), button({ label: t('ob.notify.later'), variant: 'ghost', block: true, onClick: () => go({ pushAsked: true }) }))),

    tour: () => step(t('ob.tour.title'),
      h('div', { class: 'tour-emblems' }, emblem({ tier: 'bronze', divisionIndex: 2, size: 70 }), emblem({ tier: 'gold', divisionIndex: 4, size: 84 }), emblem({ tier: 'greekgod', size: 70 })),
      h('ol', { class: 'tour-list' }, ['ob.tour.1', 'ob.tour.2', 'ob.tour.3'].map((k, i) => h('li', {}, h('span', { class: 'tour-n display', text: String(i + 1) }), h('span', { text: t(k) })))),
      actions(button({ label: t('ob.start'), block: true, onClick: () => go({ toured: true }) }))),
  };

  render();
  return root;
}
