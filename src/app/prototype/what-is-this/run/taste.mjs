// PROTOTYPE: build the taste-test page, where one person picks the better of
// two answers for each mechanism without knowing which fact sheet wrote which.
//   node src/app/prototype/what-is-this/run/taste.mjs
// Reads ./rounds.json (which sheet versions each round compares), ./sheets.json
// (what each version changed), the answers under artifacts/what-is-this/<sheet>/
// and the motion under artifacts/what-is-this/motion/, and writes
// artifacts/what-is-this/taste/taste.html from ./taste.html. The votes are not
// here: the published page keeps them in its own database.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkAnswer } from './rubric.mjs';

const here = new URL('.', import.meta.url).pathname;
const base = new URL('../../../../../artifacts/what-is-this/', import.meta.url).pathname;
const { provider, variant, rounds } = JSON.parse(readFileSync(join(here, 'rounds.json'), 'utf8'));
const sheets = JSON.parse(readFileSync(join(here, 'sheets.json'), 'utf8'));

/** "v3" is the first asking of sheet v3; "v3~2" the second. */
/** The models an arm can name after "@", by the directory their answers are kept in. */
const MODELS = {
  luna: 'codex__gpt-6-luna',
  astra: 'codex__gpt-6-astra',
  opus: 'claude__claude-opus-5-5',
  'flash-lite': 'gemini__gemini-3.5-flash-lite',
};

/**
 * An arm is `<sheet>[@<model>][~<asking>]`: "v8~2" is v8's second asking, and
 * "v8@astra" v8 answered by GPT-6 Astra rather than the rounds' own model.
 */
function parseArm(arm) {
  const [sheetAndModel, sample = '1'] = arm.split('~');
  const [sheet, model] = sheetAndModel.split('@');
  if (model && !MODELS[model]) throw new Error(`unknown model "${model}" in arm ${arm}`);
  return { sheet, sample, model: model ? MODELS[model] : provider };
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
  // v4 says "Driven input: ..." and "repeats every 6 s"; v3 and before had an Input section.
  const input =
    /^- Driven input: (.*)$/m.exec(facts)?.[1] ?? /^### Input\n- (.*)$/m.exec(facts)?.[1] ?? '';
  const drive = /(joint|slider) ([A-Z])/.exec(input);
  const cylinder = /cylinder between ([A-Z]) and ([A-Z])/.exec(input);
  const speed =
    / at ([\d.]+ (?:rpm (?:counter)?clockwise|\w+\/s))/.exec(input)?.[1] ??
    /speed (.*)\.$/.exec(input)?.[1] ??
    '';
  const cycle =
    /repeats every ([\d.]+) s/.exec(facts)?.[1] ??
    /back-and-forth takes ([\d.]+) s/.exec(facts)?.[1] ??
    /Solved \d+ samples over ([\d.]+) s/.exec(facts)?.[1];
  const stuck = /Gruebler count (-?\d+) degrees of freedom/.exec(facts)?.[1];
  const dof =
    /Degrees of freedom: (\d+)/.exec(facts)?.[1] ??
    (stuck && `${stuck} (PMKS+ could not solve it)`);
  return [
    ['Degrees of freedom', dof ?? '–'],
    [
      'Input',
      cylinder
        ? `Cylinder ${cylinder[1]}–${cylinder[2]}`
        : drive
          ? `${drive[1] === 'slider' ? 'Slider' : 'Joint'} ${drive[2]}`
          : '–',
    ],
    ['Input speed', speed || '–'],
    ['Cycle time', cycle ? `${cycle} s` : '–'],
  ];
}

const images = {};
/**
 * The pictures ride the page as JPEG, at most 1200 px wide and quality 65:
 * four rounds of seven-tile PNGs came to 19 MB, and six rounds at 1400 px and
 * quality 75 to more than the 16 MB a published page may hold.
 */
const JPEG = `
import base64, io, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
if im.width > 1200:
    im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
out = io.BytesIO()
im.save(out, 'JPEG', quality=65)
sys.stdout.write(base64.b64encode(out.getvalue()).decode())
`;

function imageId(file) {
  if (!existsSync(file)) return undefined;
  const bytes = readFileSync(file);
  const id = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
  images[id] ??=
    `data:image/jpeg;base64,${execFileSync('python3', ['-c', JPEG, file], { maxBuffer: 64 * 1024 * 1024 }).toString()}`;
  return id;
}

