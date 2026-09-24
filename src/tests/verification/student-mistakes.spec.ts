// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { mkdirSync, writeFileSync } from 'node:fs';
import { followAdvice, Walk } from '../../test-utils/verification/follow-advice';
import { Scenario, studentScenarios } from '../../test-utils/verification/student-mistakes';

/**
 * Hundreds of small drawings broken the way students break them, and the app's
 * own advice followed on each until it runs or leaves the reader guessing.
 *
 * The report it writes (`artifacts/student-mistakes/`) is the point: which
 * mistakes the drawer walks a reader out of, in how many steps, whether they
 * end up with the mechanism they meant, and -- word for word -- the sentences
 * that name no edit at all.
 */
describe('advice followed on drawings broken the way students break them', () => {
  const scenarios = studentScenarios(600, 1);
  const walks = scenarios.map((scenario) => ({ scenario, walk: followAdvice(scenario) }));

  it('never throws', () => {
    const thrown = walks.filter(({ walk }) => walk.outcome === 'threw');
    expect(thrown.map(({ scenario, walk }) => `${scenario.seed}: ${walk.error}`)).toEqual([]);
  });

  // Floors a little under what the advice reaches today, so a change that
  // makes it worse fails here rather than in a classroom.
  const single = walks.filter(({ scenario }) => scenario.mistakes.length === 1);
  const runs = (list: typeof walks) =>
    list.filter(({ walk }) => walk.outcome === 'runs' || walk.outcome === 'runs as drawn');

  it('walks a reader out of almost every single mistake', () => {
    expect(runs(single).length / single.length).toBeGreaterThan(0.97);
  });

  it('and out of it into the mechanism they meant', () => {
    const fixed = single.filter(({ walk }) => walk.outcome === 'runs');
    const meant = fixed.filter(({ walk }) => walk.intended);
    expect(meant.length / fixed.length).toBeGreaterThan(0.85);
  });

  it('and out of most pairs of mistakes within three steps', () => {
    const pairs = walks.filter(({ scenario }) => scenario.mistakes.length === 2);
    expect(runs(pairs).length / pairs.length).toBeGreaterThan(0.75);
  });

  it('writes what it found', () => {
    mkdirSync('artifacts/student-mistakes', { recursive: true });
    writeFileSync(
      'artifacts/student-mistakes/report.json',
      JSON.stringify(walks.map(summary), null, 1)
    );
    writeFileSync('artifacts/student-mistakes/summary.md', summarize(walks));
    expect(walks.length).toBeGreaterThan(500);
  });
});

function summary({ scenario, walk }: { scenario: Scenario; walk: Walk }) {
  return {
    seed: scenario.seed,
    base: scenario.base,
    mistakes: scenario.mistakes.map((mistake) => mistake.name),
    outcome: walk.outcome,
    intended: walk.intended,
    leftover: walk.leftover,
    steps: walk.steps,
    error: walk.error,
  };
}

function summarize(walks: { scenario: Scenario; walk: Walk }[]): string {
  const lines: string[] = ['# Advice followed on student mistakes', ''];
  const single = walks.filter(({ scenario }) => scenario.mistakes.length === 1);
  const byMistake = new Map<string, Walk[]>();
  single.forEach(({ scenario, walk }) => {
    const name = scenario.mistakes[0].name;
    byMistake.set(name, [...(byMistake.get(name) ?? []), walk]);
  });
  lines.push(
    '| One mistake | n | runs as drawn | runs after advice | intended | no edit named | still broken |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [name, list] of [...byMistake].sort()) {
    const count = (outcome: Walk['outcome']) =>
      list.filter((walk) => walk.outcome === outcome).length;
    const intended = list.filter((walk) => walk.outcome === 'runs' && walk.intended).length;
    lines.push(
      `| ${name} | ${list.length} | ${count('runs as drawn')} | ${count('runs')} | ${intended} | ${count('no edit named')} | ${count('still broken')} |`
    );
  }
  const two = walks.filter(({ scenario }) => scenario.mistakes.length === 2);
  const tally = (list: typeof walks, outcome: Walk['outcome']) =>
    list.filter(({ walk }) => walk.outcome === outcome).length;
  lines.push(
    '',
    `Two mistakes: ${two.length} drawings, ${tally(two, 'runs as drawn')} run as drawn, ${tally(two, 'runs')} run after advice, ${tally(two, 'no edit named')} end on a sentence naming no edit, ${tally(two, 'still broken')} still broken after three.`,
    ''
  );

  const stops = new Map<string, { count: number; example: string }>();
  walks.forEach(({ scenario, walk }) => {
    if (walk.outcome !== 'no edit named' && walk.outcome !== 'still broken') return;
    const last = walk.steps[walk.steps.length - 1];
    const key = `${walk.outcome} :: ${last?.title.replace(/\b[A-Z][A-Z0-9]*\b/g, 'X') ?? '?'}`;
    const entry = stops.get(key) ?? {
      count: 0,
      example: `seed ${scenario.seed}, ${scenario.base}, ${scenario.mistakes.map((m) => m.name).join(' + ')}: "${last?.title}" ${last?.body}`,
    };
    entry.count++;
    stops.set(key, entry);
  });
  const leftovers = new Map<string, number>();
  walks.forEach(({ walk }) =>
    (walk.leftover ?? []).forEach((title) => {
      const key = title.replace(/\b[A-Z][A-Z0-9]*\b/g, 'X');
      leftovers.set(key, (leftovers.get(key) ?? 0) + 1);
    })
  );
  lines.push('## Left over in drawings that run', '');
  [...leftovers].forEach(([title, count]) => lines.push(`- **${count}** ${title}`));
  lines.push('');

  const byMistakeStop = new Map<string, Map<string, number>>();
  single.forEach(({ scenario, walk }) => {
    if (walk.outcome !== 'no edit named' && walk.outcome !== 'still broken') return;
    const last = walk.steps[walk.steps.length - 1];
    const title = `${walk.outcome}: ${last?.title.replace(/\b[A-Z][A-Z0-9]*\b/g, 'X') ?? '?'}`;
    const counts = byMistakeStop.get(scenario.mistakes[0].name) ?? new Map<string, number>();
    counts.set(title, (counts.get(title) ?? 0) + 1);
    byMistakeStop.set(scenario.mistakes[0].name, counts);
  });
  lines.push('## Where each single mistake stops', '');
  [...byMistakeStop].sort().forEach(([name, counts]) => {
    lines.push(`- ${name}`);
    [...counts].forEach(([title, count]) => lines.push(`  - **${count}** ${title}`));
  });
  lines.push('');

  lines.push('## Where the advice stops', '');
  [...stops]
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([key, { count, example }]) => lines.push(`- **${count}** ${key}`, `  - ${example}`));

  const choices = walks.flatMap(({ walk }) => walk.steps).filter((step) => step.offered > 1);
  const first = choices.filter((step) => step.undoRank === 0).length;
  const later = choices.filter((step) => (step.undoRank ?? -1) > 0).length;
  const newest = choices.filter((step) => step.newestRank === 0).length;
  lines.push(
    '',
    '## When more than one fix is offered',
    '',
    `${choices.length} steps offered more than one counted fix. The mistake's own undo was among them in ${first + later}, and not at all in ${choices.length - first - later}.`,
    '',
    '| How the ways out are shown | The undo is |',
    '| --- | --- |',
    `| One, the first counted | first in ${first} |`,
    `| One, the newest joint letter first | first in ${newest} |`,
    `| All of them, for the reader to choose | on the list in ${first + later} |`
  );
  return lines.join('\n') + '\n';
}
