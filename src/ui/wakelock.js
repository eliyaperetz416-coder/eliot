// Keeps the screen awake during a workout (Wake Lock API; may be unsupported, e.g. older iOS standalone).
let lock = null, wanted = false;
export const wakeLockSupported = () => 'wakeLock' in navigator;
async function request() {
  if (!wanted || !wakeLockSupported() || document.visibilityState !== 'visible' || lock) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { lock = null; }
}
export function keepAwake(on) {
  wanted = on;
  if (on) request(); else { lock?.release?.().catch(() => {}); lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') request(); });
