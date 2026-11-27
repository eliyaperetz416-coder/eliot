// Benchmark workouts screens: the list (#/wods), the info sheet, the timer (#/wod/<id>) and a saved result in the history.
// OUR DESIGN. The timer lives on timestamps (not on ticks), so it is right after the phone locks or the app reloads.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, openSheet, showToast, segmented, emptyState } from './components.js';
import { data } from './data.js';
import { store, saveWodResult, deleteWodResult, bodyweightKg } from './store.js';
import { formatDate, formatKg, formatNum } from './format.js';
import { keepAwake } from './wakelock.js';
import { unlockAudio, beep } from './rest-timer.js';
import { uid } from '../core/workout.mjs';
import * as W from '../core/wods.mjs';

const RUN_KEY = 'dg.wodRun';
const he = () => getLanguage() === 'he';
const wodsList = () => data().wods?.wods ?? [];
const wodById = (id) => wodsList().find((w) => w.id === id) ?? null;
const exName = (id) => { const ex = data().byId[id]; return ex ? (he() ? ex.nameHe : ex.nameEn) : id; };
const sex = () => (store.profile?.sex === 'f' ? 'f' : 'm');
const go = (hash) => { location.hash = hash; };

/** "AMRAP 20 min", "21-15-9 for time", "5 rounds for time", "EMOM 30 min", "5 rounds, no clock". */
export function formatLine(wod) {
  if (wod.format === 'amrap') return t('wod.fmt.amrap', { min: wod.minutes });
  if (wod.format === 'emom') return t('wod.fmt.emom', { min: wod.minutes });
  if (wod.format === 'rounds') return t('wod.fmt.rounds', { n: W.roundCount(wod) });
  const scheme = W.schemeText(wod);
  if (scheme) return t('wod.fmt.scheme', { scheme });
  return wod.rounds > 1 ? t('wod.fmt.roundsTime', { n: wod.rounds }) : t('wod.fmt.time');
}
const repsText = (m) => (m.dist ? t('wod.dist', { m: formatNum(m.dist, 0) }) : m.max ? t('wod.max') : Array.isArray(m.reps) ? m.reps.join('-') : String(m.reps));
function loadText(m, division = 'rx', both = false) {
  if (m.bw) {
    const kg = !both && bodyweightKg() ? W.loadFor(m, { division, bodyweightKg: bodyweightKg() }).kg : null;
    return kg ? `${formatKg(kg)} ${t('unit.kg')} (${t('wod.bw', { x: formatNum(m.bw, 2) })})` : t('wod.bw', { x: formatNum(m.bw, 2) });
  }
  if (!m.load) return '';
  if (both) {
    const a = W.loadFor(m, { sex: 'm', division }), b = W.loadFor(m, { sex: 'f', division });
    return t('wod.load.both', { m: formatKg(a.kg), f: formatKg(b.kg) });
  }
  return `${formatKg(W.loadFor(m, { sex: sex(), division }).kg)} ${t('unit.kg')}`;
}
export function formatScore(score) {
  if (!score) return '–';
  if (score.type === 'time') return score.capped ? t('wod.score.capped', { reps: score.reps }) : W.clock(score.seconds);
  if (score.type === 'rounds') return score.reps ? t('wod.score.roundsReps', { r: score.rounds, n: score.reps }) : t('wod.score.rounds', { r: score.rounds });
  return t('wod.score.reps', { n: score.reps });
}
const divisionName = (d) => t(d === 'scaled' ? 'wod.scaled' : 'wod.rx');

/** One line per movement: reps, name (a link to the exercise), load. */
function movementRows(wod, { division = 'rx', both = false, links = true } = {}) {
  return h('ul', { class: 'wod-moves' }, wod.movements.map((m) => h('li', { class: 'wod-move' },
    h('b', { class: 'num wod-reps', dir: 'ltr', text: repsText(m) }),
    links ? h('a', { href: `#/exercise/${m.ex}`, text: exName(m.ex) }) : h('span', { text: exName(m.ex) }),
    loadText(m, division, both) ? h('span', { class: 'row-sub num', text: loadText(m, division, both) }) : null)));
}

