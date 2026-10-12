// Zip: a pixel alien in a space helmet. One file, no dependencies, no build step.
//   import { Zip } from './zip.js';  const zip = Zip.mount({ lang: 'he' });  zip.say('היי!');  zip.celebrate();
// Needs zip.css next to it (or load it yourself). Everything is generated from code, so poses, palette
// and accessory are options, not images.

export const W = 24;
export const H = 32;

export const PALETTE = {
  H: '#eef1ff', h: '#a3aedb', g: '#7fd8ff', v: '#49b4ea', w: '#e4f8ff',       // helmet rim, rim shade, glass, glass shade, glass shine
  G: '#58cc02', D: '#3d9600', L: '#92ee4e', C: '#ff7aa8',                     // head, head shade, head light, cheeks
  E: '#0b0b14', P: '#ffffff', M: '#0b0b14', R: '#ff4b8b',                     // eyes, eye shine, mouth, tongue
  B: '#7c6cff', b: '#5646e0', U: '#a99dff', K: '#262a44', S: '#a3aedb',       // suit, suit shade, suit light, dark trim, metal
  Y: '#ffc800', O: '#ff9600', J: '#ff9600', j: '#c76d00', F: '#fff3a0',       // lights, antenna, jetpack, jetpack shade, flame core
  N: '#ffd9a0',                                                               // feather
};

export const MOODS = ['idle', 'blink', 'happy', 'sad', 'think', 'wow', 'sleep', 'wave', 'cheer', 'walkA', 'walkB', 'fly'];
export const ACCESSORIES = ['jetpack', 'pen', 'dumbbells', 'jetpack+dumbbells', 'none'];   // join two with '+' (jetpack+dumbbells)

const inEll = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const ratio = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;

