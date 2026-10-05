// Builds src/data/exercises.json (+ calibration.json on first run, docs lists) from free-exercise-db (public domain) and our curation.
// node scripts/build-exercises.mjs <path to free-exercise-db clone> [--init-calibration]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import chest from './curation/chest.mjs';
import back from './curation/back.mjs';
import shoulders from './curation/shoulders.mjs';
import arms from './curation/arms.mjs';
import legs from './curation/legs.mjs';
import core from './curation/core.mjs';
import { FAMILIES } from './curation/families.mjs';
import { FAMILY_GROUP } from './family-groups.mjs';
import { FAMILY_NAMES } from './curation/family-names.mjs';

const dbPath = process.argv[2];
if (!dbPath) throw new Error('usage: node scripts/build-exercises.mjs <free-exercise-db path> [--init-calibration]');
const root = new URL('../', import.meta.url);
const dataset = new Map(JSON.parse(readFileSync(`${dbPath}/dist/exercises.json`, 'utf8')).map((e) => [e.id, e]));
const muscles = JSON.parse(readFileSync(new URL('src/data/muscles.json', root), 'utf8'));
const polygonIds = new Set([...muscles.anterior, ...muscles.posterior].map((m) => m.id));

const slug = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const EQUIP = { barbell: 'barbell', dumbbell: 'dumbbell', machine: 'machine', cable: 'cable', 'e-z curl bar': 'ez-bar', 'body only': 'bodyweight', other: 'other' };
const PRIM = { abdominals: ['abs'], abductors: ['abductors'], adductors: ['adductor'], biceps: ['biceps'], calves: ['calves'], chest: ['chest'], forearms: ['forearm'], glutes: ['gluteal'], hamstrings: ['hamstring'], lats: ['upper-back'], 'middle back': ['upper-back'], 'lower back': ['lower-back'], traps: ['trapezius'], quadriceps: ['quadriceps'], triceps: ['triceps'], neck: ['neck'], shoulders: ['front-deltoids', 'back-deltoids'] };
const DS_GROUP = { abdominals: 'abs', biceps: 'biceps', calves: 'calves', chest: 'chest', glutes: 'glutes', hamstrings: 'hamstrings', lats: 'back', 'middle back': 'back', 'lower back': 'back', traps: 'back', quadriceps: 'quads', shoulders: 'shoulders', triceps: 'triceps' };

function mapMuscles(ds, group, override) {
  if (override) return { primary: override.p, secondary: override.s ?? [] };
  const primary = [...new Set(ds.primaryMuscles.flatMap((m) => PRIM[m] ?? []))];
  const secondary = [];
  for (const m of ds.secondaryMuscles) {
    if (m === 'shoulders') {
      if (group === 'chest' || group === 'triceps') secondary.push('front-deltoids');
      else if (group === 'back') secondary.push('back-deltoids');
      else secondary.push('front-deltoids', 'back-deltoids');
    } else secondary.push(...(PRIM[m] ?? []));
  }
  return { primary, secondary: [...new Set(secondary)].filter((m) => !primary.includes(m)) };
}

// free-exercise-db has no English steps for these; ours.
const EN_FALLBACK = {
  Push_Press: ['Stand with a barbell resting on your front shoulders.', 'Dip slightly at the knees, then drive up explosively and press the bar overhead.', 'Lock out the arms, then lower the bar back to your shoulders with control.'],
  Side_Bridge: ['Lie on your side, propped up on one forearm with your legs stacked.', 'Lift your hips until your body forms a straight line from head to feet.', 'Hold for the target time, then switch sides.'],
};
const entries = [...chest, ...back, ...shoulders, ...arms, ...legs, ...core];
const seen = new Set();
const calPath = new URL('src/data/calibration.json', root);
const initCal = process.argv.includes('--init-calibration') || !existsSync(calPath);
const calibration = initCal ? { families: FAMILIES, ratios: {} } : JSON.parse(readFileSync(calPath, 'utf8'));
if (initCal) for (const [id, fam, ratio] of entries) if (fam) calibration.ratios[slug(id)] = ratio;

