// The crew screen: create or join, leaderboard, status + chat feed.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, exThumb, list, listRow, openSheet, segmented, showToast } from './components.js';
import { crew, createCrew, joinCrew, leaveCrew, fetchView, fetchMessages, sendMessage, markSeen, syncStats, syncPlan, onCrew, pushStatus, enablePush, disablePush, kickMember, makeLeader, renameGroup, newInviteCode, syncGroupInfo, fetchPlanDetail, suspendMember, setAdjust, giveDrachmas, fetchReview } from './crew-state.js';
import { lineChart, chartCard } from './charts.js';
import { data } from './data.js';
import { newRoutine, routineEntry } from '../core/routines.mjs';
import { publicUrl } from './crew-api.js';
import { sortBoard, applyAdjust, SORTS, errorKey, normalizeCode, validNick, inviteText, planRows, reviewSummary, MAX_MESSAGE } from '../core/crew.mjs';
import { ACTIVITIES } from '../core/schedule.mjs';
import { getSettings, updateSettings } from './storage.js';
import { saveRoutine, todayKey } from './store.js';
import { TIER_COLORS } from '../core/ranks.mjs';
import { shareViaWhatsApp } from './share.js';
import { formatDateTime, formatNum } from './format.js';

const PERMANENT_HOURS = 876000;
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const errText = (e) => t(`crew.err.${errorKey(e)}`);

/** "Tell the chat?" switch for a leader action (OUR DESIGN: the leader decides per action). */
function announceBox() {
  let on = true;
  const b = h('button', { class: 'chip chip-select announce-toggle', type: 'button', 'aria-pressed': 'true', onclick: () => { on = !on; b.setAttribute('aria-pressed', String(on)); b.textContent = t(on ? 'crew.announce.on' : 'crew.announce.off'); } }, t('crew.announce.on'));
  return { el: h('div', { class: 'stack' }, h('div', { class: 'row-sub', text: t('crew.announce.label') }), b), get: () => on };
}

/** A sheet with a few number choices (hours, points). `custom` adds a box for any number you like. onPick(value, announce) runs the action; the sheet closes when it worked. */
function choiceSheet({ title, body, options, custom = null, onPick }) {
  const ann = announceBox();
  const run = async (value) => { try { await onPick(value, ann.get()); sh.close(); } catch (e) { showToast({ message: errText(e) }); } };
  const box = custom ? h('input', { class: 'text-input', type: 'number', inputmode: 'numeric', dir: 'ltr', min: 1, placeholder: custom.placeholder, 'aria-label': custom.label, id: 'crew-custom' }) : null;
  const content = h('div', { class: 'stack' }, h('p', { text: body }), ann.el,
    h('div', { class: 'chips-wrap' }, options.map(([value, label]) => h('button', { class: 'chip chip-select', type: 'button', onclick: () => run(value) }, label))),
    custom ? h('div', { class: 'field' }, h('label', { for: 'crew-custom', text: custom.label }), h('div', { class: 'field-box' }, box)) : null,
    custom ? button({ label: custom.go, variant: 'secondary', block: true, onClick: () => { const n = Math.floor(Number(box.value)); if (n >= 1) run(custom.map(n)); else showToast({ message: t('crew.err.bad_target') }); } }) : null,
    button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() }));
  const sh = openSheet({ title, content });
}

/** A small "are you sure" sheet with the announce switch. onGo(announce) */
function confirmSheet({ title, body, label, danger = false, announce = true, onGo }) {
  const ann = announceBox();
  const content = h('div', { class: 'stack' }, h('p', { text: body }), announce ? ann.el : null,
    button({ label, variant: danger ? 'danger' : 'primary', block: true, onClick: async () => { try { await onGo(ann.get()); sh.close(); } catch (e) { showToast({ message: errText(e) }); } } }),
    button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() }));
  const sh = openSheet({ title, content });
}

/**
 * Before a gift (OUR DESIGN): the leader sees how the member has been doing - rating, weekly volume and workouts over time, a short summary,
 * and the heaviest sets from their latest workouts - and then decides the amount. The sets and history are readable by the leader only.
 */
