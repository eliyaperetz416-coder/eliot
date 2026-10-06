// Turns docs/ASSUMPTIONS.md and docs/ASSUMPTIONS.he.md into src/data/numbers.json (the in-app "About the numbers" page).
// Run: npm run numbers   (tests fail when numbers.json is out of date)
import { readFileSync, writeFileSync } from 'node:fs';

/** Markdown subset -> sections: [{ title, blocks: [{ type: 'p'|'ul', text|items }] }]. Inline **bold**, *italic*, `code` stay as markers. */
export function parseMd(md) {
  const sections = [];
  let cur = null, ul = null, para = [];
  const flush = () => { if (para.length) { cur?.blocks.push({ type: 'p', text: para.join(' ') }); para = []; } ul = null; };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (/^# /.test(line)) { flush(); continue; }
    if (/^## /.test(line)) { flush(); cur = { title: line.slice(3), blocks: [] }; sections.push(cur); continue; }
    if (!line.trim()) { flush(); continue; }
    const li = line.match(/^- (.*)$/);
    if (li) { if (para.length) { cur?.blocks.push({ type: 'p', text: para.join(' ') }); para = []; } if (!ul) { ul = { type: 'ul', items: [] }; cur?.blocks.push(ul); } ul.items.push(li[1]); continue; }
    if (/^\s+\S/.test(line) && ul) { ul.items[ul.items.length - 1] += ` ${line.trim()}`; continue; }
    ul = null; para.push(line.trim());
  }
  flush();
  return sections;
}

export function buildNumbers(root = new URL('..', import.meta.url)) {
  const read = (n) => readFileSync(new URL(`docs/${n}`, root), 'utf8');
  return { en: parseMd(read('ASSUMPTIONS.md')), he: parseMd(read('ASSUMPTIONS.he.md')) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = buildNumbers();
  writeFileSync(new URL('../src/data/numbers.json', import.meta.url), JSON.stringify(out) + '\n');
  console.log(`numbers.json: ${out.en.length} sections (en), ${out.he.length} (he)`);
}
