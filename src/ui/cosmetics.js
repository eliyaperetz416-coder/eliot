// OUR DESIGN: shop cosmetics drawn procedurally on a canvas (no external assets). Used by the shop previews and the player card.
import { mulberry32, hashSeed } from '../core/generator.mjs';

const rnd = (seed) => mulberry32(hashSeed(seed));

function leaf(g, x, y, ang, len, color) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = color;
  g.beginPath(); g.ellipse(0, 0, len * 0.32, len, 0, 0, Math.PI * 2); g.fill(); g.restore();
}
function bolt(g, x, y, ang, size, color, width = 4) {
  g.save(); g.translate(x, y); g.rotate(ang); g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(size * 0.25, size * 0.3); g.lineTo(-size * 0.1, size * 0.45); g.lineTo(size * 0.2, size * 0.8); g.lineTo(0, size); g.stroke(); g.restore();
}

/* ---------- backgrounds ---------- */
export function paintBackground(g, art, W, H) {
  const r = rnd(`bg:${art}`);
  const grad = (stops, y0 = 0, y1 = H) => { const l = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => l.addColorStop(o, c)); g.fillStyle = l; g.fillRect(0, 0, W, H); };
  switch (art) {
    case 'storm': {
      grad([[0, '#0f1224'], [1, '#2b3454']]);
      for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(210,220,255,${0.05 + r() * 0.07})`; g.beginPath(); g.ellipse(r() * W, r() * H * 0.7, 80 + r() * 150, 30 + r() * 50, 0, 0, Math.PI * 2); g.fill(); }
      bolt(g, W * (0.2 + r() * 0.6), 0, 0.12, H * 0.45, 'rgba(220,235,255,.55)', 5);
      break;
    }
    case 'garden': {
      grad([[0, '#0a1a12'], [1, '#17361f']]);
      for (let i = 0; i < 70; i++) leaf(g, r() * W, r() * H, r() * Math.PI * 2, 20 + r() * 40, `rgba(90,200,120,${0.06 + r() * 0.12})`);
      break;
    }
    case 'marble': {
      grad([[0, '#14161e'], [1, '#262a33']]);
      g.lineCap = 'round';
      for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(255,226,150,${0.08 + r() * 0.1})`; g.lineWidth = 1.5 + r() * 3; g.beginPath(); g.moveTo(r() * W, 0); g.bezierCurveTo(r() * W, H * 0.3, r() * W, H * 0.6, r() * W, H); g.stroke(); }
      break;
    }
    case 'dawn': {
      grad([[0, '#150d2e'], [0.55, '#5a2a63'], [1, '#e8863c']]);
      const sun = g.createRadialGradient(W / 2, H * 0.86, 10, W / 2, H * 0.86, H * 0.4);
      sun.addColorStop(0, 'rgba(255,230,160,.95)'); sun.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, H);
      g.fillStyle = '#120a1c'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.9); g.lineTo(W * 0.25, H * 0.8); g.lineTo(W * 0.42, H * 0.88); g.lineTo(W * 0.6, H * 0.74); g.lineTo(W * 0.8, H * 0.87); g.lineTo(W, H * 0.82); g.lineTo(W, H); g.fill();
      break;
    }
    case 'forge': {
      grad([[0, '#1b0906'], [1, '#42150a']]);
      const glow = g.createRadialGradient(W / 2, H, 10, W / 2, H, H * 0.7); glow.addColorStop(0, 'rgba(255,120,30,.5)'); glow.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,${120 + Math.floor(r() * 100)},40,${0.2 + r() * 0.6})`; g.beginPath(); g.arc(r() * W, r() * H, 1.5 + r() * 3, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'stars': {
      grad([[0, '#050715'], [1, '#151c3d']]);
      const neb = g.createRadialGradient(W * 0.7, H * 0.3, 10, W * 0.7, H * 0.3, W * 0.6); neb.addColorStop(0, 'rgba(140,90,255,.28)'); neb.addColorStop(1, 'rgba(140,90,255,0)'); g.fillStyle = neb; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.8})`; g.beginPath(); g.arc(r() * W, r() * H, 0.6 + r() * 2, 0, Math.PI * 2); g.fill(); }
      break;
    }
    default: grad([[0, '#0a0b12'], [1, '#11131f']]);
  }
}

