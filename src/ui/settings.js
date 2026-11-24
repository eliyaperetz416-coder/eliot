import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, list, listRow, openSheet, segmented, showToast, backLink } from './components.js';
import { getSettings, updateSettings } from './storage.js';
import { exportBackup, resetAll } from './backup.js';
import { recompute } from './store.js';
import { APP_VERSION } from '../version.js';
import { retireLink } from './link-state.js';
import { getSession, signOut, authFetch } from './auth.js';
import { syncNow, syncState, onSync } from './sync.js';
import { dbPut } from './db.js';
import { enablePush, setRestPush } from './push.js';
import { crew, leaveCrew, enablePush as enableCrewPush } from './crew-state.js';

/** Deletes the account (server: delete_my_account, which cascades to every account table) and then this phone's data. */
function deleteFlow() {
  const word = t('set.delete.word');
  const input = h('input', { class: 'text-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', 'aria-label': t('set.delete.type', { word }) });
  const go = button({ label: t('set.delete.go'), variant: 'danger', block: true, disabled: true, onClick: async () => {
    go.disabled = true;
    // the crew spot first: it lives outside the account, so once the account is gone nothing could remove it any more
    if (crew.local) { try { await leaveCrew(); } catch { showToast({ message: t('set.delete.failed'), duration: 6000 }); go.disabled = false; return; } }
    try {
      const r = await authFetch('/rest/v1/rpc/delete_my_account', { method: 'POST', body: '{}' });
      if (!r.ok) throw new Error(`http_${r.status}`);
    } catch { showToast({ message: t('set.delete.failed'), duration: 6000 }); go.disabled = false; return; }
    await retireLink();
    await resetAll();
    sh.close();
    setTimeout(() => { location.hash = ''; location.reload(); }, 300);
  } });
  input.addEventListener('input', () => { go.disabled = input.value.trim().toLowerCase() !== word.toLowerCase(); });
  const sh = openSheet({ title: t('set.delete'), content: h('div', { class: 'stack' },
    h('p', { text: t('set.delete.body') }), h('p', { class: 'row-sub', text: t('set.delete.type', { word }) }),
    h('div', { class: 'field-box' }, input), go,
    button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
}

function creditsSheet() {
  const sh = openSheet({ title: t('set.credits'), content: h('div', { class: 'stack' }, h('p', { text: t('set.credits.body') }),
    button({ label: t('common.close'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
}

function installSheet() {
  const sh = openSheet({ title: t('set.install'), content: h('div', { class: 'stack' },
    h('ol', { class: 'tour-list' }, ['ob.install.ios.1', 'ob.install.ios.2', 'ob.install.ios.3'].map((k, i) => h('li', {}, h('span', { class: 'tour-n display', text: String(i + 1) }), h('span', { text: t(k) })))),
    h('p', { class: 'row-sub', text: t('ob.install.menu') }),
    button({ label: t('common.close'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
}

const yesNo = (label, key, after) => segmented({ label, value: getSettings()[key] === false ? 'no' : 'yes', onChange: async (v) => { await updateSettings({ [key]: v === 'yes' }); after?.(v === 'yes'); }, options: [{ value: 'yes', label: t('set.yes') }, { value: 'no', label: t('set.no') }] });

export function settingsScreen({ onLanguage }) {
  const root = h('main', { class: 'screen' });
  let session = null;
  function draw() {
    const s = getSettings();
    root.replaceChildren(
      backLink('#/profile', t('tab.profile')),
      h('header', { class: 'screen-head' }, icon('settings', 'mark'), h('h1', { text: t('set.title') })),

      h('div', { class: 'section-label', text: t('set.account') }),
      list([
        listRow({ title: session?.user?.name || session?.user?.email || '-', sub: session?.user?.email ?? '', icon: 'profile' }),
        listRow({ title: t(`sync.state.${syncState.status}`, {}), icon: 'shield' }),
        listRow({ title: t('set.account.signout'), icon: 'refresh', onClick: async () => {
          if (session && (await syncNow()) !== 'ok') { showToast({ message: t('set.signout.unsaved'), duration: 6000 }); return; } // save first: nothing may be left only on this phone
          await signOut();
          await dbPut('kv', false, 'onboarded').catch(() => {});
          location.hash = ''; location.reload();
        } }),
      ]),

      h('div', { class: 'section-label', text: t('set.training') }),
      h('div', { class: 'field' }, h('label', { text: t('set.goal') }),
        segmented({ label: t('set.goal'), value: String(s.weeklyGoal ?? 3), onChange: async (v) => { await updateSettings({ weeklyGoal: Number(v) }); recompute(); draw(); }, options: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })) })),
      h('div', { class: 'field' }, h('label', { text: t('set.autoweight') }),
        segmented({ label: t('set.autoweight'), value: s.autoRoutineWeight === false ? 'off' : 'on', onChange: async (v) => { await updateSettings({ autoRoutineWeight: v === 'on' }); draw(); }, options: [{ value: 'on', label: t('set.autoweight.on') }, { value: 'off', label: t('set.autoweight.off') }] })),
      h('div', { class: 'section-label', text: t('set.rest') }),
      h('div', { class: 'field' }, h('label', { text: t('set.rest.sound') }), yesNo(t('set.rest.sound'), 'restSound')),
      h('div', { class: 'field' }, h('label', { text: t('set.rest.vibrate') }), yesNo(t('set.rest.vibrate'), 'restVibrate')),
      h('div', { class: 'field' }, h('label', { text: t('set.rest.push') }), yesNo(t('set.rest.push'), 'restPush', (on) => setRestPush(on))),

      h('div', { class: 'section-label', text: t('set.look') }),
      h('div', { class: 'field' }, h('label', { text: t('set.language') }),
        segmented({ label: t('set.language'), value: getLanguage(), onChange: (l) => onLanguage(l), options: [{ value: 'he', label: t('lang.he'), lang: 'he' }, { value: 'en', label: t('lang.en'), lang: 'en' }] })),
      h('div', { class: 'field' }, h('label', { text: t('set.theme') }),
        segmented({ label: t('set.theme'), value: s.theme === 'marble' ? 'marble' : 'dark', onChange: async (v) => { await updateSettings({ theme: v }); draw(); }, options: [{ value: 'dark', label: t('set.theme.dark') }, { value: 'marble', label: t('set.theme.marble') }] })),
      h('div', { class: 'field' }, h('label', { text: t('set.motion') }),
        segmented({ label: t('set.motion'), value: s.reducedMotion ? 'on' : 'off', onChange: async (v) => { await updateSettings({ reducedMotion: v === 'on' }); draw(); }, options: [{ value: 'off', label: t('set.motion.off') }, { value: 'on', label: t('set.motion.on') }] })),

      h('div', { class: 'section-label', text: t('set.perm') }),
      list([
        listRow({ title: t('set.perm.notify'), icon: 'bolt', onClick: async () => {
          const r = await enablePush();
          if (r === 'on' && crew.local) { try { await enableCrewPush(); } catch { /* the crew switch stays in the crew settings */ } }
          showToast({ message: t(r === 'on' ? 'set.perm.on' : r === 'denied' ? 'set.perm.denied' : r === 'unsupported' ? 'set.perm.unsupported' : 'set.delete.failed'), duration: 5000 });
        } }),
        listRow({ title: t('set.download'), icon: 'download', onClick: async () => {
          try { const r = await exportBackup(); if (r !== 'cancelled') showToast({ message: t('set.download.done') }); } catch { showToast({ message: t('set.download.failed') }); }
        } }),
        listRow({ title: t('privacy.link'), icon: 'shield', onClick: () => { location.hash = '#/privacy'; } }),
      ]),

      h('div', { class: 'section-label', text: t('set.more') }),
      list([
        listRow({ title: t('set.install'), icon: 'download', onClick: installSheet }),
        listRow({ title: t('set.numbers'), icon: 'info', onClick: () => { location.hash = '#/numbers'; } }),
        listRow({ title: t('set.credits'), icon: 'shield', onClick: creditsSheet }),
        listRow({ title: t('app.name'), icon: 'bolt', end: h('span', { class: 'num', dir: 'ltr', text: `${t('profile.version')} ${APP_VERSION}` }) }),
      ]),
      h('div', { style: 'padding-block-start:16px' }, list([listRow({ title: t('set.delete'), sub: t('set.delete.sub'), icon: 'trash', onClick: deleteFlow })])));
  }
  draw();
  getSession().then((x) => { session = x; draw(); });
  const off = onSync(() => { if (root.isConnected) draw(); else off(); });
  return root;
}
