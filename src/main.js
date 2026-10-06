import { DIR, LANGS, detectLanguage, setDictionaries, setLanguage, t } from './core/i18n.mjs';
import { TIER_COLORS } from './core/ranks.mjs';
import { buildScreens } from './ui/screens.js';
import { tabBar, showToast } from './ui/components.js';
import { loadSettings, requestPersistence, getSettings, updateSettings, onSettings } from './ui/storage.js';
import { loadData } from './ui/data.js';
import { initStore, store, saveProfile, subscribe, onAchievements } from './ui/store.js';
import { onboarding } from './ui/onboarding.js';
import { initRestTimer, refreshRestTimer } from './ui/rest-timer.js';
import { keepAwake } from './ui/wakelock.js';

const TABS = [
  { id: 'workout', icon: 'workout' }, { id: 'exercises', icon: 'exercises' }, { id: 'ranks', icon: 'ranks' },
  { id: 'shop', icon: 'shop' }, { id: 'profile', icon: 'profile' },
];
const app = document.getElementById('app');
const nav = document.getElementById('nav-root');
let screens;
let dispose = null;

const lang2 = () => document.documentElement.lang;
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; }

/** The accent follows the overall rank (OUR DESIGN); gold while unranked or when set to fixed. */
function applyAccent() {
  const root = document.documentElement.style;
  let hex = '#ffc43d';
  if (getSettings().accentMode === 'rank' && !store.overall.pending) {
    const tier = ['wood', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion', 'titan', 'olympian', 'greekgod'];
    for (const id of tier) if (store.overall.rating >= ({ wood: 1, bronze: 200, silver: 300, gold: 400, platinum: 500, diamond: 600, champion: 700, titan: 800, olympian: 900, greekgod: 1000 })[id]) hex = TIER_COLORS[id];
  }
  root.setProperty('--accent-rgb', hexToRgb(hex));
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
  const tab = { exercise: 'exercises', custom: 'exercises', history: 'profile', achievements: 'profile', settings: 'profile', numbers: 'profile', result: 'workout', routines: 'workout', routine: 'workout', plans: 'workout', plan: 'workout', progress: 'ranks', card: 'ranks' }[id] ?? id;
  nav.replaceChildren(TABS.some((x) => x.id === tab) ? tabBar({ tabs: TABS, current: tab }) : '');
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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return; reloading = true; location.reload();
  });
}

boot();