/* ---------- frames: cx, cy, rad = emblem centre and radius (emblem is about 0.9 rad wide, 1.9 rad tall) ---------- */
const TAU = Math.PI * 2;
const GOLD_STOPS = [[0, '#fff3c4'], [0.3, '#f5c84f'], [0.65, '#c68a1d'], [1, '#f8da7c']];
function gold(g, x0, y0, x1, y1) { const l = g.createLinearGradient(x0, y0, x1, y1); GOLD_STOPS.forEach(([o, c]) => l.addColorStop(o, c)); return l; }
function pointed(g, len, w) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -w, len, 0); g.quadraticCurveTo(len * 0.45, w, 0, 0); g.closePath(); }
const soft = (g, color = 'rgba(0,0,0,.55)', blur = 8) => { g.shadowColor = color; g.shadowBlur = blur; };

function laurel(g, cx, cy, rad) {
  const R = rad * 1.1, a0 = Math.PI / 2 + 0.12, a1 = -Math.PI / 2 + 0.5, n = 12;
  for (const side of [1, -1]) {
    g.save(); g.translate(cx, cy); g.scale(side, 1);
    soft(g, 'rgba(0,0,0,.5)', rad * 0.06);
    g.strokeStyle = gold(g, 0, -R, 0, R); g.lineWidth = rad * 0.04; g.lineCap = 'round';
    g.beginPath(); g.arc(0, 0, R, a0, a1, true); g.stroke();
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1), a = a0 + (a1 - a0) * tt, len = rad * (0.36 - tt * 0.12), w = len * 0.3;
      const px = Math.cos(a) * R, py = Math.sin(a) * R, tan = a - Math.PI / 2;
      for (const [off, outer] of [[-0.7, true], [0.7, false]]) {
        g.save(); g.translate(px, py); g.rotate(tan + off);
        g.fillStyle = outer ? gold(g, 0, -w, len, w) : gold(g, len, -w, 0, w);
        pointed(g, len, w); g.fill();
        g.shadowBlur = 0; g.strokeStyle = 'rgba(110,70,10,.55)'; g.lineWidth = Math.max(1, rad * 0.012);
        g.beginPath(); g.moveTo(len * 0.1, 0); g.lineTo(len * 0.85, 0); g.stroke();
        g.restore();
      }
    }
    g.restore();
  }
  // ribbon tie
  g.save(); g.translate(cx, cy + R + rad * 0.03); soft(g, 'rgba(0,0,0,.5)', rad * 0.05); g.fillStyle = '#b3202f';
  for (const s2 of [1, -1]) { g.save(); g.scale(s2, 1); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(rad * 0.12, rad * 0.02, rad * 0.22, rad * 0.14); g.lineTo(rad * 0.13, rad * 0.12); g.lineTo(rad * 0.15, rad * 0.2); g.quadraticCurveTo(rad * 0.06, rad * 0.1, 0, rad * 0.05); g.closePath(); g.fill(); g.restore(); }
  g.fillStyle = gold(g, -rad * 0.05, 0, rad * 0.05, rad * 0.1); g.beginPath(); g.arc(0, rad * 0.02, rad * 0.06, 0, TAU); g.fill();
  g.restore();
}

/** Greek key border: a rectangle (half sizes Sx, Sy) with unit u. Square around the emblem in the shop, whole-card border on the player card. */
function meanderRect(g, cx, cy, Sx, Sy, u) {
  const t = 3 * u;
  g.save(); soft(g, 'rgba(0,0,0,.5)', u * 0.5);
  g.translate(cx, cy);
  const grad = gold(g, -Sx, -Sy, Sx, Sy);
  g.strokeStyle = grad; g.lineWidth = u * 0.28; g.strokeRect(-Sx, -Sy, 2 * Sx, 2 * Sy); g.strokeRect(-Sx + t, -Sy + t, 2 * (Sx - t), 2 * (Sy - t));
  g.shadowBlur = 0; g.lineWidth = u * 0.34; g.lineJoin = 'miter'; g.lineCap = 'butt';
  const side = (len, rot, ox, oy) => {
    g.save(); g.rotate(rot); g.translate(ox, oy);
    const inner = len - 2 * t, k = Math.max(1, Math.floor((inner + u) / (4 * u))), off = t + (inner - (k * 4 * u - u)) / 2;
    g.beginPath(); g.moveTo(t, 0.15 * u); g.lineTo(len - t, 0.15 * u);
    for (let i = 0; i < k; i++) { const x = off + i * 4 * u, y = 0.15 * u; g.moveTo(x, y); g.lineTo(x, y + 2.4 * u); g.lineTo(x + 3 * u, y + 2.4 * u); g.lineTo(x + 3 * u, y + 0.8 * u); g.lineTo(x + u, y + 0.8 * u); g.lineTo(x + u, y + 1.6 * u); g.lineTo(x + 2 * u, y + 1.6 * u); }
    g.strokeStyle = grad; g.stroke(); g.restore();
  };
  side(2 * Sx, 0, -Sx, -Sy); side(2 * Sy, Math.PI / 2, -Sy, -Sx); side(2 * Sx, Math.PI, -Sx, -Sy); side(2 * Sy, -Math.PI / 2, -Sy, -Sx);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = sx < 0 ? -Sx : Sx - t, y = sy < 0 ? -Sy : Sy - t;
    g.fillStyle = grad; g.fillRect(x, y, t, t); g.fillStyle = '#12141f'; g.fillRect(x + t * 0.28, y + t * 0.28, t * 0.44, t * 0.44); g.fillStyle = grad; g.fillRect(x + t * 0.4, y + t * 0.4, t * 0.2, t * 0.2);
  }
  g.restore();
}
function meander(g, cx, cy, rad, W, H) {
  if (rad > 150) { meanderRect(g, W / 2, H / 2, W / 2 - 34, H / 2 - 34, 15); return; } // the player card: border around the whole card
  const S = Math.min(rad * 1.55, Math.min(W, H) / 2 - 6), n = 3;
  meanderRect(g, cx, cy, S, S, (2 * S) / (4 * n + 6));
}

