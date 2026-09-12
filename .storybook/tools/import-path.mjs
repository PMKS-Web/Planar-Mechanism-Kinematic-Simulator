// Shortest import path between two files in src/app, following static imports only.
// usage: node import-path.mjs <from relative to src/app> <to relative to src/app>
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve(process.cwd(), 'src/app');
const [from, to] = process.argv.slice(2);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.ts') && !f.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}
function resolveImport(file, spec) {
  let base;
  if (spec.startsWith('.')) base = resolve(dirname(file), spec);
  else if (spec.startsWith('src/')) base = resolve(process.cwd(), spec);
  else return null;
  for (const cand of [base + '.ts', join(base, 'index.ts')]) if (existsSync(cand)) return cand;
  return null;
}
const graph = new Map();
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  const deps = new Set();
  for (const m of text.matchAll(/^import(?!\s+type)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
    const target = resolveImport(file, m[1]);
    if (target) deps.add(target);
  }
  graph.set(file, [...deps]);
}
const start = resolve(root, from),
  goal = resolve(root, to);
const prev = new Map([[start, null]]);
const queue = [start];
while (queue.length) {
  const cur = queue.shift();
  if (cur === goal) break;
  for (const d of graph.get(cur) ?? [])
    if (!prev.has(d)) {
      prev.set(d, cur);
      queue.push(d);
    }
}
if (!prev.has(goal)) {
  console.log('no path');
  process.exit(0);
}
const path = [];
for (let n = goal; n; n = prev.get(n)) path.unshift(relative(root, n));
console.log(path.join('\n  -> '));
