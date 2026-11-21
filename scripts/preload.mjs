// Lists every module that src/main.js loads at start-up (static imports only, followed recursively) and writes them as
// <link rel="modulepreload"> tags into index.html. Without them the browser finds each file only after the one importing it
// arrived: ~100 small files in a chain, about 9 s to the first screen on a slow phone network (first visit only; the
// service worker serves later visits). The JSON data that start-up fetches is preloaded too, so it downloads together with
// the code instead of after it. Called by `npm run stamp`, so the lists never go stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, normalize } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+\.m?js)['"]/g;

export function moduleGraph(entry = 'src/main.js') {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(IMPORT)) visit(normalize(relative(root, join(root, dirname(file), m[1]))));
  };
  visit(entry);
  seen.delete(entry);
  return [...seen].sort();
}

/** The JSON files fetched at start-up: get('...json') in src/ui/data.js and the dictionaries fetched in src/main.js. */
export function startupData() {
  const data = readFileSync(join(root, 'src/ui/data.js'), 'utf8');
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  const files = [...data.matchAll(/get\('(src\/data\/[^']+\.json)'\)/g)].map((m) => m[1]);
  const i18n = readFileSync(join(root, 'src/core/i18n.mjs'), 'utf8');
  const langs = i18n.match(/export const LANGS = \[([^\]]+)\]/)?.[1].match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  if (main.includes('src/data/i18n/${l}.json')) files.push(...langs.map((l) => `src/data/i18n/${l}.json`));
  return [...new Set(files)].sort();
}

export function preloadBlock(files = moduleGraph(), json = startupData()) {
  const lines = [...json.map((f) => `  <link rel="preload" href="${f}" as="fetch" crossorigin>`), ...files.map((f) => `  <link rel="modulepreload" href="${f}">`)];
  return `<!--PRELOAD_START-->\n${lines.join('\n')}\n  <!--PRELOAD_END-->`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = join(root, 'index.html');
  const html = readFileSync(p, 'utf8');
  if (!html.includes('<!--PRELOAD_START-->')) throw new Error('index.html has no <!--PRELOAD_START--> marker');
  const files = moduleGraph(), json = startupData();
  writeFileSync(p, html.replace(/<!--PRELOAD_START-->[\s\S]*?<!--PRELOAD_END-->/, preloadBlock(files, json)));
  console.log(`index.html: ${files.length} modulepreload + ${json.length} data preload links`);
}
