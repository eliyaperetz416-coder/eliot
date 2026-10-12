// Zip, the pixel-alien mascot (src/vendor/zip, copied unchanged from the Quill repo's packages/zip). He lives only on the Profile screen.
// Display only: he is not wired to app events. He stays out of the way of sheets (--zip-z in components.css) and the tab bar.
import { Zip } from '../vendor/zip/zip.js';
import { getLanguage } from '../core/i18n.mjs';

let zip = null, mountedLang = null;

/** Show Zip (on) or hide him (off). He is created the first time he is needed and re-created when the language changes. */
export function showMascot(on) {
  if (!on) { zip?.hide(); return; }
  const lang = getLanguage();
  if (!zip || mountedLang !== lang) {
    zip?.destroy();
    zip = Zip.mount({ lang, accessory: 'jetpack+dumbbells', position: { side: 'start', bottom: 'calc(var(--tabbar-h) + 10px)' } });
    mountedLang = lang;
  }
  zip.show();
}
