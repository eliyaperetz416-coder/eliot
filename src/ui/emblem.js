// OUR DESIGN: the rank crest (artboard E5, made solid on 26.11 — Elia: "too plain, and in places you can see it is a line,
// not a shape"; the louder versions with rays and wings were "too much"). A laurel wreath of full leaves on a stem around a
// solid metal shield: a frame in the tier colour, a darker bevel step, enamel inside, a soft sheen (no hard highlight
// line), and in the middle each tier's own symbol in gold with a glow in the tier colour (crest-icons.js; the same bolt for
// every tier "looked lazy"). Unranked keeps a dim bolt. The division is the gems above (V = 1 ... I = 5).
// The only thing that grows with the tier is the wreath's metal: bronze (Wood, Bronze), silver (Silver), gold (Gold to
// Olympian), white-gold to cyan (Greek God, who wears a crown of three bolts instead of gems). Unranked: iron, a dim bolt.
import { TIER_COLORS, GREEK_GOD_GRADIENT } from '../core/ranks.mjs';
import { ICONS, GLYPH_OF } from './crest-icons.js';

let uid = 0;

function shade(hex, amt) { // amt -1..1
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
const reduced = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The wreath's metal for a tier: 'iron' | 'bronze' | 'silver' | 'gold' | 'divine'. */
export function wreathMetal(tier) {
  if (tier === 'greekgod') return 'divine';
  if (tier === 'wood' || tier === 'bronze') return 'bronze';
  if (tier === 'silver') return 'silver';
  return TIER_COLORS[tier] ? 'gold' : 'iron';
}
const WREATH_BASE = { iron: '#7c8190', bronze: '#c4874c', silver: '#c3ccda', gold: '#e3b84f' };
function wreathStops(metal) {
  if (metal === 'divine') return '<stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#fff1b8"/><stop offset="1" stop-color="#5fd6e6"/>';
  const m = WREATH_BASE[metal];
  return `<stop offset="0" stop-color="${shade(m, 0.6)}"/><stop offset=".5" stop-color="${m}"/><stop offset="1" stop-color="${shade(m, -0.5)}"/>`;
}

// One branch (the left one; the right one mirrors it around x = 130): a stem on an arc, 12 pairs of leaves pointing up
// along it (bigger at the bottom) and one leaf at the tip. Built once; every crest fills it with its own gradient.
const LEAF = 'M0 0 C4 -5.2 12 -5.6 18 0 C12 5.6 4 5.2 0 0 Z';
const CX = 130, CY = 116, R = 96, FROM = 104, TO = 228, PAIRS = 12;
const at = (deg) => [CX + R * Math.cos(deg * Math.PI / 180), CY + R * Math.sin(deg * Math.PI / 180)];
const f1 = (n) => n.toFixed(1);
function leafAt(deg, side, k) {
  const [x, y] = at(deg);
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(deg + 90 + side * 32)}) scale(${k.toFixed(2)})"><path class="leaf" d="${LEAF}" stroke="none"/><path d="M2.5 0 Q9 -.4 15 0" fill="none" stroke="rgba(40,24,0,.38)" stroke-width=".9"/></g>`;
}
const BRANCH = (() => {
  const [x0, y0] = at(FROM), [x1, y1] = at(TO);
  let s = `<path d="M${f1(x0)} ${f1(y0)} A${R} ${R} 0 0 1 ${f1(x1)} ${f1(y1)}" fill="none" stroke-width="2.6" stroke-linecap="round"/>`;
  for (let i = 0; i < PAIRS; i++) {
    const deg = FROM + (TO - FROM) * (i / (PAIRS - 1)), k = 1.2 - 0.45 * (i / (PAIRS - 1));
    s += leafAt(deg, -1, k) + leafAt(deg, 1, k);
  }
  const [tx, ty] = at(TO + 6);
  return s + `<g transform="translate(${f1(tx)} ${f1(ty)}) rotate(${f1(TO + 96)}) scale(.7)"><path class="leaf" d="${LEAF}" stroke="none"/></g>`;
})();