/** Which side each arm lands on, fixed per round and mechanism so a reload keeps it. */
function aOnLeft(roundId, template) {
  return createHash('sha1').update(`${roundId}:${template}`).digest()[0] % 2 === 0;
}

const round3 = (value) => Math.round(value * 1000) / 1000;

function loadArm(arm, template) {
  const { sheet, sample, model } = parseArm(arm);
  const root = join(base, sheet);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const entry = manifest.cases.find((c) => c.template === template && c.variant === variant);
  if (!entry) return undefined;
  const prompt = readFileSync(join(root, entry.prompt), 'utf8');
  const facts = factsOf(prompt);
  const instructions = prompt.slice(0, prompt.indexOf('FACT SHEET'));
  const file = join(
    root,
    'answers',
    model,
    sample === '1' ? `${entry.key}.json` : `${entry.key}~${sample}.json`
  );
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  return {
    entry,
    facts,
    instructions,
    arm: {
      id: arm,
      sheet,
      sample: Number(sample),
      model,
      // Whether this version's panel would show "Looks like" (from v8's gate on; older sheets always did).
      looksLike: entry.looksLike,
      answer: saved?.parsed,
      error: saved ? (saved.error ?? saved.parseError) : 'not asked yet',
      latencyMs: saved?.latencyMs,
      usage: saved?.usage,
      image: imageId(join(root, entry.image ?? '')),
      familyCheck: entry.family?.[0]?.family,
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
      source: b.entry.source ?? 'library',
      intent: b.entry.intent,
      // The family is the app's, shown in the panel's Overview for both sides.
      // Undefined for sheets older than v4, which had no family check; null for no match.
      appFamily:
        (b.entry.family ?? a.entry.family)?.map((m) => m.family)[0] ??
        ((b.entry.family ?? a.entry.family) ? null : undefined),
      appUrl: b.entry.appUrl,
      overview: overviewOf(b.facts),
      // The Links table is the app's, not the model's: the newer sheet's jobs, shown on both sides.
      jobs: b.entry.jobs?.length ? b.entry.jobs : (a.entry.jobs ?? []),
      decided: round.decided?.[template],
      motion,
      // Identical only when the model was sent the same thing: the same sheet
      // under the same instructions. Round 3 changes the instructions and the
      // picture over sheets that are mostly the same.
      // A round may declare its instructions the same where they differ only in a
      // sentence none of its mechanisms reaches (round 1's unsolvable-drawing rule).
      // Two models reading one sheet are not the model varying on its own.
      identical:
        a.arm.model === b.arm.model &&
        a.facts === b.facts &&
        a.arm.image === b.arm.image &&
        (a.instructions === b.instructions || !!round.sameInstructions),
      sameFacts: a.facts === b.facts,
      diff: a.facts === b.facts ? [] : diffLines(a.facts, b.facts),
      left: left ? a.arm : b.arm,
      right: left ? b.arm : a.arm,
    });
  }
  return { ...round, pairs };
});

// Rounds that compare models share one mechanism's motion and fact sheet across
// every pair; each is kept once and pointed at, or nine rounds pass 16 MB.
const motions = {};
const facts = {};
const factsId = (text) => {
  if (text === undefined) return undefined;
  const id = createHash('sha1').update(text).digest('hex').slice(0, 12);
  facts[id] ??= text;
  return id;
};
const pageRounds = builtRounds.map((round) => ({
  ...round,
  pairs: round.pairs.map(({ motion, ...pair }) => {
    if (motion) motions[pair.template] ??= motion;
    const arm = ({ facts: text, ...side }) => ({ ...side, factsId: factsId(text) });
    return { ...pair, left: arm(pair.left), right: arm(pair.right) };
  }),
}));
const data = {
  provider,
  variant,
  sheets,
  rounds: pageRounds,
  motions,
  facts,
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
// A student's mechanism is theirs: its link, fact sheets, message and the sheet
// diff stay out of the repository; the answers and checks are kept.
const lite = builtRounds.map((round) => ({
  ...round,
  pairs: round.pairs.map(({ motion, overview, ...pair }) => {
    const student = pair.source === 'student';
    const arm = (side) => ({ ...side, image: undefined, facts: student ? undefined : side.facts });
    return {
      ...pair,
      appUrl: student ? undefined : pair.appUrl,
      blurb: student ? undefined : pair.blurb,
      diff: student ? undefined : pair.diff,
      jobs: student ? undefined : pair.jobs,
      left: arm(pair.left),
      right: arm(pair.right),
    };
  }),
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
