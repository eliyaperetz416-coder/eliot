// Saved workouts: prepare them in advance, then pick "which workout today?" when starting.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import * as R from '../core/routines.mjs';
import { previousPerformance } from '../core/workout.mjs';
import { nextPlanDay, planDayId, templateRoutines, ROUTINE_TEMPLATES } from '../core/generator.mjs';
import { suggestLoad, bestE1RM, stepFor } from '../core/progression.mjs';
import { button, emptyState, miniStepper, openSheet, showToast } from './components.js';
import { data } from './data.js';
import { store, saveRoutine, deleteRoutine, saveFolder, removeFolder, setDraft } from './store.js';
import { openExercisePicker } from './picker.js';
import { keepAwake } from './wakelock.js';
import { unlockAudio } from './rest-timer.js';
import { formatClock } from '../core/timer.mjs';
import { planDayLabel } from './plan-names.js';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

/* ---------- starting workouts ---------- */
function begin(draft) { unlockAudio(); setDraft(draft); keepAwake(true); go('#/workout'); }

export function startFromRoutine(r) {
  const prev = (id) => previousPerformance(store.workouts, id);
  begin(R.draftFromEntries(r.entries, { name: r.name, routineId: r.id, previous: prev }));
}

/** Working sets of earlier sessions of an exercise, newest first. */
export function historyOf(exerciseId, limit = 3) {
  const out = [];
  for (const w of [...store.workouts].sort((a, b) => b.startedMs - a.startedMs)) {
    const e = w.entries.find((x) => x.exerciseId === exerciseId);
    const sets = e?.sets.filter((s) => s.done && s.type !== 'warmup' && s.reps > 0).map((s) => ({ weight: s.weight, reps: s.reps }));
    if (sets?.length) out.push(sets);
    if (out.length >= limit) break;
  }
  return out;
}

export function startFromPlanDay(plan, day) {
  const byId = data().byId;
  const sessions = new Map();
  const suggest = (e) => {
    const ex = byId[e.exerciseId];
    if (!ex || ex.type === 'time' || ex.type === 'cardio') return { weight: null, action: 'hold' };
    if (!sessions.has(ex.id)) sessions.set(ex.id, historyOf(ex.id));
    const hist = sessions.get(ex.id);
    const sg = suggestLoad({ ex, target: { sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax }, history: hist, e1rm: bestE1RM(hist), goal: plan.goal });
    if (day.deload && sg.weight) { const step = stepFor(ex); return { ...sg, weight: Math.max(step, Math.floor((sg.weight * 0.9) / step) * step), action: 'deload' }; }
    return sg;
  };
  begin(R.draftFromEntries(day.entries, { name: planDayLabel(plan, day), planDayId: planDayId(plan, day.week, day.day), suggest, previous: (id) => previousPerformance(store.workouts, id) }));
}

export function activePlan() { return store.plans[store.plans.length - 1] ?? null; }

