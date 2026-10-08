// An in-memory stand-in for the crew database (same rules as the SQL functions) so UI tests do not need the network.
export function createFakeCrew() {
  const groups = new Map(); // code -> { name, members: [] , messages: [] }
  const byToken = new Map(); // token -> { group, member }
  let msgId = 0;
  const fail = (message) => { const e = new Error(message); e.fake = true; throw e; };
  const add = (g, m, kind, body) => { g.messages.push({ id: ++msgId, member_id: m.id, nickname: m.nickname, kind, body, created_at: new Date().toISOString() }); return msgId; };
  const me = (t) => (t && t.length >= 32 ? byToken.get(t) ?? fail('not_member') : fail('bad_token'));
  let memberSeq = 0;
  const fns = {
    create_group({ p_name, p_nick, p_token }) {
      if (byToken.has(p_token)) fail('already_member');
      const nick = String(p_nick ?? '').trim(); if (!nick) fail('bad_nick');
      const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
      const g = { code, name: String(p_name).trim(), members: [], messages: [] }; groups.set(code, g);
      const m = { id: `m${++memberSeq}`, nickname: nick, stats: {}, active: true }; g.members.push(m); byToken.set(p_token, { group: g, member: m });
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
      return { group: { name: g.name, code: g.code }, me: { id: m.id, nickname: m.nickname }, members: g.members.filter((x) => x.active).map((x) => ({ id: x.id, nickname: x.nickname, stats: x.stats, plan: x.plan ?? null, stats_updated_at: x.stats && Object.keys(x.stats).length ? new Date().toISOString() : null })) };
    },
    update_stats({ p_token, p_stats }) { me(p_token).member.stats = { ...p_stats }; return null; },
    update_plan({ p_token, p_plan }) { me(p_token).member.plan = p_plan ?? null; return null; },
    post_message({ p_token, p_kind, p_body }) {
      const { group: g, member: m } = me(p_token);
      if (!['chat', 'status'].includes(p_kind)) fail('bad_kind');
      const body = String(p_body ?? '').trim().slice(0, 280); if (!body) fail('empty');
      return add(g, m, p_kind, body);
    },
    get_messages({ p_token, p_after = 0, p_limit = 60 }) {
      const { group: g } = me(p_token);
      return g.messages.filter((x) => x.id > p_after).slice(-Math.min(p_limit, 100));
    },
    leave_group({ p_token }) { const x = me(p_token); x.member.active = false; byToken.delete(p_token); return null; },
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
  return { handle, calls, groups, install: (ctx) => ctx.route(/supabase\.co\/rest\/v1\/rpc\//, handle) };
}
