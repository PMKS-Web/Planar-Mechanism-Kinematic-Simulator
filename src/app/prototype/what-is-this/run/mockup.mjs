// PROTOTYPE: the data behind the "What is this?" mock-up, the design canvas that
// shows the note in the app's own panel. For each screen it gathers what PMKS+
// computes (the overview, the Links table with each link's job, the family, the
// gate) and one model's answer, made into what the panel draws by note-prose.ts,
// plus the mechanism's motion for the canvas to animate.
//   SHEET=v9 MODEL=gemini__gemini-3.5-flash-lite node src/app/prototype/what-is-this/run/mockup.mjs
// Writes artifacts/what-is-this/mockup/<screen>.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { noteVocabulary, panelNote } from '../note-prose.ts';

const base = new URL('../../../../../artifacts/what-is-this/', import.meta.url).pathname;
const sheet = process.env.SHEET ?? 'v9';
const model = process.env.MODEL ?? 'gemini__gemini-3.5-flash-lite';
const { cases } = JSON.parse(readFileSync(join(base, sheet, 'manifest.json'), 'utf8'));
const outDir = join(base, 'mockup');
mkdirSync(outDir, { recursive: true });

/** The screens: one mechanism, a drawing of two, and a note the gate trims. */
const SCREENS = {
  single: ['Hood_Hinge'],
  several: ['Straight_Line_Pair__M1', 'Straight_Line_Pair__M2'],
  gated: ['Bell_Crank'],
};

const letters = (key) => [...key].sort().join('');

/** The Overview's rows, read off the sheet PMKS+ wrote, as the panel shows them. */
function overview(text, entry) {
  const rows = [];
  if (entry.family[0]) rows.push(['Family', entry.family[0].family]);
  const dof = /Degrees of freedom: (\d+)/.exec(text)?.[1];
  if (dof) rows.push(['Degrees of freedom', dof]);
  const input = /Driven input: (?:joint|slider) (\w)/.exec(text)?.[1];
  const cylinder = /Driven input: the cylinder between (\w) and (\w)/.exec(text);
  rows.push(['Input', cylinder ? `Cylinder ${cylinder[1]}–${cylinder[2]}` : `Joint ${input}`]);
  const speed = / at ([\d.]+ (?:rpm (?:counter)?clockwise|\w+\/s))\./.exec(text)?.[1];
  if (speed) rows.push(['Input speed', speed.replace('rpm', 'RPM')]);
  const cycle = /repeats every ([\d.]+) s|one full back-and-forth takes ([\d.]+) s/.exec(text);
  if (cycle) rows.push(['Cycle time', `${cycle[1] ?? cycle[2]} s`]);
  rows.push(['Motion', /reverses/.test(text) ? 'Reciprocating' : 'Continuous']);
  return rows;
}

/** The motion thinned to about 90 frames, and each body's key as the Links table names it. */
function motionOf(template) {
  const m = JSON.parse(readFileSync(join(base, 'motion', `${template}.json`), 'utf8'));
  const step = Math.max(1, Math.round(m.frames.length / 90));
  const frames = m.frames.filter((_, i) => i % step === 0);
  const round = (v) => Math.round(v * 1000) / 1000;
  return {
    joints: m.joints.map((j) => ({
      id: j.id,
      ground: j.ground,
      slider: j.slider,
      traced: j.traced,
    })),
    bodies: m.bodies.map((ids) => ({ ids, key: ids.map((i) => m.joints[i].id).join('') })),
    discs: m.discs,
    cylinders: m.cylinders.map(([a, b]) => ({ a, b, key: `${m.joints[a].id}-${m.joints[b].id}` })),
    guides: m.guides,
    frames: frames.map((f) => f.map(([x, y]) => [round(x), round(y)])),
    period: m.time[m.time.length - 1],
  };
}

