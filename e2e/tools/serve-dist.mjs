/**
 * Serves a built bundle so the suites have something to point at.
 *
 * `ng serve` is the right thing on a laptop and the wrong thing on a CI runner:
 * it rebuilds on a watcher, transforms per request, and takes the best part of
 * a minute to answer the first time. Sharding the batch across eight machines
 * would pay that eight times over, for eight builds that must then be trusted
 * to be identical. So the workflow builds once and every shard serves the same
 * bytes through this.
 *
 * It must be a **development** build. Most suites reach into the app through
 * `window.ng`, which the production configuration optimizes away:
 *
 *   npx ng build --configuration development
 *   node e2e/tools/serve-dist.mjs --port 4200
 *
 * No dependency, because adding one to serve a directory of files is how a
 * build starts fetching things it does not need.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (argv[at + 1] ?? fallback);
};

const port = Number(flag('port', 4200));
const root = path.resolve(flag('root', 'dist/pmksweb'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.pmks': 'text/plain; charset=utf-8',
  '.dxf': 'application/dxf',
};

/** Resolve a request to a file under root, or null if it escapes or is missing. */
async function resolve(url) {
  const asked = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const target = path.resolve(root, `.${asked}`);
  // path.resolve collapses `..`, so anything outside root is a traversal.
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(target);
    if (info.isFile()) return target;
  } catch {
    /* fall through to index.html */
  }
  // The app has no router, but a bare `/` and a stray path both want the shell.
  return path.extname(asked) ? null : path.join(root, 'index.html');
}

const server = createServer(async (request, response) => {
  const file = await resolve(request.url ?? '/');
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    // A shard runs once against one build; a cached answer only hides a change.
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

// `ng serve` answers on IPv6 loopback only, which is why the suites are told
// never to say 127.0.0.1. Listening with no host given takes both, so here that
// rule does not bite — but keep saying `localhost`, for the days it is `ng serve`.
server.listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
