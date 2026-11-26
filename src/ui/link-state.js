// Habit Coach is no longer connected (Elia, 24.11). A phone that was linked closes the link once: the server empties the
// summary (link_revoke, supabase/migrations/008_link.sql) and the phone forgets the token. Offline, it tries again at the
// next start. The server side stays as it is: Habit Coach is a separate app.
import { dbGet, dbPut } from './db.js';
import { rpc } from './crew-api.js';

export async function retireLink() {
  const old = await dbGet('kv', 'link').catch(() => null);
  if (!old?.token) return;
  try { await rpc('link_revoke', { p_token: old.token }); } catch { return; } // offline: next start
  await dbPut('kv', null, 'link').catch(() => {});
}