/** "What do you do in this workout?" — the info button next to every workout. */
export function infoSheet(wod) {
  const best = W.bestsByWod(store.workouts)[wod.id] ?? {};
  const scaleTips = [...new Set(wod.movements.map((m) => m.ex))].map((ex) => t(`wod.scale.${ex}`)).filter((s) => !s.startsWith('wod.scale.'));
  const body = h('div', { class: 'stack wod-info' },
    h('p', { class: 'row-sub', text: wod.kind === 'hero' ? (he() ? data().wods.heroNoteHe : data().wods.heroNoteEn) : t('wod.girl.note') }),
    h('p', { class: 'wod-format', text: formatLine(wod) }),
    h('p', { text: t(`wod.how.${wod.format}`, { min: wod.minutes ?? '', n: W.roundCount(wod) }) }),
    h('div', { class: 'section-label', text: t('wod.movements') }),
    movementRows(wod, { both: true }),
    (he() ? wod.noteHe : wod.noteEn) ? h('p', { class: 'wod-note', text: he() ? wod.noteHe : wod.noteEn }) : null,
    h('div', { class: 'section-label', text: t('wod.scaled.title') }),
    h('p', { class: 'row-sub', text: t('wod.scaled.body') }),
    scaleTips.length ? h('ul', { class: 'wod-tips' }, scaleTips.map((s) => h('li', { text: s }))) : null,
    h('div', { class: 'section-label', text: t('wod.score.title') }),
    h('p', { class: 'row-sub', text: t(`wod.scoreHow.${wod.score}`) }),
    best.rx || best.scaled ? h('p', { class: 'num', text: [best.rx ? `${t('wod.rx')}: ${formatScore(best.rx.wod.score)}` : '', best.scaled ? `${t('wod.scaled')}: ${formatScore(best.scaled.wod.score)}` : ''].filter(Boolean).join(' · ') }) : null,
    button({ label: t('wod.start'), icon: 'bolt', block: true, onClick: () => { sh.close(); go(`#/wod/${wod.id}`); } }));
  const sh = openSheet({ title: wod.name, content: body });
}

/* ---------- list ---------- */
export function wodsScreen() {
  const root = h('main', { class: 'screen' });
  const best = W.bestsByWod(store.workouts);
  const card = (wod) => {
    const b = best[wod.id];
    const top = b?.rx ?? b?.scaled;
    return h('section', { class: 'card wod-card' },
      h('div', { class: 'wod-card-head' },
        h('div', { class: 'wod-card-title' }, h('h2', { class: 'display', text: wod.name }), h('span', { class: 'row-sub', text: formatLine(wod) })),
        top ? h('span', { class: 'chip chip-select wod-best', 'aria-label': t('wod.best.label', { s: formatScore(top.wod.score) }), text: `${top.wod.division === 'scaled' ? t('wod.scaled') : t('wod.rx')} ${formatScore(top.wod.score)}` }) : null),
      h('p', { class: 'row-sub wod-card-moves', text: wod.movements.map((m) => exName(m.ex)).filter((x, i, a) => a.indexOf(x) === i).join(' · ') }),
      h('div', { class: 'btn-pair' },
        button({ label: t('wod.info'), icon: 'info', variant: 'secondary', onClick: () => infoSheet(wod) }),
        button({ label: t('wod.start'), icon: 'bolt', onClick: () => go(`#/wod/${wod.id}`) })));
  };
  const list = wodsList();
  root.append(
    h('a', { class: 'back-link', href: '#/workouts' }, icon('chevron', 'chev back-chev'), t('tab.workouts')),
    h('header', { class: 'screen-head' }, h('h1', { text: t('wods.title') })),
    h('p', { class: 'row-sub', text: t('wods.intro') }),
    h('div', { class: 'section-label', text: t('wods.girls') }),
    h('div', { class: 'stack' }, list.filter((w) => w.kind === 'girl').map(card)),
    h('div', { class: 'section-label', text: t('wods.heroes') }),
    h('div', { class: 'stack' }, list.filter((w) => w.kind === 'hero').map(card)),
    h('p', { class: 'row-sub wods-hero-note', text: he() ? data().wods.heroNoteHe : data().wods.heroNoteEn })); // a footnote under the list, not a line above it
  return root;
}