function giftSheet(m, done) {
  const body = h('div', { class: 'stack crew-review' }, h('p', { class: 'row-sub', text: t('crew.review.loading') }));
  const sh = openSheet({ title: t('crew.gift.title'), tall: true, content: body });
  const nameOf = (r) => { const ex = data().byId[r.e]; return ex ? (getLanguage() === 'he' ? ex.nameHe : ex.nameEn) : r.n || t('exercise.unknown'); };
  const ms = (day) => Date.parse(`${day}T12:00:00Z`);
  const show = (rv) => {
    const rows = rv.history ?? [];
    const sum = reviewSummary(rows);
    const series = (key) => rows.filter((r) => r[key] != null).map((r) => ({ t: ms(r.day), v: r[key] }));
    const charts = rows.length
      ? [chartCard({ title: t('crew.review.rating'), chart: lineChart({ series: series('rating'), title: t('crew.review.rating') }), empty: series('rating').length ? null : t('progress.nodata') }),
        chartCard({ title: t('crew.review.week'), chart: lineChart({ series: series('week'), unit: t('unit.kg'), title: t('crew.review.week') }) }),
        chartCard({ title: t('crew.review.workouts'), chart: lineChart({ series: series('workouts'), title: t('crew.review.workouts') }) })]
      : [h('p', { class: 'row-sub', text: t('crew.review.empty') })];
    const recent = (rv.recent ?? []).length
      ? h('div', { class: 'list' }, rv.recent.map((r) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: nameOf(r) }), h('span', { class: 'row-sub num', dir: 'ltr', text: `${formatNum(r.w, 1)} ${t('unit.kg')} × ${r.r} · ${r.d}` })))))
      : h('p', { class: 'row-sub', text: t('crew.review.noSets') });
    let amount = 0, bonus = 0;
    const ann = announceBox();
    const bbox = h('input', { class: 'text-input', type: 'number', inputmode: 'numeric', dir: 'ltr', min: 1, id: 'crew-gift-bonus', 'aria-label': t('crew.gift.bonus.custom'), placeholder: t('crew.gift.bonus.custom') });
    const bchips = [25, 50, 100, 250].map((n) => h('button', { class: 'chip chip-select', type: 'button', 'aria-pressed': 'false', onclick: (e) => { bonus = n; bbox.value = ''; bchips.forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget))); } }, `+${n}`));
    bbox.addEventListener('input', () => { bonus = Math.floor(Number(bbox.value)) || 0; bchips.forEach((c) => c.setAttribute('aria-pressed', 'false')); });
    const box = h('input', { class: 'text-input', type: 'number', inputmode: 'numeric', dir: 'ltr', min: 1, id: 'crew-gift-amount', 'aria-label': t('crew.gift.custom'), placeholder: t('crew.gift.custom') });
    const chips = [50, 100, 250, 500, 1000].map((n) => h('button', { class: 'chip chip-select', type: 'button', 'aria-pressed': 'false', onclick: (e) => { amount = n; box.value = ''; chips.forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget))); } }, String(n)));
    box.addEventListener('input', () => { amount = Math.floor(Number(box.value)) || 0; chips.forEach((c) => c.setAttribute('aria-pressed', 'false')); });
    body.replaceChildren(
      h('p', { text: t('crew.gift.body', { name: m.nickname }) }),
      ...charts,
      sum ? h('p', { class: 'card crew-review-sum', text: t('crew.review.sum', { name: m.nickname, days: sum.days, w: sum.workouts, r: sum.rating >= 0 ? `+${sum.rating}` : String(sum.rating), v: formatNum(sum.week, 0), s: sum.streak }) }) : null,
      h('div', { class: 'section-label', text: t('crew.review.sets') }), recent,
      h('div', { class: 'section-label', text: t('crew.gift.amount') }),
      h('div', { class: 'chips-wrap' }, chips), h('div', { class: 'field' }, h('div', { class: 'field-box' }, box)),
      h('div', { class: 'section-label', text: t('crew.gift.bonus') }), h('p', { class: 'row-sub', text: t('crew.gift.bonus.note') }),
      h('div', { class: 'chips-wrap' }, bchips), h('div', { class: 'field' }, h('div', { class: 'field-box' }, bbox)), ann.el,
      button({ label: t('crew.gift.go'), variant: 'primary', block: true, onClick: async () => { if (amount < 1 && bonus < 1) { showToast({ message: t('crew.err.bad_target') }); return; } try { if (amount >= 1) await giveDrachmas(m.id, amount, ann.get()); if (bonus >= 1) await setAdjust(m.id, (Number(m.adjust) || 0) + bonus, ann.get()); sh.close(); done(); } catch (e) { showToast({ message: errText(e) }); } } }),
      button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() }));
  };
  fetchReview(m.id).then(show).catch((e) => body.replaceChildren(h('p', { class: 'field-error', text: errText(e) }), button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() })));
}