/** One frame as H rows of W characters (see PALETTE). Pure and deterministic. */
export function frame(mood = 'idle', { accessory = 'jetpack' } = {}) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
  const sym = (x, y, c) => { set(x, y, c); set(W - 1 - x, y, c); };
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };

  const has = (name) => String(accessory).split('+').includes(name);
  const armsUp = mood === 'cheer';
  const waving = mood === 'wave';
  const flying = mood === 'fly';

  // ---- jetpack (behind everything) ----
  if (has('jetpack')) {
    for (const side of [0, 1]) {
      const x0 = side ? 19 : 2;
      fill(x0, 20, x0 + 2, 27, 'J'); fill(x0 + (side ? 2 : 0), 20, x0 + (side ? 2 : 0), 27, 'j');
      fill(x0, 20, x0 + 2, 20, 'S'); fill(x0, 28, x0 + 2, 28, 'S');
      if (flying) { fill(x0, 29, x0 + 2, 30, 'Y'); set(x0 + 1, 29, 'F'); set(x0 + 1, 30, 'F'); set(x0 + 1, 31, 'O'); }
    }
  }

  // ---- antenna ----
  fill(10, 0, 13, 1, 'O'); set(10, 0, 'Y'); set(11, 0, 'Y');
  fill(11, 2, 12, 3, 'S');

  // ---- helmet ----
  const HC = [12, 12.2, 10.9, 9.2], HI = [12, 12.2, 8.9, 7.2];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inEll(x, y, ...HC)) continue;
    if (inEll(x, y, ...HI)) set(x, y, y > 14 ? 'v' : 'g');
    else set(x, y, x + 0.5 > 12 && y + 0.5 > 12.2 ? 'h' : 'H');
  }
  // glass shine (top-left arc)
  for (const [x, y] of [[4, 8], [4, 7], [5, 6], [6, 5], [7, 5], [4, 9]]) if (g[y][x] === 'g') set(x, y, 'w');

  // ---- head ----
  const HD = [12, 12.6, 7.4, 6.4];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inEll(x, y, ...HD)) continue;
    const r = ratio(x, y, ...HD);
    let c = 'G';
    if (r > 0.62 && x + 0.5 > 12 && y + 0.5 > 12.6) c = 'D';
    else if (r > 0.5 && x + 0.5 < 12 && y + 0.5 < 12.6) c = 'L';
    set(x, y, c);
  }

  // ---- face ----
  const eyeAt = (cx, cy, rx, ry, shine = true) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inEll(x, y, cx, cy, rx, ry)) set(x, y, 'E');
    if (shine) { set(Math.round(cx - 1), Math.round(cy - 1.4), 'P'); set(Math.round(cx - 1), Math.round(cy - 0.4), 'P'); }
  };
  const lineEye = (cx, cy, w) => { for (let x = Math.round(cx - w); x <= Math.round(cx + w - 1); x++) set(x, Math.round(cy), 'E'); };
  const arcEye = (cx, cy) => { for (const [dx, dy] of [[-2, 1], [-1, 0], [0, -0.5], [1, 0], [2, 1]]) set(Math.round(cx + dx - 0.5), Math.round(cy + dy), 'E'); set(Math.round(cx - 0.5), Math.round(cy - 1), 'E'); };
  const EX = 8.2, EY = 12.4;                     // left eye centre; the right eye mirrors around x = 12
  const eyes = (fn) => { fn(EX, EY, false); fn(W - EX, EY, true); };

  if (mood === 'blink' || mood === 'sleep') eyes((x, y) => lineEye(x, y + 0.8, 2.4));
  else if (mood === 'happy' || mood === 'cheer') eyes((x, y) => arcEye(x, y + 0.5));
  else if (mood === 'wow') eyes((x, y) => eyeAt(x, y, 2.5, 3.3));
  else if (mood === 'sad') {
    eyes((x, y, right) => { eyeAt(x, y + 0.4, 2.1, 2.7); const dir = right ? 1 : -1; for (let k = 0; k < 4; k++) set(Math.round(x - 2 + k * (right ? 1 : 1) - 0.5 + (right ? 0 : 0)), Math.round(y - 3.6 + (right ? k : 3 - k) * 0.5), 'D'); void dir; });
  } else if (mood === 'think') { eyeAt(EX, EY, 2.2, 2.9); eyeAt(W - EX, EY - 0.6, 2.4, 3.2); }
  else eyes((x, y) => eyeAt(x, y, 2.2, 2.9));

  // cheeks
  if (mood === 'happy' || mood === 'cheer') { fill(5, 16, 6, 16, 'C'); fill(17, 16, 18, 16, 'C'); }
  // mouth (symmetric around x = 12)
  const mouth = {
    idle: [[9, 17], [10, 18], [11, 18], [12, 18], [13, 18], [14, 17]],
    blink: [[9, 17], [10, 18], [11, 18], [12, 18], [13, 18], [14, 17]],
    happy: [[8, 16], [9, 17], [10, 18], [11, 18], [12, 18], [13, 18], [14, 17], [15, 16]],
    sad: [[9, 18], [10, 17], [11, 17], [12, 17], [13, 17], [14, 18]],
    think: [[11, 18], [12, 18]],
    wow: [[11, 17], [12, 17], [11, 18], [12, 18], [11, 19], [12, 19]],
    sleep: [[11, 18], [12, 18]],
  };
  const m = mouth[mood === 'cheer' ? 'happy' : (mood === 'wave' || mood.startsWith('walk') || mood === 'fly') ? 'idle' : mood] || mouth.idle;
  for (const [x, y] of m) set(x, y, 'M');
  if (mood === 'happy' || mood === 'cheer') { fill(10, 19, 13, 19, 'M'); fill(11, 19, 12, 19, 'R'); }

  // ---- body ----
  fill(8, 21, 15, 21, 'S'); fill(8, 21, 15, 21, 'S');                       // collar
  const torso = [[7, 16], [6, 17], [6, 17], [6, 17], [7, 16], [8, 15]];     // rows 22..27: [x0, x1]
  torso.forEach(([x0, x1], i) => { fill(x0, 22 + i, x1, 22 + i, 'B'); set(x0, 22 + i, 'U'); set(x1, 22 + i, 'b'); });
  fill(8, 27, 15, 27, 'b');
  fill(10, 23, 13, 25, 'K'); set(10, 24, 'Y'); set(11, 24, 'Y'); set(12, 23, 'O'); set(13, 25, 'R');  // chest panel
  // arms
  const arm = (side, up) => {
    const x0 = side ? 17 : 4;
    if (up) { fill(side ? 18 : 4, 16, side ? 19 : 5, 22, 'B'); set(side ? 19 : 4, 16, 'S'); fill(side ? 18 : 4, 14, side ? 19 : 5, 15, 'S'); return; }
    fill(x0, 23, x0 + 1, 26, 'B'); set(x0 + (side ? 1 : 0), 23, 'b'); fill(x0, 27, x0 + 1, 27, 'S');
  };
  arm(0, armsUp); arm(1, armsUp || waving);
  // legs + boots (walkA / walkB lift one foot)
  const lift = mood === 'walkA' ? 1 : mood === 'walkB' ? 2 : 0;
  const leg = (x0, raised) => { fill(x0, 28, x0 + 1, 29, 'B'); fill(x0 - 1, raised ? 29 : 30, x0 + 2, raised ? 30 : 31, 'K'); set(x0 - 1, raised ? 29 : 30, 'S'); };
  leg(8, lift === 1); leg(14, lift === 2);

  // ---- pen accessory (a feather quill in the right hand) ----
  if (has('pen') && !armsUp && !waving) {
    const feather = [
      [22, 13, 'N'], [21, 14, 'N'], [22, 14, 'H'], [23, 14, 'N'], [21, 15, 'N'], [22, 15, 'H'], [23, 15, 'N'], [20, 16, 'N'], [21, 16, 'H'], [22, 16, 'N'], [23, 16, 'N'],
      [20, 17, 'N'], [21, 17, 'H'], [22, 17, 'N'], [20, 18, 'N'], [21, 18, 'N'], [21, 19, 'S'], [21, 20, 'S'], [21, 21, 'S'], [20, 22, 'S'], [20, 23, 'S'], [20, 24, 'K'], [19, 25, 'K'], [19, 26, 'K'], [19, 27, 'K'],
    ];
    for (const [x, y, c] of feather) set(x, y, c);
  }
  // ---- dumbbells accessory (one in each hand; a raised hand holds its dumbbell upright) ----
  if (has('dumbbells')) {
    for (const side of [0, 1]) {
      const mx = (x) => (side ? W - 1 - x : x);          // the right side mirrors the left
      const raised = side ? (armsUp || waving) : armsUp;
      if (raised) {
        // upright: a plate above and below the raised hand (hand = the bar)
        for (const y of [13, 16]) { for (let x = 3; x <= 6; x++) set(mx(x), y, 'K'); set(mx(3), y, 'S'); }
      } else {
        // held at the side: a big plate and a small one on the outer end, the bar through the hand, a cap on the inner end
        for (let y = 25; y <= 29; y++) { set(mx(0), y, 'K'); set(mx(1), y, 'K'); }
        set(mx(0), 25, 'S'); set(mx(1), 25, 'S');
        for (let y = 26; y <= 28; y++) set(mx(2), y, 'K');
        for (let x = 3; x <= 7; x++) set(mx(x), 27, 'S');
      }
    }
  }
  return g.map((r) => r.join(''));
}