function machineOf(entry) {
  const text = readFileSync(join(base, sheet, entry.prompt), 'utf8');
  const facts = text.slice(text.indexOf('FACT SHEET'));
  const file = join(base, sheet, 'answers', model, `${entry.key}.json`);
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  const joints = [...facts.matchAll(/^- Joints: (.*)$/gm)].flatMap(([, line]) =>
    [...line.matchAll(/(?:^|; )([A-Z])(?: \("[^"]*"\))? \(/g)].map((m) => m[1])
  );
  const rows = entry.jobs.map((j) => j.name);
  const words = noteVocabulary(rows, joints);
  const unit = /Length unit: (\w+)/.exec(facts)?.[1] ?? 'cm';
  return {
    label: `M${(entry.machine ?? 0) + 1}`,
    overview: overview(facts, entry),
    unit,
    links: entry.jobs
      .filter((j) => j.name !== 'ground')
      .map((j) => {
        const named = /^(.*?)\s*\("([^"]+)"\)$/.exec(j.name);
        const bare = named ? named[1] : j.name;
        const [, kind = 'link', key = bare] =
          /^(link|slider|pin|cylinder)\s+(\S+)$/.exec(bare) ?? [];
        return {
          key,
          letters: letters(key.replace('-', '')),
          label: named ? `${key} (${named[2]})` : kind === 'link' ? key : `${kind} ${key}`,
          job: j.job.split(/[;,](?![^(]*\))/)[0].replace(/\s*\(.*\)$/, ''),
        };
      }),
    gate: entry.looksLike,
    note: saved?.parsed ? panelNote(saved.parsed, words, entry.looksLike, entry.family) : undefined,
    failed: saved?.parsed ? undefined : (saved?.error ?? saved?.parseError ?? 'not asked'),
  };
}

/**
 * A mechanism PMKS+ cannot solve gets no note: the panel sends the reader to
 * what stops it, in the setup drawer's own words and part links, copied from
 * feature/explain-blockers-check-answers running this drawing (a student's
 * Strider leg with one freedom too many).
 */
function blockedScreen() {
  const motion = motionOf('student-19afdedcc1a4');
  const part = (key, label) => ({ part: key, label });
  return {
    screen: 'blocked',
    name: 'A walking leg that does not run',
    backdrop: null,
    machines: [
      {
        label: 'M1',
        overview: [
          ['Degrees of freedom', '2 (needs 1)'],
          ['Input', 'Joint A'],
          ['Input speed', '20 RPM clockwise'],
        ],
        unit: 'cm',
        links: motion.bodies.map((b) => ({
          key: b.key,
          letters: letters(b.key),
          label: b.key,
          job: '',
        })),
        gate: { show: false, because: '' },
        note: undefined,
      },
    ],
    motion,
    issue: {
      title: '2 degrees of freedom, needs 1',
      summary: [
        'With the input held still, ',
        part('DE', 'link DE'),
        ', ',
        part('BF', 'link BF'),
        ' and ',
        part('FE', 'link FE'),
        ' can still move.',
      ],
      explain:
        'One input drives one motion. With more degrees of freedom than inputs, part of the mechanism can move on its own.',
      label: 'Required to run. Some ways to fix it:',
      fixes: [
        ['Weld ', part('E', 'joint E')],
        ['Weld ', part('F', 'joint F')],
      ],
    },
  };
}
writeFileSync(join(outDir, 'blocked.json'), JSON.stringify(blockedScreen()));
console.log('blocked: the setup drawer instead of a note');

for (const [screen, templates] of Object.entries(SCREENS)) {
  const entries = templates.map((t) => cases.find((c) => c.template === t));
  if (entries.some((e) => !e)) throw new Error(`${screen}: a case is missing from ${sheet}`);
  const data = {
    screen,
    name: entries[0].name.replace(/ · M\d+$/, ''),
    backdrop: entries[0].backdrop ?? null,
    machines: entries.map(machineOf),
    motion: motionOf(entries[0].template),
  };
  writeFileSync(join(outDir, `${screen}.json`), JSON.stringify(data));
  const notes = data.machines.map((m) => (m.note ? 'note' : `no note (${m.failed})`)).join(', ');
  console.log(`${screen}: ${data.name}, ${data.machines.length} machine(s): ${notes}`);
}
