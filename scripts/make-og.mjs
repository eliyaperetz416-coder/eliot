// Makes assets/og/og-image.png (1200x630), the preview image WhatsApp and other apps show for a shared link: node scripts/make-og.mjs
import sharp from 'sharp';
const root = new URL('..', import.meta.url).pathname;
const W = 1200, H = 630;
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><radialGradient id="g" cx="0.75" cy="0.1" r="0.9"><stop offset="0" stop-color="#2a2150"/><stop offset="0.6" stop-color="#0a0b12"/></radialGradient></defs>
<rect width="100%" height="100%" fill="#0a0b12"/><rect width="100%" height="100%" fill="url(#g)"/>
<text x="600" y="455" text-anchor="middle" font-family="DejaVu Serif, serif" font-size="88" font-weight="700" letter-spacing="10" fill="#ffffff">DEMIGOD</text>
<text x="600" y="530" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="36" fill="#b0b5cc">Lift. Rank. Ascend.</text>
</svg>`);
const mask = Buffer.from('<svg width="260" height="260"><rect width="260" height="260" rx="58" ry="58" fill="#fff"/></svg>');
const ring = Buffer.from('<svg width="260" height="260"><rect x="1" y="1" width="258" height="258" rx="57" ry="57" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/></svg>');
const icon = await sharp(root + 'assets/icons/icon-512.png').resize(260, 260).composite([{ input: mask, blend: 'dest-in' }, { input: ring }]).png().toBuffer();
await sharp(bg).composite([{ input: icon, top: 90, left: (W - 260) / 2 }]).png({ compressionLevel: 9, palette: true }).toFile(root + 'assets/og/og-image.png');
console.log('ok');
