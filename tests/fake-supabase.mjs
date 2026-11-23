// A stand-in for Supabase Auth + the account tables, so UI tests never reach the network.
// It behaves like the real server where sync depends on it: a version counted by the server, "only if the version is
// still N" writes (409 on a second insert, 0 rows on a stale PATCH), and jsonb's key re-ordering on the way back.
// installFakeSupabase(ctx, { remote: { data, version? }, failUploads, failReads: <how many reads fail first> }) -> state { remote, uploads, alarms, pushes, deletes }
const jsonbOrder = (v) => {
  if (Array.isArray(v)) return v.map(jsonbOrder);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map((k) => [k, jsonbOrder(v[k])]));
  return v;
};

export async function installFakeSupabase(ctx, { remote = null, failUploads = false, failReads = 0 } = {}) {
  const state = { remote: remote ? { version: 1, ...remote } : null, uploads: [], alarms: [], pushes: [], deletes: 0, failReads };
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'tester@example.com', user_metadata: { full_name: 'Test User' } };
  const token = () => ({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600, user });
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await ctx.route(/supabase\.co\/auth\/v1\/authorize/, (route) => {
    const back = new URL(route.request().url()).searchParams.get('redirect_to');
    return route.fulfill({ status: 302, headers: { location: `${back}?code=fake-code` } });
  });
  await ctx.route(/supabase\.co\/auth\/v1\/token/, (route) => json(route, token()));
  await ctx.route(/supabase\.co\/auth\/v1\/logout/, (route) => route.fulfill({ status: 204 }));
  await ctx.route(/supabase\.co\/rest\/v1\/user_data/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const row = () => ({ data: jsonbOrder(state.remote.data), version: state.remote.version });
    if (req.method() === 'GET') {
      if (state.failReads > 0) { state.failReads--; return json(route, { message: 'down' }, 503); }
      if (!state.remote) return json(route, []);
      return json(route, [url.searchParams.get('select') === 'version' ? { version: state.remote.version } : row()]);
    }
    if (failUploads) return json(route, { message: 'down' }, 503);
    const body = JSON.parse(req.postData() ?? '{}');
    if (req.method() === 'POST') {
      if (state.remote) return json(route, { code: '23505', message: 'duplicate key' }, 409);
      state.remote = { data: body.data, version: 1 };
    } else { // PATCH ...&version=eq.N
      const want = Number((url.searchParams.get('version') ?? '').replace('eq.', ''));
      if (!state.remote || state.remote.version !== want) return json(route, []);
      state.remote = { data: body.data, version: state.remote.version + 1 };
    }
    state.uploads.push(body);
    return json(route, [{ ...body, version: state.remote.version }], req.method() === 'POST' ? 201 : 200);
  });
  await ctx.route(/supabase\.co\/rest\/v1\/rest_alarms/, (route) => {
    const req = route.request();
    state.alarms.push({ method: req.method(), body: req.postData() ? JSON.parse(req.postData()) : null });
    return json(route, [], req.method() === 'DELETE' ? 204 : 201);
  });
  await ctx.route(/supabase\.co\/rest\/v1\/user_push/, (route) => { state.pushes.push(JSON.parse(route.request().postData() ?? 'null')); return json(route, [], 201); });
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/delete_my_account/, (route) => { state.deletes++; state.remote = null; return route.fulfill({ status: 204 }); });
  return state;
}
