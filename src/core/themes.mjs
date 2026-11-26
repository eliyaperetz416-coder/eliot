// The two colour themes (OUR DESIGN, spec 5.1; artboards E5 = dark, E6 = marble). One source: main.js writes them as CSS
// variables, so every component follows. tests/themes.test.mjs keeps every text pair readable (WCAG AA).

export const THEMES = Object.freeze({
  dark: Object.freeze({
    bg: '#0A0A0B', surface1: '#121214', surface2: '#18181B', surface3: '#24221F',
    line: 'rgb(255 255 255 / .08)', text: '#F2EDE3', textDim: '#C9C3B8', textMute: '#8C867C',
    accent: '#C9A24A', silver: '#B9C3D3',
    glass: 'rgb(34 31 26 / .55)', glassThick: 'rgb(24 22 19 / .86)', glassEdge: 'rgb(255 255 255 / .10)', glassSolid: '#1A1916',
    metaColor: '#0A0A0B', scheme: 'dark',
  }),
  marble: Object.freeze({
    bg: '#EAE4D9', surface1: '#F4F0E9', surface2: '#EFEAE1', surface3: '#E2DACB',
    line: 'rgb(28 26 23 / .12)', text: '#1C1A17', textDim: '#3E3A34', textMute: '#655E54',
    accent: '#8A5A2B', silver: '#5E6878',
    glass: 'rgb(255 255 255 / .55)', glassThick: 'rgb(250 247 241 / .9)', glassEdge: 'rgb(255 255 255 / .8)', glassSolid: '#F4F0E9',
    metaColor: '#EAE4D9', scheme: 'light',
  }),
});

const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Text colour for a button of this colour: whichever of near-black / white reads better. */
export const inkFor = (hex) => (contrast('#0A0A0B', hex) >= contrast('#FFFFFF', hex) ? '#0A0A0B' : '#FFFFFF');

export const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; };

const mix = (hex, to, k) => { // k 0..1 toward `to`
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};

/** A colour used as TEXT (the accent from the shop, a tier colour): darkened on marble, lightened on dark, just enough
 *  to read (WCAG AA 4.5) on the page and on cards. A colour that already reads is returned unchanged. */
export function readableOn(hex, p) {
  const to = p.scheme === 'light' ? '#000000' : '#FFFFFF';
  const ok = (c) => [p.bg, p.surface1, p.surface2].every((bg) => contrast(c, bg) >= 4.5);
  for (let k = 0; k <= 1.0001; k += 0.02) { const c = k ? mix(hex, to, k) : hex; if (ok(c)) return c; }
  return to;
}

/** A tier colour as text in the theme that is on now (name from <html data-theme>). */
export const tierInk = (hex, themeName) => (hex ? readableOn(hex, THEMES[themeName] ?? THEMES.dark) : 'inherit');
