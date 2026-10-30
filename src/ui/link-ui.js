// Settings > Habit Coach: connect, copy the code, sync now, see what is shared, disconnect.
import { h } from './dom.js';
import { t } from '../core/i18n.mjs';
import { button, list, listRow, openSheet, showToast } from './components.js';
import { formatDateTime } from './format.js';
import { link, connectLink, syncLink, disconnectLink } from './link-state.js';
import { linkCode } from '../core/link.mjs';

const errorText = (e) => t(String(e?.message) === 'offline' ? 'link.err.offline' : 'link.err.server');

/** The code in a read-only field (select-all fallback when the clipboard is blocked) and a copy button. */
function codeSheet() {
  const code = linkCode(link.local.token);
  const out = h('textarea', { class: 'notes-input', rows: 3, readonly: true, dir: 'ltr', 'aria-label': t('link.code'), 'data-testid': 'link-code' }, code);
  const sh = openSheet({ title: t('link.code.title'), content: h('div', { class: 'stack' },
    h('p', { text: t('link.code.body') }), out,
    button({ label: t('link.copy'), icon: 'share', block: true, onClick: async () => {
      try { await navigator.clipboard.writeText(code); showToast({ message: t('link.copied') }); } catch { out.focus(); out.select(); showToast({ message: t('link.copyManual') }); }
    } }),
    h('p', { class: 'row-sub', text: t('link.code.secret') }),
    button({ label: t('common.close'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
}

function sharedSheet() {
  const sh = openSheet({ title: t('link.shared.title'), content: h('div', { class: 'stack' },
    h('p', { text: t('link.shared.yes') }), h('p', { text: t('link.shared.no') }),
    button({ label: t('common.close'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
}

function disconnectSheet(redraw) {
  const sh = openSheet({ title: t('link.disconnect.title'), content: h('div', { class: 'stack' },
    h('p', { text: t('link.disconnect.body') }),
    button({ label: t('link.disconnect'), variant: 'danger', block: true, onClick: async (ev) => {
      ev.currentTarget.disabled = true;
      try { await disconnectLink(); sh.close(); showToast({ message: t('link.disconnected') }); redraw(); }
      catch (e) { ev.currentTarget.disabled = false; showToast({ message: errorText(e), duration: 6000 }); }
    } }),
    button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() })) });
}

/** The settings section. redraw: re-renders the settings screen. */
export function linkSection(redraw) {
  const head = h('div', { class: 'section-label', text: t('link.title') });
  if (!link.local) {
    return [head,
      h('p', { class: 'row-sub', style: 'padding-block-end:8px', text: t('link.intro') }),
      h('div', { class: 'stack' }, button({ label: t('link.connect'), icon: 'share', variant: 'secondary', block: true, onClick: async (ev) => {
        ev.currentTarget.disabled = true;
        try { await connectLink(); redraw(); codeSheet(); }
        catch (e) { ev.currentTarget.disabled = false; showToast({ message: errorText(e), duration: 6000 }); }
      } })),
      list([listRow({ title: t('link.shared.title'), icon: 'info', onClick: sharedSheet })])];
  }
  return [head,
    list([
      listRow({ title: t('link.code'), sub: t('link.code.sub'), icon: 'share', onClick: codeSheet }),
      listRow({ title: t('link.sync'), sub: t('link.synced', { date: formatDateTime(link.local.lastSyncMs) }), icon: 'refresh', onClick: async () => {
        const ok = await syncLink(true);
        showToast({ message: t(ok ? 'link.sync.ok' : 'link.err.offline') });
        redraw();
      } }),
      listRow({ title: t('link.shared.title'), icon: 'info', onClick: sharedSheet }),
      listRow({ title: t('link.disconnect'), sub: t('link.disconnect.sub'), icon: 'close', onClick: () => disconnectSheet(redraw) }),
    ])];
}
