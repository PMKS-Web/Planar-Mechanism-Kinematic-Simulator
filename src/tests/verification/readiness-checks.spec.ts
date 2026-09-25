// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { ReadinessHelpers, readinessOf } from '../../app/model/mechanism/readiness';
import { unassignedIssues } from '../../app/model/mechanism/unassigned-issues';
import { Cylinder } from '../../app/model/cylinder';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { read } from '../../test-utils/verification/issue-text';

/**
 * What the app tells a student who has pressed play and got nothing.
 *
 * Every one of these situations used to arrive as the same silence, or at best
 * as one first-blocker-wins sentence about the whole drawing. What is checked
 * here is not that a message exists but that it is the *right* message for the
 * solver's actual reason, and that it names a way out — a blocker that only
 * describes the wall leaves the reader exactly where they were.
 */
describe('why a mechanism will not run', () => {
  const noHelpers: ReadinessHelpers = {
    strokeWarning: () => undefined,
    describeSpeed: () => '20.00 RPM CCW',
  };

  function checksFor(fixture: MechanismFixture, helpers = noHelpers) {
    const built = buildMechanism(fixture);
    const { mechanisms } = partitionMechanisms(built.joints, built.links, built.forces);
    return readinessOf(mechanisms[0], built.mechanism, helpers);
  }

  const workingFourBar: MechanismFixture = {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 0, y: 1 },
      { id: 'C', x: 3, y: 2 },
      { id: 'D', x: 4, y: 0, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    inputAngVel: 1,
  };

  it('says nothing at all about a mechanism that runs', () => {
    const readiness = checksFor(workingFourBar);

    expect(readiness.ready).toBe(true);
    expect(readiness.checks).toEqual([]);
  });

  it('counts the degrees of freedom rather than calling the linkage invalid', () => {
    // Grounded at one end only, so the chain flaps: mobility 2.
    const readiness = checksFor({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 1, y: 0 },
        { id: 'C', x: 2, y: 0 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }],
      inputAngVel: 1,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks).toHaveLength(1);
    const check = read(readiness.checks[0]);
    expect(check.severity).toBe('blocker');
    expect(check.title).toBe('2 degrees of freedom, needs 1');
    // The number, which part is loose, and what to do about it — not "invalid".
    expect(check.summary).toBe('With the input held still, link BC can still move.');
  });

  it('points at the free end that carries the extra freedom', () => {
    // Same loose chain: C hangs on one link, and that is where the second
    // degree of freedom lives. Grounding C would leave the pair rigid, so the
    // way out is a link from C to ground, and the button goes there.
    const readiness = checksFor({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 1, y: 0 },
        { id: 'C', x: 2, y: 0 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }],
      inputAngVel: 1,
    });

    const check = read(readiness.checks[0]);
    expect(check.fixes).toContain('Attach a grounded link at joint C');
    expect(check.fixes).not.toContain('Ground joint C');
    // The counted fix is deleting BC, so it comes first; the free end is named
    // for the reader who meant to finish the four-bar.
    expect(check.fixes[0]).toBe('Delete link BC');
    expect(check.parts).toEqual(expect.arrayContaining(['BC', 'C']));
  });

  it('reports the mobility first, and the missing input beside it', () => {
    // Both are wrong, and the order matters: giving this an input would not
    // make it run, so the count is first. Neither waits on the other, so both
    // are said at once.
    const readiness = checksFor({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true },
        { id: 'B', x: 1, y: 0 },
        { id: 'C', x: 2, y: 0 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }],
      inputAngVel: 1,
    });

    expect(readiness.checks.map((check) => check.title)).toEqual([
      '2 degrees of freedom, needs 1',
      'No input is set',
    ]);
  });

  it('names a joint that could take the drive when nothing is driven', () => {
    const readiness = checksFor({
      ...workingFourBar,
      joints: workingFourBar.joints.map((joint) => ({ ...joint, input: false })),
    });

    expect(readiness.checks).toHaveLength(1);
    const check = read(readiness.checks[0]);
    expect(check.title).toBe('No input is set');
    // Names a joint that can actually take the job, so the fix is an answer
    // rather than a place to start looking.
    expect(check.fixes).toEqual([expect.stringMatching(/^Set joint [A-Z] as the input$/)]);
    expect(check.parts).toHaveLength(1);
  });

  it('names the slider when one has nothing to slide along', () => {
    // The slider is a joint of the grounded chain, so it is part of that
    // mechanism. A detached slider hanging off nothing else is a different
    // situation entirely -- it never reaches ground, so it is unassigned
    // geometry rather than a broken mechanism, and the case below covers it.
    const readiness = checksFor({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
      sliders: [{ at: 'C', on: { carrier: 'AB', a: 'A', b: 'B' } }],
      // The joint that slides, not a prismatic twin beside it: a slider is one
      // joint now, and C is the letter it kept.
      detach: ['C'],
      inputAngVel: 1,
    });

    const check = read(readiness.checks[0]);
    expect(check.title).toBe('Slider C has no slot');
    expect(check.fixes).toEqual([
      'Drag slider C onto a link to cut a slot',
      'Ground slider C to fix its direction',
    ]);
  });

  it('leaves a good linkage alone when a detached slider floats beside it', () => {
    // Splitting the drawing changed this for the better: the four-bar used to
    // be dragged down by the dangling slider, because both were one mechanism.
    // Now the slider simply never reaches ground.
    const built = buildMechanism({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 1.5, y: 1.5 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
      sliders: [{ at: 'E', on: { carrier: 'BC', a: 'B', b: 'C' } }],
      detach: ['E'],
      inputAngVel: 1,
    });
    const { mechanisms, unassigned } = partitionMechanisms(built.joints, built.links, built.forces);

    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0].joints.map((j) => j.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(unassigned.floatingChains.length + unassigned.looseJoints.length).toBeGreaterThan(0);
  });

  it('reports a drive the actuator cannot describe, even on a solved mechanism', () => {
    // The refusal is asked of every mechanism, not only broken ones: the toggle
    // guards this, but a later edit can add a third body to a joint that was
    // legitimately driven when it was switched on.
    const built = buildMechanism(workingFourBar);
    const { mechanisms } = partitionMechanisms(built.joints, built.links, built.forces);
    // A brace drawn from the input's pivot after the input was set, and after
    // the solve: the pivot now joins three bodies.
    const [a, c] = ['A', 'C'].map((id) => built.joints.find((one) => one.id === id) as RealJoint);
    a.links.push(new RealLink('AC', [a, c]));
    const readiness = readinessOf(mechanisms[0], built.mechanism, noHelpers);

    expect(readiness.ready).toBe(false);
    expect(readiness.checks[0].severity).toBe('blocker');
    expect(readiness.checks[0].title).toMatch(/^Joint A (can't be the input|has 2 links to turn)$/);
  });

  it('treats a cylinder that cannot use its whole stroke as a warning, not a blocker', () => {
    const built = buildMechanism(workingFourBar);
    const [a, b] = ['A', 'B'].map((id) => built.joints.find((one) => one.id === id)!);
    const barrel = built.links.find((link) => link.id === 'AB')!;
    const cylinder = { barrel, mountA: a, mountB: b } as unknown as Cylinder;
    const readiness = checksFor(workingFourBar, {
      ...noHelpers,
      strokeWarning: () => ({ cylinder, percent: 40 }),
    });

    // It runs, and every number it reports is right; there is simply something
    // about the result worth knowing.
    expect(readiness.ready).toBe(true);
    expect(readiness.checks).toHaveLength(1);
    expect(readiness.checks[0].severity).toBe('warning');
    expect(readiness.checks[0].title).toBe('Cylinder AB uses 40% of its stroke');
  });

  it('tells a floating chain what it is missing, and a lone joint what it is', () => {
    const built = buildMechanism({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 0, y: 6 },
        { id: 'F', x: 2, y: 7 },
        { id: 'G', x: 9, y: 9 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }, { joints: 'EF' }],
      inputAngVel: 1,
    });
    const { unassigned } = partitionMechanisms(built.joints, built.links, built.forces);
    const reports = unassignedIssues(unassigned).map(read);

    expect(reports).toHaveLength(2);
    // One link on its own is named as one, with the two ways out a reader has.
    expect(reports[0].title).toBe('Link EF is attached to nothing');
    expect(reports[0].fixes).toEqual(['Ground joint E', 'Delete link EF']);
    expect(reports[1].title).toBe('Joint G has no link');
    expect(reports[1].fixes).toEqual(['Attach a link to joint G', 'Delete joint G']);
  });
});
