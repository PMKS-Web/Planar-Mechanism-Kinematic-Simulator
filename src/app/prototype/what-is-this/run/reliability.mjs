// PROTOTYPE: how often each sheet version names the real machine, over several
// askings of every case, and how often a stated "Looks like" is wrong.
//   SHEETS=v6r5,v7 K=5 [MODEL=codex__gpt-6-astra] node src/app/prototype/what-is-this/run/reliability.mjs [--looks]
// Ask first with SAMPLE=1..K (run/ask.mjs). ANSWERS=answers-named-file scores
// the answers kept from before the picture was sent under a neutral name.
// Only what an answer claims the machine is counts (its "Looks like" and its
// uses): the paragraph repeats the author's names ("**Hood**"), which is not
// recognizing anything.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NO_MACHINE, recognitionMatch } from './rubric.mjs';

const base = new URL('../../../../../artifacts/what-is-this/', import.meta.url).pathname;
const sheets = (process.env.SHEETS ?? 'v6r5,v7').split(',');
const K = Number(process.env.K ?? 5);
const answersDir = process.env.ANSWERS ?? 'answers';
// MODEL=codex__gpt-6-astra, or codex__gpt-6-luna__high for another effort.
const provider = process.env.MODEL ?? 'codex__gpt-6-luna';

const manifest = (sheet) => JSON.parse(readFileSync(join(base, sheet, 'manifest.json'), 'utf8'));
const answer = (sheet, key, n) => {
  const file = join(base, sheet, answersDir, provider, `${key}${n === 1 ? '' : `~${n}`}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).parsed : undefined;
};

// Families that name a class of chain rather than a kind of machine.
const GENERIC =
  /four-bar|six-bar|eight-bar|slider-crank|cylinder-driven lever|parallelogram$|antiparallelogram/;
const summary = {};
const invented = {};
// The panel showing "Looks like" only when the author named parts or PMKS+
// matched a specific family: how many a student would see, and how many are right.
const gate = {};
const gatePhoto = {};
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
    // A family that points at a kind of machine, not only at a class of chain.
    const families = [...facts.matchAll(/^- (?:Also )?[Mm]atches: ([^.]+)\./gm)].map((m) => m[1]);
    const specific = families.some((f) => !GENERIC.test(f));
    const answers = Array.from({ length: K }, (_, i) => answer(sheet, entry.key, i + 1)).filter(
      Boolean
    );
    const looks = answers.map((a) => a.resembles || '—');
    // The app's own gate where the sheet has one (v8 on), else the same rule estimated.
    const gated = entry.looksLike ? entry.looksLike.show : row.named || specific;
    // A variant: a background photograph opens the gate too.
    const gatedPhoto = gated || !!entry.backdrop;
    const p = (gatePhoto[sheet] ??= { shown: 0, right: 0, invented: 0 });
    const g = (gate[sheet] ??= { shown: 0, right: 0, invented: 0, hidden: 0, hiddenRight: 0 });
    if (NO_MACHINE.has(c.template) && answers.length) {
      // No machine to recognize: every "Looks like" is a machine the model made up.
      const said = answers.filter((a) => (a.resembles ?? '').trim()).length;
      row[sheet] = { claims: said, n: answers.length, looks };
      const s = (invented[sheet] ??= { cases: 0, asked: 0, said: 0 });
      s.cases++;
      s.asked += answers.length;
      s.said += said;
      if (gated) {
        g.shown += said;
        g.invented += said;
      } else g.hidden += said;
      if (gatedPhoto) {
        p.shown += said;
        p.invented += said;
      }
      continue;
    }
    const marks = answers.map((a) =>
      recognitionMatch(c.template, { resembles: a.resembles, useCases: a.useCases })
    );
    if (!marks.length || marks[0] === 'n/a') continue;
    answers.forEach((a, i) => {
      if (!(a.resembles ?? '').trim()) return;
      if (gatedPhoto) {
        p.shown++;
        if (marks[i] === 'named') p.right++;
      }
      if (gated) {
        g.shown++;
        if (marks[i] === 'named') g.right++;
      } else {
        g.hidden++;
        if (marks[i] === 'named') g.hiddenRight++;
      }
    });
    const hits = marks.filter((m) => m === 'named').length;
    const said = answers.filter((a) => (a.resembles ?? '').trim()).length;
    const wrong = answers.filter(
      (a, i) => marks[i] === 'missed' && (a.resembles ?? '').trim()
    ).length;
    row[sheet] = { hits, n: marks.length, wrong, looks };
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
    (!r[s]
      ? ''
      : 'claims' in r[s]
        ? `${s} claims a machine ${r[s].claims}/${r[s].n}`
        : `${s} ${r[s].hits}/${r[s].n} (wrong ${r[s].wrong})`
    ).padEnd(30)
  );
  if (cells.some((x) => x.trim()))
    console.log(`${r.template.padEnd(24)}${r.named ? '*' : ' '} ${cells.join(' ')}`);
}
console.log('\n* an author named parts (sent from v7 on)');
for (const [k, s] of Object.entries(summary))
  console.log(
    `${k.padEnd(16)} ${s.cases} cases, ${s.asked} askings: names it ${s.hits} (${pct(s.hits, s.asked)}); every time ${s.always}, never ${s.never}; "Looks like" given ${s.said}, wrong ${s.wrong} (${pct(s.wrong, s.said)})`
  );
for (const [sheet, s] of Object.entries(invented))
  console.log(
    `${`${sheet} no machine`.padEnd(16)} ${s.cases} cases, ${s.asked} askings: claims a machine anyway ${s.said} (${pct(s.said, s.asked)})`
  );
console.log(
  '\nShown only with author names or a specific family match (cases whose machine, or lack of one, is known):'
);
for (const [sheet, g] of Object.entries(gate))
  console.log(
    `${sheet.padEnd(16)} shown ${g.shown}: right ${g.right}, made up for a chain with no machine ${g.invented}, wrong ${g.shown - g.right - g.invented}; hidden ${g.hidden}, of which right ${g.hiddenRight}`
  );
console.log('The same, with a background photograph also opening it:');
for (const [sheet, g] of Object.entries(gatePhoto))
  console.log(
    `${sheet.padEnd(16)} shown ${g.shown}: right ${g.right}, made up for a chain with no machine ${g.invented}, wrong ${g.shown - g.right - g.invented}`
  );
if (process.argv.includes('--looks'))
  for (const r of rows)
    console.log(
      `\n${r.template}\n${sheets.map((s) => `  ${s}: ${r[s]?.looks.join(' | ') ?? 'n/a'}`).join('\n')}`
    );
