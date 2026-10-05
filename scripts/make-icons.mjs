// Renders app icons from an SVG "art" file onto a dark plate.
// node scripts/make-icons.mjs [path/to/art.svg]   (default: placeholder lightning bolt)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = new URL('../assets/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const artPath = process.argv[2];
const art = artPath
  ? readFileSync(artPath, 'utf8')
  : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".55" stop-color="#ffc43d"/><stop offset="1" stop-color="#d98a12"/></linearGradient></defs><path fill="url(#g)" d="M150 20 L78 138 H122 L100 236 L184 108 H138 Z"/></svg>`;
const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(art).toString('base64');

function plate(size, { art: scale, radius }) {
  const a = size * scale, o = (size - a) / 2;
  return `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden;position:relative;
    background:radial-gradient(80% 70% at 50% 28%,#2a2412 0%,#0f111b 62%,#0a0b12 100%)">
    <img src="${dataUri}" style="position:absolute;left:${o}px;top:${o}px;width:${a}px;height:${a}px;filter:drop-shadow(0 0 ${size * 0.05}px rgba(255,196,61,.45))"></div></body>`;
}
const jobs = [
  ['apple-touch-icon.png', 180, { art: 0.74, radius: 0 }],
  ['icon-192.png', 192, { art: 0.74, radius: 0 }],
  ['icon-512.png', 512, { art: 0.74, radius: 0 }],
  ['icon-maskable-512.png', 512, { art: 0.58, radius: 0 }],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, size, opt] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(plate(size, opt));
  await page.waitForTimeout(100);
  writeFileSync(new URL(name, out), await page.screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();
writeFileSync(new URL('favicon.svg', out), art);
console.log('icons written');
