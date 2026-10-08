// Player card: drawn on a canvas, saved as PNG (Web Share with files when available, otherwise a download).
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { cardModel, cardFileName } from '../core/card.mjs';
import { TIER_COLORS } from '../core/ranks.mjs';
import { button } from './components.js';
import { store, todayKey } from './store.js';
import { data } from './data.js';
import { emblem } from './emblem.js';
import { formatNum } from './format.js';
import { paintBackground, paintFrame, paintEffect } from './cosmetics.js';

const W = 1080, H = 1350;

function svgToImage(svgEl) {
  const xml = new XMLSerializer().serializeToString(svgEl);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img); img.onerror = rej;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

export async function renderCard(model) {
  try { await Promise.all([document.fonts.load('700 64px Cinzel'), document.fonts.load('700 48px Heebo'), document.fonts.load('400 32px Heebo')]); } catch { /* fonts optional */ }
  const rtl = getLanguage() === 'he';
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = 'center';
  const accent = model.tier ? TIER_COLORS[model.tier] : '#ffc43d';
  // background (an equipped one replaces the plain dark card)
  const [bgItem, frItem, fxItem] = model.slots;
  g.fillStyle = '#0a0b12'; g.fillRect(0, 0, W, H);
  if (bgItem) { paintBackground(g, bgItem.art, W, H); g.fillStyle = 'rgba(8,9,16,.35)'; g.fillRect(0, 0, W, H); }
  const glow = g.createRadialGradient(W / 2, 470, 40, W / 2, 470, 720);
  glow.addColorStop(0, `${accent}55`); glow.addColorStop(1, '#0a0b1200');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const framed = !!frItem && frItem.art !== 'meander'; // a frame needs room around the emblem, so the emblem is drawn smaller
  const esize = framed ? 320 : 400;
  const ecx = W / 2, ecy = 290 + (400 * (168 / 160)) / 2, erad = framed ? 185 : 230;
  if (fxItem) paintEffect(g, fxItem.art, ecx, ecy, erad, W, H, accent);
  g.strokeStyle = `${accent}88`; g.lineWidth = 6; g.beginPath(); g.roundRect(30, 30, W - 60, H - 60, 56); g.stroke();
  // title and name
  g.fillStyle = accent; g.font = '700 54px Cinzel, serif'; g.fillText('DEMIGOD', W / 2, 130);
  g.fillStyle = '#f4f5fa'; g.font = '700 84px Heebo, system-ui, sans-serif'; g.fillText(model.name, W / 2, 250, W - 160);
  // emblem
  const em = emblem({ tier: model.tier ?? 'unranked', divisionIndex: model.divisionIndex, size: esize });
  const img = await svgToImage(em.querySelector('svg'));
  const eh = 400 * (168 / 160);
  const eh2 = esize * (168 / 160);
  g.drawImage(img, (W - esize) / 2, ecy - eh2 / 2, esize, eh2);
  if (frItem) paintFrame(g, frItem.art, ecx, ecy, erad, W, H, accent);
  // rank text
  const ty = 290 + eh + 85;
  g.fillStyle = '#f4f5fa'; g.font = '700 76px Cinzel, serif';
  if (model.pending) {
    g.font = '700 46px Heebo, system-ui, sans-serif'; g.fillStyle = '#b0b5cc';
    g.fillText(t('rank.pending', { n: model.remaining }), W / 2, ty, W - 200);
  } else {
    g.fillText(model.division ? `${t(`tier.${model.tier}`)} ${model.division}` : t(`tier.${model.tier}`), W / 2, ty);
    g.fillStyle = accent; g.font = '700 54px Cinzel, serif';
    g.fillText(model.division ? t('rank.rating', { n: formatNum(model.rating, 0) }) : t('rank.score', { n: formatNum(model.rating, 0) }), W / 2, ty + 70);
    if (model.lp != null) {
      const bx = 240, bw = W - 480, by = ty + 110;
      g.fillStyle = '#20243a'; g.beginPath(); g.roundRect(bx, by, bw, 28, 14); g.fill();
      g.fillStyle = accent; g.beginPath(); g.roundRect(rtl ? bx + bw - Math.max(28, (bw * model.lp) / 100) : bx, by, Math.max(28, (bw * model.lp) / 100), 28, 14); g.fill();
      g.fillStyle = '#b0b5cc'; g.font = '400 28px Heebo, system-ui, sans-serif'; g.direction = 'ltr'; g.fillText(t('rank.lp', { n: model.lp }), W / 2, by + 68); g.direction = rtl ? 'rtl' : 'ltr';
    }
  }
  // placeholder stats (level, streak, achievements) and cosmetic slots
  const stat = (x, label, value) => {
    g.fillStyle = '#11131f'; g.beginPath(); g.roundRect(x, H - 330, 280, 130, 28); g.fill();
    g.fillStyle = '#f4f5fa'; g.font = '700 54px Cinzel, serif'; g.fillText(value ?? '—', x + 140, H - 255);
    g.fillStyle = '#8a90ab'; g.font = '400 28px Heebo, system-ui, sans-serif'; g.fillText(label, x + 140, H - 215);
  };
  const xs = [90, 400, 710];
  const items = [[t('card.level'), model.level], [t('card.streak'), model.streak], [t('card.achievements'), model.achievements]];
  (rtl ? items.reverse() : items).forEach(([label, v], i) => stat(xs[i], label, v));
  g.strokeStyle = '#3a3f5e'; g.setLineDash([10, 10]); g.lineWidth = 4;
  model.slots.forEach((slot, i) => { g.beginPath(); g.arc(W / 2 + (i - 1) * 150, H - 120, 42, 0, Math.PI * 2); if (slot) { g.fillStyle = '#11131f'; g.fill(); g.setLineDash([]); g.strokeStyle = accent; g.stroke(); g.fillStyle = accent; g.font = '700 18px Heebo, system-ui, sans-serif'; g.fillText((getLanguage() === 'he' ? slot.nameHe : slot.nameEn).split(' ')[0].slice(0, 8), W / 2 + (i - 1) * 150, H - 112); g.strokeStyle = '#3a3f5e'; g.setLineDash([10, 10]); } else g.stroke(); });
  g.setLineDash([]);
  return c;
}

