// PROTOTYPE: how often each sheet version names the real machine, over several
// askings of every case, and how often a stated "Looks like" is wrong.
//   SHEETS=v6r5,v7 K=5 node src/app/prototype/what-is-this/run/reliability.mjs [--looks]
// Ask first with SAMPLE=1..K (run/ask.mjs). ANSWERS=answers-named-file scores
// the answers kept from before the picture was sent under a neutral name.
// Only what an answer claims the machine is counts (its "Looks like" and its
// uses): the paragraph repeats the author's names ("**Hood**"), which is not
// recognizing anything.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recognitionMatch } from './rubric.mjs';

const base = new URL('../../../../../artifacts/what-is-this/', import.meta.url).pathname;
const sheets = (process.env.SHEETS ?? 'v6r5,v7').split(',');
const K = Number(process.env.K ?? 5);
const answersDir = process.env.ANSWERS ?? 'answers';
const provider = 'codex__gpt-6-luna';

const manifest = (sheet) => JSON.parse(readFileSync(join(base, sheet, 'manifest.json'), 'utf8'));
const answer = (sheet, key, n) => {
  const file = join(base, sheet, answersDir, provider, `${key}${n === 1 ? '' : `~${n}`}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).parsed : undefined;
};

const summary = {};
const rows = [];
for (const c of manifest(sheets[sheets.length - 1]).cases) {
  const row = { template: c.template, source: c.source ?? 'library', named: false };
  for (const sheet of sheets) {
    const entry = manifest(sheet).cases.find((x) => x.template === c.template);
    if (!entry) continue;
    // An author's name reaches the model as ("Hood") after a part's letters, in
    // the fact sheet (the instructions carry an example of their own).
    const prompt = readFileSync(join(base, sheet, entry.prompt), 'utf8');
    const facts = prompt.slice(prompt.indexOf('FACT SHEET'));
    if (/\b(?:link|joint|slider|pin|Force) [A-Z0-9-]+ \("/.test(facts)) row.named = true;
    const answers = Array.from({ length: K }, (_, i) => answer(sheet, entry.key, i + 1)).filter(
      Boolean
    );
    const marks = answers.map((a) =>
      recognitionMatch(c.template, { resembles: a.resembles, useCases: a.useCases })
    );
    if (!marks.length || marks[0] === 'n/a') continue;
    const hits = marks.filter((m) => m === 'named').length;
    const said = answers.filter((a) => (a.resembles ?? '').trim()).length;
    const wrong = answers.filter(
      (a, i) => marks[i] === 'missed' && (a.resembles ?? '').trim()
    ).length;
    row[sheet] = { hits, n: marks.length, wrong, looks: answers.map((a) => a.resembles || '—') };
    const s = (summary[`${sheet} ${row.source}`] ??= {
      cases: 0,
      asked: 0,
      hits: 0,
      said: 0,
      wrong: 0,
      always: 0,
      never: 0,
    });
    s.cases++;
    s.asked += marks.length;
    s.hits += hits;
    s.said += said;
    s.wrong += wrong;
    if (hits === marks.length) s.always++;
    if (hits === 0) s.never++;
  }
  rows.push(row);
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
for (const r of rows) {
  const cells = sheets.map((s) =>
    r[s] ? `${s} ${r[s].hits}/${r[s].n} (wrong ${r[s].wrong})`.padEnd(24) : ''.padEnd(24)
  );
  if (cells.some((x) => x.trim()))
    console.log(`${r.template.padEnd(24)}${r.named ? '*' : ' '} ${cells.join(' ')}`);
}
console.log('\n* an author named parts (sent from v7 on)');
for (const [k, s] of Object.entries(summary))
  console.log(
    `${k.padEnd(16)} ${s.cases} cases, ${s.asked} askings: names it ${s.hits} (${pct(s.hits, s.asked)}); every time ${s.always}, never ${s.never}; "Looks like" given ${s.said}, wrong ${s.wrong} (${pct(s.wrong, s.said)})`
  );
if (process.argv.includes('--looks'))
  for (const r of rows)
    console.log(
      `\n${r.template}\n${sheets.map((s) => `  ${s}: ${r[s]?.looks.join(' | ') ?? 'n/a'}`).join('\n')}`
    );
