// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { forceIssues } from '../../app/model/mechanism/force-issues';
import { SECOND_ORDER_LOCK_MESSAGE } from '../../app/model/mechanism/force-solver';
import { Mechanism, MechanismFailure } from '../../app/model/mechanism/mechanism';
import { MechanismPartition } from '../../app/model/mechanism/mechanism-partition';
import { readinessOf } from '../../app/model/mechanism/readiness';
import { SetupIssue } from '../../app/model/mechanism/setup-issue';
import { textOf, wordCount } from '../../app/model/prose';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { FIXTURE_GALLERY } from '../../test-utils/verification/fixture-gallery';
import { readDrawing } from '../../test-utils/verification/follow-advice';
import { studentScenarios } from '../../test-utils/verification/student-mistakes';

/**
 * Every setup message, held to the budgets and punctuation of
 * `docs/setup-issues-spec.md` §6: a title of 3 to 7 words, a summary of 16 at
 * most, an explanation of 35 at most that names no part, fixes of 10 words at
 * most and 3 at most, and no em dash or semicolon anywhere.
 *
 * Asked of the messages the drawer actually builds rather than of a list of
 * strings, because most of them are assembled from parts and counts: every
 * drawing in the fixture gallery, a few hundred broken student drawings, every
 * way the solver can fail, and every combination force analysis can be in.
 */
