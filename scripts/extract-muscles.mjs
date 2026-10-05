// One-off extraction of MIT-licensed polygon data from react-body-highlighter (GV79) into src/data/muscles.json.
// Usage: node scripts/extract-muscles.mjs <path to node_modules/react-body-highlighter>
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = process.argv[2];
if (!pkg) throw new Error('pass the package folder');
const meta = readFileSync(`${pkg}/src/component/metadata.ts`, 'utf8');
const ids = Object.fromEntries([...meta.matchAll(/^\s+([A-Z_]+): '([a-z-]+)',$/gm)].map((m) => [m[1], m[2]]));
const src = readFileSync(`${pkg}/src/assets/index.ts`, 'utf8');
function parse(name) {
  const body = src.split(`export const ${name}`)[1].split(/export const |$/)[0];
  const out = [];
  for (const m of body.matchAll(/muscle: MuscleType\.([A-Z_]+),\s*svgPoints: \[([\s\S]*?)\],\s*\}/g)) {
    out.push({ id: ids[m[1]], polygons: [...m[2].matchAll(/'([^']+)'/g)].map((p) => p[1].trim().replace(/\s+/g, ' ')) });
  }
  return out;
}
const data = { viewBox: '0 0 100 200', source: 'react-body-highlighter (MIT, GV79)', anterior: parse('anteriorData'), posterior: parse('posteriorData') };
writeFileSync(new URL('../src/data/muscles.json', import.meta.url), JSON.stringify(data));
console.log(data.anterior.map((m) => `${m.id}:${m.polygons.length}`).join(' '), '\n', data.posterior.map((m) => `${m.id}:${m.polygons.length}`).join(' '));
