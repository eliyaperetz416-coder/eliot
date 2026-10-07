// Settings schema + migrations. Pure; storage lives in src/ui/storage.js.
export const SETTINGS_VERSION = 2;
export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_VERSION,
  lang: null,            // null = detect from the device on first run
  accentMode: 'fixed',   // 'rank' | 'fixed' (fixed purple is the default since v2)
  reducedMotion: false,
  autoRoutineWeight: true, // raise the planned weight of a saved workout when you lift more
  lastExportAt: null,
  reminderSnoozedUntil: null, // export reminder hidden until this time
});

const migrations = {
  // 0 -> 1: pre-versioned objects get defaults filled in.
  0: (s) => ({ ...DEFAULT_SETTINGS, ...s, schemaVersion: 1 }),
  // 1 -> 2: one steady accent colour (OUR DESIGN); rank colours stay available in Settings.
  1: (s) => ({ ...s, accentMode: 'fixed', schemaVersion: 2 }),
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