const SHIELD = 'M130 40 L186 58 V107 C186 149 162 175 130 191 C98 175 74 149 74 107 V58 Z';
const BEVEL = 'M130 47 L180 63 V107 C180 145 158 169 130 184 C102 169 80 145 80 107 V63 Z';
const INNER = 'M130 53 L174 67 V107 C174 141 155 162 130 176 C105 162 86 141 86 107 V67 Z';
const SHEEN = 'M86 67 L130 53 L174 67 V84 C150 75 108 78 86 94 Z';
const BOLT = 'M139 70 L111 121 H127 L121 165 L151 108 H134 L143 70 Z';
const FACET = 'M139 70 L111 121 H118 L140 76 Z';
const ICON_SCALE = 0.1482; // a 512 icon -> about 76 px, centred at (130, 118) in the shield

/** The tier's symbol painted with `paint` (a colour or url(#..)). `key` keeps the hydra's clip id unique on the page. */
function glyph(name, paint, key) {
  const icon = (n, extra = '') => `<g transform="translate(130 118) scale(${ICON_SCALE}) translate(-256 -256)" fill="${paint}"${extra}>${ICONS[n].map((d) => `<path d="${d}"/>`).join('')}</g>`;
  if (name === 'bolt') return `<path d="${BOLT}" fill="${paint}"/>`;
  if (name === 'target') { // our own (the old Wood symbol), in the old 160-wide drawing's units
    return `<g transform="translate(130 118) scale(1.12) translate(-80 -78)"><g fill="none" stroke="${paint}" stroke-width="3.5"><circle cx="80" cy="76" r="8"/><circle cx="80" cy="76" r="16"/><circle cx="80" cy="76" r="24" stroke-dasharray="40 10"/></g><circle cx="80" cy="76" r="3" fill="${paint}"/></g>`;
  }
  if (name === 'temple-bolts') { // the Greek temple with three of our bolts above it
    const bolt = (x, y, k) => `<path transform="translate(${x} ${y}) scale(${k})" d="${CROWN_BOLT}" fill="${paint}"/>`;
    return `<g transform="translate(130 118) scale(1.15) translate(-80 -78)"><g transform="translate(0 13) translate(80 78) scale(.7) translate(-80 -78)"><g transform="translate(80 78) scale(.1289) translate(-256 -256)" fill="${paint}">${ICONS['delapouite/greek-temple'].map((d) => `<path d="${d}"/>`).join('')}</g></g>${bolt(63, 44, 0.95)}${bolt(78, 33, 1.22)}${bolt(95, 44, 0.95)}</g>`;
  }
  if (name === 'lorc/hydra') { // the icon's necks end in a straight cut on the left: round it into a body
    return `<defs><clipPath id="hc${key}"><ellipse cx="320" cy="310" rx="302" ry="275"/><rect x="300" y="0" width="212" height="512"/></clipPath></defs>${icon(name, ` clip-path="url(#hc${key})"`)}`;
  }
  return icon(name);
}
const KNOT = 'M107 208 Q118 206 127 199 L129 202 Q121 210 108 212 Z M153 208 Q142 206 133 199 L131 202 Q139 210 152 212 Z';
const CROWN_BOLT = 'M3 0 L-5 12 H0 L-3 22 L7 7 H2 L6 0 Z';

