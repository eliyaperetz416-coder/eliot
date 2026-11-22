// A stand-in for Supabase Auth + the account tables, so UI tests never reach the network.
// installFakeSupabase(ctx, { remote, failUploads }) -> { uploads, alarms, pushes, deletes }
export async function installFakeSupabase(ctx, { remote = null, failUploads = false } = {}) {
  const state = { remote, uploads: [], alarms: [], pushes: [], deletes: 0 };
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
    if (req.method() === 'GET') return json(route, state.remote ? [{ data: state.remote.data, updated_at: new Date(state.remote.updatedAt).toISOString() }] : []);
    if (failUploads) return json(route, { message: 'down' }, 503);
    const row = JSON.parse(req.postData() ?? '{}');
    state.uploads.push(row);
    state.remote = { data: row.data, updatedAt: Date.parse(row.updated_at) };
    return json(route, [row], 201);
  });
  await ctx.route(/supabase\.co\/rest\/v1\/rest_alarms/, (route) => {
    const req = route.request();
    state.alarms.push({ method: req.method(), body: req.postData() ? JSON.parse(req.postData()) : null });
    return json(route, [], req.method() === 'DELETE' ? 204 : 201);
  });
  await ctx.route(/supabase\.co\/rest\/v1\/user_push/, (route) => { state.pushes.push(JSON.parse(route.request().postData() ?? 'null')); return json(route, [], 201); });
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/delete_my_account/, (route) => { state.deletes++; return route.fulfill({ status: 204 }); });
  return state;
}
