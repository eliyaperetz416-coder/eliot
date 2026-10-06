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

/* ---------- frames: cx, cy, rad = emblem centre and radius ---------- */
export function paintFrame(g, art, cx, cy, rad, W, H, accent) {
  const r = rnd(`fr:${art}`);
  g.save();
  switch (art) {
    case 'laurel': {
      for (const side of [1, -1]) for (let i = 0; i < 12; i++) {
        const a = Math.PI * (0.62 + i * 0.075);
        const x = cx + side * Math.cos(a) * rad * 1.02, y = cy + Math.sin(a) * rad * 1.02 * -1 + rad * 0.05;
        leaf(g, x, y, (side === 1 ? 1 : -1) * (a - Math.PI * 0.5) + (side === 1 ? 0.5 : -0.5), 30 - i * 0.8, i % 2 ? '#d6b04a' : '#8ecb6a');
      }
      break;
    }
    case 'meander': {
      g.strokeStyle = accent; g.lineWidth = 6; g.globalAlpha = 0.85; g.strokeRect(46, 46, W - 92, H - 92);
      g.lineWidth = 4; g.strokeStyle = '#d6b04a';
      const u = 22;
      for (const y of [64, H - 64 - u]) { g.beginPath(); for (let x = 70; x < W - 70; x += u * 4) { g.moveTo(x, y + u); g.lineTo(x, y); g.lineTo(x + u * 2, y); g.lineTo(x + u * 2, y + u); g.lineTo(x + u, y + u); g.lineTo(x + u, y + u * 0.4); } g.stroke(); }
      break;
    }
    case 'thunder': {
      for (let i = 0; i < 14; i++) { const x = 60 + (i * (W - 120)) / 13; bolt(g, x, 40, (r() - 0.5) * 0.4, 70 + r() * 40, '#9ff5ff', 4); bolt(g, x, H - 40, Math.PI + (r() - 0.5) * 0.4, 70 + r() * 40, '#9ff5ff', 4); }
      break;
    }
    case 'helm': {
      g.strokeStyle = '#d6b04a'; g.lineWidth = 8; g.fillStyle = 'rgba(214,176,74,.18)';
      g.beginPath(); g.arc(cx, cy - rad * 0.55, rad * 0.62, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      for (let i = 0; i < 9; i++) { const a = Math.PI * (1.12 + i * 0.095); g.beginPath(); g.moveTo(cx + Math.cos(a) * rad * 0.62, cy - rad * 0.55 + Math.sin(a) * rad * 0.62); g.lineTo(cx + Math.cos(a) * rad * 0.9, cy - rad * 0.55 + Math.sin(a) * rad * 0.9 - 14); g.stroke(); }
      break;
    }
    case 'wings': {
      for (const side of [1, -1]) for (let i = 0; i < 7; i++) {
        g.save(); g.translate(cx + side * rad * 0.78, cy - rad * 0.1 + i * 16); g.rotate(side * (-0.5 + i * 0.12));
        g.fillStyle = i % 2 ? 'rgba(255,255,255,.85)' : 'rgba(214,176,74,.9)';
        g.beginPath(); g.ellipse(side * (70 + i * 6), 0, 120 - i * 8, 16, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
      break;
    }
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
    case 'sparks': { for (let i = 0; i < 12; i++) { const a = r() * Math.PI * 2, d = rad * (1 + r() * 0.35); bolt(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, a - Math.PI / 2, 50 + r() * 50, '#a8f4ff', 3.5); } break; }
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
  const cx = W / 2, cy = H * 0.5, rad = H * 0.28;
  if (item.kind === 'effect') paintEffect(g, item.art, cx, cy, rad, W, H, accent);
  if (emblemImg) g.drawImage(emblemImg, cx - rad * 0.9, cy - rad * 0.95, rad * 1.8, rad * 1.8 * (168 / 160));
  if (item.kind === 'frame') paintFrame(g, item.art, cx, cy, rad, W, H, accent);
}
