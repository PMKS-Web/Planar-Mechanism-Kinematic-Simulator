import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const tokens = readFileSync(join(root, 'src/styles/_tokens.scss'), 'utf8');
const names = [...tokens.matchAll(/^\s+(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [
  m[1],
  m[2].trim(),
]);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(scss|html|ts)$/.test(f) && !p.includes('/stories/')) out.push(p);
  }
  return out;
}
const files = walk(join(root, 'src'));
const texts = files.map((f) => [f, readFileSync(f, 'utf8')]);

const rows = names.map(([name, value]) => {
  let uses = 0;
  const where = new Set();
  const re = new RegExp(`var\\(${name}[,)]`, 'g');
  for (const [f, t] of texts) {
    const n = (t.match(re) ?? []).length;
    if (n && !f.endsWith('_tokens.scss')) {
      uses += n;
      where.add(f.replace(root + '/src/', '').replace(/^app\/component\//, ''));
    }
  }
  return { name, value, uses, files: [...where] };
});
rows.sort((a, b) => a.uses - b.uses);
console.log(`tokens: ${rows.length}`);
for (const r of rows)
  console.log(
    `${String(r.uses).padStart(3)}  ${r.name.padEnd(26)} ${r.value.padEnd(10)} ${r.files.slice(0, 3).join(', ')}${r.files.length > 3 ? ` +${r.files.length - 3}` : ''}`
  );
