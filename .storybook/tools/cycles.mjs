// Every static-import cycle under src/app that passes through a component file, shortest first.
// usage: node .storybook/tools/cycles.mjs [max cycles]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve(process.cwd(), 'src/app');
const max = Number(process.argv[2] ?? 20);

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
  const deps = new Set();
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/^import(?!\s+type)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
    const t = resolveImport(file, m[1]);
    if (t) deps.add(t);
  }
  graph.set(file, [...deps]);
}
function shortestPath(from, to) {
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const d of graph.get(cur) ?? []) if (!prev.has(d)) (prev.set(d, cur), queue.push(d));
  }
  if (!prev.has(to)) return null;
  const path = [];
  for (let n = to; n; n = prev.get(n)) path.unshift(n);
  return path;
}
const seen = new Set();
const cycles = [];
for (const file of [...graph.keys()].filter((f) => f.endsWith('.component.ts'))) {
  for (const dep of graph.get(file)) {
    const back = shortestPath(dep, file);
    if (!back) continue;
    const cycle = [file, ...back];
    const key = [...new Set(cycle)].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    cycles.push(cycle);
  }
}
cycles.sort((a, b) => a.length - b.length);
console.log(`${cycles.length} cycles through component files`);
for (const c of cycles.slice(0, max))
  console.log('\n' + c.map((f) => relative(root, f)).join('\n  -> '));