export function crewScreen() {
  const root = h('main', { class: 'screen crew' });
  let tab = 'feed', sort = 'rating';
  let view = null, messages = [], timer = null, busy = false, formMode = 'join';
  if (!crew.ownerKey) formMode = 'join';
  const off = onCrew(() => { if (!crew.local) draw(); });

  /* ---------- not in a crew ---------- */
  function startView() {
    const nick = h('input', { class: 'text-input', type: 'text', maxlength: 24, placeholder: t('crew.nick.ph'), 'aria-label': t('crew.nick'), id: 'crew-nick' });
    const code = h('input', { class: 'text-input', type: 'text', maxlength: 8, autocapitalize: 'characters', autocomplete: 'off', dir: 'ltr', placeholder: 'AB23CD', 'aria-label': t('crew.code'), id: 'crew-code' });
    const name = h('input', { class: 'text-input', type: 'text', maxlength: 40, placeholder: t('crew.name.ph'), 'aria-label': t('crew.name'), id: 'crew-name' });
    const msg = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const fail = (text) => { msg.textContent = text; msg.hidden = false; };
    const go = async (btn) => {
      msg.hidden = true;
      const n = validNick(nick.value);
      if (!n) return fail(t('crew.err.bad_nick'));
      btn.disabled = true;
      try {
        if (formMode === 'join') { const c = normalizeCode(code.value); if (c.length !== 6) { btn.disabled = false; return fail(t('crew.err.no_group')); } await joinCrew(c, n); }
        else { if (!name.value.trim()) { btn.disabled = false; return fail(t('crew.err.bad_name')); } await createCrew(name.value.trim(), n); }
        showToast({ message: t('crew.welcome') });
        begin();
        draw();
      } catch (e) { btn.disabled = false; fail(errText(e)); }
    };
    const go2 = button({ label: t(formMode === 'join' ? 'crew.join.go' : 'crew.create.go'), block: true, onClick: (e) => go(e.currentTarget) });
    return [
      h('p', { text: t('crew.intro') }),
      h('section', { class: 'card card-accent', style: 'margin-block:12px' },
        h('h2', { text: t('crew.share.title') }),
        h('p', { text: t('crew.share.body') })),
      crew.ownerKey ? segmented({ label: t('crew.title'), value: formMode, onChange: (v) => { formMode = v; draw(); }, options: [{ value: 'join', label: t('crew.join') }, { value: 'create', label: t('crew.create') }] }) : h('p', { class: 'row-sub', text: t('crew.owner.only') }),
      h('div', { class: 'stack', style: 'padding-block-start:12px' },
        formMode === 'join' ? h('div', { class: 'field' }, h('label', { for: 'crew-code', text: t('crew.code') }), h('div', { class: 'field-box' }, code)) : h('div', { class: 'field' }, h('label', { for: 'crew-name', text: t('crew.name') }), h('div', { class: 'field-box' }, name)),
        h('div', { class: 'field' }, h('label', { for: 'crew-nick', text: t('crew.nick') }), h('div', { class: 'field-box' }, nick)),
        msg, go2),
    ];
  }

  /* ---------- in a crew ---------- */
  const tierLabel = (s) => (s.tier ? `${t(`tier.${s.tier}`)}${s.division ? ` ${s.division}` : ''}` : t('crew.unranked'));
  const metric = { rating: (s) => (s.rating != null ? formatNum(s.rating, 0) : '–'), level: (s) => t('game.level', { n: s.level ?? 1 }), week: (s) => `${formatNum(s.weekVolume ?? 0, 0)} ${t('unit.kg')}`, streak: (s) => t('game.streakDays', { n: s.streak ?? 0 }) };

  function boardView() {
    const members = sortBoard(view.members.map(applyAdjust), sort);
    return [
      segmented({ label: t('crew.sort'), value: sort, onChange: (v) => { sort = v; draw(); }, options: SORTS.map((s) => ({ value: s, label: t(`crew.sort.${s}`) })) }),
      h('div', { class: 'list crew-board', style: 'margin-block-start:12px' }, members.map((m, i) => {
        const s = m.stats ?? {};
        const mine = m.id === crew.local.memberId;
        return h('button', { class: `row crew-row${mine ? ' me' : ''}`, type: 'button', 'data-nick': m.nickname, onclick: () => friendSheet(m, mine) },
          h('span', { class: 'crew-pos display num', text: String(i + 1) }),
          h('span', { class: 'row-main' },
            h('span', { class: 'row-title' }, mine ? `${m.nickname} · ${t('crew.you')}` : m.nickname, m.leader ? leaderChip() : null, m.suspended ? h('span', { class: 'chip chip-warn', text: t('crew.suspended') }) : null, m.adjust ? h('span', { class: 'chip chip-warn num', dir: 'ltr', text: signed(m.adjust), title: t('crew.adjust.title') }) : null),
            h('span', { class: 'row-sub' }, s.tier ? h('span', { style: `color:${TIER_COLORS[s.tier] ?? 'inherit'}`, text: tierLabel(s) }) : t('crew.unranked'), ` · ${t('game.level', { n: s.level ?? 1 })} · `, h('bdi', { class: 'num', text: `${formatNum(s.weekVolume ?? 0, 0)} ${t('unit.kg')}` }))),
          h('span', { class: 'crew-val display num' }, h('bdi', { text: metric[sort](s) })));
      })),
      h('p', { class: 'row-sub', style: 'padding-block-start:8px', text: t('crew.board.note') }),
    ];
  }

  const weekday = (d) => new Intl.DateTimeFormat(getLanguage() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 11 + d)); // 2026-10-11 is a Sunday
  const itemName = (it) => (it.kind === 'rest' ? t('sched.rest') : it.kind === 'activity' ? (ACTIVITIES.includes(it.name) ? t(`sched.act.${it.name}`) : it.name || t('sched.act.other')) : it.name || t('crew.p.workout'));
  const dayText = (r) => (r.items.length ? r.items.map(itemName).join(' + ') : t('sched.none'));

  /** A friend's strength workout: the exercises with sets and reps (no weights), and a button that saves a copy to your own workouts. */
  function workoutPeek({ name, nick, list: items }) {
    const title = name || t('crew.p.workout');
    const body = h('div', { class: 'stack crew-peek' });
    const sh = openSheet({ title: `${title} · ${nick}`, tall: true, content: body });
    const byId = data().byId;
    const exName = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
    let saved = null;
    const draw2 = () => body.replaceChildren(
      h('div', { class: 'list' }, items.map((x) => { const ex = byId[x.e]; return h('div', { class: 'row crew-peek-row' }, exThumb(ex, 48), h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: exName(ex) }), h('span', { class: 'row-sub num', dir: 'ltr', text: `${x.s}×${x.a === x.b ? x.a : `${x.a}-${x.b}`}` }))); })),
      h('p', { class: 'row-sub', text: t('crew.peek.note', { name: nick }) }),
      saved
        ? h('a', { class: 'btn btn-primary btn-block', href: `#/routine/${saved.id}`, onclick: () => sh.close() }, t('crew.peek.open'))
        : button({ label: t('crew.peek.add'), icon: 'plus', block: true, onClick: async () => {
          const r = newRoutine({ name: `${title} · ${nick}`.slice(0, 60) });
          r.entries = items.map((x) => routineEntry(byId[x.e], { sets: x.s, repsMin: x.a, repsMax: x.b }));
          await saveRoutine(r); saved = r; showToast({ message: t('crew.peek.added') }); draw2();
        } }));
    draw2();
  }

  /** A friend's profile: rank, numbers and (if they share it) the week plan. Opens from the leaderboard. */
  function friendSheet(m, mine) {
    const s = m.stats ?? {};
    let detailP = null; // fetched when you first tap one of their workouts
    const detail = () => (detailP ??= fetchPlanDetail(m.id).catch(() => ({})));
    const peek = async (it) => {
      const list = ((await detail())[it.detailKey] ?? []).filter((x) => data().byId[x.e]);
      if (!list.length) { showToast({ message: t('crew.p.noDetail') }); return; }
      workoutPeek({ name: it.name, nick: m.nickname, list });
    };
    const rows = planRows(m.plan, todayKey());
    const stat = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'stat-v display num' }, h('bdi', { text: value })), h('span', { class: 'stat-l', text: label }));
    const plan = rows
      ? h('div', { class: 'list crew-plan' }, rows.map((r) => h('div', { class: `row crew-plan-row${r.trained ? ' trained' : ''}` },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: weekday(r.weekday) }), h('span', { class: 'row-sub crew-day-items' }, r.items.length ? r.items.map((it) => (it.kind === 'workout' ? h('button', { class: 'chip chip-select crew-workout', type: 'button', onclick: () => peek(it) }, itemName(it), ' ›') : h('span', { class: `sched-${it.kind}`, text: itemName(it) }))) : t('sched.none'))),
        r.trained ? h('span', { class: 'plan-done', 'aria-label': t('crew.p.trained') }, icon('check')) : null)))
      : h('p', { class: 'row-sub', text: mine ? t('crew.p.mineOff') : t('crew.p.notShared', { name: m.nickname }) });
    const afterLeaderAction = async () => { view = null; await refreshFeed(true); };
    const sh = openSheet({ title: mine ? `${m.nickname} · ${t('crew.you')}` : m.nickname, tall: true, content: h('div', { class: 'stack crew-friend' },
      h('div', { class: 'row-sub' }, s.tier ? h('span', { style: `color:${TIER_COLORS[s.tier] ?? 'inherit'}`, text: tierLabel(s) }) : t('crew.unranked'), s.rating != null ? ` · ${formatNum(s.rating, 0)}` : ''),
      h('div', { class: 'stats-grid' },
        stat(t('crew.sort.level'), String(s.level ?? 1)), stat(t('crew.sort.streak'), t('game.streakDays', { n: s.streak ?? 0 })),
        stat(t('crew.p.week'), `${formatNum(s.weekVolume ?? 0, 0)} ${t('unit.kg')}`), stat(t('crew.p.month'), String(s.monthWorkouts ?? 0))),
      m.leader ? h('div', { class: 'row-sub' }, leaderChip(), ' ', t('crew.leader.is', { name: m.nickname })) : null,
      m.adjust ? h('div', { class: 'row-sub' }, t('crew.adjust.note', { raw: formatNum(m.rawRating ?? 0, 0), n: signed(m.adjust) })) : null,
      m.suspended ? h('div', { class: 'row-sub' }, t('crew.suspended.until', { time: formatDateTime(Date.parse(m.suspended_until)) })) : null,
      h('div', { class: 'section-label', text: t('crew.p.plan') }), plan,
      isLeader() && !mine ? h('div', { class: 'stack crew-leader-tools' },
        h('div', { class: 'section-label', text: t('crew.leader.tools') }),
        button({ label: t('crew.suspend'), variant: 'secondary', block: true, onClick: () => choiceSheet({ title: t('crew.suspend'), body: t('crew.suspend.body', { name: m.nickname }), options: [[1, t('crew.hours', { n: 1 })], [24, t('crew.days', { n: 1 })], [72, t('crew.days', { n: 3 })], [168, t('crew.days', { n: 7 })], [720, t('crew.days', { n: 30 })], [PERMANENT_HOURS, t('crew.permanent')], ...(m.suspended ? [[0, t('crew.suspend.lift')]] : [])], custom: { label: t('crew.suspend.custom'), placeholder: t('crew.suspend.custom.ph'), go: t('crew.suspend.custom.go'), map: (n) => n * 24 }, onPick: async (v, announce) => { await suspendMember(m.id, v, announce); sh.close(); await afterLeaderAction(); } }) }),
        button({ label: t('crew.adjust.title'), variant: 'secondary', block: true, onClick: () => choiceSheet({ title: t('crew.adjust.title'), body: t('crew.adjust.body', { name: m.nickname }), options: [[-50, '−50'], [-100, '−100'], [-200, '−200'], [-500, '−500'], [-1000, '−1000'], [50, '+50'], [100, '+100'], [250, '+250'], [0, t('crew.adjust.reset')]], custom: { label: t('crew.adjust.custom'), placeholder: t('crew.adjust.custom.ph'), go: t('crew.adjust.custom.go'), map: (n) => -n }, onPick: async (v, announce) => { await setAdjust(m.id, v, announce); sh.close(); await afterLeaderAction(); } }) }),
        button({ label: t('crew.gift.title'), variant: 'secondary', block: true, onClick: () => giftSheet(m, async () => { sh.close(); await afterLeaderAction(); }) }),
        button({ label: t('crew.leader.make'), variant: 'secondary', block: true, onClick: () => confirmSheet({ title: t('crew.leader.make'), body: t('crew.leader.make.body', { name: m.nickname }), label: t('crew.leader.make.go'), onGo: async (announce) => { await makeLeader(m.id, announce); sh.close(); await afterLeaderAction(); } }) }),
        button({ label: t('crew.kick'), variant: 'danger', block: true, onClick: () => confirmSheet({ title: t('crew.kick'), body: t('crew.kick.body', { name: m.nickname }), label: t('crew.kick.go'), danger: true, onGo: async (announce) => { await kickMember(m.id, announce); sh.close(); await afterLeaderAction(); } }) })) : null) });
  }

  function shareBox(again = draw) {
    const on = !!getSettings().sharePlan;
    return h('section', { class: 'card crew-share', style: 'margin-block-start:12px' },
      h('h2', { text: t('crew.share.plan.title') }),
      h('p', { text: t('crew.share.plan.body') }),
      segmented({ label: t('crew.share.plan.title'), value: on ? 'on' : 'off', onChange: async (v) => { await updateSettings({ sharePlan: v === 'on' }); await syncPlan(); again(); }, options: [{ value: 'off', label: t('crew.share.plan.off') }, { value: 'on', label: t('crew.share.plan.on') }] }),
      h('p', { class: 'row-sub', text: t('crew.privacy.note') }));
  }

  const hoursText = (h24) => (h24 >= PERMANENT_HOURS / 2 ? t('crew.permanent') : h24 % 24 === 0 ? t('crew.days', { n: h24 / 24 }) : t('crew.hours', { n: h24 }));
  const sysText = (m) => {
    const [kind, arg] = String(m.body).split(':');
    if (kind === 'suspended') return t('crew.sys.suspended', { name: m.nickname, time: hoursText(Number(arg)) });
    if (kind === 'unsuspended') return t('crew.sys.unsuspended', { name: m.nickname });
    if (kind === 'adjust') return Number(arg) ? t('crew.sys.adjust', { name: m.nickname, n: signed(Number(arg)) }) : t('crew.sys.adjust0', { name: m.nickname });
    if (kind === 'gift') return t('crew.sys.gift', { name: m.nickname, n: arg });
    return t(({ created: 'crew.sys.created', removed: 'crew.sys.removed', leader: 'crew.sys.leader' })[kind] ?? 'crew.sys.joined', { name: m.nickname });
  };
  const isLeader = () => !!view?.me?.leader;
  const leaderChip = () => h('span', { class: 'chip chip-leader', text: t('crew.leader') });
  function feedView() {
    const mine = crew.local.memberId;
    const bubbles = messages.length ? messages.map((m) => (m.kind === 'system'
      ? h('div', { class: 'crew-sys', text: sysText(m) })
      : h('div', { class: `crew-msg ${m.kind}${m.member_id === mine ? ' mine' : ''}` },
        h('div', { class: 'crew-meta' }, h('b', { text: m.nickname }), view?.members?.find((x) => x.id === m.member_id)?.leader ? leaderChip() : null, m.kind === 'status' ? h('span', { class: 'chip chip-primary', text: t('crew.status') }) : null, h('span', { class: 'row-sub', text: formatDateTime(Date.parse(m.created_at)) })),
        h('div', { class: 'crew-body', dir: 'auto', text: m.body })))) : [h('p', { class: 'row-sub center', text: t('crew.feed.empty') })];
    const input = h('input', { class: 'text-input', type: 'text', maxlength: MAX_MESSAGE, enterkeyhint: 'send', autocomplete: 'off', placeholder: t('crew.say.ph'), 'aria-label': t('crew.say'), id: 'crew-say' });
    const send = async (body, k = 'chat') => {
      const text = String(body).trim();
      if (!text) return;
      try { await sendMessage(k, text); input.value = ''; await refreshFeed(true); } catch (e) { showToast({ message: errText(e) }); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(input.value); });
    const suspended = view?.me?.suspended_until;
    if (suspended) return [h('div', { class: 'crew-feed', id: 'crew-feed', 'aria-live': 'polite' }, bubbles), h('p', { class: 'card crew-suspended', role: 'status', text: t('crew.suspended.you', { time: formatDateTime(Date.parse(suspended)) }) })];
    const quick = ['going', 'done', 'rest'].map((q) => h('button', { class: 'chip chip-select', type: 'button', onclick: () => send(t(`crew.q.${q}`), 'status') }, t(`crew.q.${q}`)));
    return [
      h('div', { class: 'crew-feed', id: 'crew-feed', 'aria-live': 'polite' }, bubbles),
      h('div', { class: 'crew-quick' }, quick),
      h('div', { class: 'crew-compose' }, h('div', { class: 'field-box' }, input), h('button', { class: 'icon-btn send-btn', type: 'button', 'aria-label': t('crew.send'), onclick: () => send(input.value) }, icon('upload'))),
    ];
  }

  async function invite() {
    const url = `${location.origin}${location.pathname}`.replace(/index\.html$/, '');
    const r = await shareViaWhatsApp(inviteText({ name: crew.local.name, code: crew.local.code, url }, getLanguage()));
    if (r === 'copied') showToast({ message: t('crew.invite.copied') });
  }

  function leave() {
    const body = h('div', { class: 'stack' }, h('p', { text: t('crew.leave.body') }),
      button({ label: t('crew.leave.go'), variant: 'danger', block: true, onClick: async () => { try { await leaveCrew(); clearInterval(timer); timer = null; view = null; messages = []; sh.close(); showToast({ message: t('crew.left') }); draw(); } catch (e) { showToast({ message: errText(e) }); } } }),
      button({ label: t('common.cancel'), variant: 'ghost', block: true, onClick: () => sh.close() }));
    const sh = openSheet({ title: t('crew.leave'), content: body });
  }

  function notifyBox(again = draw) {
    const box = h('section', { class: 'card crew-push', style: 'margin-block: 12px' });
    pushStatus().then((st) => box.replaceChildren(
      h('h2', { text: t('crew.push.title') }),
      h('p', { text: t(`crew.push.state.${st}`) }),
      st === 'off' ? button({ label: t('crew.push.enable'), icon: 'bolt', block: true, onClick: async () => {
        try { await enablePush(); showToast({ message: t('crew.push.enabled') }); again(); } catch (e) { showToast({ message: t(e.message === 'denied' ? 'crew.push.state.denied' : e.message === 'unsupported' ? 'crew.push.state.unsupported' : 'crew.err.generic'), duration: 6000 }); }
      } }) : null,
      st === 'on' ? button({ label: t('crew.push.disable'), variant: 'secondary', block: true, onClick: async () => { await disablePush(); again(); } }) : null));
    return box;
  }

  /** Leader: rename the crew, make a new invite code. Everyone else sees who the leader is. */
  function leaderBox(again) {
    const lead = view?.members?.find((x) => x.leader);
    if (!isLeader()) return lead ? h('p', { class: 'row-sub' }, leaderChip(), ' ', t('crew.leader.is', { name: lead.nickname })) : null;
    const name = h('input', { class: 'text-input', type: 'text', maxlength: 40, value: crew.local.name, 'aria-label': t('crew.rename'), id: 'crew-rename' });
    return h('section', { class: 'card crew-leader-box' },
      h('h2', {}, leaderChip(), ' ', t('crew.leader.tools')),
      h('div', { class: 'field' }, h('label', { for: 'crew-rename', text: t('crew.rename') }), h('div', { class: 'field-box' }, name)),
      button({ label: t('common.save'), variant: 'secondary', block: true, onClick: async () => { try { await renameGroup(name.value); showToast({ message: t('crew.renamed') }); draw(); again(); } catch (e) { showToast({ message: errText(e) }); } } }),
      button({ label: t('crew.newcode'), variant: 'ghost', block: true, onClick: () => confirmSheet({ title: t('crew.newcode'), announce: false, body: t('crew.newcode.body'), label: t('crew.newcode.go'), onGo: async () => { await newInviteCode(); draw(); again(); } }) }));
  }

  /** Code, notifications, plan sharing and leaving live in a small sheet behind the gear, so the chat has the whole screen. */
  function openGroupSheet() {
    const body = h('div', { class: 'stack crew-settings' });
    const render = () => body.replaceChildren(
      h('section', { class: 'card crew-head crew-codebar' },
        h('div', {}, h('div', { class: 'row-sub', text: t('crew.code.label') }), h('div', { class: 'display crew-code num', dir: 'ltr', text: crew.local.code })),
        button({ label: t('crew.invite'), icon: 'share', variant: 'secondary', onClick: invite })),
      leaderBox(render),
      notifyBox(render),
      shareBox(render),
      list([listRow({ title: t('crew.leave'), sub: t('crew.leave.sub'), icon: 'trash', onClick: () => { sh.close(); leave(); } })]));
    const sh = openSheet({ title: t('crew.settings'), content: body, tall: true });
    render();
  }

  function joinedView() {
    return [
      h('div', { class: 'crew-tabs' }, segmented({ label: t('crew.title'), value: tab, onChange: (v) => { tab = v; draw(); if (v === 'feed') markRead(); }, options: [{ value: 'feed', label: `${t('crew.tab.feed')}${crew.unread ? ` (${crew.unread})` : ''}` }, { value: 'board', label: t('crew.tab.board') }] })),
      !view ? h('p', { class: 'row-sub center', text: t('common.loading') }) : tab === 'board' ? boardView() : feedView(),
    ];
  }

  function draw() {
    const keep = document.getElementById('crew-say')?.value ?? '';
    root.replaceChildren(
      h('a', { class: 'back-link', href: '#/profile' }, icon('chevron', 'chev back-chev'), t('tab.profile')),
      h('header', { class: 'screen-head' }, h('h1', { text: crew.local ? crew.local.name : t('crew.title') }), crew.local ? h('button', { class: 'icon-btn crew-gear', type: 'button', 'aria-label': t('crew.settings'), onclick: openGroupSheet }, icon('settings')) : null),
      ...(crew.local ? joinedView() : startView()));
    const say = document.getElementById('crew-say'); if (say && keep) say.value = keep;
    const feed = document.getElementById('crew-feed'); if (feed) feed.scrollTop = feed.scrollHeight;
  }

  async function markRead() { if (messages.length) await markSeen(messages[messages.length - 1].id); }
  async function refreshFeed(scroll = false) {
    if (!crew.local || busy) return;
    busy = true;
    try {
      const lastId = messages.length ? messages[messages.length - 1].id : 0;
      const fresh = await fetchMessages(lastId, lastId ? 100 : 60);
      const [v] = await Promise.all([fetchView()]);
      const changed = fresh.length || JSON.stringify(v.members) !== JSON.stringify(view?.members) || JSON.stringify(v.group) !== JSON.stringify(view?.group) || !!v.me?.leader !== !!view?.me?.leader;
      await syncGroupInfo(v.group);
      view = v; messages = [...messages, ...fresh];
      if (changed || scroll) draw();
      if (tab === 'feed') markRead();
    } catch (e) {
      if (errorKey(e) === 'not_member') { await leaveCrew().catch(() => {}); showToast({ message: t('crew.removed') }); draw(); }
    } finally { busy = false; }
  }

  function begin() {
    if (timer || !crew.local) return;
    syncStats(true);
    refreshFeed();
    timer = setInterval(() => { if (document.visibilityState === 'visible') refreshFeed(); }, 7000);
  }
  draw();
  begin();
  root._dispose = () => { clearInterval(timer); off(); };
  return root;
}
