// OUR OWN small inline-SVG icon set (24 grid, stroke based). No emoji, no icon fonts.
const P = {
  workout: '<path d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12"/>',
  exercises: '<path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8.5h6"/>',
  ranks: '<path d="M12 3l7 2.6v6c0 4.4-3 7.6-7 9.4-4-1.8-7-5-7-9.4v-6z"/><path d="M12 8.5v6M9.2 11.5L12 8.5l2.8 3"/>',
  shop: '<path d="M8 3.5h8M9 3.5c-.4 2-2.5 3-2.5 6.2C6.5 13 5 14 5 16.8 5 19 8 20.5 12 20.5s7-1.500 7-3.700c0-2.800-1.500-3.800-1.500-7.100 0-3.200-2.100-4.200-2.500-6.200"/><path d="M9.500 14.500h5"/>',
  profile: '<circle cx="12" cy="8.5" r="3.800"/><path d="M4.500 20c.8-3.700 3.800-5.700 7.500-5.700s6.700 2 7.500 5.700"/>',
  bolt: '<path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.500 2.600 3.800 5.600 3.800 9S14.500 18.400 12 21c-2.500-2.600-3.800-5.600-3.800-9S9.500 5.600 12 3z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.500M12 7.700v.1"/>',
  share: '<path d="M12 15V4M8.500 7.500L12 4l3.500 3.500M6 11H5.500A1.500 1.500 0 0 0 4 12.500v6A1.500 1.500 0 0 0 5.500 20h13a1.500 1.500 0 0 0 1.500-1.500v-6a1.500 1.500 0 0 0-1.500-1.500H18"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.500-4M4 5v3.500h3.500M4 13a8 8 0 0 0 14.500 4M20 19v-3.500h-3.500"/>',
  shield: '<path d="M12 3l7 2.600v6c0 4.400-3 7.600-7 9.400-4-1.800-7-5-7-9.400v-6z"/>',
};

export function icon(name, cls = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.8');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  if (cls) el.setAttribute('class', cls);
  el.innerHTML = P[name] ?? '';
  return el;
}
