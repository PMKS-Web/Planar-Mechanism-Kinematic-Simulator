// PROTOTYPE: build the taste-test page, where one person picks the better of
// two answers for each mechanism without knowing which fact sheet wrote which.
//   node src/app/prototype/what-is-this/run/taste.mjs
// Reads ./rounds.json (which sheet versions each round compares), ./sheets.json
// (what each version changed), the answers under artifacts/what-is-this/<sheet>/
// and the motion under artifacts/what-is-this/motion/, and writes
// artifacts/what-is-this/taste/taste.html from ./taste.html. The votes are not
// here: the published page keeps them in its own database.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkAnswer } from './rubric.mjs';

const here = new URL('.', import.meta.url).pathname;
const base = new URL('../../../../../artifacts/what-is-this/', import.meta.url).pathname;
const { provider, variant, rounds } = JSON.parse(readFileSync(join(here, 'rounds.json'), 'utf8'));
const sheets = JSON.parse(readFileSync(join(here, 'sheets.json'), 'utf8'));

/** "v3" is the first asking of sheet v3; "v3~2" the second. */
function parseArm(arm) {
  const [sheet, sample = '1'] = arm.split('~');
  return { sheet, sample };
}

function factsOf(prompt) {
  return prompt.slice(prompt.indexOf('FACT SHEET') + 'FACT SHEET'.length).trim();
}

/** Line diff by longest common subsequence: enough for two fifty-line sheets. */
function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      out.push({ op: '+', line: b[j++] });
    } else {
      out.push({ op: '-', line: a[i++] });
    }
  }
  return out;
}

/** The overview rows the panel shows above the note; read off the sheet, the same for both sides. */
function overviewOf(facts) {
  const input = /^### Input\n- (.*)$/m.exec(facts)?.[1] ?? '';
  const drive = /at joint ([A-Z])/.exec(input)?.[1];
  const cylinder = /cylinder between ([A-Z]) and ([A-Z])/.exec(input);
  const speed = /speed (.*)\.$/.exec(input)?.[1] ?? '';
  const cycle = /Solved \d+ samples over ([\d.]+) s/.exec(facts)?.[1];
  const dof = /Degrees of freedom: (\d+)/.exec(facts)?.[1];
  return [
    ['Degrees of freedom', dof ?? '–'],
    ['Input', cylinder ? `Cylinder ${cylinder[1]}–${cylinder[2]}` : drive ? `Joint ${drive}` : '–'],
    ['Input speed', speed || '–'],
    ['Cycle time', cycle ? `${cycle} s` : '–'],
  ];
}

const images = {};
function imageId(file) {
  if (!existsSync(file)) return undefined;
  const bytes = readFileSync(file);
  const id = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
  images[id] ??= `data:image/png;base64,${bytes.toString('base64')}`;
  return id;
}

/** Which side each arm lands on, fixed per round and mechanism so a reload keeps it. */
function aOnLeft(roundId, template) {
  return createHash('sha1').update(`${roundId}:${template}`).digest()[0] % 2 === 0;
}

const round3 = (value) => Math.round(value * 1000) / 1000;

function loadArm(arm, template) {
  const { sheet, sample } = parseArm(arm);
  const root = join(base, sheet);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const entry = manifest.cases.find((c) => c.template === template && c.variant === variant);
  if (!entry) return undefined;
  const facts = factsOf(readFileSync(join(root, entry.prompt), 'utf8'));
  const file = join(
    root,
    'answers',
    provider,
    sample === '1' ? `${entry.key}.json` : `${entry.key}~${sample}.json`
  );
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  return {
    entry,
    facts,
    arm: {
      id: arm,
      sheet,
      sample: Number(sample),
      answer: saved?.parsed,
      error: saved ? (saved.error ?? saved.parseError) : 'not asked yet',
      latencyMs: saved?.latencyMs,
      usage: saved?.usage,
      image: imageId(join(root, entry.image ?? '')),
      facts,
      rubric: checkAnswer(template, saved?.parsed, facts),
    },
  };
}

const builtRounds = rounds.map((round) => {
  const manifest = JSON.parse(
    readFileSync(join(base, parseArm(round.b).sheet, 'manifest.json'), 'utf8')
  );
  const templates = [...new Set(manifest.cases.map((c) => c.template))];
  const pairs = [];
  for (const template of templates) {
    const a = loadArm(round.a, template);
    const b = loadArm(round.b, template);
    if (!a || !b) continue;
    const motionFile = join(base, 'motion', `${template}.json`);
    const motion = existsSync(motionFile)
      ? JSON.parse(readFileSync(motionFile, 'utf8'))
      : undefined;
    if (motion) {
      motion.frames = motion.frames.map((frame) => frame.map(([x, y]) => [round3(x), round3(y)]));
      motion.time = motion.time.map(round3);
      motion.guides = motion.guides.map((g) => g.map(([x, y]) => [round3(x), round3(y)]));
    }
    const left = aOnLeft(round.id, template);
    pairs.push({
      template,
      name: b.entry.name,
      blurb: b.entry.libraryBlurb,
      appUrl: b.entry.appUrl,
      overview: overviewOf(b.facts),
      motion,
      identical: a.facts === b.facts,
      diff: a.facts === b.facts ? [] : diffLines(a.facts, b.facts),
      left: left ? a.arm : b.arm,
      right: left ? b.arm : a.arm,
    });
  }
  return { ...round, pairs };
});

const data = {
  provider,
  variant,
  sheets,
  rounds: builtRounds,
  images,
  generated: new Date().toISOString(),
};
const outDir = join(base, 'taste');
mkdirSync(outDir, { recursive: true });
// Prettier writes the placeholder with a space after the comment; either way matches.
const page = readFileSync(join(here, 'taste.html'), 'utf8').replace(/\/\*DATA\*\/\s*null/, () =>
  JSON.stringify(data).replace(/</g, '\\u003c')
);
writeFileSync(join(outDir, 'taste.html'), page);
// The same rounds without pictures or motion: small enough to keep in the repository as evidence.
const lite = builtRounds.map((round) => ({
  ...round,
  pairs: round.pairs.map(({ motion, overview, ...pair }) => ({
    ...pair,
    left: { ...pair.left, image: undefined },
    right: { ...pair.right, image: undefined },
  })),
}));
writeFileSync(
  join(outDir, 'rounds.json'),
  JSON.stringify({ provider, variant, sheets, rounds: lite }, null, 2)
);
for (const round of builtRounds) {
  console.log(
    `${round.id}: ${round.pairs.length} pairs, ${round.pairs.filter((p) => p.identical).length} with identical sheets`
  );
  for (const pair of round.pairs)
    for (const side of ['left', 'right'])
      console.log(
        `  ${pair.template} ${pair[side].id}: family ${pair[side].rubric.family}, use ${pair[side].rubric.application}; ${pair[side].rubric.flags.join('; ') || 'no flags'}`
      );
}
console.log(`wrote ${join(outDir, 'taste.html')} (${Math.round(page.length / 1024)} KB)`);