/** "Which workout today?" */
export function openChooseWorkout() {
  const body = h('div', { class: 'stack' });
  const sh = openSheet({ title: t('choose.title'), content: body, tall: true });
  const plan = activePlan();
  const next = plan ? nextPlanDay(plan) : null;
  const pick = (fn) => () => { sh.close(); fn(); };
  const row = (title, sub, ic, onClick, extra = null) => h('button', { class: 'row', type: 'button', onclick: onClick },
    h('span', { class: 'row-icon' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: title }), sub ? h('span', { class: 'row-sub', text: sub }) : null), extra);
  if (next) {
    body.append(h('div', { class: 'section-label', text: t('choose.plan') }),
      h('div', { class: 'list' }, row(planDayLabel(plan, next), t('choose.plan.sub', { week: next.week, day: next.day }), 'bolt', pick(() => startFromPlanDay(plan, next)))));
  }
  body.append(h('div', { class: 'section-label', text: t('choose.mine') }));
  if (!store.routines.length) {
    body.append(h('p', { class: 'row-sub', text: t('choose.none') }), button({ label: t('routines.new'), variant: 'secondary', block: true, onClick: pick(() => go('#/routine/new')) }));
  } else {
    for (const g of R.groupByFolder(store.folders, store.routines)) {
      if (!g.routines.length) continue;
      if (g.folder) body.append(h('div', { class: 'row-sub folder-label', text: g.folder.name }));
      body.append(h('div', { class: 'list' }, g.routines.map((r) => row(r.name || t('routines.untitled'), t('routines.count', { n: r.entries.length }), 'workout', pick(() => startFromRoutine(r))))));
    }
  }
  const last = store.workouts[store.workouts.length - 1];
  body.append(h('div', { class: 'section-label', text: t('choose.other') }),
    h('div', { class: 'list' },
      last ? row(t('wk.repeat'), last.name || null, 'refresh', pick(() => begin(R.draftFromEntries(last.entries.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length, repsMin: 8, repsMax: 12, restSec: e.restSec })), { name: last.name, previous: (id) => previousPerformance(store.workouts, id) })))) : null,
      row(t('choose.empty'), t('choose.empty.sub'), 'close', pick(() => { import('./workout.js').then((m) => m.startWorkout()); }))));
}

/* ---------- list screen ---------- */
function nameForTemplate(key) {
  if (['chest', 'back', 'shoulders'].includes(key)) return t(`group.${key}`);
  if (key === 'arms') return t('tpl.arms');
  return t(`plan.day.${key}`);
}

function templateSheet() {
  const sh = openSheet({ title: t('routines.fromTemplate'), content: h('div', { class: 'list' }, Object.keys(ROUTINE_TEMPLATES).map((id) =>
    h('button', { class: 'row', type: 'button', onclick: async () => {
      sh.close();
      const ctx = { exercises: data().exercises, ratios: data().ratios };
      const folder = R.newFolder(t(`tpl.${id}`));
      const made = templateRoutines(id, ctx, { seed: Date.now() });
      const multi = made.length > 1;
      if (multi) await saveFolder(folder);
      for (const m of made) {
        const r = R.newRoutine({ name: nameForTemplate(m.nameKey), folderId: multi ? folder.id : null });
        r.entries = m.entries.map((e) => R.routineEntry(data().byId[e.exerciseId], e));
        await saveRoutine(r);
      }
      showToast({ message: t('routines.created', { n: made.length }) });
      go('#/routines');
    } }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: t(`tpl.${id}`) }), h('span', { class: 'row-sub', text: t(`tpl.${id}.sub`) })), icon('chevron', 'chev')))) });
}

function routineMenu(r, rerender) {
  const body = h('div');
  const sh = openSheet({ title: r.name || t('routines.untitled'), content: body });
  const act = (label, ic, fn, cls = '') => h('button', { class: `row ${cls}`, type: 'button', onclick: async () => { sh.close(); await fn(); rerender(); } }, h('span', { class: 'row-icon' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: label })));
  body.append(h('div', { class: 'list' },
    act(t('routines.duplicate'), 'refresh', () => saveRoutine(R.duplicateRoutine(r, Date.now(), ` ${t('routines.copy')}`))),
    act(t('routines.moveTo'), 'chevron', async () => { await moveSheet(r); }),
    act(t('common.delete'), 'trash', () => confirmDelete(r), 'danger-row')));
}
function moveSheet(r) {
  return new Promise((resolve) => {
    const sh = openSheet({ title: t('routines.moveTo'), content: h('div', { class: 'list' },
      [{ id: null, name: t('routines.noFolder') }, ...store.folders].map((f) => h('button', { class: 'row', type: 'button', onclick: async () => { sh.close(); R.moveToFolder(r, f.id); await saveRoutine(r); resolve(); } }, h('span', { class: 'row-title', text: f.name }), (r.folderId ?? null) === f.id ? icon('check') : null))) });
  });
}
function confirmDelete(r) {
  return new Promise((resolve) => {
    const sh = openSheet({ title: t('routines.delete.title'), content: h('div', { class: 'stack' }, h('p', { text: t('routines.delete.confirm', { name: r.name || t('routines.untitled') }) }),
      button({ label: t('common.delete'), variant: 'danger', block: true, onClick: async () => { sh.close(); await deleteRoutine(r.id); resolve(); } }),
      button({ label: t('common.cancel'), variant: 'secondary', block: true, onClick: () => { sh.close(); resolve(); } })) });
  });
}
function folderSheet(folder, rerender) {
  const input = h('input', { class: 'text-input', type: 'text', maxlength: 40, value: folder?.name ?? '', placeholder: t('folder.name'), 'aria-label': t('folder.name') });
  const sh = openSheet({ title: folder ? t('folder.rename') : t('folder.new'), content: h('div', { class: 'stack' },
    h('div', { class: 'field-box' }, input),
    button({ label: t('common.save'), block: true, onClick: async () => { const n = input.value.trim(); if (!n) return; sh.close(); await saveFolder(folder ? R.renameFolder(folder, n) : R.newFolder(n)); rerender(); } }),
    folder ? button({ label: t('folder.delete'), variant: 'danger', block: true, onClick: async () => { sh.close(); const folders = R.deleteFolder(store.folders, store.routines, folder.id); await removeFolder(folder.id, folders, store.routines); rerender(); } }) : null) });
  input.focus();
}