const out = [];
for (const [dsId, family, , nameHe, steps, opts = {}] of entries) {
  const ds = dataset.get(dsId);
  if (!ds) throw new Error(`dataset id not found: ${dsId}`);
  const id = slug(dsId);
  if (seen.has(id)) throw new Error(`duplicate: ${id}`);
  seen.add(id);
  const fam = family ? calibration.families[family] : null;
  if (family && !fam) throw new Error(`unknown family ${family} for ${id}`);
  const group = opts.g ?? (family && FAMILY_GROUP[family]) ?? DS_GROUP[ds.primaryMuscles[0]] ?? 'other';
  const ranked = opts.ranked === false ? false : !!fam;
  const ratio = calibration.ratios[id];
  if (ranked && !(ratio > 0)) throw new Error(`missing ratio for ${id}`);
  const m = mapMuscles(ds, group, opts.ms);
  for (const pid of [...m.primary, ...m.secondary]) if (!polygonIds.has(pid)) throw new Error(`${id}: unknown muscle polygon ${pid}`);
  const ex = {
    id, nameEn: ds.name, nameHe, equipment: EQUIP[ds.equipment] ?? 'other',
    primaryMuscles: m.primary, secondaryMuscles: m.secondary, muscleGroup: group, ranked,
    type: opts.type ?? 'weight',
  };
  if (ranked) {
    ex.family = family; ex.R = Math.round(fam.R * ratio * 10) / 10;
    if (fam.bwFactor) ex.bwFactor = fam.bwFactor;
    if (fam.perHand) ex.perHand = true;
  }
  ex.instructionsEn = ds.instructions.length ? ds.instructions : EN_FALLBACK[dsId] ?? [];
  ex.instructionsHe = steps.split('|').map((s) => s.trim()).filter(Boolean);
  ex.image = `assets/exercises/${id}/0.webp`;
  ex.image2 = `assets/exercises/${id}/1.webp`;
  ex.sourceId = dsId;
  out.push(ex);
}

for (const [fid, f] of Object.entries(calibration.families)) { const n = FAMILY_NAMES[fid]; if (!n) throw new Error(`no display name for family ${fid}`); f.nameEn = n[0]; f.nameHe = n[1]; }
writeFileSync(calPath, JSON.stringify(calibration, null, 1) + '\n');
writeFileSync(new URL('src/data/exercises.json', root), JSON.stringify({ schemaVersion: 1, exercises: out }));

// docs/exercise-list.md for review
const names = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', abs: 'Abs', other: 'Cardio / other' };
let md = `# Exercise list (${out.length})\n\nGenerated by scripts/build-exercises.mjs. R = 1RM (kg) of an 80 kg male at rating 900 (OUR CALIBRATION, approximate).\n`;
for (const g of Object.keys(names)) {
  const l = out.filter((e) => e.muscleGroup === g);
  md += `\n## ${names[g]} (${l.length})\n\n| id | English | עברית | equipment | ranked | R |\n|---|---|---|---|---|---|\n`;
  for (const e of l) md += `| ${e.id} | ${e.nameEn} | ${e.nameHe} | ${e.equipment} | ${e.ranked ? 'yes' : e.type} | ${e.R ?? ''}${e.perHand ? ' /hand' : ''} |\n`;
}
writeFileSync(new URL('docs/exercise-list.md', root), md);

const REVIEW = [
  [/hack/, 'האק סקוואט: תעתיק מאנגלית. אולי יש ניסוח יותר טבעי?'], [/face-pull/, 'פייס פול: תעתיק, כך אומרים בחדר כושר.'],
  [/push-press/, 'פוש פרס: תעתיק.'], [/jm-press/, 'JM פרס: תעתיק.'], [/skullcrusher/, 'סקאל קראשר: תעתיק.'],
  [/arnold/, 'לחיצת ארנולד: שם התרגיל.'], [/drag-curl|zottman|spider-curl/, 'שם תרגיל שאין לו מונח עברי מקובל.'],
  [/pallof/, 'פאלוף פרס: תעתיק.'], [/glute-ham/, 'גלוט האם רייז: תעתיק.'], [/cable-crossover|low-cable-crossover/, 'קרוסאובר: תעתיק.'],
  [/rack-pulls|power-clean|hang-clean/, 'שם תרגיל אולימפי או כוח: תעתיק.'], [/box-squat|sissy|jefferson|zercher/, 'שם תרגיל שנשאר בתעתיק.'],
  [/step-mill|stairmaster|air-bike/, 'שם מכשיר קרדיו: תעתיק או שם עברי?'], [/wood-chop/, 'חיטוב עץ בכבל: אולי "ווד צ׳ופ"?'],
  [/donkey/, 'דונקי: תעתיק.'], [/battling-ropes/, 'חבלי קרב: אולי "חבלים" או "בטל רופס"?'], [/reverse-flyes|reverse-machine-flyes|butterfly/, 'פרפר / פליי: איזה שם מקובל יותר?'],
  [/(^|-)t-bar-/, 'חתירת T-bar: תעתיק.'], [/pull-through/, 'משיכה בין הרגליים בכבל: ניסוח מתאר.'],
];
let rv = `# Hebrew review\n\nNames and instructions that may not read naturally. Please fix in scripts/curation/*.mjs (or tell me) and rerun \`node scripts/build-exercises.mjs\`.\n\n| id | עברית | note |\n|---|---|---|\n`;
for (const e of out) { const r = REVIEW.find(([re]) => re.test(e.id)); if (r) rv += `| ${e.id} | ${e.nameHe} | ${r[1]} |\n`; }
writeFileSync(new URL('docs/hebrew-review.md', root), rv);

const counts = {}; out.forEach((e) => { counts[e.muscleGroup] = (counts[e.muscleGroup] ?? 0) + 1; });
console.log(out.length, counts, 'ranked:', out.filter((e) => e.ranked).length);
