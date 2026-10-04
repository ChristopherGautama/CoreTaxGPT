import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Deliberately no history fallback: an unknown pathname returns an actual 404.
// This catches routes which only appear to work behind Vite's SPA dev server.
const root = resolve(process.env.PAGES_TEST_DIST || 'dist');
const prefix = process.env.PAGES_TEST_BASE_PATH || '/CoreTaxGPT/';
if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new Error('PAGES_TEST_BASE_PATH must start and end with /');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  const fail = (status, message) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(message); };
  if (!['GET', 'HEAD'].includes(request.method || '')) { fail(405, 'Method not allowed'); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (!pathname.startsWith(prefix)) { fail(404, 'Outside project prefix'); return; }
    const relative = pathname.slice(prefix.length) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) { fail(403, 'Invalid path'); return; }
    if (!(await stat(file)).isFile()) { fail(404, 'Not a file'); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    fail(error instanceof URIError ? 400 : 404, 'File not found');
  }
});
server.listen(4174, '127.0.0.1', () => process.stdout.write(`Static Pages test server: http://127.0.0.1:4174${prefix}\n`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
