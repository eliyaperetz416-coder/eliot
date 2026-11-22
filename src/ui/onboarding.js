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
      profile: { name: p?.name, sex: p?.sex, weight: store.profile ? bodyweightKg() : Number(st.form.weight) || null, age: p?.age ?? null },
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
      checked = true;
      root.replaceChildren(step(t('ob.checking')));
      await syncNow(); // a pull reloads the page with the account's data
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
      h('li', {}, icon('share'), h('span', { text: t('ob.install.ios.1') })),
      h('li', {}, icon('plus'), h('span', { text: t('ob.install.ios.2') })),
      h('li', {}, icon('check'), h('span', { text: t('ob.install.ios.3') })));
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
      const status = h('p', { class: 'ob-lead', role: 'status', text: busy === 'failed' ? t('ob.migrate.failed') : t('ob.migrate.count', { n }) });
      const bar = h('div', { class: 'ob-bar' }, h('span', { class: busy === 'failed' ? '' : 'run' }));
      const run = async () => {
        busy = 'run'; root.replaceChildren(screens.migrate());
        const res = await syncNow(); // a merge reloads the page; a push returns 'ok'
        if (res === 'ok' && await syncedOnce()) { busy = ''; await go({ migrated: true }); return; }
        busy = 'failed'; render();
      };
      if (!busy) setTimeout(run, 0);
      return step(t('ob.migrate.title'), bar, status,
        busy === 'failed' ? actions(button({ label: t('ob.migrate.retry'), block: true, onClick: run }), button({ label: t('ob.migrate.later'), variant: 'ghost', block: true, onClick: () => finish() })) : null);
    },

    name: () => {
      const input = h('input', { class: 'text-input', id: 'ob-name', type: 'text', autocomplete: 'given-name', maxlength: 40, value: st.form.name || session?.user?.name?.split(' ')[0] || '' });
      const err = h('p', { class: 'field-error', role: 'alert', text: t('ob.err.name'), hidden: true });
      return step(t('ob.name'), h('div', { class: 'field-box' }, input), err,
        actions(button({ label: t('common.continue'), block: true, onClick: () => { if (!input.value.trim()) { err.hidden = false; return; } go({ form: { ...st.form, name: input.value.trim().slice(0, 40) } }); } })));
    },

    curve: () => step(t('ob.curve'), h('p', { class: 'ob-lead', text: t('ob.curve.hint') }),
      segmented({ label: t('ob.curve'), value: st.form.sex, onChange: (x) => go({ form: { ...st.form, sex: x } }), options: [{ value: 'm', label: t('ob.curve.m') }, { value: 'f', label: t('ob.curve.f') }] })),

    weight: () => {
      const f = numberField({ id: 'ob-weight', label: t('ob.weight'), unit: t('unit.kg'), value: st.form.weight });
      const err = h('p', { class: 'field-error', role: 'alert', text: t('ob.err.weight'), hidden: true });
      return step(t('ob.weight'), f, h('p', { class: 'row-sub', text: t('ob.weight.hint') }), err,
        actions(button({ label: t('common.continue'), block: true, onClick: () => {
          const v = f.querySelector('input').value;
          if (validateProfile({ ...st.form, weight: v }).errors.weight) { err.hidden = false; return; }
          go({ form: { ...st.form, weight: String(validateProfile({ ...st.form, weight: v }).value.weight) } });
        } })));
    },

    age: () => {
      const f = numberField({ id: 'ob-age', label: t('ob.age'), integer: true, value: st.form.age });
      const err = h('p', { class: 'field-error', role: 'alert', text: t('ob.err.age'), hidden: true });
      return step(t('ob.age'), f, err,
        actions(button({ label: t('common.continue'), block: true, onClick: () => {
          const v = f.querySelector('input').value;
          const r = validateProfile({ ...st.form, age: v });
          if (r.errors.age || r.value.age == null) { err.hidden = false; return; }
          go({ form: { ...st.form, age: String(r.value.age) } });
        } }), button({ label: t('ob.skip'), variant: 'ghost', block: true, onClick: () => go({ ageSkipped: true }) })));
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
