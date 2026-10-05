// OUR DESIGN: rank emblem family. One crest per tier, five division pips (V lowest), Greek God gets a bolt crown.
import { TIER_COLORS, GREEK_GOD_GRADIENT } from '../core/ranks.mjs';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

function shade(hex, amt) { // amt -1..1
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
const reduced = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

const SHIELD = 'M80 8 L128 24 V76 C128 112 106 134 80 146 C54 134 32 112 32 76 V24 Z';
const PLATE = 'M80 18 L118 31 V76 C118 106 100 124 80 134 C60 124 42 106 42 76 V31 Z';
const WING = 'M32 42 C14 38 4 52 2 66 C12 60 20 62 26 66 C14 70 10 82 10 92 C18 84 26 84 32 88 C24 94 24 106 28 114 C36 102 42 96 50 96 Z';

function leaves(color) {
  let s = '';
  for (const side of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const deg = 100 + i * 20;
      const th = (deg * Math.PI) / 180;
      const x = 80 + side * 30 * Math.cos(th) * -1, y = 82 + 30 * Math.sin(th) * -1 * -1;
      const rot = side * (deg - 90) * -1 + (side === 1 ? 20 : -20);
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3.2" ry="8" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${color}"/>`;
    }
  }
  return s;
}

function glyph(tier, c, light) {
  const st = `fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;
  switch (tier) {
    case 'wood': return `<g fill="none" stroke="${c}" stroke-width="3.5"><circle cx="80" cy="76" r="8"/><circle cx="80" cy="76" r="16"/><circle cx="80" cy="76" r="24" stroke-dasharray="40 10"/></g><circle cx="80" cy="76" r="3" fill="${c}"/>`;
    case 'bronze': return `<path d="M60 86 L80 64 L100 86" ${st}/>`;
    case 'silver': return `<path d="M60 78 L80 58 L100 78" ${st}/><path d="M60 98 L80 78 L100 98" ${st}/>`;
    case 'gold': return `<path d="M60 70 L80 52 L100 70" ${st}/><path d="M60 88 L80 70 L100 88" ${st}/><path d="M60 106 L80 88 L100 106" ${st}/>`;
    case 'platinum': return `<path d="M80 50 L104 70 L80 108 L56 70 Z" fill="${c}"/><path d="M56 70 H104 M80 50 L68 70 L80 108 L92 70 Z" fill="none" stroke="${light}" stroke-width="2" stroke-linejoin="round" opacity=".8"/>`;
    case 'diamond': return `<path d="M80 46 L110 68 L80 112 L50 68 Z" fill="${c}"/><path d="M50 68 H110 M66 68 L80 46 L94 68 L80 112 Z" fill="none" stroke="${light}" stroke-width="2" stroke-linejoin="round"/><path d="M104 44 l2.500 7 7 2.500 -7 2.500 -2.500 7 -2.500 -7 -7 -2.500 7 -2.500 Z" fill="${light}"/>`;
    case 'champion': return `<path d="M52 102 L56 62 L69 80 L80 54 L91 80 L104 62 L108 102 Z" fill="${c}"/><rect x="52" y="104" width="56" height="8" rx="3" fill="${c}"/><circle cx="56" cy="60" r="3.500" fill="${light}"/><circle cx="80" cy="52" r="3.500" fill="${light}"/><circle cx="104" cy="60" r="3.500" fill="${light}"/>`;
    case 'titan': return `<path d="M50 62 C48 82 60 92 80 98 C100 92 112 82 110 62 C102 74 92 78 80 78 C68 78 58 74 50 62 Z" fill="${c}"/><path d="M80 52 L89 98 L80 112 L71 98 Z" fill="${light}"/>`;
    case 'olympian': return `${leaves(c)}<path d="M80 50 C94 68 96 82 80 104 C64 82 66 68 80 50 Z" fill="${light}"/><path d="M80 70 C86 80 85 88 80 96 C75 88 74 80 80 70 Z" fill="${c}"/>`;
    case 'greekgod': return `<path d="M48 108 H112 L106 119 H54 Z" fill="url(#GG)"/><path d="M58 62 L45 84 H55 L48 102 L68 76 H58 Z M102 62 L115 84 H105 L112 102 L92 76 H102 Z" fill="url(#GG)" opacity=".8"/><path d="M90 34 L58 84 H79 L66 114 L108 64 H87 Z" fill="url(#GG)" stroke="#fff" stroke-width="1.500" stroke-linejoin="round"/>`;
    default: return `<text x="80" y="90" text-anchor="middle" font-size="40" fill="${c}" font-family="Cinzel,serif">?</text>`;
  }
}

/** emblem({tier, divisionIndex (0=V..4=I), size}) -> element. tier 'unranked' is a dim outline. */
export function emblem({ tier = 'unranked', divisionIndex = 0, size = 96, label }) {
  const id = ++uid;
  const gg = tier === 'greekgod';
  const base = tier === 'unranked' ? '#59607d' : TIER_COLORS[tier];
  const light = shade(base, 0.5), dark = shade(base, -0.55), mid = shade(base, -0.25);
  const wings = ['titan', 'olympian', 'greekgod'].includes(tier);
  const anim = gg && !reduced()
    ? `<animate attributeName="stop-color" values="${GREEK_GOD_GRADIENT[0]};${GREEK_GOD_GRADIENT[1]};${GREEK_GOD_GRADIENT[0]}" dur="3.6s" repeatCount="indefinite"/>`
    : '';
  const ggStops = `<stop offset="0" stop-color="${GREEK_GOD_GRADIENT[0]}">${anim}</stop><stop offset="1" stop-color="${GREEK_GOD_GRADIENT[1]}"/>`;
  const pips = !gg && tier !== 'unranked'
    ? [52, 66, 80, 94, 108].map((x, i) => `<circle cx="${x}" cy="158" r="4" fill="${i <= divisionIndex ? base : 'none'}" stroke="${base}" stroke-width="1.500" opacity="${i <= divisionIndex ? 1 : 0.5}"/>`).join('')
    : '';
  const wingSvg = wings ? `<g fill="${gg ? 'url(#GG)' : base}" opacity=".85"><path d="${WING}"/><path d="${WING}" transform="translate(160 0) scale(-1 1)"/></g>` : '';
  const body = `
    <defs>
      <linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".5" stop-color="${base}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
      <linearGradient id="GG" x1="0" y1="0" x2="1" y2="1">${ggStops}</linearGradient>
      <radialGradient id="p${id}" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="${shade(base, -0.7)}"/><stop offset="1" stop-color="#0b0c14"/></radialGradient>
    </defs>
    ${wingSvg}
    <path d="${SHIELD}" fill="${tier === 'unranked' ? 'none' : `url(#g${id})`}" stroke="${gg ? 'url(#GG)' : light}" stroke-width="${tier === 'unranked' ? 3 : 2}" stroke-linejoin="round" ${tier === 'unranked' ? 'stroke-dasharray="6 6"' : ''}/>
    ${tier === 'unranked' ? '' : `<path d="${PLATE}" fill="url(#p${id})" stroke="${dark}" stroke-width="2"/>`}
    ${glyph(tier, base, light).replace(/url\(#GG\)/g, 'url(#GG)')}
    ${pips}`;
  const wrap = document.createElement('span');
  wrap.className = `emblem emblem-${tier}`;
  wrap.style.setProperty('--em-glow', gg ? '#7df9ff' : base);
  wrap.style.width = `${size}px`;
  wrap.innerHTML = `<svg viewBox="0 0 160 168" width="${size}" height="${size * 168 / 160}" role="img" aria-label="${label ?? tier}">${body}</svg>`;
  return wrap;
}
