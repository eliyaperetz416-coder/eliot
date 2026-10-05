// Writes the precache list and a content hash into sw.js. Run before every commit: npm run stamp
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = [
  'index.html', 'offline.html', 'manifest.webmanifest',
  ...walk(join(root, 'src')).map((p) => relative(root, p)),
  ...walk(join(root, 'assets/fonts')).filter((p) => p.endsWith('.woff2')).map((p) => relative(root, p)),
  ...walk(join(root, 'assets/icons')).map((p) => relative(root, p)),
].sort();

const hash = createHash('sha256');
for (const f of files) { hash.update(f); hash.update(readFileSync(join(root, f))); }
const build = hash.digest('hex').slice(0, 10);

const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const block = `/*PRECACHE_START*/\nconst BUILD = '${build}';\nconst PRECACHE = ${JSON.stringify(files, null, 2)};\n/*PRECACHE_END*/`;
writeFileSync(swPath, sw.replace(/\/\*PRECACHE_START\*\/[\s\S]*?\/\*PRECACHE_END\*\//, block));
console.log(`sw.js stamped: build ${build}, ${files.length} files`);
