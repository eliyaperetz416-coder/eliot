import { getLanguage } from '../core/i18n.mjs';
import { formatClock } from '../core/timer.mjs';

const loc = () => (getLanguage() === 'he' ? 'he-IL' : 'en-GB');
export const formatDate = (ms, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Intl.DateTimeFormat(loc(), opts).format(ms);
export const formatDateTime = (ms) => new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
export const formatNum = (n, max = 1) => new Intl.NumberFormat(loc(), { maximumFractionDigits: max }).format(n);
export function formatDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}` : formatClock(sec);
}
export const formatKg = (kg) => formatNum(Math.round(kg * 10) / 10);
