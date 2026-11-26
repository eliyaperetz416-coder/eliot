import { DIR, LANGS, detectLanguage, setDictionaries, setLanguage, t } from './core/i18n.mjs';
import { THEMES, inkFor, hexToRgb, readableOn } from './core/themes.mjs';
import { buildScreens } from './ui/screens.js';
import { tabBar, showToast, backLink, button } from './ui/components.js';
import { loadSettings, requestPersistence, getSettings, updateSettings, onSettings } from './ui/storage.js';
import { loadData, data } from './ui/data.js';
import { initStore, store, saveProfile, subscribe, onAchievements } from './ui/store.js';
import { onboarding } from './ui/onboarding.js';
import { initRestTimer, refreshRestTimer } from './ui/rest-timer.js';
import { keepAwake } from './ui/wakelock.js';
import { initCrew, onCrew, crew, startCrewWatcher } from './ui/crew-state.js';
import { retireLink } from './ui/link-state.js';
import { syncMorning } from './ui/push.js';
import { h } from './ui/dom.js';
import { completeSignIn, getSession, onAuth, startGoogleSignIn } from './ui/auth.js';
import { startSync } from './ui/sync.js';
import { dbGet } from './ui/db.js';

const TABS = [
  { id: 'workout', icon: 'bolt' }, { id: 'workouts', icon: 'workout' }, { id: 'ranks', icon: 'progress' }, { id: 'crew', icon: 'chat' }, { id: 'profile', icon: 'profile' },
];
const app = document.getElementById('app');
const nav = document.getElementById('nav-root');
let screens;
let dispose = null;
let currentTab = null;
let session = null, onboarded = false, signInFailed = false;
/** Android's install prompt, kept for the install step of the first run (OUR DESIGN, spec 4.5). */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
const drawNav = () => nav.replaceChildren(store.profile && TABS.some((x) => x.id === currentTab) ? tabBar({ tabs: TABS, current: currentTab, badges: { crew: crew.unread > 0 } }) : '');

const lang2 = () => document.documentElement.lang;
/** Colours (OUR DESIGN, redesign): the chosen theme (dark / marble, src/core/themes.mjs); a colour bought in the shop and
 *  equipped replaces the accent. iOS "increase contrast" and "reduce transparency" still win. */
function applyTheme() {
  const name = getSettings().theme === 'marble' ? 'marble' : 'dark';
  const p = THEMES[name];
  const equipped = data().shop.cosmetics.find((c) => c.id === store.game.inventory.equipped.theme);
  const accent = readableOn(equipped?.hex ?? p.accent, p); // the accent is also text: dark enough on marble, light enough on dark
  const more = matchMedia('(prefers-contrast: more)').matches;
  const solid = more || matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const html = document.documentElement;
  html.dataset.theme = name;
  const vars = {
    '--bg': p.bg, '--surface-1': p.surface1, '--surface-2': p.surface2, '--surface-3': p.surface3,
    '--line': more ? (name === 'dark' ? 'rgb(255 255 255 / .28)' : 'rgb(28 26 23 / .4)') : p.line,
    '--text': p.text, '--text-dim': more ? p.text : p.textDim, '--text-mute': more ? p.text : p.textMute,
    '--accent-rgb': hexToRgb(accent), '--accent-ink': inkFor(accent), '--silver': p.silver,
    '--material': solid ? p.glassSolid : p.glass, '--material-thick': solid ? p.glassSolid : p.glassThick, '--material-edge': p.glassEdge, '--material-solid': p.glassSolid,
  };
  for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.metaColor);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', p.scheme);
}

function applyDocument() {
  const lang = document.documentElement.lang;
  document.documentElement.dir = DIR[lang];
  document.documentElement.dataset.motion = getSettings().reducedMotion ? 'reduce' : '';
  document.title = t('app.name');
}