/* ---------- timer ---------- */
const readRun = () => { // a saved clock is only trusted when it has the right shape (a broken one is dropped, never shown as NaN)
  try {
    const r = JSON.parse(localStorage.getItem(RUN_KEY));
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!r || typeof r.id !== 'string' || !num(r.startedMs) || !num(r.pausedTotal ?? 0) || !(r.pausedAt == null || num(r.pausedAt))) return null;
    if (Math.abs(Date.now() - r.startedMs) > 2 * 86400000) return null; // a clock from days ago is stale
    return { ...r, division: r.division === 'scaled' ? 'scaled' : 'rx', rounds: Math.max(0, Math.min(999, Math.round(Number(r.rounds) || 0))) };
  } catch { return null; }
};
const writeRun = (r) => { try { if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r)); else localStorage.removeItem(RUN_KEY); } catch { /* private mode */ } };
const elapsedMs = (r, now = Date.now()) => (r ? (r.pausedAt ?? now) - r.startedMs - (r.pausedTotal ?? 0) : 0);

export function wodScreen(id) {
  const wod = wodById(id);
  const back = h('a', { class: 'back-link', href: '#/wods' }, icon('chevron', 'chev back-chev'), t('wods.title'));
  if (!wod) return h('main', { class: 'screen' }, back, emptyState({ icon: 'bolt', title: t('wod.notfound'), body: '' }));
  const root = h('main', { class: 'screen wod-run' });
  let run = readRun();
  if (run && run.id !== id) run = null; // another workout's clock: leave it alone
  let division = run?.division ?? 'rx';
  let timer = null, lastMinute = 0, lastSecond = null, announced = '';
  const clockEl = h('div', { class: 'wod-clock display num', dir: 'ltr', role: 'timer', 'aria-label': t('wod.clock') });
  const subEl = h('div', { class: 'wod-sub num' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' }); // spoken once a minute, not every second

  const say = (text) => { if (text !== announced) { announced = text; live.textContent = text; } };
  function tick() {
    if (!run) return;
    const ms = elapsedMs(run);
    if (ms < 0) { clockEl.textContent = String(Math.ceil(-ms / 1000)); subEl.textContent = t('wod.getReady'); return; }
    if (lastSecond != null && lastSecond < 0) beep(); // go!
    lastSecond = ms;
    const s = W.clockState(wod, ms);
    clockEl.textContent = W.clock(s.remaining ?? s.elapsed);
    if (wod.format === 'emom') {
      subEl.textContent = t('wod.emomMinute', { m: s.minute, of: wod.minutes, s: Math.ceil(s.secInMinute) });
      if (s.minute !== lastMinute) { if (lastMinute) beep(); lastMinute = s.minute; say(t('wod.emomMinute.say', { m: s.minute, of: wod.minutes })); }
    } else {
      subEl.textContent = wod.format === 'amrap' || wod.format === 'rounds' || wod.rounds > 1 ? t('wod.roundsDone', { n: run.rounds ?? 0 }) : '';
      const min = Math.floor(s.elapsed / 60);
      if (min !== lastMinute) { lastMinute = min; say(t('wod.minutes.say', { n: min })); }
    }
    if (s.done && !run.pausedAt) { beep(); finish(); }
  }
  const start = () => {
    unlockAudio(); keepAwake(true);
    run = { id, division, startedMs: Date.now() + 3000, pausedTotal: 0, pausedAt: null, rounds: 0 };
    lastSecond = -1; writeRun(run); draw();
  };
  const togglePause = () => {
    if (run.pausedAt) { run.pausedTotal += Date.now() - run.pausedAt; run.pausedAt = null; } else run.pausedAt = Date.now();
    writeRun(run); draw();
  };
  const addRound = () => { run.rounds = (run.rounds ?? 0) + 1; writeRun(run); tick(); showToast({ message: t('wod.roundAdded', { n: run.rounds }), duration: 1200 }); };
  function finish() {
    if (!run) return;
    if (!run.pausedAt) run.pausedAt = Date.now();
    writeRun(run); draw(); scoreSheet();
  }
  const discard = () => {
    const sh = openSheet({ title: t('wod.discard'), content: h('div', { class: 'stack' }, h('p', { text: t('wod.discard.body') }),
      button({ label: t('wod.discard.go'), variant: 'danger', block: true, onClick: () => { sh.close(); run = null; writeRun(null); keepAwake(false); draw(); } })) });
  };

  function scoreSheet() {
    const ms = Math.max(0, elapsedMs(run));
    const s = W.clockState(wod, ms);
    const num = (idv, label, value) => {
      const input = h('input', { id: idv, class: 'set-input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 5, dir: 'ltr', value: String(value ?? ''), 'aria-label': label });
      return { input, el: h('label', { class: 'wod-num' }, h('span', { class: 'row-sub', text: label }), input) };
    };
    const fields = [];
    let read;
    if (wod.score === 'time') {
      const mm = num('wod-min', t('wod.f.min'), Math.floor(s.elapsed / 60)), ss = num('wod-sec', t('wod.f.sec'), Math.floor(s.elapsed % 60));
      fields.push(h('div', { class: 'wod-nums' }, mm.el, ss.el));
      read = () => ({ seconds: Number(mm.input.value) * 60 + Number(ss.input.value) });
    } else if (wod.score === 'rounds') {
      const done = wod.format === 'emom' ? Math.min(wod.minutes, Math.floor(s.elapsed / 60)) : run.rounds ?? 0;
      const r = num('wod-rounds', t('wod.f.rounds'), done), x = num('wod-reps', t('wod.f.extra'), 0);
      fields.push(h('div', { class: 'wod-nums' }, r.el, wod.format === 'emom' ? null : x.el));
      read = () => ({ rounds: r.input.value, reps: wod.format === 'emom' ? 0 : x.input.value });
    } else {
      const r = num('wod-total', t('wod.f.total'), '');
      fields.push(r.el);
      read = () => ({ reps: r.input.value });
    }
    let div = run.division;
    const seg = segmented({ label: t('wod.division'), value: div, options: [{ value: 'rx', label: t('wod.rx') }, { value: 'scaled', label: t('wod.scaled') }], onChange: (v) => { div = v; seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 ? 'rx' : 'scaled') === v))); } });
    const notes = h('textarea', { class: 'notes-input', rows: 2, maxlength: 500, placeholder: t('wod.notes.ph'), 'aria-label': t('wod.notes') });
    const err = h('p', { class: 'field-error', role: 'alert', hidden: true, text: t('wod.err.score') });
    const sh = openSheet({ title: t('wod.result', { name: wod.name }), content: h('div', { class: 'stack' },
      h('p', { class: 'row-sub', text: t(`wod.scoreHow.${wod.score}`) }), ...fields, seg, notes, err,
      button({ label: t('wod.save'), block: true, onClick: async () => {
        const score = W.cleanScore(wod.score, read());
        if (!score) { err.hidden = false; return; }
        const now = Date.now();
        const w = W.buildWodWorkout({ id: `wod-${uid()}`, wod, division: div, score, startedMs: Math.min(run.startedMs, now), endedMs: now, notes: notes.value, workouts: store.workouts });
        const res = await saveWodResult(w);
        run = null; writeRun(null); keepAwake(false); sh.close();
        resultSheet(w, res);
      } }),
      button({ label: t('wod.keepGoing'), variant: 'ghost', block: true, onClick: () => { sh.close(); if (run?.pausedAt && !W.clockState(wod, elapsedMs(run)).done) togglePause(); } })) });
  }

  function resultSheet(w, res) {
    const gained = Math.round((res.after ?? 0) - (res.before ?? 0));
    const sh = openSheet({ title: wod.name, content: h('div', { class: 'stack wod-result' },
      h('div', { class: 'wod-clock display num', dir: 'ltr', text: formatScore(w.wod.score) }),
      h('p', { class: 'row-sub', text: divisionName(w.wod.division) }),
      w.wod.pr ? h('p', { class: 'pr-badge pr-all', text: t('wod.pr') }) : null,
      h('p', { text: gained > 0 ? t('wod.lp', { n: gained }) : t('wod.lp.none') }),
      res.rewards?.rewarded ? h('p', { class: 'wod-earned num', text: t('wod.earned', { xp: formatNum(res.rewards.xp, 0), d: formatNum(res.rewards.drachmas, 0) }) + (res.rewards.shake ? ` · ${t('wod.earned.shake')}` : '') }) : null,
      button({ label: t('common.done'), block: true, onClick: () => { sh.close(); go('#/wods'); } })) });
  }

  function draw() {
    clearInterval(timer); timer = null;
    const running = !!run;
    const head = [back, h('header', { class: 'screen-head' }, h('h1', { class: 'display', text: wod.name })),
      h('p', { class: 'wod-format', text: formatLine(wod) }),
      h('button', { class: 'btn btn-ghost wod-info-btn', type: 'button', onclick: () => infoSheet(wod) }, icon('info'), t('wod.info'))];
    const pick = running ? h('p', { class: 'row-sub', text: divisionName(run.division) })
      : segmented({ label: t('wod.division'), value: division, options: [{ value: 'rx', label: t('wod.rx') }, { value: 'scaled', label: t('wod.scaled') }], onChange: (v) => { division = v; draw(); } });
    const controls = !running
      ? [button({ label: t('wod.go'), icon: 'bolt', block: true, onClick: start })]
      : [h('div', { class: 'btn-pair' },
          button({ label: run.pausedAt ? t('wod.resume') : t('wod.pause'), variant: 'secondary', onClick: togglePause }),
          button({ label: t('wod.finish'), onClick: finish })),
        wod.format !== 'emom' && (wod.format !== 'fortime' || W.roundCount(wod) > 1) ? button({ label: t('wod.addRound'), icon: 'plus', variant: 'secondary', block: true, onClick: addRound }) : null,
        button({ label: t('wod.discard'), variant: 'ghost', block: true, onClick: discard })];
    root.replaceChildren(...head, pick,
      h('section', { class: 'card wod-clock-card' }, clockEl, subEl, live),
      h('div', { class: 'stack' }, ...controls),
      h('div', { class: 'section-label', text: t('wod.movements') }),
      movementRows(wod, { division: running ? run.division : division, links: !running }));
    if (running) { tick(); if (!run.pausedAt) timer = setInterval(tick, 250); }
    else { clockEl.textContent = wod.format === 'amrap' || wod.format === 'emom' ? W.clock(wod.minutes * 60) : '0:00'; subEl.textContent = t('wod.ready'); }
  }
  draw();
  root._dispose = () => clearInterval(timer);
  return root;
}

