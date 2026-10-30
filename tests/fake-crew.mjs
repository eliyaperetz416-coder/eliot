// An in-memory stand-in for the crew database (same rules as the SQL functions) so UI tests do not need the network.
export function createFakeCrew() {
  const groups = new Map(); // code -> { name, members: [] , messages: [] }
  const byToken = new Map(); // token -> { group, member }
  let msgId = 0;
  const fail = (message) => { const e = new Error(message); e.fake = true; throw e; };
  const add = (g, m, kind, body) => { g.messages.push({ id: ++msgId, member_id: m.id, nickname: m.nickname, kind, body, created_at: new Date().toISOString() }); return msgId; };
  const me = (t) => (t && t.length >= 32 ? byToken.get(t) ?? fail('not_member') : fail('bad_token'));
  let memberSeq = 0;
  const links = new Map(); // token -> { snapshot, updated_at, active }
  const OWNER_KEY = 'owner-key-for-tests';
  const month = () => new Date().toISOString().slice(0, 7);
  const fns = {
    create_group({ p_name, p_nick, p_token, p_owner_key }) {
      if (p_owner_key !== OWNER_KEY) fail('not_owner');
      if (byToken.has(p_token)) fail('already_member');
      const nick = String(p_nick ?? '').trim(); if (!nick) fail('bad_nick');
      const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
      const g = { code, name: String(p_name).trim(), members: [], messages: [] }; groups.set(code, g);
      const m = { id: `m${++memberSeq}`, nickname: nick, stats: {}, active: true, leader: true, owner: true }; g.members.push(m); byToken.set(p_token, { group: g, member: m });
      add(g, m, 'system', 'created');
      return { code, name: g.name, member_id: m.id };
    },
    join_group({ p_code, p_nick, p_token }) {
      if (byToken.has(p_token)) fail('already_member');
      const g = groups.get(String(p_code).trim().toUpperCase()) ?? fail('no_group');
      const nick = String(p_nick ?? '').trim(); if (!nick) fail('bad_nick');
      if (g.members.filter((x) => x.active).length >= 8) fail('group_full');
      if (g.members.some((x) => x.nickname.toLowerCase() === nick.toLowerCase())) fail('nick_taken');
      const m = { id: `m${++memberSeq}`, nickname: nick, stats: {}, active: true }; g.members.push(m); byToken.set(p_token, { group: g, member: m });
      add(g, m, 'system', 'joined');
      return { code: g.code, name: g.name, member_id: m.id };
    },
    my_group({ p_token }) {
      const { group: g, member: m } = me(p_token);
      return { group: { name: g.name, code: g.code }, me: { id: m.id, nickname: m.nickname, leader: !!m.leader, suspended_until: m.suspendedUntil && m.suspendedUntil > Date.now() ? new Date(m.suspendedUntil).toISOString() : null, adjust: m.adjust ?? 0, returns_used: (m.returns ?? []).filter((x) => x === month()).length, owner_key: m.owner ? OWNER_KEY : null }, members: g.members.filter((x) => x.active).map((x) => ({ id: x.id, nickname: x.nickname, stats: x.stats, plan: x.plan ?? null, leader: !!x.leader, adjust: x.adjust ?? 0, suspended_until: x.suspendedUntil && x.suspendedUntil > Date.now() ? new Date(x.suspendedUntil).toISOString() : null, stats_updated_at: x.stats && Object.keys(x.stats).length ? new Date().toISOString() : null })) };
    },
    update_stats({ p_token, p_stats }) {
      const m = me(p_token).member; const { recent, ...rest } = p_stats ?? {};
      m.stats = rest; if (Array.isArray(recent)) m.recent = recent.slice(0, 8);
      m.history ??= []; const day = new Date().toISOString().slice(0, 10); m.history = m.history.filter((r) => r.day !== day);
      m.history.push({ day, rating: rest.rating ?? null, week: rest.weekVolume ?? null, month: rest.monthWorkouts ?? null, workouts: rest.workouts ?? null, streak: rest.streak ?? null, level: rest.level ?? null });
      return null;
    },
    record_return({ p_token }) { const m = me(p_token).member; m.returns ??= []; if (m.returns.filter((x) => x === month()).length >= 2) fail('return_limit'); m.returns.push(month()); return m.returns.length; },
    get_member_review({ p_token, p_member_id }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      const t = g.members.find((y) => y.id === p_member_id && y.active) ?? fail('bad_target');
      return { nickname: t.nickname, recent: t.recent ?? [], updated: null, history: t.history ?? [] };
    },
    update_plan({ p_token, p_plan }) {
      const m = me(p_token).member;
      if (!p_plan) { m.plan = null; m.planX = null; return null; }
      const days = {}, x = {};
      for (const [d, items] of Object.entries(p_plan.days ?? {})) days[d] = (Array.isArray(items) ? items : [items]).map((it, i) => { if (it.x) x[`${d}-${i}`] = it.x; return { k: it.k, n: it.n ?? '' }; });
      m.plan = { days, trained: p_plan.trained ?? [] }; m.planX = x; return null;
    },
    get_plan_detail({ p_token, p_member_id }) {
      const { group: g } = me(p_token); const t = g.members.find((y) => y.id === p_member_id && y.active);
      return t?.plan ? (t.planX ?? {}) : {};
    },
    // Habit Coach link (supabase/migrations/008_link.sql): one summary per token, soft delete on revoke.
    link_put({ p_token, p_snapshot }) {
      if (!p_token || p_token.length < 32) fail('bad_token');
      if (!p_snapshot || typeof p_snapshot !== 'object' || Array.isArray(p_snapshot)) fail('bad_snapshot');
      if (JSON.stringify(p_snapshot).length > 24576) fail('too_large');
      links.set(p_token, { snapshot: p_snapshot, updated_at: new Date().toISOString(), active: true }); return null;
    },
    link_get({ p_token }) { if (!p_token || p_token.length < 32) fail('bad_token'); const l = links.get(p_token); return l?.active ? { snapshot: l.snapshot, updated_at: l.updated_at } : null; },
    link_revoke({ p_token }) { if (!p_token || p_token.length < 32) fail('bad_token'); const l = links.get(p_token); if (l) { l.active = false; l.snapshot = {}; } return null; },
    post_message({ p_token, p_kind, p_body }) {
      const { group: g, member: m } = me(p_token);
      if (!['chat', 'status'].includes(p_kind)) fail('bad_kind');
      const body = String(p_body ?? '').trim().slice(0, 280); if (!body) fail('empty');
      if (m.suspendedUntil && m.suspendedUntil > Date.now()) fail('suspended');
      return add(g, m, p_kind, body);
    },
    get_messages({ p_token, p_after = 0, p_limit = 60 }) {
      const { group: g } = me(p_token);
      return g.messages.filter((x) => x.id > p_after).slice(-Math.min(p_limit, 100));
    },
    leave_group({ p_token }) {
      const x = me(p_token); if (x.member.suspendedUntil && x.member.suspendedUntil > Date.now()) fail('suspended'); x.member.active = false; byToken.delete(p_token);
      if (x.member.leader) { x.member.leader = false; const nxt = x.group.members.find((y) => y.active); if (nxt) { nxt.leader = true; add(x.group, nxt, 'system', 'leader'); } }
      return null;
    },
    kick_member({ p_token, p_member_id, p_announce = true }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      const t = g.members.find((y) => y.id === p_member_id && y.active); if (!t || t.id === m.id) fail('bad_target');
      t.active = false; t.leader = false; for (const [tok, v] of byToken) if (v.member === t) byToken.delete(tok);
      if (p_announce) g.messages.push({ id: ++msgId, member_id: m.id, nickname: t.nickname, kind: 'system', body: 'removed', created_at: new Date().toISOString() });
      return null;
    },
    make_leader({ p_token, p_member_id, p_announce = true }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      const t = g.members.find((y) => y.id === p_member_id && y.active); if (!t || t.id === m.id) fail('bad_target');
      m.leader = false; t.leader = true; if (p_announce) add(g, t, 'system', 'leader'); return null;
    },
    suspend_member({ p_token, p_member_id, p_hours, p_announce = true }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      const t = g.members.find((y) => y.id === p_member_id && y.active); if (!t || t.id === m.id) fail('bad_target');
      t.suspendedUntil = p_hours > 0 ? Date.now() + p_hours * 3600000 : null;
      if (p_announce) g.messages.push({ id: ++msgId, member_id: m.id, nickname: t.nickname, kind: 'system', body: p_hours > 0 ? `suspended:${p_hours}` : 'unsuspended', created_at: new Date().toISOString() }); return null;
    },
    set_adjust({ p_token, p_member_id, p_value, p_announce = true }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      const t = g.members.find((y) => y.id === p_member_id && y.active); if (!t || t.id === m.id || p_value > 100000 || p_value < -100000) fail('bad_target');
      t.adjust = p_value; if (p_announce) g.messages.push({ id: ++msgId, member_id: m.id, nickname: t.nickname, kind: 'system', body: `adjust:${p_value}`, created_at: new Date().toISOString() }); return null;
    },
    give_drachmas({ p_token, p_member_id, p_amount, p_announce = true }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      const t = g.members.find((y) => y.id === p_member_id && y.active); if (!t || t.id === m.id || !(p_amount >= 1 && p_amount <= 10000000)) fail('bad_target');
      t.gifts = (t.gifts ?? 0) + p_amount; if (p_announce) g.messages.push({ id: ++msgId, member_id: m.id, nickname: t.nickname, kind: 'system', body: `gift:${p_amount}`, created_at: new Date().toISOString() }); return null;
    },
    claim_gifts({ p_token }) { const m = me(p_token).member; const n = m.gifts ?? 0; m.gifts = 0; return n; },
    rename_group({ p_token, p_name }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      const n = String(p_name ?? '').trim().slice(0, 40); if (!n) fail('bad_name'); g.name = n; return n;
    },
    new_code({ p_token }) {
      const { group: g, member: m } = me(p_token); if (!m.leader) fail('not_leader');
      groups.delete(g.code); g.code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'Z'); groups.set(g.code, g); return g.code;
    },
    save_push({ p_token }) { me(p_token); return null; },
    delete_push({ p_token }) { me(p_token); return null; },
  };
  const calls = [];
  async function handle(route) {
    const req = route.request();
    const name = new URL(req.url()).pathname.split('/').pop();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const args = JSON.parse(req.postData() || '{}');
    calls.push({ name, args });
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    try {
      const out = fns[name]?.(args);
      return route.fulfill({ status: 200, headers, body: JSON.stringify(out ?? null) });
    } catch (e) {
      return route.fulfill({ status: 400, headers, body: JSON.stringify({ code: 'P0001', message: e.message }) });
    }
  }
  return { handle, calls, groups, links, OWNER_KEY, install: (ctx) => ctx.route(/supabase\.co\/rest\/v1\/rpc\//, handle) };
}
