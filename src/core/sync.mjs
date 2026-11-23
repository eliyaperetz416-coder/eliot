// Account sync decisions (OUR DESIGN, spec section 4.3, hardened after the branch review).
// The server counts every write (user_data.version, migration 014). The phone remembers the version it last saw
// (syncedVersion) and the hash of the snapshot it last synced; "dirty" = today's snapshot hashes differently.
// When both sides changed, the two are merged (mergeData), so a stale copy never overwrites newer data.
import { checksum } from './backup.mjs';

export const MAX_SYNC_BYTES = 7_000_000; // the server allows 8 MB of jsonb text, which is wider than compact JSON
export const SYNC_DEBOUNCE_MS = 3000;

/** JSON with object keys sorted at every level, so the same data always gives the same text (jsonb re-sorts keys). */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export const snapshotHash = (data) => checksum(stableStringify(data));

const ARRAYS = ['workouts', 'routines', 'plans', 'custom', 'folders', 'bodyweight'];
export const hasLocalData = (d) => !!d?.profile || !!d?.game || ARRAYS.some((k) => (d?.[k]?.length ?? 0) > 0);

/** 'none' | 'push' | 'pull' | 'merge' */
export function decideSync({ remoteVersion, syncedVersion, localDirty, localHasData }) {
  if (remoteVersion == null) return localHasData ? 'push' : 'none';
  if (syncedVersion == null) return localHasData ? 'merge' : 'pull';
  if (remoteVersion !== syncedVersion) return localDirty ? 'merge' : 'pull';
  return localDirty ? 'push' : 'none';
}

export const tooBig = (json) => new TextEncoder().encode(json).length > MAX_SYNC_BYTES;