/** Horizontal runs of one colour: [{x, y, w, c}] (small SVGs). */
export function runs(mood = 'idle', opts = {}, palette = PALETTE) {
  const out = [];
  frame(mood, opts).forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]; let n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== '.' && palette[ch]) out.push({ x, y, w: n, c: palette[ch] });
      x += n;
    }
  });
  return out;
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  n.append(...kids.flat().filter((c) => c != null && c !== false));
  return n;
};

const DEFAULTS = {
  size: 56,                         // px width of the floating Zip
  accessory: 'jetpack',             // 'jetpack' | 'pen' | 'dumbbells' | 'jetpack+dumbbells' | 'none'
  palette: {},                      // override any PALETTE colour, e.g. { G: '#ff7a00' }
  motion: true,                     // wanders, waves, naps by himself
  position: { side: 'start', bottom: 14 },   // side: 'start' | 'end' (follows page direction), bottom in px
  parent: null,                     // where to mount (default: document.body)
  lang: 'en',
  lines: null,                      // { tap: [...], hello: '...' } override the built-in speech lines
  lifeEveryMs: [7000, 14000],
  weights: { wave: 25, hop: 20, walk: 35, peek: 10, spin: 10 },
  walkPxPerSec: 70,
  sleepAfterMs: 35000,
  bubbleMs: 3400,
  confetti: 16,
  blinkMs: 4200,
};
const LINES = {
  en: { hello: 'Hi! I am Zip 👽', tap: ['You are doing great!', 'One step at a time 🚀', 'Need a break? I will wait.', 'Beep boop! 🤖', 'I like it here.'] },
  he: { hello: 'היי! אני זיפ 👽', tap: ['אתה מצוין!', 'צעד אחד בכל פעם 🚀', 'צריך הפסקה? אני אחכה.', 'ביפ בופ! 🤖', 'טוב לי כאן.'] },
};
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A pixel Zip inside any element: Zip.inline({ size, mood }) -> { el, setMood(m), destroy() } */
function inline(opts = {}) {
  const o = { ...DEFAULTS, ...opts, palette: { ...PALETTE, ...(opts.palette || {}) } };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', o.size); svg.setAttribute('height', Math.round((o.size * H) / W));
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('aria-hidden', 'true');
  const root = el('span', { class: 'zip ' + (opts.class || ''), role: 'img', 'aria-label': opts.label || 'Zip' }, svg);
  const self = { el: root, mood: 'idle', accessory: o.accessory };
  self.setMood = (mood) => {
    self.mood = mood;
    svg.replaceChildren(...runs(mood, { accessory: self.accessory }, o.palette).map((r) => {
      const n = document.createElementNS(NS, 'rect');
      n.setAttribute('x', r.x); n.setAttribute('y', r.y); n.setAttribute('width', r.w); n.setAttribute('height', 1); n.setAttribute('fill', r.c);
      return n;
    }));
    root.dataset.mood = mood;
  };
  self.setAccessory = (a) => { self.accessory = a; self.setMood(self.mood); };
  self.setMood(opts.mood || 'idle');
  if (opts.blink !== false) {
    const iv = setInterval(() => {
      if (!root.isConnected) { if (self.destroyed) clearInterval(iv); return; }
      if (self.mood === 'idle') { self.setMood('blink'); setTimeout(() => { if (self.mood === 'blink') self.setMood('idle'); }, 140); }
    }, o.blinkMs);
    self.stopBlink = () => clearInterval(iv);
  }
  self.destroy = () => { self.destroyed = true; self.stopBlink?.(); root.remove(); };
  return self;
}