/** Returns 'shared' | 'downloaded'. */
export async function saveCard(canvas, name) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('no image');
  const file = new File([blob], cardFileName(name), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Demigod' }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'shared'; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export function cardScreen() {
  const model = cardModel({ profile: store.profile, overall: store.overall, workoutsCount: store.workouts.length, game: store.game, todayKey: todayKey(), shop: data().shop });
  const box = h('div', { class: 'card-preview', 'aria-busy': 'true' });
  const msg = h('p', { class: 'row-sub center', role: 'status' });
  let canvas = null;
  renderCard(model).then((c) => { canvas = c; c.setAttribute('role', 'img'); c.setAttribute('aria-label', t('card.title')); box.removeAttribute('aria-busy'); box.replaceChildren(c); }).catch(() => { box.replaceChildren(h('p', { text: t('card.error') })); });
  return h('main', { class: 'screen' },
    h('a', { class: 'back-link', href: '#/ranks' }, icon('chevron', 'chev back-chev'), t('tab.ranks')),
    h('h1', { class: 'ex-title', text: t('card.title') }),
    box,
    h('div', { class: 'stack', style: 'padding-block-start:12px' },
      button({ label: t('card.save'), icon: 'share', block: true, onClick: async () => {
        if (!canvas) return;
        try { msg.textContent = (await saveCard(canvas, store.profile.name)) === 'shared' ? t('card.shared') : t('card.downloaded'); } catch { msg.textContent = t('card.error'); }
      } }), msg));
}
