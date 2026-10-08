import { DIR, LANGS, detectLanguage, setDictionaries, setLanguage, t } from './core/i18n.mjs';
import { TIER_COLORS } from './core/ranks.mjs';
import { buildScreens } from './ui/screens.js';
import { tabBar, showToast, backLink } from './ui/components.js';
import { loadSettings, requestPersistence, getSettings, updateSettings, onSettings } from './ui/storage.js';
import { loadData, data } from './ui/data.js';
import { initStore, store, saveProfile, subscribe, onAchievements } from './ui/store.js';
import { onboarding } from './ui/onboarding.js';
import { initRestTimer, refreshRestTimer } from './ui/rest-timer.js';
import { keepAwake } from './ui/wakelock.js';
import { initCrew, onCrew, crew, startCrewWatcher } from './ui/crew-state.js';

const TABS = [
  { id: 'workout', icon: 'workout' }, { id: 'exercises', icon: 'exercises' }, { id: 'ranks', icon: 'ranks' }, { id: 'profile', icon: 'profile' },
];
const app = document.getElementById('app');
const nav = document.getElementById('nav-root');
let screens;
let dispose = null;
let currentTab = null;
const drawNav = () => nav.replaceChildren(store.profile && TABS.some((x) => x.id === currentTab) ? tabBar({ tabs: TABS, current: currentTab, badges: { profile: crew.unread > 0 } }) : '');

const lang2 = () => document.documentElement.lang;
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; }

/** White text on dark accents, dark text on light ones. */
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16), lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#1a1305' : '#ffffff';
}

/** The accent follows the overall rank (OUR DESIGN); gold while unranked or when set to fixed. */
function applyAccent() {
  const root = document.documentElement.style;
  const equippedTheme = data().shop.cosmetics.find((c) => c.id === store.game.inventory.equipped.theme);
  let hex = equippedTheme?.hex ?? '#7c5cff';
  if (getSettings().accentMode === 'rank' && !store.overall.pending) {
    const tier = ['wood', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion', 'titan', 'olympian', 'greekgod'];
    for (const id of tier) if (store.overall.rating >= ({ wood: 1, bronze: 200, silver: 300, gold: 400, platinum: 500, diamond: 600, champion: 700, titan: 800, olympian: 900, greekgod: 1000 })[id]) hex = TIER_COLORS[id];
  }
  root.setProperty('--accent-rgb', hexToRgb(hex));
  root.setProperty('--accent-ink', inkFor(hex));
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
  if (!store.profile) {
    app.replaceChildren(onboarding({ onLanguage: changeLanguage, onDone: finishOnboarding }));
    nav.replaceChildren();
    return;
  }
  const { id, param } = route();
  const el = screens[id](param);
  dispose = el._dispose ?? null;
  app.replaceChildren(el);
  const tab = { exercise: 'exercises', custom: 'exercises', history: 'profile', achievements: 'profile', crew: 'profile', settings: 'profile', requests: 'exercises', calendar: 'profile', numbers: 'profile', result: 'workout', routines: 'workout', routine: 'workout', plans: 'workout', plan: 'workout', progress: 'ranks', card: 'ranks', shop: 'profile', model: 'profile', schedule: 'workout' }[id] ?? id;
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

async function finishOnboarding({ profile, weight }) {
  await saveProfile(profile, weight);
  applyAccent();
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
  const lang = settings.lang ?? store.profile?.lang ?? detectLanguage(navigator.language);
  setLanguage(lang);
  document.documentElement.lang = lang;
  screens = buildScreens({ onLanguage: changeLanguage });
  applyDocument();
  applyAccent();
  render();
  initRestTimer(document.getElementById('rest-root'));
  onAchievements((list, reward) => showToast({ message: t('ach.toast', { name: list.map((a) => (lang2() === 'he' ? a.nameHe : a.nameEn)).join(', '), n: reward }) }));
  let hadDraft = !!store.draft;
  subscribe(() => {
    applyAccent();
    if (!!store.draft !== hadDraft) { hadDraft = !!store.draft; if (store.profile && route().id === 'workout') render(); }
  });
  onSettings((next) => {
    if (next.lang && next.lang !== document.documentElement.lang) { setLanguage(next.lang); document.documentElement.lang = next.lang; refreshRestTimer(); }
    applyDocument(); applyAccent();
  });
  onCrew(drawNav);
  startCrewWatcher();
  window.addEventListener('hashchange', render);
  document.documentElement.dataset.ready = '1';
  requestPersistence();
  registerServiceWorker();
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

// No pinch or double-tap zoom: a zoomed-in screen is hard to get out of on a phone (a trade-off against accessibility zoom, chosen by Elia).
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });

boot();