/** The floating companion. Returns a controller. */
function mount(opts = {}) {
  const o = { ...DEFAULTS, ...opts, position: { ...DEFAULTS.position, ...(opts.position || {}) }, weights: { ...DEFAULTS.weights, ...(opts.weights || {}) } };
  const lines = { ...(LINES[o.lang] || LINES.en), ...(o.lines || {}) };
  const parent = o.parent || document.body;
  const actor = inline({ ...o, class: 'zip-bob' });
  const bubble = el('div', { class: 'zip-bubble', hidden: true, role: 'status' });
  const btn = el('button', { class: 'zip-float', type: 'button', 'aria-label': 'Zip' }, actor.el);
  const host = el('div', { class: 'zip-host', 'data-side': o.position.side }, btn);
  host.style.setProperty('--zip-bottom', typeof o.position.bottom === 'number' ? o.position.bottom + 'px' : o.position.bottom);
  parent.append(host, bubble);

  let x = 0, busy = false, asleep = false, lastTouch = Date.now(), zzz = null, moodTimer = 0, bubbleTimer = 0, lifeTimer = 0, destroyed = false, motion = !!o.motion;
  const isHidden = () => host.hidden;

  const api = {
    el: host, actor,
    /** idle | blink | happy | sad | think | wow | sleep | wave | cheer | fly */
    react(mood, text = '', ms = 1800) {
      clearTimeout(moodTimer); actor.setMood(mood);
      moodTimer = setTimeout(() => actor.setMood('idle'), ms);
      if (text) api.say(text);
    },
    say(text, ms = o.bubbleMs) {
      if (isHidden()) return;
      bubble.textContent = text; bubble.hidden = false;
      const r = btn.getBoundingClientRect(), w = bubble.offsetWidth || 200;
      bubble.style.left = Math.round(Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12)) + 'px';
      bubble.style.bottom = Math.round(innerHeight - r.top + 6) + 'px';
      clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
    },
    touch() { lastTouch = Date.now(); if (asleep) wake(); },
    show() { host.hidden = false; },
    hide() { host.hidden = true; bubble.hidden = true; },
    setBottom(v) { host.style.setProperty('--zip-bottom', typeof v === 'number' ? v + 'px' : v); },   // px number or any CSS length, e.g. 'calc(var(--tabbar) + 8px)'
    setMotion(on) { motion = !!on; },
    setAccessory(a) { actor.setAccessory(a); },
    /** Run one move now: wave | hop | spin | walk | peek | nap */
    async play(name) {
      if (destroyed) return false;
      if (name === 'nap') { fall(); return true; }
      if (busy || !ACTIONS[name]) return false;
      busy = true; try { await ACTIONS[name](); } finally { busy = false; }
      return true;
    },
    celebrate(anchor) {
      const t = anchor || btn; if (!t.isConnected) return;
      const r = t.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 3;
      const colors = ['#58cc02', '#1cb0f6', '#ff9600', '#ff4b8b', '#ffc800', '#7c6cff'];
      const wrap = el('div', { class: 'zip-confetti', 'aria-hidden': 'true' });
      for (let n = 0; n < o.confetti; n++) {
        const a = (Math.PI * 2 * n) / o.confetti + Math.random() * 0.5, d = 50 + Math.random() * 90;
        const i = el('i'); i.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[n % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px`; wrap.append(i);
      }
      document.body.append(wrap); setTimeout(() => wrap.remove(), 1400);
      if (t === btn) { actor.setMood('cheer'); setTimeout(() => actor.setMood('idle'), 1500); }
    },
    park() { x = 0; btn.style.transition = 'none'; btn.style.transform = ''; },
    destroy() { destroyed = true; actor.destroy(); clearTimeout(lifeTimer); removeEventListener('pointerdown', api.touch); host.remove(); bubble.remove(); },
  };

  function wake() { asleep = false; zzz?.remove(); zzz = null; actor.setMood('wow'); setTimeout(() => { if (!asleep) actor.setMood('idle'); }, 700); }
  function fall() { asleep = true; actor.setMood('sleep'); zzz = el('span', { class: 'zip-zzz', 'aria-hidden': 'true' }, 'z', el('i', {}, 'z'), el('i', {}, 'Z')); btn.append(zzz); }
  const anim = async (cls, ms, withFlame = false) => { actor.el.classList.add(cls); if (withFlame && String(actor.accessory).split('+').includes('jetpack')) actor.setMood('fly'); await sleep(ms); actor.el.classList.remove(cls); if (actor.mood === 'fly') actor.setMood('idle'); };
  const maxLeft = () => Math.max(0, innerWidth - o.size - 40);
  const dirSign = () => ((getComputedStyle(host).direction === 'rtl') === (o.position.side === 'start') ? -1 : 1);   // which way is "into the screen"

  const ACTIONS = {
    async wave() { actor.setMood('wave'); await sleep(1100); actor.setMood('idle'); },
    async hop() { await anim('zip-a-hop', 900, true); },
    async spin() { await anim('zip-a-spin', 800, true); },
    async walk() {
      const sign = dirSign(), to = sign * Math.round(Math.random() * maxLeft()), from = x;
      if (Math.abs(to - from) < 60) return;
      const ms = (Math.abs(to - from) / o.walkPxPerSec) * 1000;
      bubble.hidden = true; btn.style.transition = `transform ${ms}ms linear`; btn.style.transform = `translateX(${to}px)`; x = to;
      let s = 0; const iv = setInterval(() => actor.setMood(s++ % 2 ? 'walkA' : 'walkB'), 170);
      await sleep(ms); clearInterval(iv); actor.setMood('idle'); await sleep(300); await ACTIONS.wave();
    },
    async peek() {
      const sign = dirSign(), home = x ? `translateX(${x}px)` : '';
      btn.style.transition = 'transform 450ms cubic-bezier(.22,1,.36,1)';
      if (x) { btn.style.transform = home; return ACTIONS.hop(); }
      btn.style.transform = `translateX(${-sign * 90}px)`; await sleep(1400); btn.style.transform = home; await sleep(500); await anim('zip-a-hop', 700, true);
    },
  };
  const choose = () => { const w = o.weights; let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) if ((r -= v) < 0) return k; return 'wave'; };
  function schedule() {
    clearTimeout(lifeTimer); const [a, b] = o.lifeEveryMs;
    lifeTimer = setTimeout(async () => {
      if (destroyed) return; schedule();
      if (isHidden() || busy || document.hidden || !motion || reducedMotion()) return;
      if (!asleep && Date.now() - lastTouch > o.sleepAfterMs) return fall();
      if (asleep || !bubble.hidden) return;
      busy = true; try { await ACTIONS[choose()](); } finally { busy = false; }
    }, a + Math.random() * (b - a));
  }
  btn.addEventListener('click', async () => {
    api.touch(); if (busy) return; busy = true;
    api.react('wow', pick(lines.tap), 3200);
    try { await ACTIONS[pick(['hop', 'spin', 'wave'])](); } finally { busy = false; }
  });
  addEventListener('pointerdown', api.touch, { passive: true });
  schedule();
  if (lines.hello && opts.hello) setTimeout(() => api.react('wow', lines.hello, 5000), 900);
  return api;
}

export const Zip = { mount, inline, frame, runs, PALETTE, MOODS, ACCESSORIES, W, H };
export default Zip;
