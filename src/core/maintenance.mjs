// The update lock ("מתעדכנים."), OUR DESIGN, spec section 3 + Elia 22.11 (runs on launch day for about two hours).
// While LOCKED, every phone shows only the lock screen: no button, no code, no address trick. Only the next release
// (LOCKED = false) removes it, and the lock screen takes that release in by itself.
// Tests serve the app with LOCKED = false (tests/serve.mjs); users always get this file as it is.
export const LOCKED = false; // launch day: true in v1.49.0 (the lock), false again from v1.49.1 (the unlock)
/** The time shown on the lock screen ("back tomorrow morning around 09:45"), Israel time. */
export const BACK_AT = '09:45';

/** "HH:MM" -> the same text; anything else -> '' (no time is better than a wrong one). */
export const backAtLabel = (hhmm) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hhmm ?? '')) ? hhmm : '');

/** Lets a downloaded release take over now. -> true when one was waiting. */
export function activateWaiting(reg) {
  if (!reg?.waiting) return false;
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}
