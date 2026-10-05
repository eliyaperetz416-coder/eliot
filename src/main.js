import { DIR, LANGS, detectLanguage, setDictionaries, setLanguage, t } from './core/i18n.mjs';
import { buildScreens } from './ui/screens.js';
import { tabBar, showToast } from './ui/components.js';
import { loadSettings, saveSettings, requestPersistence } from './ui/storage.js';

const TABS = [
  { id: 'workout', icon: 'workout' }, { id: 'exercises', icon: 'exercises' }, { id: 'ranks', icon: 'ranks' },
  { id: 'shop', icon: 'shop' }, { id: 'profile', icon: 'profile' },
];
const app = document.getElementById('app');
const nav = document.getElementById('nav-root');
let settings;
let screens;

function applyDocument() {
  const lang = document.documentElement.lang;
  document.documentElement.dir = DIR[lang];
  document.documentElement.dataset.motion = settings.reducedMotion ? 'reduce' : '';
  document.title = t('app.name');
}

function route() {
  const id = (location.hash.replace(/^#\//, '') || 'workout').split('?')[0];
  return screens[id] ? id : 'workout';
}

function render() {
  const id = route();
  app.replaceChildren(screens[id]());
  nav.replaceChildren(TABS.some((x) => x.id === id) ? tabBar({ tabs: TABS, current: id }) : '');
  window.scrollTo(0, 0);
}

async function changeLanguage(lang) {
  setLanguage(lang);
  document.documentElement.lang = lang;
  settings = { ...settings, lang };
  applyDocument();
  render();
  saveSettings(settings);
}

async function boot() {
  const [he, en] = await Promise.all(LANGS.map((l) => fetch(`src/data/i18n/${l}.json`).then((r) => r.json())));
  setDictionaries({ he, en });
  settings = await loadSettings();
  const lang = settings.lang ?? detectLanguage(navigator.language);
  setLanguage(lang);
  document.documentElement.lang = lang;
  screens = buildScreens({ onLanguage: changeLanguage });
  applyDocument();
  render();
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