export function routinesScreen() {
  const root = h('main', { class: 'screen' });
  function draw() {
    const kids = [
      h('a', { class: 'back-link', href: '#/workout' }, icon('chevron', 'chev back-chev'), t('workout.title')),
      h('h1', { class: 'ex-title', text: t('routines.title') }),
      h('p', { class: 'row-sub', text: t('routines.hint') }),
      h('div', { class: 'stack', style: 'padding-block:12px' },
        button({ label: t('routines.new'), icon: 'workout', block: true, onClick: () => go('#/routine/new') }),
        h('div', { class: 'btn-pair' },
          button({ label: t('routines.fromTemplate'), variant: 'secondary', onClick: templateSheet }),
          button({ label: t('folder.new'), variant: 'secondary', onClick: () => folderSheet(null, draw) }))),
    ];
    if (!store.routines.length && !store.folders.length) kids.push(emptyState({ icon: 'workout', title: t('routines.empty.title'), body: t('routines.empty.body') }));
    for (const g of R.groupByFolder(store.folders, store.routines)) {
      if (!g.folder && !g.routines.length) continue;
      if (g.folder) kids.push(h('div', { class: 'folder-head' }, h('span', { class: 'section-label', text: g.folder.name }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('folder.rename'), onclick: () => folderSheet(g.folder, draw) }, icon('more'))));
      if (!g.routines.length) { kids.push(h('p', { class: 'row-sub', text: t('folder.empty') })); continue; }
      kids.push(h('div', { class: 'list' }, g.routines.map((r) => h('div', { class: 'row routine-row' },
        h('a', { class: 'row-main routine-link', href: `#/routine/${r.id}` }, h('span', { class: 'row-title', text: r.name || t('routines.untitled') }),
          h('span', { class: 'row-sub', text: r.entries.slice(0, 3).map((e) => nameOf(data().byId[e.exerciseId])).join(' · ') || t('routines.count', { n: 0 }) })),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('routines.start'), onclick: () => startFromRoutine(r), disabled: !r.entries.length }, icon('bolt')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('entry.menu'), onclick: () => routineMenu(r, draw) }, icon('more'))))));
    }
    root.replaceChildren(...kids);
  }
  draw();
  return root;
}

