// Converts the chosen exercise images to WebP (<= 480 px wide). node scripts/process-images.mjs <free-exercise-db path>
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import sharp from 'sharp';

const db = process.argv[2];
if (!db) throw new Error('usage: node scripts/process-images.mjs <free-exercise-db path>');
const root = new URL('../', import.meta.url);
const { exercises } = JSON.parse(readFileSync(new URL('src/data/exercises.json', root), 'utf8'));
let total = 0, n = 0, missing = [];
for (const ex of exercises) {
  const dir = new URL(`assets/exercises/${ex.id}/`, root);
  mkdirSync(dir, { recursive: true });
  for (const i of [0, 1]) {
    const src = `${db}/exercises/${ex.sourceId}/${i}.jpg`;
    if (!existsSync(src)) { if (i === 0) missing.push(ex.id); continue; }
    const out = new URL(`${i}.webp`, dir);
    await sharp(src).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72, effort: 5 }).toFile(out.pathname);
    total += statSync(out.pathname).size; n++;
  }
}
console.log(`${n} images, ${(total / 1e6).toFixed(1)} MB, avg ${(total / n / 1000).toFixed(1)} KB`, missing.length ? `MISSING first frame: ${missing}` : '');
