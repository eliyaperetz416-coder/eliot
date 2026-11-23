// OUR DESIGN: the rank crest (artboard E5). A gold laurel wreath (36 leaves) around an enamel shield whose rim is the
// tier colour, a faceted two-tone bolt in the middle, and the division as diamonds above (III = 3, V lowest).
// Greek God: a #fff1b8 -> #7df9ff rim and a crown of three bolts instead of diamonds. Unranked: a grey rim, no diamonds.
import { TIER_COLORS, GREEK_GOD_GRADIENT } from '../core/ranks.mjs';

let uid = 0;

function shade(hex, amt) { // amt -1..1
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
const reduced = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

// Left half of the wreath: [cx, cy, rx, ry, rotate]. The right half mirrors it around x = 130.
const LEAVES = [[87.7, 191.5, 9, 3.6, 180], [82.1, 202.1, 9, 3.6, 236], [69.8, 178.9, 8.6, 3.5, 194], [61.7, 187.8, 8.6, 3.5, 250],
  [55.4, 162.3, 8.3, 3.3, 208], [45.4, 169, 8.3, 3.3, 264], [45.4, 142.8, 7.9, 3.2, 222], [34.2, 146.9, 7.9, 3.2, 278],
  [40.5, 121.4, 7.6, 3, 236], [28.6, 122.7, 7.6, 3, 292], [40.9, 99.5, 7.2, 2.9, 250], [29, 97.8, 7.2, 2.9, 306],
  [46.6, 78.3, 6.8, 2.7, 264], [35.4, 73.8, 6.8, 2.7, 320], [57.2, 59.1, 6.5, 2.6, 278], [47.5, 52, 6.5, 2.6, 334],
  [72.1, 43.1, 6.1, 2.4, 292], [64.4, 33.9, 6.1, 2.4, 348]];
const leaf = (x, y, rx, ry, r) => `<ellipse class="leaf" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})"/>`;
const WREATH = LEAVES.map(([x, y, rx, ry, r]) => leaf(x, y, rx, ry, r) + leaf(+(260 - x).toFixed(1), y, rx, ry, 180 - r)).join('');

const SHIELD = 'M130 46 L180 62 V108 C180 145 158 169 130 183 C102 169 80 145 80 108 V62 Z';
const INNER = 'M130 56 L171 69 V108 C171 139 153 159 130 171 C107 159 89 139 89 108 V69 Z';
const BOLT = 'M136 72 114 112h15l-4 40 26-48h-16l3-32z';
const SMALL_BOLT = (x, y, s) => `<path d="M${x + 3 * s} ${y} L${x - 4 * s} ${y + 10 * s} H${x} L${x - 2 * s} ${y + 18 * s} L${x + 6 * s} ${y + 6 * s} H${x + 2 * s} Z"/>`;

/** emblem({tier, divisionIndex (0=V..4=I), size, label}) -> element. `size` is the width in px. */
export function emblem({ tier = 'unranked', divisionIndex = 0, size = 96, label }) {
  const id = ++uid; // gradient ids carry it: ids must stay unique when several crests share a screen
  const gg = tier === 'greekgod', un = tier === 'unranked' || !TIER_COLORS[tier];
  const base = un ? '#6B7080' : TIER_COLORS[tier];
  const anim = gg && !reduced()
    ? `<animate attributeName="stop-color" values="${GREEK_GOD_GRADIENT[0]};${GREEK_GOD_GRADIENT[1]};${GREEK_GOD_GRADIENT[0]}" dur="3.6s" repeatCount="indefinite"/>`
    : '';
  const rimStops = gg
    ? `<stop offset="0" stop-color="${GREEK_GOD_GRADIENT[0]}">${anim}</stop><stop offset="1" stop-color="${GREEK_GOD_GRADIENT[1]}"/>`
    : `<stop offset="0" stop-color="${shade(base, 0.7)}"/><stop offset=".4" stop-color="${base}"/><stop offset=".6" stop-color="${shade(base, -0.35)}"/><stop offset="1" stop-color="${shade(base, 0.45)}"/>`;
  const div = Math.max(0, Math.min(4, divisionIndex | 0));
  const n = gg || un ? 0 : 5 - div;
  const xs = Array.from({ length: n }, (_, i) => 130 + (i - (n - 1) / 2) * 15);
  const diamonds = xs.map((x) => { const big = n % 2 === 1 && x === 130; const s = big ? 8 : 6; return `<rect class="dia" x="${x - s / 2}" y="${26 - s / 2 + (big ? 0 : 4)}" width="${s}" height="${s}" transform="rotate(45 ${x} ${26 + (big ? 0 : 4)})"/>`; }).join('');
  const crown = gg ? `<g class="crown" fill="url(#r${id})">${SMALL_BOLT(112, 22, 0.8)}${SMALL_BOLT(130, 12, 1.05)}${SMALL_BOLT(148, 22, 0.8)}</g>` : '';
  const body = `
    <defs>
      <linearGradient id="r${id}" x1="0" y1="0" x2="1" y2="1">${rimStops}</linearGradient>
      <linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3DB9A"/><stop offset=".5" stop-color="#C9A24A"/><stop offset="1" stop-color="#8F6E2C"/></linearGradient>
      <radialGradient id="e${id}" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="${un ? '#1A1C22' : shade(base, -0.78)}"/><stop offset="1" stop-color="#080B12"/></radialGradient>
      <linearGradient id="b${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FAEBC0"/><stop offset=".5" stop-color="#E2BE5E"/><stop offset=".5" stop-color="#A9853A"/><stop offset="1" stop-color="#7A5C22"/></linearGradient>
    </defs>
    <g fill="none" stroke="url(#g${id})" stroke-width="1.4" stroke-linecap="round"><path d="M84.9 196.8 A96 96 0 0 1 68.3 38.5"/><path d="M175.1 196.8 A96 96 0 0 0 191.7 38.5"/></g>
    <g fill="url(#g${id})">${WREATH}</g>
    <path d="M130 207 l-14 14 M130 207 l14 14" stroke="url(#g${id})" stroke-width="2" stroke-linecap="round"/>
    <circle cx="130" cy="205" r="4" fill="url(#g${id})"/>
    <path class="rim" d="${SHIELD}" fill="url(#e${id})" stroke="url(#r${id})" stroke-width="4"${un ? ' stroke-dasharray="7 5"' : ''}/>
    <path d="${INNER}" fill="none" stroke="url(#g${id})" stroke-width=".8" opacity=".7"/>
    <path d="M86 66 L128 52" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
    <path d="${BOLT}" fill="url(#b${id})"${un ? ' opacity=".45"' : ''}/>
    <g fill="url(#g${id})">${diamonds}</g>
    ${crown}`;
  const wrap = document.createElement('span');
  wrap.className = `emblem emblem-${un ? 'unranked' : tier}`;
  wrap.dataset.division = String(div);
  wrap.style.setProperty('--em-glow', gg ? '#7df9ff' : base);
  wrap.style.width = `${size}px`;
  wrap.innerHTML = `<svg viewBox="0 0 260 230" width="${size}" height="${Math.round(size * 230 / 260)}" role="img" aria-label="${String(label ?? tier).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}">${body}</svg>`;
  return wrap;
}
