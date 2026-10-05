// node scripts/shot-routes.mjs <baseUrl> <outDir> <lang> route1 route2 ...  (390x844 @2x, full page)
import { chromium } from 'playwright';
const [, , base, out, lang, ...routes] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'he' ? 'he-IL' : 'en-US' });
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(base); await p.waitForSelector('html[data-ready="1"]');
for (const r of routes) {
  await p.goto(`${base}#/${r}`); await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/${lang}-${r.replace(/\//g, '_')}.png`, fullPage: r.includes('preview') });
}
await b.close();
