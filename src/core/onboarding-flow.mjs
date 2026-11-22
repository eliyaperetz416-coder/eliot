// The first-run flow, one question per screen (OUR DESIGN, spec 4.5 + the 22.11 updates). Pure: the UI keeps the state.
// migrated = the account's data is already on this phone (moved up from here, or pulled down from the account).

/** 'ios-safari' (iPhone/iPad browser) | 'ios-app' (added to the home screen) | 'android' | 'other' */
export function platformOf({ ua = '', standalone = false }) {
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios) return standalone ? 'ios-app' : 'ios-safari';
  return /Android/i.test(ua) ? 'android' : 'other';
}

export const profileComplete = (p = {}) => !!p.name && !!p.sex && p.weight > 0;

export function nextStep(s) {
  const p = s.profile ?? {};
  if (s.platform === 'ios-safari' && !s.installed && !s.installSkipped) return 'install-first';
  if (!s.signedIn) return 'signin';
  if (s.localData && !s.migrated) return 'migrate';
  if (s.migrated && profileComplete(p)) return 'done';
  if (!p.name) return 'name';
  if (!p.sex) return 'curve';
  if (!(p.weight > 0)) return 'weight';
  if (p.age == null && !s.ageSkipped) return 'age';
  if (!s.goalSet) return 'goal';
  if (s.platform !== 'ios-app' && !s.installed && !s.installSkipped) return 'install';
  if (!s.pushAsked) return 'notify';
  if (!s.toured) return 'tour';
  return 'done';
}
