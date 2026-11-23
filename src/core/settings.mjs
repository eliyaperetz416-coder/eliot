// Settings schema + migrations. Pure; storage lives in src/ui/storage.js.
export const SETTINGS_VERSION = 3;
export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_VERSION,
  lang: null,            // null = detect from the device on first run
  theme: 'dark',         // 'dark' | 'marble' (OUR DESIGN, v3: replaces the accent-by-rank choice)
  reducedMotion: false,
  dumbbellTotal: false,    // OUR DESIGN: type the total of both dumbbells (stored per hand); off = type one dumbbell
  sharePlan: false,        // OUR DESIGN: show your weekly plan to your crew (off until you switch it on)
  weeklyGoal: 3,           // OUR DESIGN: training days per week you aim for; each week you reach it adds rank points
  autoRoutineWeight: true, // raise the planned weight of a saved workout when you lift more
  restSound: true,         // OUR DESIGN (accounts): end-of-rest sound
  restVibrate: true,       // end-of-rest vibration (Android)
  restPush: true,          // end-of-rest notification when the phone is locked
  lastExportAt: null,
  reminderSnoozedUntil: null, // export reminder hidden until this time
});

const migrations = {
  // 0 -> 1: pre-versioned objects get defaults filled in.
  0: (s) => ({ ...DEFAULT_SETTINGS, ...s, schemaVersion: 1 }),
  // 1 -> 2: one steady accent colour (OUR DESIGN); rank colours stay available in Settings.
  1: (s) => ({ ...s, accentMode: 'fixed', schemaVersion: 2 }),
  // 2 -> 3: the redesign. Colour themes (dark / marble) replace the accent-by-rank choice.
  2: (s) => { const { accentMode, ...rest } = s; return { ...rest, theme: 'dark', schemaVersion: 3 }; },
};

export function migrateSettings(raw) {
  let s = raw && typeof raw === 'object' ? { ...raw } : {};
  let v = Number.isInteger(s.schemaVersion) ? s.schemaVersion : 0;
  while (v < SETTINGS_VERSION) {
    s = migrations[v](s);
    v = s.schemaVersion;
  }
  return { ...DEFAULT_SETTINGS, ...s };
}
