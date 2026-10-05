// Tiny helper: node scripts/shot.mjs <file-or-url> <out.png> [w] [h]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [, , src, out, w = '900', h = '700'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
await page.goto(/^https?:/.test(src) ? src : pathToFileURL(resolve(src)).href);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