function thunder(g, cx, cy, rad) {
  const R = rad * 1.06;
  g.save();
  g.shadowColor = '#6fe8ff'; g.shadowBlur = rad * 0.18;
  g.strokeStyle = '#d8fbff'; g.lineWidth = rad * 0.035; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.shadowBlur = rad * 0.08; g.strokeStyle = '#3db8ff'; g.lineWidth = rad * 0.014; g.beginPath(); g.arc(cx, cy, R + rad * 0.075, 0, TAU); g.stroke();
  const pts = [[0, 0], [0.1, -0.09], [0.12, 0.02], [0.22, -0.06], [0.2, 0.05], [0.31, 0]];
  for (let i = 0; i < 8; i++) {
    g.save(); g.translate(cx, cy); g.rotate((i * TAU) / 8 + TAU / 16); g.translate(R + rad * 0.02, 0);
    g.strokeStyle = '#eaffff'; g.lineWidth = rad * 0.03; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x * rad, y * rad * (i % 2 ? -1 : 1)) : g.moveTo(x * rad, y * rad))); g.stroke();
    g.restore();
  }
  g.shadowBlur = 0; g.fillStyle = '#eaffff';
  for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; g.beginPath(); g.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, rad * 0.025, 0, TAU); g.fill(); }
  g.restore();
}

function helm(g, cx, cy, rad) {
  const R = rad * 1.02, n = 9;
  g.save(); soft(g, 'rgba(0,0,0,.55)', rad * 0.07);
  for (let i = 0; i < n; i++) {
    const tt = i / (n - 1), a = Math.PI * (1.14 + tt * 0.72), mid = 1 - Math.abs(tt - 0.5) * 1.1, len = rad * (0.22 + 0.24 * mid);
    g.save(); g.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.rotate(a);
    const l = g.createLinearGradient(0, 0, len, 0); l.addColorStop(0, '#7c0f1c'); l.addColorStop(0.6, '#d3283a'); l.addColorStop(1, '#ff7a7a');
    g.fillStyle = l; pointed(g, len, len * 0.2); g.fill(); g.restore();
  }
  g.shadowBlur = 0;
  g.strokeStyle = gold(g, cx - R, cy - R, cx + R, cy); g.lineWidth = rad * 0.1; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.strokeStyle = 'rgba(110,70,10,.6)'; g.lineWidth = rad * 0.012; g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
  g.fillStyle = gold(g, cx - rad * 0.1, cy - R - rad * 0.1, cx + rad * 0.1, cy - R + rad * 0.1); g.beginPath(); g.arc(cx, cy - R, rad * 0.09, 0, TAU); g.fill();
  g.restore();
}

