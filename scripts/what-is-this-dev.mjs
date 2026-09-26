// The "What is this?" Netlify Function, run on this machine for `npm start`.
//
//   GEMINI_API_KEY=… node scripts/what-is-this-dev.mjs
//
// The dev server has no functions, so `src/proxy.conf.json` sends /api to
// this one. It runs the very file Netlify deploys
// (netlify/functions/what-is-this.mts), bundled with the esbuild the Angular
// build already brings, with a stand-in for the `Netlify.env` global that
// reads this shell's environment. There is no rate limit here: that rule is
// Netlify's, applied before the function runs. docs/environment.md has the rest.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const port = Number(process.env.WHAT_IS_THIS_DEV_PORT ?? 8788);
const root = new URL('..', import.meta.url).pathname;
const out = join(mkdtempSync(join(tmpdir(), 'what-is-this-dev-')), 'what-is-this.mjs');
await build({
  entryPoints: [join(root, 'netlify/functions/what-is-this.mts')],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
});
globalThis.Netlify = { env: { get: (name) => process.env[name] } };
const { default: handler, config } = await import(pathToFileURL(out).href);

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set in this shell: every note will fail to be written.');
}

createServer(async (incoming, outgoing) => {
  if (incoming.url !== config.path) {
    outgoing.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const request = new Request(`http://localhost:${port}${incoming.url}`, {
    method: incoming.method,
    headers: incoming.headers,
    body: incoming.method === 'POST' ? Buffer.concat(chunks) : undefined,
  });
  const started = Date.now();
  const response = await handler(request);
  // The status and the time only: never the sheet, the picture or the note.
  console.log(`${incoming.method} ${incoming.url} ${response.status} ${Date.now() - started} ms`);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () =>
  console.log(`What is this? function on http://localhost:${port}${config.path}`)
);
