// Live workout screen: exercise cards, set rows with previous performance, big V button, rest timer, autosave.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import * as W from '../core/workout.mjs';
import { completeSet, reopenSet, refreshWorkout, feedbackOf } from '../core/live.mjs';
import { button, emptyState, openSheet } from './components.js';
import { data } from './data.js';
import { store, touchDraft, bodyweightKg } from './store.js';
import { openExercisePicker } from './picker.js';
import { startRestTimer, unlockAudio } from './rest-timer.js';
import { openFinishSheet } from './post-ui.js';
import { formatDuration, formatKg } from './format.js';
import { formatClock } from '../core/timer.mjs';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const LETTER = { warmup: 'W', drop: 'D', failure: 'F' };

/** Which inputs an exercise uses. 'time' stores seconds, 'cardio' shows minutes but stores seconds (in `reps`). */
function layoutOf(ex) {
  if (ex.type === 'time') return { weight: false, repsLabel: 'col.sec' };
  if (ex.type === 'cardio') return { weight: false, repsLabel: 'col.min', minutes: true };
  return { weight: true, weightLabel: ex.type === 'bodyweight' ? 'col.added' : 'col.kg', repsLabel: 'col.reps' };
}
const repsShown = (ex, reps) => (reps == null ? '' : layoutOf(ex).minutes ? String(Math.round((reps / 60) * 10) / 10) : String(reps));

function prevText(ex, p) {
  if (!p) return '–';
  const L = layoutOf(ex);
  const reps = repsShown(ex, p.reps);
  if (!L.weight) return `${reps}${L.minutes ? t('col.min.short') : t('col.sec.short')}`;
  const w = Number(p.weight) > 0 ? formatKg(p.weight) : null;
  return w ? `${w}×${reps}` : `${ex.type === 'bodyweight' ? '' : '0×'}${reps}`;
}

function numInput({ value, placeholder, integer, label, onInput, onChange }) {
  const el = h('input', { class: 'set-input', type: 'text', inputmode: integer ? 'numeric' : 'decimal', pattern: integer ? '[0-9]*' : '[0-9]*[.,]?[0-9]*', enterkeyhint: 'done', autocomplete: 'off', dir: 'ltr', value: value ?? '', placeholder: placeholder ?? '', 'aria-label': label });
  el.addEventListener('input', () => onInput(el.value));
  el.addEventListener('change', () => onChange?.(el.value));
  el.addEventListener('focus', () => el.select?.());
  return el;
}