/* ---------- a saved result in the history ---------- */
export function wodHistoryDetail(w) {
  const wod = wodById(w.wod.id);
  const root = h('main', { class: 'screen' },
    h('a', { class: 'back-link', href: '#/history' }, icon('chevron', 'chev back-chev'), t('hist.title')),
    h('header', { class: 'screen-head' }, h('h1', { class: 'display', text: w.wod.name })),
    h('p', { class: 'row-sub num', text: `${formatDate(w.endedMs)} · ${divisionName(w.wod.division)}` }),
    h('section', { class: 'card wod-clock-card' }, h('div', { class: 'wod-clock display num', dir: 'ltr', text: formatScore(w.wod.score) }), w.wod.pr ? h('span', { class: 'pr-badge pr-all', text: t('wod.pr') }) : null),
    w.notes ? h('p', { text: w.notes }) : null,
    wod ? movementRows(wod, { division: w.wod.division }) : null,
    h('div', { class: 'stack', style: 'padding-block-start:16px' },
      wod ? button({ label: t('wod.again'), icon: 'bolt', block: true, onClick: () => go(`#/wod/${wod.id}`) }) : null,
      button({ label: t('wod.delete'), variant: 'danger', block: true, onClick: () => {
        const sh = openSheet({ title: t('wod.delete'), content: h('div', { class: 'stack' }, h('p', { text: t('wod.delete.body') }),
          button({ label: t('wod.delete'), variant: 'danger', block: true, onClick: async () => { await deleteWodResult(w.id); sh.close(); showToast({ message: t('wod.deleted') }); go('#/history'); } })) });
      } })));
  return root;
}
/** Line under a WOD in the history list. */
export const wodHistoryLine = (w) => `${divisionName(w.wod.division)} · ${formatScore(w.wod.score)}${w.wod.pr ? ` · ${t('wod.pr')}` : ''}`;
