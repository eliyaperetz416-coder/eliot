// Account sync decisions (OUR DESIGN, spec section 4.3): one snapshot per user, the last change wins.
// meta = { dirtyAt, syncedRemoteAt } is kept on the phone: when this phone last changed something, and which server version it has.

export const MAX_SYNC_BYTES = 8_000_000;
export const SYNC_DEBOUNCE_MS = 3000;

const hasAnything = (d) => !!d?.profile || (d?.workouts?.length ?? 0) > 0;

/** Returns { action: 'none' | 'push' | 'pull' | 'merge' }. */
export function decideSync({ local, remote, meta }) {
  const { dirtyAt = null, syncedRemoteAt = null } = meta ?? {};
  if (remote == null) return { action: hasAnything(local) ? 'push' : 'none' };
  if (syncedRemoteAt == null) return { action: (local?.workouts?.length ?? 0) > 0 ? 'merge' : 'pull' };
  if (remote.updatedAt > syncedRemoteAt) {
    if (dirtyAt == null) return { action: 'pull' };
    return { action: dirtyAt > remote.updatedAt ? 'push' : 'pull' };
  }
  return { action: dirtyAt != null ? 'push' : 'none' };
}

export const tooBig = (json) => new TextEncoder().encode(json).length > MAX_SYNC_BYTES;