function route() {
  const [id, param] = (location.hash.replace(/^#\//, '') || 'workout').split('?')[0].split('/');
  return screens[id] ? { id, param } : { id: 'workout' };
}

function render() {
  dispose?.(); dispose = null;
  // Sign-in is needed once (spec 4.1); the privacy page stays readable from the sign-in screen. After that the app never
  // locks on a lost session: it keeps working on this phone and offers to sign in again (banner below).
  if ((!store.profile || !onboarded) && route().id !== 'privacy') {
    app.replaceChildren(onboarding({ onLanguage: changeLanguage, onDone: finishOnboarding, installPrompt: () => installPrompt, signInFailed }));
    signInFailed = false;
    nav.replaceChildren();
    return;
  }
  const { id, param } = route();
  let el;
  try { el = screens[id](param); }
  catch (err) { // a screen that crashes must never leave a black page: offer a way out (OUR DESIGN); the data is safe in the account
    console.error(err);
    el = h('main', { class: 'screen' },
      h('h1', { class: 'display', text: t('crash.title') }), h('p', { class: 'row-sub', text: t('crash.body') }),
      h('div', { class: 'stack' },
        button({ label: t('crash.home'), block: true, onClick: () => { location.hash = '#/profile'; } })));
  }
  dispose = el._dispose ?? null;
  if (!session) el.prepend(h('div', { class: 'card card-accent signin-banner', role: 'status' },
    h('p', { text: t('sync.banner') }), button({ label: t('sync.banner.go'), icon: 'refresh', onClick: () => startGoogleSignIn() })));
  app.replaceChildren(el);
  const tab = { exercises: 'workouts', exercise: 'workouts', custom: 'workouts', requests: 'workouts', routines: 'workouts', routine: 'workouts', plans: 'workouts', plan: 'workouts', schedule: 'workouts', wods: 'workouts', wod: 'workouts', history: 'workouts', achievements: 'profile', settings: 'profile', calendar: 'profile', numbers: 'profile', privacy: 'profile', result: 'workout', progress: 'ranks', ladder: 'ranks', weakest: 'ranks', card: 'ranks', shop: 'profile', }[id] ?? id;
  currentTab = tab;
  // Safety net: every sub-screen (any screen that is not a tab root) has a way back, even in empty/error states.
  if (id !== tab && !el.querySelector('.back-link')) el.prepend(backLink(`#/${tab}`, t(`tab.${tab}`)));
  drawNav();
  keepAwake(!!store.draft);
  window.scrollTo(0, 0);
}

async function changeLanguage(lang) {
  setLanguage(lang);
  document.documentElement.lang = lang;
  applyDocument();
  render();
  refreshRestTimer();
  updateSettings({ lang });
}

async function finishOnboarding(result) {
  if (result) await saveProfile(result.profile, result.weight);
  onboarded = true;
  applyTheme();
  location.hash = '#/workout';
  render();
}

async function boot() {
  const [he, en] = await Promise.all(LANGS.map((l) => fetch(`src/data/i18n/${l}.json`).then((r) => r.json())));
  setDictionaries({ he, en });
  const settings = await loadSettings();
  await loadData();
  await initStore();
  await initCrew();
  retireLink(); // Habit Coach is gone: close an old link in the background
  const back = await completeSignIn();
  session = await getSession();
  signInFailed = back === 'error' && !session; // a stray ?error= in the address while signed in is not a failed sign-in
  onboarded = !!(await dbGet('kv', 'onboarded').catch(() => null));
  onAuth((s) => { const was = !!session; session = s; if (was !== !!s) render(); });
  // the morning reminder follows the week plan, the saved workouts' names, its time and the language (sent only when changed)
  let morningTimer = null;
  const morningSoon = () => { clearTimeout(morningTimer); morningTimer = setTimeout(syncMorning, 2000); };
  subscribe(morningSoon); onSettings(morningSoon); morningSoon();
  const lang = settings.lang ?? store.profile?.lang ?? detectLanguage(navigator.language);
  setLanguage(lang);
  document.documentElement.lang = lang;
  screens = buildScreens({ onLanguage: changeLanguage });
  applyDocument();
  applyTheme();
  // iPhone home-screen app: iOS can report the screen shorter by the status bar's height and draws nothing in the strip
  // that is left at the bottom (only the page colour). Then the bar sits at the very edge and casts no shadow into it.
  const markShort = () => {
    const tall = Math.max(screen.width, screen.height);
    const short = navigator.standalone === true && innerHeight > innerWidth && tall - innerHeight >= 30;
    document.documentElement.dataset.shortvp = short ? '1' : '';
  };
  markShort();
  addEventListener('resize', markShort); visualViewport?.addEventListener('resize', markShort);
  // iOS "increase contrast" / "reduce transparency" switched while the app is open take effect at once
  for (const q of ['(prefers-contrast: more)', '(prefers-reduced-transparency: reduce)']) matchMedia(q).addEventListener?.('change', applyTheme);
  render();
  initRestTimer(document.getElementById('rest-root'));
  onAchievements((list, reward) => showToast({ message: t('ach.toast', { name: list.map((a) => (lang2() === 'he' ? a.nameHe : a.nameEn)).join(', '), n: reward }) }));
  let hadDraft = !!store.draft;
  subscribe(() => {
    applyTheme();
    if (!!store.draft !== hadDraft) { hadDraft = !!store.draft; if (store.profile && route().id === 'workout') render(); }
  });
  onSettings((next) => {
    if (next.lang && next.lang !== document.documentElement.lang) { setLanguage(next.lang); document.documentElement.lang = next.lang; refreshRestTimer(); }
    applyDocument(); applyTheme();
  });
  onCrew(drawNav);
  startCrewWatcher();
  window.addEventListener('hashchange', render);
  document.documentElement.dataset.ready = '1';
  requestPersistence();
  registerServiceWorker();
  if (session) startSync();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const ready = (reg) => showToast({
    message: t('update.ready'), actionLabel: t('update.reload'), duration: 0,
    onAction: () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }),
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) ready(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) ready(reg);
      });
    });
  }).catch(() => { /* offline support is optional; app still runs */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'GO' && typeof e.data.hash === 'string') location.hash = e.data.hash; });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return; reloading = true; location.reload();
  });
}

// Zoom: two-finger pinch stays on (accessibility, IS 5568 / WCAG 1.4.4); accidental double-tap zoom is off through
// `touch-action: manipulation` in base.css (chosen by Elia, v1.47).

/** A failed first request (bad network, a busy server) must never leave a black page: try again a few times, then say so (OUR DESIGN). */
async function start() {
  for (let i = 0; i < 3; i++) { // about 3 s in all, well before boot-guard.js (9 s) would reload the page
    try { await boot(); return; } catch (err) { console.error(err); await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
  const retry = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => location.reload(), text: 'נסה שוב / Try again' });
  app.replaceChildren(h('main', { class: 'screen' }, h('h1', { class: 'display', text: 'Demigod' }),
    h('p', { class: 'row-sub', text: 'לא הצלחנו לפתוח את האפליקציה. הנתונים שלך שמורים. בדוק חיבור ונסה שוב.' }),
    h('p', { class: 'row-sub', text: "Couldn't open the app. Your data is safe. Check your connection and try again." }), retry));
}
start();
