// Settings schema + migrations. Pure; storage lives in src/ui/storage.js.
export const SETTINGS_VERSION = 1;
export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_VERSION,
  lang: null,            // null = detect from the device on first run
  accentMode: 'rank',    // 'rank' | 'fixed'
  reducedMotion: false,
  lastExportAt: null,
});

const migrations = {
  // 0 -> 1: pre-versioned objects get defaults filled in.
  0: (s) => ({ ...DEFAULT_SETTINGS, ...s, schemaVersion: 1 }),
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