/* ---------- editor ---------- */
export function routineEditScreen(id) {
  let r = store.routines.find((x) => x.id === id);
  if (id === 'new' || !r) {
    r = R.newRoutine({});
    saveRoutine(r);
    location.replace(`#/routine/${r.id}`);
    return h('main', { class: 'screen' });
  }
  const byId = data().byId;
  const root = h('main', { class: 'screen' });
  const save = () => saveRoutine(r);
  function draw() {
    const name = h('input', { class: 'live-name routine-name', type: 'text', maxlength: 60, value: r.name, placeholder: t('routines.namePlaceholder'), 'aria-label': t('routines.namePlaceholder') });
    name.addEventListener('input', () => { r.name = name.value; r.updatedMs = Date.now(); save(); });
    const folderChips = store.folders.length ? h('div', { class: 'chips-wrap', style: 'padding-block:8px' },
      [{ id: null, name: t('routines.noFolder') }, ...store.folders].map((f) => h('button', { type: 'button', class: 'chip chip-select', 'aria-pressed': String((r.folderId ?? null) === f.id), onclick: () => { R.moveToFolder(r, f.id); save(); draw(); } }, f.name))) : null;
    const cards = r.entries.map((e, i) => {
      const ex = byId[e.exerciseId];
      return h('section', { class: 'card ent-card' },
        h('header', { class: 'ent-head' }, h('a', { class: 'ent-name', href: `#/exercise/${ex.id}` }, nameOf(ex)),
          h('div', { class: 'ent-actions' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('entry.up'), disabled: i === 0, onclick: () => { R.moveEntry(r, e.id, -1); save(); draw(); } }, icon('chevron', 'up-chev')),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('entry.down'), disabled: i === r.entries.length - 1, onclick: () => { R.moveEntry(r, e.id, 1); save(); draw(); } }, icon('chevron', 'down-chev')),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('entry.remove'), onclick: () => { R.removeEntry(r, e.id); save(); draw(); } }, icon('trash')))),
        h('div', { class: 'ms-grid' },
          miniStepper({ label: t('routines.sets'), value: e.sets, min: 1, max: 10, onChange: (v) => { R.updateEntry(r, e.id, { sets: v }); save(); } }),
          miniStepper({ label: t('routines.repsMin'), value: e.repsMin, min: 1, max: 60, onChange: (v) => { R.updateEntry(r, e.id, { repsMin: v }); save(); } }),
          miniStepper({ label: t('routines.repsMax'), value: e.repsMax, min: 1, max: 60, onChange: (v) => { R.updateEntry(r, e.id, { repsMax: v }); save(); } }),
          miniStepper({ label: t('entry.rest'), value: e.restSec, min: 15, max: 600, step: 15, format: formatClock, onChange: (v) => { R.updateEntry(r, e.id, { restSec: v }); save(); } })));
    });
    const notes = h('textarea', { class: 'notes-input', rows: 3, placeholder: t('routines.notes'), 'aria-label': t('routines.notes') }, r.notes ?? '');
    notes.addEventListener('input', () => { r.notes = notes.value; save(); });
    root.replaceChildren(
      h('a', { class: 'back-link', href: '#/routines' }, icon('chevron', 'chev back-chev'), t('routines.title')),
      h('div', { class: 'field-box routine-name-box' }, name), folderChips,
      h('div', { class: 'stack', style: 'padding-block-start:12px' },
        cards.length ? cards : [emptyState({ icon: 'workout', title: t('routines.edit.empty.title'), body: t('routines.edit.empty.body') })],
        button({ label: t('live.addExercise'), variant: 'secondary', icon: 'workout', block: true, onClick: () => openExercisePicker({ title: t('pick.title'), onPick: (list) => { R.addToRoutine(r, list); save(); draw(); } }) }),
        notes,
        button({ label: t('routines.startNow'), block: true, icon: 'bolt', onClick: () => { if (r.entries.length) startFromRoutine(r); } }),
        h('div', { class: 'btn-pair' },
          button({ label: t('routines.duplicate'), variant: 'secondary', onClick: async () => { const c = R.duplicateRoutine(r, Date.now(), ` ${t('routines.copy')}`); await saveRoutine(c); go(`#/routine/${c.id}`); } }),
          button({ label: t('common.delete'), variant: 'danger', onClick: async () => { await confirmDelete(r); if (!store.routines.some((x) => x.id === r.id)) go('#/routines'); } }))));
  }
  draw();
  root._dispose = () => { if (!r.name.trim() && !r.entries.length) deleteRoutine(r.id); };
  return root;
}