export function liveScreen() {
  const w = store.draft;
  const byId = data().byId;
  const root = h('main', { class: 'screen live' });
  const entriesBox = h('div', { class: 'stack' });
  const elapsed = h('span', { class: 'live-clock display num' });
  const prevCache = new Map();
  const prevOf = (exId) => { if (!prevCache.has(exId)) prevCache.set(exId, W.previousPerformance(store.workouts, exId)); return prevCache.get(exId); };

  const save = () => touchDraft();
  const rerender = () => { renderEntries(); };

  function refreshDone() { refreshWorkout(w, store.workouts, byId); save(); rerender(); }

  function typeSheet(entry, s) {
    const sh = openSheet({ title: t('settype.title'), content: h('div', { class: 'list' },
      W.SET_TYPES.map((type) => h('button', { class: 'row', type: 'button', onclick: () => { W.setType(w, entry.id, s.idx, type); sh.close(); if (s.done) refreshDone(); else { save(); rerender(); } } },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: t(`settype.${type}`) }), h('span', { class: 'row-sub', text: t(`settype.${type}.hint`) })),
        s.type === type ? icon('check') : null)),
      h('button', { class: 'row danger-row', type: 'button', onclick: () => { W.removeSet(w, entry.id, s.idx); sh.close(); refreshDone(); } }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: t('set.delete') })))) });
  }

  function entryMenu(entry, i) {
    const ex = byId[entry.exerciseId];
    const body = h('div');
    const sh = openSheet({ title: nameOf(ex), content: body });
    const act = (label, ic, fn, cls = '') => h('button', { class: `row ${cls}`, type: 'button', onclick: () => { sh.close(); fn(); } }, h('span', { class: 'row-icon' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: label })));
    const notes = h('textarea', { class: 'notes-input', rows: 3, placeholder: t('entry.notes'), 'aria-label': t('entry.notes') }, entry.notes ?? '');
    notes.addEventListener('input', () => { entry.notes = notes.value; save(); });
    notes.addEventListener('change', rerender);
    const linked = !!entry.supersetGroup;
    body.append(
      h('div', { class: 'list' },
        act(t('entry.replace'), 'refresh', () => openExercisePicker({ title: t('pick.replace.title'), multi: false, onPick: ([ex2]) => { W.replaceExercise(w, entry.id, ex2); refreshDone(); } })),
        i > 0 ? act(t('entry.up'), 'chevron', () => { W.moveEntry(w, entry.id, -1); save(); rerender(); }) : null,
        i < w.entries.length - 1 ? act(t('entry.down'), 'chevron', () => { W.moveEntry(w, entry.id, 1); save(); rerender(); }) : null,
        linked ? act(t('entry.unsuperset'), 'close', () => { W.unlinkSuperset(w, entry.id); save(); rerender(); })
          : (i < w.entries.length - 1 ? act(t('entry.superset'), 'bolt', () => { W.linkSuperset(w, entry.id); save(); rerender(); }) : null),
        act(t('entry.remove'), 'trash', () => { W.removeEntry(w, entry.id); refreshDone(); }, 'danger-row')),
      h('div', { class: 'section-label', text: t('entry.notes') }), notes);
  }

  function setRow(entry, ex, s, workingNo) {
    const L = layoutOf(ex);
    const p = prevOf(ex.id)[s.idx];
    const done = s.done;
    const typeBtn = h('button', { class: `set-num type-${s.type}`, type: 'button', 'aria-label': `${t('col.set')} ${s.idx + 1}: ${t(`settype.${s.type}`)}`, onclick: () => typeSheet(entry, s) }, s.type === 'normal' ? String(workingNo) : LETTER[s.type]);
    const setNum = (field, v) => { W.setField(w, entry.id, s.idx, field, v); if (field === 'reps' && L.minutes && s.reps != null) s.reps = Math.round(s.reps * 60); save(); };
    const cells = [typeBtn, h('span', { class: 'set-prev num', text: prevText(ex, p) })];
    if (L.weight) cells.push(numInput({ value: s.weight ?? '', placeholder: p && Number(p.weight) > 0 ? formatKg(p.weight) : '', label: t(L.weightLabel), onInput: (v) => setNum('weight', v), onChange: () => s.done && refreshDone() }));
    cells.push(numInput({ value: repsShown(ex, s.reps), placeholder: p?.reps != null ? repsShown(ex, p.reps) : '', integer: !L.minutes, label: t(L.repsLabel), onInput: (v) => setNum('reps', v), onChange: () => s.done && refreshDone() }));
    if (!L.weight) cells.splice(2, 0, h('span'));
    const vBtn = h('button', { class: `set-v${done ? ' on' : ''}`, type: 'button', 'aria-pressed': String(done), 'aria-label': t('set.done'), onclick: () => toggle(entry, ex, s, p) }, icon('check'));
    const row = h('div', { class: `set-row${done ? ' done' : ''}${L.weight ? '' : ' no-weight'}` }, cells, vBtn);
    const fb = done && s.type !== 'warmup' ? feedbackLine(ex, s) : (done ? h('div', { class: 'set-fb muted', text: t('fb.warmup') }) : null);
    return h('div', { class: 'set-wrap' }, row, fb);
  }

  function toggle(entry, ex, s, p) {
    if (s.done) { reopenSet({ workout: w, entryId: entry.id, idx: s.idx, now: Date.now(), workouts: store.workouts, byId }); save(); rerender(); return; }
    // empty fields fall back to the previous performance (placeholders)
    const L = layoutOf(ex);
    if (s.reps == null && p?.reps != null) s.reps = p.reps;
    if (L.weight && s.weight == null && p?.weight != null) s.weight = p.weight;
    if (L.weight && s.weight == null && ex.type === 'bodyweight') s.weight = 0;
    if (!(s.reps > 0) || (L.weight && ex.type !== 'bodyweight' && !(s.weight > 0))) { rerender(); return; }
    unlockAudio();
    const bw = bodyweightKg();
    completeSet({ workout: w, entryId: entry.id, idx: s.idx, now: Date.now(), bodyweightKg: bw, sex: store.profile.sex, workouts: store.workouts, byId });
    if (s.type !== 'warmup') floatXp(entry.id, s.idx, 10 + (s.prWeekly || s.prAllTime ? 25 : 0));
    if (entry.target?.find && s.type !== 'warmup' && s.weight > 0) for (const x of entry.sets) if (!x.done && x.weight == null) x.weight = s.weight; // first working set sets the weight for the rest
    const idx = w.entries.indexOf(entry);
    const next = w.entries[idx + 1];
    const midSuperset = entry.supersetGroup && next?.supersetGroup === entry.supersetGroup;
    if (!midSuperset) startRestTimer(entry.restSec);
    save(); rerender();
  }

  function feedbackLine(ex, s) {
    const fb = feedbackOf(s);
    const bits = [];
    if (ex.ranked && fb.rating > 0) bits.push(h('span', { class: 'fb-rating num', text: fb.division ? t('fb.rating.tier', { n: fb.rating, tier: t(`tier.${fb.tier}`), division: fb.division }) : t('fb.rating.gg', { n: fb.rating }) }));
    if (fb.pr.allTime) bits.push(h('span', { class: 'pr-badge pr-all', text: t('fb.pr.all') }));
    else if (fb.pr.weekly) bits.push(h('span', { class: 'pr-badge pr-week', text: t('fb.pr.week') }));
    else if (fb.pr.first) bits.push(h('span', { class: 'pr-badge pr-first', text: t('fb.pr.first') }));
    return h('div', { class: 'set-fb' }, bits);
  }

  function floatXp(entryId, idx, xp) {
    setTimeout(() => {
      const btn = [...document.querySelectorAll('.ent-card')][w.entries.findIndex((e) => e.id === entryId)]?.querySelectorAll('.set-v')[idx];
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const f = h('span', { class: 'xp-float num', 'aria-hidden': 'true', style: `left:${Math.round(r.left + r.width / 2)}px;top:${Math.round(r.top)}px`, text: `+${xp} XP` });
      document.body.append(f);
      setTimeout(() => f.remove(), 1100);
    }, 30);
  }

  function targetLine(tg) {
    const bits = [h('span', { class: 'chip', text: t('target.reps', { min: tg.repsMin, max: tg.repsMax }) })];
    if (tg.action) bits.push(h('span', { class: `chip target-${tg.action}`, text: t(`target.${tg.action}`) }));
    return h('div', { class: 'target-line' }, bits);
  }

  function entryCard(entry, i) {
    const ex = byId[entry.exerciseId];
    const L = layoutOf(ex);
    const prevE = w.entries[i - 1], nextE = w.entries[i + 1];
    const inSS = !!entry.supersetGroup;
    const ssFirst = inSS && prevE?.supersetGroup !== entry.supersetGroup, ssLast = inSS && nextE?.supersetGroup !== entry.supersetGroup;
    let workingNo = 0;
    const rows = entry.sets.map((s) => { if (s.type !== 'warmup') workingNo++; return setRow(entry, ex, s, workingNo); });
    const restLabel = h('span', { class: 'num', text: formatClock(entry.restSec) });
    const bump = (d) => { W.adjustRestSec(w, entry.id, d); restLabel.textContent = formatClock(entry.restSec); save(); };
    return h('section', { class: `card ent-card${inSS ? ' ss' : ''}${ssFirst ? ' ss-first' : ''}${ssLast ? ' ss-last' : ''}` },
      ssFirst ? h('div', { class: 'ss-label', text: t('superset.label') }) : null,
      h('header', { class: 'ent-head' },
        h('a', { class: 'ent-name', href: `#/exercise/${ex.id}` }, nameOf(ex)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('entry.menu'), onclick: () => entryMenu(entry, i) }, icon('more'))),
      entry.target ? targetLine(entry.target) : null,
      entry.notes ? h('p', { class: 'ent-notes', text: entry.notes }) : null,
      h('div', { class: 'ent-rest' }, h('span', { class: 'row-sub', text: t('entry.rest') }), restLabel,
        h('button', { class: 'mini-btn', type: 'button', dir: 'ltr', onclick: () => bump(-15), 'aria-label': t('rest.minus') }, '−15'),
        h('button', { class: 'mini-btn', type: 'button', dir: 'ltr', onclick: () => bump(15), 'aria-label': t('rest.plus') }, '+15')),
      h('div', { class: `set-head${L.weight ? '' : ' no-weight'}` },
        h('span', { text: t('col.set') }), h('span', { text: t('col.prev') }), L.weight ? h('span', { text: t(L.weightLabel) }) : h('span'), h('span', { text: t(L.repsLabel) }), h('span')),
      rows,
      h('button', { class: 'btn btn-ghost btn-block add-set', type: 'button', onclick: () => { W.addSet(w, entry.id); save(); rerender(); } }, icon('check'), t('live.addSet')));
  }

  function renderEntries() {
    const y = window.scrollY;
    entriesBox.replaceChildren(...(w.entries.length ? w.entries.map(entryCard) : [emptyState({ icon: 'workout', title: t('live.empty.title'), body: t('live.empty.body') })]));
    window.scrollTo(0, y);
  }

  const nameInput = h('input', { class: 'live-name', type: 'text', maxlength: 60, placeholder: t('live.namePlaceholder'), 'aria-label': t('live.namePlaceholder'), value: w.name });
  nameInput.addEventListener('input', () => { w.name = nameInput.value; save(); });
  const tick = () => { elapsed.textContent = formatDuration(Math.max(0, Math.round((Date.now() - w.startedMs) / 1000))); };
  tick();
  const iv = setInterval(tick, 1000);
  const notes = h('textarea', { class: 'notes-input', rows: 3, placeholder: t('live.notes'), 'aria-label': t('live.notes') }, w.notes ?? '');
  notes.addEventListener('input', () => { w.notes = notes.value; save(); });

  root.append(
    h('header', { class: 'live-head' },
      h('div', { class: 'live-title' }, nameInput, h('span', { class: 'row-sub' }, t('live.elapsed'), ' ', elapsed)),
      button({ label: t('live.finish'), onClick: () => openFinishSheet() })),
    entriesBox,
    h('div', { class: 'stack live-actions' },
      button({ label: t('live.addExercise'), variant: 'secondary', icon: 'workout', block: true, onClick: () => openExercisePicker({ title: t('pick.title'), onPick: (list) => { list.forEach((ex) => W.addEntry(w, ex)); save(); rerender(); } }) }),
      notes),
    h('div', { class: 'live-bottom-space' }));
  root._dispose = () => { clearInterval(iv); };
  renderEntries();
  return root;
}
