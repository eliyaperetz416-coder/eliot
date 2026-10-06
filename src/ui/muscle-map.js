// <MuscleMap>: front + back figures, label above each, tap a muscle for its name and role.
import { h } from './dom.js';
import { t } from '../core/i18n.mjs';
import { MAP_COLORS, exerciseHighlight, chipIds } from '../core/muscles.mjs';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const NEUTRAL_ONLY = new Set(['head', 'knees']);

/**
 * mode 'exercise': pass `exercise`. Other modes (Stage 4) pass `paint(id) -> {fill, role?, label?}`.
 */
export function muscleMap({ muscles, mode = 'exercise', exercise, paint, onSelect }) {
  const hl = mode === 'exercise' ? exerciseHighlight(exercise) : null;
  const paintOf = paint ?? ((id) => {
    if (hl.primary.has(id)) return { fill: MAP_COLORS.primary, role: 'primary' };
    if (hl.secondary.has(id)) return { fill: MAP_COLORS.secondary, role: 'secondary' };
    return { fill: MAP_COLORS.neutral };
  });
  const info = h('p', { class: 'mmap-info', 'aria-live': 'polite', text: t('map.hint') });
  let selected = null;

  function figure(viewKey, list) {
    const svg = svgEl('svg', { viewBox: muscles.viewBox, role: 'img', 'aria-label': t('map.figure', { view: t(`map.${viewKey}`) }) });
    for (const m of list) {
      const p = NEUTRAL_ONLY.has(m.id) ? { fill: MAP_COLORS.neutral } : paintOf(m.id);
      const g = svgEl('g', { class: `mm ${p.role ? 'mm-' + p.role : ''}`, 'data-muscle': m.id });
      g.style.fill = p.fill;
      if (p.glow) { g.style.setProperty('--glow', p.fill); g.classList.add('mm-glow'); }
      for (const pts of m.polygons) g.append(svgEl('polygon', { points: pts }));
      if (!NEUTRAL_ONLY.has(m.id) && m.id !== 'knees') {
        g.addEventListener('click', () => {
          selected?.classList.remove('mm-selected');
          selected = g; g.classList.add('mm-selected');
          const name = t(`muscle.${m.id.replace(/^(left|right)-soleus$/, 'calves')}`);
          info.textContent = p.label ?? (p.role ? `${name} · ${t(`exercise.role.${p.role}`)}` : name);
          onSelect?.(m.id);
        });
      }
      svg.append(g);
    }
    return h('figure', { class: 'mmap-fig' }, h('figcaption', { class: 'mmap-label', text: t(`map.${viewKey}`) }), svg);
  }

  const chips = [];
  if (hl) {
    for (const id of chipIds([...hl.primary])) chips.push(h('span', { class: 'chip chip-primary', text: t(`muscle.${id}`) }));
    for (const id of chipIds([...hl.secondary])) chips.push(h('span', { class: 'chip chip-secondary', text: t(`muscle.${id}`) }));
  }
  return h('div', { class: `mmap mmap-${mode}` },
    h('div', { class: 'mmap-figures' }, figure('front', muscles.anterior), figure('back', muscles.posterior)),
    info,
    chips.length ? h('div', { class: 'mmap-chips' }, chips) : null,
    hl ? h('div', { class: 'mmap-legend' },
      h('span', { class: 'chip chip-primary', text: t('map.legend.primary') }),
      h('span', { class: 'chip chip-secondary', text: t('map.legend.secondary') })) : null);
}