/** emblem({tier, divisionIndex (0=V..4=I), size, label}) -> element. `size` is the width in px. */
export function emblem({ tier = 'unranked', divisionIndex = 0, size = 96, label }) {
  const id = ++uid; // gradient ids carry it: ids must stay unique when several crests share a screen
  const gg = tier === 'greekgod', un = !gg && !TIER_COLORS[tier];
  const base = un ? '#6B7080' : gg ? GREEK_GOD_GRADIENT[1] : TIER_COLORS[tier];
  const metal = wreathMetal(un ? 'unranked' : tier);
  const sym = un ? 'bolt' : GLYPH_OF[tier];
  const anim = gg && !reduced()
    ? `<animate attributeName="stop-color" values="#ffffff;${GREEK_GOD_GRADIENT[1]};#ffffff" dur="3.6s" repeatCount="indefinite"/>`
    : '';
  const frameStops = gg
    ? `<stop offset="0" stop-color="#ffffff">${anim}</stop><stop offset=".35" stop-color="${GREEK_GOD_GRADIENT[0]}"/><stop offset=".7" stop-color="${GREEK_GOD_GRADIENT[1]}"/><stop offset="1" stop-color="#d9fbff"/>`
    : `<stop offset="0" stop-color="${shade(base, 0.65)}"/><stop offset=".38" stop-color="${base}"/><stop offset=".7" stop-color="${shade(base, -0.45)}"/><stop offset="1" stop-color="${shade(base, 0.35)}"/>`;
  const div = Math.max(0, Math.min(4, divisionIndex | 0));
  const n = gg || un ? 0 : 5 - div;
  const gems = Array.from({ length: n }, (_, i) => {
    const x = 130 + (i - (n - 1) / 2) * 15;
    return `<g class="dia" transform="translate(${x} 26)"><path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill="url(#w${id})"/><path d="M0 -6 L6 0 L0 0 Z" fill="#fff" opacity=".5"/><path d="M-6 0 L0 0 L0 6 Z" fill="#000" opacity=".25"/></g>`;
  }).join('');
  const crown = gg ? `<g class="crown" fill="url(#b${id})">${[[112, 14, 0.9], [130, 4, 1.15], [148, 14, 0.9]].map(([x, y, k]) => `<path transform="translate(${x} ${y}) scale(${k})" d="${CROWN_BOLT}"/>`).join('')}</g>` : '';
  const body = `
    <defs>
      <linearGradient id="r${id}" x1="0" y1="0" x2="1" y2="1">${frameStops}</linearGradient>
      <linearGradient id="w${id}" x1="0" y1="0" x2="0" y2="1">${wreathStops(metal)}</linearGradient>
      <radialGradient id="e${id}" cx=".5" cy=".28" r=".85"><stop offset="0" stop-color="${gg ? '#1f4553' : shade(base, -0.5)}"/><stop offset=".55" stop-color="${gg ? '#0b1a22' : shade(base, -0.8)}"/><stop offset="1" stop-color="#05070b"/></radialGradient>
      <linearGradient id="s${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="b${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".4" stop-color="${gg ? '#c6fbff' : '#f6cf6a'}"/><stop offset="1" stop-color="${gg ? '#2aa9c8' : '#9a6a18'}"/></linearGradient>
      <filter id="f${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5"/></filter>
    </defs>
    <g fill="url(#w${id})" stroke="url(#w${id})">${BRANCH}</g>
    <g fill="url(#w${id})" stroke="url(#w${id})" transform="translate(260 0) scale(-1 1)">${BRANCH}</g>
    <path d="${KNOT}" fill="url(#w${id})"/><circle cx="130" cy="200" r="4.5" fill="url(#w${id})"/>
    <path class="rim" d="${SHIELD}" fill="url(#r${id})"/>
    <path d="${BEVEL}" fill="${shade(base, -0.55)}" opacity=".55"/>
    <path d="${INNER}" fill="url(#e${id})"/>
    <g class="glyph-glow" filter="url(#f${id})" opacity="${un ? 0.25 : 0.7}">${glyph(sym, base, `g${id}`)}</g>
    <g class="glyph"${un ? ' opacity=".45"' : ''}>${glyph(sym, `url(#b${id})`, `m${id}`)}${un ? `<path d="${FACET}" fill="#fff" opacity=".28"/>` : ''}</g>
    <path d="${SHEEN}" fill="url(#s${id})"/>
    ${gems}${crown}`;
  const wrap = document.createElement('span');
  wrap.className = `emblem emblem-${un ? 'unranked' : tier}`;
  wrap.dataset.division = String(div);
  wrap.dataset.wreath = metal;
  wrap.dataset.glyph = sym;
  wrap.style.setProperty('--em-glow', gg ? GREEK_GOD_GRADIENT[1] : base);
  wrap.style.width = `${size}px`;
  wrap.innerHTML = `<svg viewBox="0 0 260 230" width="${size}" height="${Math.round(size * 230 / 260)}" role="img" aria-label="${String(label ?? tier).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}">${body}</svg>`;
  return wrap;
}

/** The tier's symbol alone, as a small inline <svg> (the rank pyramid's passed steps). */
export function tierGlyph(tier, paint = 'currentColor', size = 18) {
  const name = GLYPH_OF[tier] ?? 'bolt';
  return `<svg class="tier-glyph" viewBox="84 72 92 92" width="${size}" height="${size}" aria-hidden="true" focusable="false">${glyph(name, paint, `pg-${tier}`)}</svg>`;
}
