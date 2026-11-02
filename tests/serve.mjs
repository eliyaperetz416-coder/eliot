// Tiny static server with explicit MIME types (used by UI tests and `npm run serve`).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

// The production security headers from vercel.json (the "/(.*)" rule), so UI tests fail if a change breaks the CSP.
// HSTS and upgrade-insecure-requests are left out: the test server is plain http on localhost.
const SECURITY = process.env.NO_SECURITY_HEADERS ? [] : (JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')).headers ?? [])
  .filter((r) => r.source === '/(.*)')
  .flatMap((r) => r.headers)
  .filter((h) => h.key !== 'Strict-Transport-Security')
  .map((h) => [h.key, h.key === 'Content-Security-Policy' ? h.value.replace(/;\s*upgrade-insecure-requests/, '') : h.value]);

export function serve(port = 0) {
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(root, normalize(p));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { ...Object.fromEntries(SECURITY), 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const s = await serve(8080); console.log('http://localhost:' + s.address().port);
}
