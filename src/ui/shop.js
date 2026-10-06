// Shop tab: drachma balance, consumables (restores, XP Shake) and procedurally drawn cosmetics.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.mjs';
import { purchase, toggleEquip, activateShake } from '../core/shop.mjs';
import { view } from '../core/streak.mjs';
import { button, showToast } from './components.js';
import { data } from './data.js';
import { store, saveGame, todayKey } from './store.js';
import { emblem } from './emblem.js';
import { drawPreview } from './cosmetics.js';
import { itemName, itemDesc } from './game-ui.js';
import { formatNum } from './format.js';

let emblemImg = null;
async function sampleEmblem() {
  if (emblemImg) return emblemImg;
  const svg = emblem({ tier: 'gold', divisionIndex: 3, size: 160 }).querySelector('svg');
  const xml = new XMLSerializer().serializeToString(svg);
  emblemImg = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`; });
  return emblemImg;
}

export function shopScreen() {
  const root = h('main', { class: 'screen' });
  const shop = data().shop;
  async function act(fn, okMsg) { const r = fn(store.game); if (!r.ok) { showToast({ message: t(`shop.err.${r.error ?? 'generic'}`) }); return; } await saveGame(r.game); if (okMsg) showToast({ message: okMsg(r) }); draw(); }

  function draw() {
    const g = store.game, inv = g.inventory;
    const broken = view(g.streak, todayKey()).broken;
    const consumables = shop.consumables.map((c) => {
      const owned = inv[c.id];
      const shakeActive = c.id === 'xpshake' && inv.shakeActive;
      return h('div', { class: 'row shop-row' },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: itemName(c) }), h('span', { class: 'row-sub', text: itemDesc(c) }),
          h('span', { class: 'row-sub num', text: t('shop.owned', { n: owned }) + (shakeActive ? ` · ${t('shop.shakeActive')}` : '') })),
        h('div', { class: 'shop-actions' },
          c.id === 'xpshake' && owned > 0 && !inv.shakeActive ? button({ label: t('shop.activate'), variant: 'secondary', onClick: () => act(activateShake, () => t('shop.shakeOn')) }) : null,
          button({ label: `${c.price}`, icon: 'coin', variant: g.drachmas >= c.price ? 'primary' : 'secondary', disabled: g.drachmas < c.price, onClick: () => act((gm) => purchase(gm, shop, c.id), () => t('shop.bought', { name: itemName(c) })) })));
    });
    const tiles = (kind) => h('div', { class: 'cosmetic-grid' }, shop.cosmetics.filter((c) => c.kind === kind).map((c) => {
      const owned = inv.owned.includes(c.id), eq = inv.equipped[kind] === c.id;
      const canvas = h('canvas', { width: 240, height: 300, class: 'cosmetic-canvas', role: 'img', 'aria-label': itemName(c) });
      sampleEmblem().then((img) => drawPreview(canvas, c, img)).catch(() => drawPreview(canvas, c, null));
      return h('div', { class: `cosmetic${eq ? ' equipped' : ''}` }, canvas,
        h('div', { class: 'cosmetic-name', text: itemName(c) }), h('div', { class: 'row-sub', text: itemDesc(c) }),
        owned ? button({ label: eq ? t('shop.equipped') : t('shop.equip'), variant: eq ? 'secondary' : 'primary', block: true, onClick: () => act((gm) => toggleEquip(gm, shop, c.id)) })
          : button({ label: `${c.price}`, icon: 'coin', variant: g.drachmas >= c.price ? 'primary' : 'secondary', block: true, disabled: g.drachmas < c.price, onClick: () => act((gm) => purchase(gm, shop, c.id), () => t('shop.bought', { name: itemName(c) })) }));
    }));
    root.replaceChildren(
      h('header', { class: 'screen-head' }, icon('bolt', 'mark'), h('h1', { text: t('shop.title') })),
      h('section', { class: 'card card-accent wallet' }, icon('coin', 'coin-icon'), h('div', {}, h('div', { class: 'display wallet-n num', text: formatNum(g.drachmas, 0) }), h('div', { class: 'row-sub', text: t('game.drachmas') }))),
      broken ? h('p', { class: 'row-sub warn', text: t('shop.brokenHint', { n: broken.lostLength }) }) : null,
      h('div', { class: 'section-label', text: t('shop.consumables') }), h('div', { class: 'list' }, consumables),
      h('p', { class: 'row-sub', style: 'padding-block-start:8px', text: t('shop.restoreHint') }),
      h('div', { class: 'section-label', text: t('shop.backgrounds') }), tiles('background'),
      h('div', { class: 'section-label', text: t('shop.frames') }), tiles('frame'),
      h('div', { class: 'section-label', text: t('shop.effects') }), tiles('effect'),
      h('p', { class: 'row-sub', style: 'padding-block-start:12px', text: t('shop.cosmeticsOnly') }));
  }
  draw();
  return root;
}
