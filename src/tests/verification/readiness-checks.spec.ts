// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import {
  describeUnassigned,
  ReadinessHelpers,
  readinessOf,
} from '../../app/model/mechanism/readiness';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';

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
    cylinderName: (id: string) => id,
    drivenRefusal: () => undefined,
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
    const [check] = readiness.checks;
    expect(check.state).toBe('blocker');
    expect(check.title).toBe('This mechanism has 2 degrees of freedom');
    // The number, which part is loose, and what to do about it — not "invalid".
    expect(check.body).toContain('link BC can still move');
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

    const [check] = readiness.checks;
    expect(check.ways?.map((way) => way.text)).toContain(
      'Attach a link from joint C to a new grounded joint'
    );
    expect(check.body).not.toContain('Grounding joint C');
    // The counted fix is deleting BC, so that is where the button goes; the
    // free end is named in the sentence for the reader who meant to finish it.
    expect(check.at?.id).toBe('BC');
    expect(check.action).toBe('Go To Link');
  });

  it('reports the mobility first when a linkage is both loose and undriven', () => {
    // Both are wrong, and the order matters: giving this an input would not
    // make it run, so sending the reader to add one first wastes the fix.
    const readiness = checksFor({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true },
        { id: 'B', x: 1, y: 0 },
        { id: 'C', x: 2, y: 0 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }],
      inputAngVel: 1,
    });

    expect(readiness.checks[0].title).toBe('This mechanism has 2 degrees of freedom');
  });

  it('names a joint that could take the drive when nothing is driven', () => {
    const readiness = checksFor({
      ...workingFourBar,
      joints: workingFourBar.joints.map((joint) => ({ ...joint, input: false })),
    });

    expect(readiness.checks).toHaveLength(1);
    const [check] = readiness.checks;
    expect(check.title).toBe('No input is set');
    // Points at a joint that can actually take the job, so the button is an
    // answer rather than a place to start looking.
    expect(check.at).toBeDefined();
    expect(check.action).toBe('Go To Joint');
    expect(check.body).toMatch(/Right-click joint [A-Z] and set it as the input/);
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

    const [check] = readiness.checks;
    expect(check.title).toBe('A slider has nothing to slide along');
    expect(check.body).toMatch(/Drag it onto a link to cut a slot, or ground it/);
    expect(check.at).toBeDefined();
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
    const readiness = checksFor(workingFourBar, {
      ...noHelpers,
      drivenRefusal: () =>
        'A slider’s block is a single point, so there is no angle to turn it through.',
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks).toHaveLength(1);
    expect(readiness.checks[0].state).toBe('blocker');
    expect(readiness.checks[0].title).toBe('This joint cannot be an input');
  });

  it('treats a cylinder that cannot use its whole stroke as a warning, not a blocker', () => {
    const readiness = checksFor(workingFourBar, {
      ...noHelpers,
      strokeWarning: () => 'Cylinder AB can only use 40% of its stroke — the linkage binds first.',
    });

    // It runs, and every number it reports is right; there is simply something
    // about the result worth knowing.
    expect(readiness.ready).toBe(true);
    expect(readiness.checks).toHaveLength(1);
    expect(readiness.checks[0].state).toBe('warning');
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
    const reports = describeUnassigned(unassigned);

    expect(reports).toHaveLength(2);
    // One link on its own is named as one, with the two ways out a reader has.
    expect(reports[0].title).toBe('Link EF is attached to nothing');
    expect(reports[0].body).toMatch(
      /Delete it, or ground one of its joints to make it a mechanism of its own/
    );
    expect(reports[1].title).toBe('Joint G has no link');
    expect(reports[1].body).toMatch(/Attach a link to it, or delete it/);
  });
});