describe('every setup message keeps to its budget', () => {
  const issues: { where: string; issue: SetupIssue }[] = [];
  const collect = (where: string, found: SetupIssue[]) =>
    found.forEach((issue) => issues.push({ where, issue }));

  function fromDrawing(where: string, fixture: Parameters<typeof readDrawing>[0]) {
    const { machines, stray } = readDrawing(fixture);
    machines.forEach(({ readiness }) => collect(where, readiness.checks));
    collect(where, stray);
  }

  FIXTURE_GALLERY.forEach((entry) => {
    try {
      fromDrawing(entry.name, entry.fixture);
    } catch {
      // A drawing the harness cannot build is the gallery spec's to report.
    }
  });
  studentScenarios(600, 1).forEach((scenario) =>
    fromDrawing(`seed ${scenario.seed}`, scenario.broken)
  );

  // Every failure the solver can name, on a machine that is driven and one
  // that is not: the stubbed mechanism of readiness-honest-blockers.spec.ts.
  const S = MODEL_SCALE;
  const partition = (driven: string | undefined): MechanismPartition => {
    const a = new RevJoint('A', 0, 0);
    const d = new RevJoint('D', 2 * S, 3 * S);
    const e = new RevJoint('E', 3 * S, -3 * S);
    e.ground = true;
    [a, d, e].forEach((joint) => (joint.input = joint.id === driven));
    const bar = new RealLink('ADE', [a, d, e]);
    [a, d, e].forEach((joint) => joint.links.push(bar));
    return { id: 'M1', joints: [a, d, e], ownJoints: [a, d, e], links: [bar], forces: [] };
  };
  const failing = (failure: MechanismFailure | undefined, dof: number, gap?: number) => {
    const stub = Object.create(Mechanism.prototype) as Mechanism;
    Object.assign(stub, {
      _failure: failure,
      _dof: dof,
      mechanismValid: false,
      _unreachableJoints: ['D'],
      _cycleGap: gap,
      _unusableCylinder: undefined,
      _hiddenFreedoms: 2,
      _addedSamples: [true],
      _joints: [[]],
      _timeNum: [],
      _inputAngularVelocities: [1],
      _unit: 'cm',
    });
    return stub;
  };
  const failures: MechanismFailure[] = [
    'dangling-slider',
    'mobility',
    'not-driven',
    'nothing-can-move',
    'dead-position',
    'hidden-freedom',
    'cycle-never-closes',
    'cylinder-has-no-travel',
    'solver-error',
  ];
  for (const failure of failures) {
    for (const driven of ['E', 'D', undefined]) {
      for (const [dof, gap] of [
        [1, 0.14],
        [3, 3],
        [-1, undefined],
        [NaN, undefined],
      ] as [number, number | undefined][]) {
        const readiness = readinessOf(partition(driven), failing(failure, dof, gap), {
          strokeWarning: () => undefined,
          describeSpeed: () => '10.00 RPM',
        });
        collect(`${failure} driven at ${driven ?? 'nothing'}, dof ${dof}`, readiness.checks);
      }
    }
  }

  // Every combination force analysis can be in.
  const links = ['AB', 'BC', 'CD', 'DE', 'EF'].map(
    (id) => new RealLink(id, [new RevJoint(id[0], 0, 0), new RevJoint(id[1], 1, 0)])
  );
  for (const runs of [true, false]) {
    for (const refused of [
      undefined,
      { status: 'singular' as const, message: SECOND_ORDER_LOCK_MESSAGE },
      { status: 'singular' as const, message: 'The forces do not balance.' },
      { status: 'unsupported-topology' as const },
      { status: 'missing-kinematics' as const },
      {
        status: 'invalid-properties' as const,
        message: "Link BC has a mass that isn't a usable number. Type it in the Masses table.",
      },
    ]) {
      for (const [forces, gravityOn, weighted] of [
        [0, true, false],
        [0, false, true],
        [0, false, false],
        [2, true, true],
      ] as [number, boolean, boolean][]) {
        for (const massless of [0, 1, 2, 5]) {
          collect(
            'force analysis',
            forceIssues({
              runs,
              refused,
              sharedSupport: massless === 2,
              massless: links.slice(0, massless),
              cylinders: [],
              forces,
              gravityOn,
              weighted,
            })
          );
        }
      }
    }
  }

  const budget = (text: string, most: number) => wordCount(text) <= most;
  const partName = /\b(joint|link|slider|cylinder|barrel|rod) [A-Z][A-Z0-9]*\b/;

  it('found a few thousand messages to check', () => {
    expect(issues.length).toBeGreaterThan(1000);
  });

  it('keeps every part to its length', () => {
    const over = new Set<string>();
    for (const { where, issue } of issues) {
      const title = wordCount(issue.title);
      const summary = textOf(issue.summary);
      if (title < 3 || title > 7) over.add(`title, ${title} words: "${issue.title}" (${where})`);
      if (!budget(summary, 16)) over.add(`summary: "${summary}" (${where})`);
      if (!budget(issue.explain, 35)) over.add(`explanation: "${issue.explain}" (${where})`);
      if (title + wordCount(summary) > 25) {
        over.add(`visible before Show fixes: "${issue.title}. ${summary}" (${where})`);
      }
      if (issue.fixes.length > 3) over.add(`${issue.fixes.length} fixes: "${issue.title}"`);
      for (const fix of issue.fixes.map(textOf)) {
        if (!budget(fix, 10)) over.add(`fix: "${fix}" (${where})`);
      }
    }
    expect([...over]).toEqual([]);
  });

  it('writes no em dash or semicolon, and no line that is only "or"', () => {
    const found = new Set<string>();
    for (const { issue } of issues) {
      const texts = [
        issue.title,
        textOf(issue.summary),
        issue.explain,
        issue.note ?? '',
        ...issue.fixes.map(textOf),
      ];
      for (const text of texts) {
        if (/[—;]/.test(text) || /^\s*or\s*$/i.test(text)) found.add(text);
      }
    }
    expect([...found]).toEqual([]);
  });

  it('gives each part its one job', () => {
    const wrong = new Set<string>();
    for (const { where, issue } of issues) {
      if (/\.$/.test(issue.title)) wrong.add(`title ends in a period: "${issue.title}"`);
      if (issue.title[0] !== issue.title[0].toUpperCase()) {
        wrong.add(`title is not sentence case: "${issue.title}"`);
      }
      // The explanation teaches the rule, true of any drawing.
      if (partName.test(issue.explain)) wrong.add(`explanation names a part: "${issue.explain}"`);
      // A fix starts with the verb a reader does.
      for (const fix of issue.fixes.map(textOf)) {
        if (!/^[A-Z][a-z-]+ /.test(fix)) wrong.add(`fix does not start with a verb: "${fix}"`);
        if (/\b(instead|any one of these|would leave one degree of freedom)\b/i.test(fix)) {
          wrong.add(`fix frames itself: "${fix}"`);
        }
      }
      if (issue.note && issue.fixes.length) wrong.add(`note beside fixes: "${issue.title}"`);
      if (!textOf(issue.summary) || !issue.explain)
        wrong.add(`empty part: "${issue.title}" (${where})`);
    }
    expect([...wrong]).toEqual([]);
  });

  it('names the joint a fix is about as a link to it', () => {
    // Every part a fix names is one the reader can press: "Unground joint E"
    // with E drawn as a link, never as plain text.
    const plain = new Set<string>();
    for (const { issue } of issues) {
      for (const fix of issue.fixes) {
        const text = fix.filter((piece) => typeof piece === 'string').join('');
        if (partName.test(text)) plain.add(textOf(fix));
      }
      const summaryText = issue.summary.filter((piece) => typeof piece === 'string').join('');
      if (partName.test(summaryText)) plain.add(textOf(issue.summary));
    }
    expect([...plain]).toEqual([]);
  });

  it('holds joints drawn as the real thing', () => {
    // A guard on the corpus: the drawings above were built by the harness,
    // so a joint in them is a joint the app would have made.
    expect(
      issues.some(({ issue }) =>
        issue.fixes
          .flat()
          .some((piece) => typeof piece !== 'string' && piece.part instanceof RealJoint)
      )
    ).toBe(true);
  });
});
