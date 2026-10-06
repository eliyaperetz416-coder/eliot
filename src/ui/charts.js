// Hand-written SVG charts. RTL-aware: in Hebrew time flows right to left and the value axis sits on the right.
import { h } from './dom.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { layoutSeries, linePath, areaPath } from '../core/charts.mjs';
import { formatDate, formatNum } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
let gid = 0;

function frame({ title, series, rtl, bars, zeroBase, unit, height = 200 }) {
  const W = 340, H = height;
  const lay = layoutSeries(series, { width: W, height: H, rtl, bars, zeroBase });
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': title });
  svg.append(el('title', {}, title));
  for (const tk of lay.yTicks) {
    svg.append(el('line', { x1: lay.plot.x0, x2: lay.plot.x1, y1: tk.y, y2: tk.y, class: 'chart-grid' }));
    svg.append(el('text', { x: rtl ? lay.plot.x1 + 5 : lay.plot.x0 - 5, y: tk.y + 3.5, class: 'chart-tick', 'text-anchor': rtl ? 'start' : 'end' }, formatNum(tk.v, 0)));
  }
  for (const tk of lay.xTicks) svg.append(el('text', { x: tk.x, y: H - 8, class: 'chart-tick', 'text-anchor': 'middle' }, formatDate(tk.t, { day: 'numeric', month: 'short' })));
  return { svg, lay, W, H };
}

export function lineChart({ series, title, unit = '', rtl = getLanguage() === 'he' }) {
  const { svg, lay } = frame({ title, series, rtl, unit });
  if (lay.points.length) {
    const id = `cg${++gid}`;
    svg.insertAdjacentHTML('afterbegin', `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>`);
    if (lay.points.length > 1) {
      svg.append(el('path', { d: areaPath(lay.points, lay.plot.y1), fill: `url(#${id})`, class: 'chart-area' }));
      svg.append(el('path', { d: linePath(lay.points), class: 'chart-line', fill: 'none' }));
    }
    for (const p of lay.points) svg.append(el('circle', { cx: p.x, cy: p.y, r: 3, class: 'chart-dot' }));
    const last = lay.points[lay.points.length - 1];
    svg.append(el('text', { x: last.x, y: Math.max(12, last.y - 8), class: 'chart-last', 'text-anchor': 'middle' }, `${formatNum(last.v, 1)}${unit ? ` ${unit}` : ''}`));
  }
  return svg;
}

export function barChart({ series, title, rtl = getLanguage() === 'he' }) {
  const { svg, lay } = frame({ title, series, rtl, bars: true, zeroBase: true });
  const bw = lay.barWidth;
  series.forEach((p, i) => {
    const pt = lay.points[i];
    const hgt = Math.max(0, lay.plot.y1 - pt.y);
    if (p.v > 0) svg.append(el('rect', { x: pt.x - bw / 2, y: pt.y, width: bw, height: hgt, rx: 3, class: 'chart-bar' }));
    else svg.append(el('rect', { x: pt.x - bw / 2, y: lay.plot.y1 - 2, width: bw, height: 2, class: 'chart-bar zero' }));
  });
  return svg;
}

export const chartCard = ({ title, subtitle, chart, empty }) => h('section', { class: 'card chart-card' },
  h('h2', { text: title }), subtitle ? h('p', { class: 'row-sub', text: subtitle }) : null, empty ? h('p', { class: 'row-sub chart-empty', text: empty }) : chart);
