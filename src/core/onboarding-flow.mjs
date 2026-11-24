// The first-run flow, a few questions per screen (OUR DESIGN, spec 4.5 + the 22.11 updates). Pure: the UI keeps the state.
// migrated = the account's data is already on this phone (moved up from here, or pulled down from the account).

/** 'ios-safari' (iPhone/iPad browser) | 'ios-app' (added to the home screen) | 'android' | 'other' */
export function platformOf({ ua = '', standalone = false, touchPoints = 0 }) {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1); // iPadOS Safari presents itself as a Mac
  if (ios) return standalone ? 'ios-app' : 'ios-safari';
  return /Android/i.test(ua) ? 'android' : 'other';
}

export const profileComplete = (p = {}) => !!p.name && !!p.sex && p.weight > 0;

export function nextStep(s) {
  const p = s.profile ?? {};
  const offerInstall = s.platform === 'ios-safari' && !s.installed && !s.installSkipped;
  // An iPhone app on the home screen does not share storage with Safari: data already here moves to the account first.
  if (offerInstall && !s.localData) return 'install-first';
  if (!s.signedIn) return 'signin';
  if (s.localData && !s.migrated) return 'migrate';
  if (s.migrated && profileComplete(p)) return offerInstall ? 'install-first' : 'done';
  // "About you": name, curve, body weight and age (optional) on one screen (Elia, 23.11: fewer, fuller screens).
  if (!profileComplete(p) || (p.age == null && !s.ageSkipped)) return 'about';
  if (!s.goalSet) return 'goal';
  if (s.platform !== 'ios-app' && !s.installed && !s.installSkipped) return 'install';
  if (!s.pushAsked) return 'notify';
  if (!s.toured) return 'tour';
  return 'done';
}
