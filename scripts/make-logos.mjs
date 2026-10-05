// Generates the three Stage 1 logo candidates as standalone SVG files.
// Original artwork, drawn from geometry. Run: node scripts/make-logos.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../assets/logo/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const defs = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1b8"/><stop offset=".55" stop-color="#ffc43d"/><stop offset="1" stop-color="#d98a12"/>
    </linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff9dc"/><stop offset=".5" stop-color="#7df9ff"/><stop offset="1" stop-color="#2fb4ff"/>
    </linearGradient>
  </defs>`;

const BG = '#0a0b12';
const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">${defs}${inner}</svg>\n`;

const bolt = (tx = 0, ty = 0, s = 1, fill = 'url(#b)') =>
  `<path transform="translate(${tx} ${ty}) scale(${s})" fill="${fill}" d="M146 6 L104 62 H126 L110 104 L158 44 H134 Z"/>`;

// ---------- A: bust ----------
const A = wrap(`
  ${bolt(22, -4, 0.78)}
  <g transform="translate(0 14)" fill="url(#g)">
    <!-- shoulders / drape -->
    <path d="M44 256 C48 230 80 220 102 214 L128 238 L154 214 C176 220 208 230 212 256 Z"/>
    <!-- hair -->
    <path d="M90 156 C74 126 84 92 128 86 C172 92 182 126 166 156 C170 128 152 108 128 108 C104 108 86 128 90 156 Z"/>
    <path d="M92 108 C78 112 70 128 74 146 C80 136 86 130 94 128 Z"/>
    <path d="M164 108 C178 112 186 128 182 146 C176 136 170 130 162 128 Z"/>
    <!-- face -->
    <path d="M98 142 C98 116 112 106 128 106 C144 106 158 116 158 142 C158 164 150 180 128 192 C106 180 98 164 98 142 Z"/>
    <!-- beard -->
    <path d="M92 150 C88 192 106 222 128 236 C150 222 168 192 164 150 C160 172 150 182 128 182 C106 182 96 172 92 150 Z"/>
  </g>
  <g transform="translate(0 14)" fill="${BG}">
    <path d="M103 140 L123 144 L122 148 L106 146 Z"/>
    <path d="M153 140 L133 144 L134 148 L150 146 Z"/>
    <path d="M104 130 L124 132 L123 135 L106 134 Z" opacity=".0"/>
    <path d="M100 128 L126 134 L126 138 L102 134 Z"/>
    <path d="M156 128 L130 134 L130 138 L154 134 Z"/>
    <path d="M127 148 L121 168 L135 168 Z" opacity=".45"/>
    <path d="M110 180 C118 172 128 177 128 177 C128 177 138 172 146 180 C138 184 130 182 128 182 C126 182 118 184 110 180 Z"/>
  </g>
`);

// ---------- B: full figure, raised arm ----------
const B = wrap(`
  <ellipse cx="128" cy="244" rx="64" ry="6" fill="url(#g)" opacity=".35"/>
  ${bolt(46, -2, 1.05)}
  <g stroke="url(#g)" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- raised arm toward the bolt -->
    <path d="M138 108 L170 70 L184 56" stroke-width="13"/>
    <!-- lowered arm -->
    <path d="M102 112 L84 148 L88 176" stroke-width="12"/>
    <!-- legs -->
    <path d="M116 168 L106 214 L96 238" stroke-width="15"/>
    <path d="M132 168 L146 212 L156 238" stroke-width="15"/>
  </g>
  <g fill="url(#g)">
    <circle cx="124" cy="82" r="15"/>
    <!-- torso -->
    <path d="M98 102 C108 96 140 96 148 104 L140 172 L108 172 Z"/>
    <!-- cloak streaming behind -->
    <path d="M100 104 C70 112 44 138 30 186 C58 164 78 164 98 168 C92 148 94 124 100 104 Z" opacity=".8"/>
    <!-- feet -->
    <path d="M86 236 H104 L100 244 H80 Z"/>
    <path d="M148 236 H166 L168 244 H146 Z"/>
  </g>
  <path d="M110 134 H142" stroke="${BG}" stroke-width="4" stroke-linecap="round" opacity=".55"/>
`);

// ---------- C: crest ----------
function laurel(side) {
  const leaves = [];
  const cx = 128, cy = 144, R = 98, n = 11;
  for (let i = 0; i < n; i++) {
    const deg = 96 + i * (138 / (n - 1)); // sweep from bottom up the side
    const th = (deg * Math.PI) / 180;
    const x = cx + side * R * Math.cos(th) * -1 * -1;
    const RR = R;
    const px = side === 1 ? cx + RR * Math.cos(th) : cx - RR * Math.cos(th);
    const py = cy + RR * Math.sin(th);
    const tangent = side === 1 ? deg + 90 : 270 - deg; // direction of travel
    for (const off of [-34, 34]) {
      const rot = tangent + off - 90;
      const s = 1 - i * 0.025;
      leaves.push(
        `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(4.2 * s).toFixed(1)}" ry="${(12 * s).toFixed(1)}" transform="rotate(${rot.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}) "/>`
      );
    }
    void x;
  }
  return leaves.join('');
}
const C = wrap(`
  <g fill="url(#g)" opacity=".92">${laurel(1)}${laurel(-1)}</g>
  <path d="M128 52 L194 76 V138 C194 176 164 202 128 218 C92 202 62 176 62 138 V76 Z" fill="${BG}" stroke="url(#g)" stroke-width="7" stroke-linejoin="round"/>
  <path d="M128 64 L184 84 V138 C184 170 158 192 128 206 C98 192 72 170 72 138 V84 Z" stroke="url(#g)" stroke-width="2" opacity=".6" stroke-linejoin="round"/>
  <path transform="translate(31 38) scale(.8)" fill="url(#b)" d="M146 40 L96 112 H126 L106 176 L168 98 H138 Z"/>
`);

writeFileSync(new URL('logo-a-bust.svg', OUT), A);
writeFileSync(new URL('logo-b-figure.svg', OUT), B);
writeFileSync(new URL('logo-c-crest.svg', OUT), C);
console.log('logos written');