function wings(g, cx, cy, rad, W) {
  const room = Math.max(0.5, (W / 2 - rad * 0.8) / rad);
  const spread = Math.min(1.05, room * 0.95);
  for (const side of [1, -1]) {
    g.save(); g.translate(cx + side * rad * 0.78, cy - rad * 0.22); g.scale(side, 1);
    soft(g, 'rgba(0,0,0,.5)', rad * 0.06);
    const rows = [{ n: 6, len: spread * rad * 1.0, from: -1.0, to: 0.12, w: 0.15, c0: '#fff7dc', c1: '#d9b24a' }, { n: 6, len: spread * rad * 0.74, from: -0.82, to: 0.2, w: 0.14, c0: '#ffffff', c1: '#e8c768' }, { n: 5, len: spread * rad * 0.46, from: -0.62, to: 0.2, w: 0.13, c0: '#ffffff', c1: '#f3dc92' }];
    for (const r of rows) for (let i = 0; i < r.n; i++) {
      const tt = i / (r.n - 1), a = r.from + (r.to - r.from) * tt, len = r.len * (0.78 + 0.22 * (1 - tt));
      g.save(); g.translate(0, tt * rad * 0.22 * (r.len / (spread * rad))); g.rotate(a);
      const l = g.createLinearGradient(0, 0, len, 0); l.addColorStop(0, r.c1); l.addColorStop(0.5, r.c0); l.addColorStop(1, r.c1);
      g.fillStyle = l; g.beginPath(); g.moveTo(0, -len * 0.07); g.bezierCurveTo(len * 0.5, -len * (r.w + 0.04), len * 0.9, -len * r.w * 0.8, len, 0); g.bezierCurveTo(len * 0.9, len * r.w * 0.8, len * 0.5, len * (r.w + 0.04), 0, len * 0.07); g.closePath(); g.fill();
      g.shadowBlur = 0; g.strokeStyle = 'rgba(120,80,15,.35)'; g.lineWidth = Math.max(1, rad * 0.01); g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.92, 0); g.stroke();
      g.restore(); soft(g, 'rgba(0,0,0,.5)', rad * 0.06);
    }
    g.restore();
  }
}

export function paintFrame(g, art, cx, cy, rad, W, H, accent) {
  g.save();
  switch (art) {
    case 'laurel': laurel(g, cx, cy, rad); break;
    case 'meander': meander(g, cx, cy, rad, W, H); break;
    case 'thunder': thunder(g, cx, cy, rad); break;
    case 'helm': helm(g, cx, cy, rad); break;
    case 'wings': wings(g, cx, cy, rad, W); break;
    default: break;
  }
  g.restore();
}

/* ---------- effects ---------- */
export function paintEffect(g, art, cx, cy, rad, W, H, accent) {
  const r = rnd(`fx:${art}`);
  g.save();
  switch (art) {
    case 'glow': { const gl = g.createRadialGradient(cx, cy, rad * 0.3, cx, cy, rad * 1.7); gl.addColorStop(0, `${accent}99`); gl.addColorStop(1, `${accent}00`); g.fillStyle = gl; g.fillRect(0, 0, W, H); break; }
    case 'ember': { for (let i = 0; i < 60; i++) { const x = r() * W, y = H - r() * H * 0.9; g.fillStyle = `rgba(255,${110 + Math.floor(r() * 100)},40,${0.25 + r() * 0.6})`; g.beginPath(); g.arc(x, y, 1.5 + r() * 3.5, 0, Math.PI * 2); g.fill(); } break; }
    case 'sparks': { g.shadowColor = '#6fe8ff'; g.shadowBlur = rad * 0.12; g.strokeStyle = '#dffcff'; g.lineWidth = rad * 0.022; g.lineJoin = 'round'; g.lineCap = 'round'; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + r() * 0.2, d0 = rad * (1.08 + r() * 0.1), len = rad * (0.14 + r() * 0.16); g.beginPath(); g.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); for (let k = 1; k <= 3; k++) { const dd = d0 + (len * k) / 3, off = (r() - 0.5) * rad * 0.1; g.lineTo(cx + Math.cos(a) * dd - Math.sin(a) * off, cy + Math.sin(a) * dd + Math.cos(a) * off); } g.stroke(); } break; }
    case 'dust': { for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,${200 + Math.floor(r() * 40)},${90 + Math.floor(r() * 60)},${0.25 + r() * 0.6})`; g.beginPath(); g.arc(r() * W, r() * H, 1.5 + r() * 3.5, 0, Math.PI * 2); g.fill(); } break; }
    default: break;
  }
  g.restore();
}

/** A small preview of one cosmetic on a sample card. `emblemImg` is an Image/canvas of an emblem. */
export function drawPreview(canvas, item, emblemImg, accent = '#ffc43d') {
  const W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#0a0b12'; g.fillRect(0, 0, W, H);
  if (item.kind === 'background') paintBackground(g, item.art, W, H);
  const cx = W / 2, cy = H * 0.5, rad = item.kind === 'frame' ? H * (0.2) : H * 0.28;
  if (item.kind === 'effect') paintEffect(g, item.art, cx, cy, rad, W, H, accent);
  if (emblemImg) g.drawImage(emblemImg, cx - rad * 0.9, cy - rad * 0.95, rad * 1.8, rad * 1.8 * (168 / 160));
  if (item.kind === 'frame') paintFrame(g, item.art, cx, cy, rad, W, H, accent);
}
