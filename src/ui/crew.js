// The crew screen: create or join, leaderboard, status + chat feed.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { button, list, listRow, openSheet, segmented, showToast } from './components.js';
import { crew, createCrew, joinCrew, leaveCrew, fetchView, fetchMessages, sendMessage, markSeen, syncStats, onCrew, pushStatus, enablePush, disablePush } from './crew-state.js';
import { publicUrl } from './crew-api.js';
import { sortBoard, SORTS, errorKey, normalizeCode, validNick, inviteText, MAX_MESSAGE } from '../core/crew.mjs';
import { TIER_COLORS } from '../core/ranks.mjs';
import { shareViaWhatsApp } from './share.js';
import { formatDateTime, formatNum } from './format.js';

const errText = (e) => t(`crew.err.${errorKey(e)}`);

export function crewScreen() {
  const root = h('main', { class: 'screen crew' });
  let tab = 'feed', sort = 'rating';
  let view = null, messages = [], timer = null, busy = false, formMode = 'join';
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
      segmented({ label: t('crew.title'), value: formMode, onChange: (v) => { formMode = v; draw(); }, options: [{ value: 'join', label: t('crew.join') }, { value: 'create', label: t('crew.create') }] }),
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
    const members = sortBoard(view.members, sort);
    return [
      segmented({ label: t('crew.sort'), value: sort, onChange: (v) => { sort = v; draw(); }, options: SORTS.map((s) => ({ value: s, label: t(`crew.sort.${s}`) })) }),
      h('div', { class: 'list crew-board', style: 'margin-block-start:12px' }, members.map((m, i) => {
        const s = m.stats ?? {};
        const mine = m.id === crew.local.memberId;
        return h('div', { class: `row crew-row${mine ? ' me' : ''}`, 'data-nick': m.nickname },
          h('span', { class: 'crew-pos display num', text: String(i + 1) }),
          h('span', { class: 'row-main' },
            h('span', { class: 'row-title', text: mine ? `${m.nickname} · ${t('crew.you')}` : m.nickname }),
            h('span', { class: 'row-sub' }, s.tier ? h('span', { style: `color:${TIER_COLORS[s.tier] ?? 'inherit'}`, text: tierLabel(s) }) : t('crew.unranked'), ` · ${t('game.level', { n: s.level ?? 1 })} · `, h('bdi', { class: 'num', text: `${formatNum(s.weekVolume ?? 0, 0)} ${t('unit.kg')}` }))),
          h('span', { class: 'crew-val display num' }, h('bdi', { text: metric[sort](s) })));
      })),
      h('p', { class: 'row-sub', style: 'padding-block-start:8px', text: t('crew.board.note') }),
    ];
  }

  const sysText = (m) => t(m.body === 'created' ? 'crew.sys.created' : 'crew.sys.joined', { name: m.nickname });
  function feedView() {
    const mine = crew.local.memberId;
    const bubbles = messages.length ? messages.map((m) => (m.kind === 'system'
      ? h('div', { class: 'crew-sys', text: sysText(m) })
      : h('div', { class: `crew-msg ${m.kind}${m.member_id === mine ? ' mine' : ''}` },
        h('div', { class: 'crew-meta' }, h('b', { text: m.nickname }), m.kind === 'status' ? h('span', { class: 'chip chip-primary', text: t('crew.status') }) : null, h('span', { class: 'row-sub', text: formatDateTime(Date.parse(m.created_at)) })),
        h('div', { class: 'crew-body', dir: 'auto', text: m.body })))) : [h('p', { class: 'row-sub center', text: t('crew.feed.empty') })];
    const input = h('input', { class: 'text-input', type: 'text', maxlength: MAX_MESSAGE, enterkeyhint: 'send', autocomplete: 'off', placeholder: t('crew.say.ph'), 'aria-label': t('crew.say'), id: 'crew-say' });
    const send = async (body, k = 'chat') => {
      const text = String(body).trim();
      if (!text) return;
      try { await sendMessage(k, text); input.value = ''; await refreshFeed(true); } catch (e) { showToast({ message: errText(e) }); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(input.value); });
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

  function notifyBox() {
    const box = h('section', { class: 'card crew-push', style: 'margin-block-start:12px' });
    pushStatus().then((st) => box.replaceChildren(
      h('h2', { text: t('crew.push.title') }),
      h('p', { text: t(`crew.push.state.${st}`) }),
      st === 'off' ? button({ label: t('crew.push.enable'), icon: 'bolt', block: true, onClick: async () => {
        try { await enablePush(); showToast({ message: t('crew.push.enabled') }); draw(); } catch (e) { showToast({ message: t(e.message === 'denied' ? 'crew.push.state.denied' : e.message === 'unsupported' ? 'crew.push.state.unsupported' : 'crew.err.generic'), duration: 6000 }); }
      } }) : null,
      st === 'on' ? button({ label: t('crew.push.disable'), variant: 'secondary', block: true, onClick: async () => { await disablePush(); draw(); } }) : null));
    return box;
  }

  function joinedView() {
    return [
      h('div', { class: 'crew-tabs' }, segmented({ label: t('crew.title'), value: tab, onChange: (v) => { tab = v; draw(); if (v === 'feed') markRead(); }, options: [{ value: 'feed', label: `${t('crew.tab.feed')}${crew.unread ? ` (${crew.unread})` : ''}` }, { value: 'board', label: t('crew.tab.board') }] })),
      !view ? h('p', { class: 'row-sub center', text: t('common.loading') }) : tab === 'board' ? boardView() : feedView(),
      h('details', { class: 'crew-more' },
        h('summary', { text: t('crew.more') }),
        h('section', { class: 'card crew-head' },
          h('div', {}, h('div', { class: 'row-sub', text: t('crew.code.label') }), h('div', { class: 'display crew-code num', dir: 'ltr', text: crew.local.code })),
          button({ label: t('crew.invite'), icon: 'share', variant: 'secondary', onClick: invite })),
        notifyBox(),
        h('div', { style: 'padding-block-start:12px' }, list([listRow({ title: t('crew.leave'), sub: t('crew.leave.sub'), icon: 'trash', onClick: leave })]))),
    ];
  }

  function draw() {
    const keep = document.getElementById('crew-say')?.value ?? '';
    root.replaceChildren(
      h('a', { class: 'back-link', href: '#/profile' }, icon('chevron', 'chev back-chev'), t('tab.profile')),
      h('header', { class: 'screen-head' }, h('h1', { text: crew.local ? crew.local.name : t('crew.title') }), crew.local ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('crew.invite'), onclick: invite }, icon('plus')) : null),
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
      const changed = fresh.length || JSON.stringify(v.members) !== JSON.stringify(view?.members);
      view = v; messages = [...messages, ...fresh];
      if (changed || scroll) draw();
      if (tab === 'feed') markRead();
    } catch (e) {
      if (errorKey(e) === 'not_member') { await leaveCrew().catch(() => {}); draw(); }
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
