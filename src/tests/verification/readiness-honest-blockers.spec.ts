// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { readinessOf, ReadinessHelpers } from '../../app/model/mechanism/readiness';
import { MechanismPartition } from '../../app/model/mechanism/mechanism-partition';
import { Mechanism, MechanismFailure } from '../../app/model/mechanism/mechanism';
import { LoopSolver } from '../../app/model/mechanism/loop-solver';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * Two rules about what readiness is allowed to say (decision S25).
 *
 * The maintainer, on a drawing whose joint `E` was driven and which the panel
 * told him to drive:
 *
 * > *"you should never show a message if a mechanism is driven that says it's
 * > not driven. There should be a fallback error when you can't find a good
 * > message for it instead of defaulting if that's the current behavior."*
 *
 * So: **"Nothing drives this mechanism" may be said only when no joint of that
 * machine has Driven Input on in the drawing the reader is looking at**, and a
 * machine that will not run for a reason nothing here has a sentence for gets
 * an honest fallback rather than a red chip with nothing under it.
 *
 * The sweep below is deliberately written against a *hand-built* partition and
 * a stubbed mechanism rather than a solved fixture, because what it has to
 * cover is every `MechanismFailure` including the ones no drawing in the corpus
 * produces -- and the one case the types say cannot happen.
 */

const S = MODEL_SCALE;

/** A two-bar drawing with `E` grounded and driven, standing in for any machine. */
function drivenPartition(): MechanismPartition {
  const a = new RevJoint('A', 0, 0);
  const d = new RevJoint('D', 2 * S, 3 * S);
  const e = new RevJoint('E', 3 * S, -3 * S, true, true);
  const bar = new RealLink('ADE', [a, d, e]);
  [a, d, e].forEach((joint) => joint.links.push(bar));
  return { id: 'M1', joints: [a, d, e], ownJoints: [a, d, e], links: [bar], forces: [] };
}

/** The same drawing with nothing driven, so the sentence is true of it. */
function undrivenPartition(): MechanismPartition {
  const partition = drivenPartition();
  partition.ownJoints.forEach((joint) => ((joint as RealJoint).input = false));
  return partition;
}

/**
 * A mechanism that reports exactly the failure asked for.
 *
 * `Mechanism` decides its own failure in its constructor from a drawing, and
 * there is no drawing that produces `cycle-never-closes` and `dead-position`
 * and `hidden-freedom` on demand. The readiness sentences are a pure function
 * of the failure and the partition, so the failure is what is supplied.
 */
function failing(failure: MechanismFailure | undefined, dof = 1): Mechanism {
  const stub = Object.create(Mechanism.prototype) as Mechanism;
  Object.assign(stub, {
    _failure: failure,
    _dof: dof,
    mechanismValid: false,
    _unreachableJoints: [],
    _cycleGap: undefined,
    _unusableCylinder: undefined,
    _hiddenFreedoms: undefined,
    _addedSamples: [],
    _joints: [[]],
    _timeNum: [],
    _inputAngularVelocities: [1],
  });
  return stub;
}

const helpers: ReadinessHelpers = {
  cylinderName: (sliderId) => sliderId,
  drivenRefusal: () => undefined,
  strokeWarning: () => undefined,
  describeSpeed: () => '10.00 RPM',
};

/** Every failure the type has, so a new one arrives here rather than nowhere. */
const EVERY_FAILURE: MechanismFailure[] = [
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

describe('readiness never says a driven mechanism is not driven', () => {
  EVERY_FAILURE.forEach((failure) => {
    it(`says nothing about switching on an input for "${failure}"`, () => {
      const partition = drivenPartition();
      const readiness = readinessOf(partition, failing(failure), helpers);
      const said = readiness.checks.map((check) => `${check.title} ${check.body}`).join(' ');
      expect(said).not.toContain('Nothing drives');
      expect(said).not.toContain('switch on Driven Input');
      expect(said).not.toContain('Driven Input');
      // And it still says *something*: a red chip with nothing under it is the
      // other half of what this file is about.
      expect(readiness.checks.filter((check) => check.state === 'blocker').length).toBeGreaterThan(
        0
      );
      expect(readiness.ready).toBe(false);
    });
  });

  it('mentions the joint that is driven when the solver says none is', () => {
    const readiness = readinessOf(drivenPartition(), failing('not-driven'), helpers);
    const blocker = readiness.checks[0];
    expect(blocker.title).toBe('This mechanism could not be solved');
    expect(blocker.body).toContain('is driven at joint E');
    expect(blocker.at?.id).toBe('E');
  });

  it('still says it for a machine that really has no driven joint', () => {
    const readiness = readinessOf(undrivenPartition(), failing('not-driven'), helpers);
    expect(readiness.checks[0].title).toBe('Nothing drives this mechanism');
    expect(readiness.checks[0].body).toContain('switch on Driven Input');
  });
});

describe('a drive that cannot be driven is the cause, not a symptom', () => {
  /** The same drawing, with the drive itself refused for a reason. */
  const refusing: ReadinessHelpers = {
    ...helpers,
    drivenRefusal: () =>
      "Both of this cylinder's end joints are welded into Link ABCDE, so it cannot extend. " +
      'Unweld joint A or joint C, or drive a different joint.',
  };

  it('states the refusal and leaves the solver\u2019s downstream complaint out', () => {
    // A cylinder driven while it could extend, and welded shut afterwards, fails
    // the solve as "nothing moves when the input turns" -- which is true, and
    // sends the reader to check connections that are perfectly sound.
    const readiness = readinessOf(drivenPartition(), failing('nothing-can-move'), refusing);
    expect(readiness.checks.map((check) => check.title)).toEqual([
      'The driven joint cannot be driven',
    ]);
    expect(readiness.checks[0].body).toContain('so it cannot extend');
    expect(readiness.ready).toBe(false);
  });

  it('is said first even where the solver accepted the mechanism', () => {
    const valid = failing(undefined);
    Object.assign(valid, { mechanismValid: true });
    const readiness = readinessOf(drivenPartition(), valid, refusing);
    expect(readiness.checks[0].title).toBe('The driven joint cannot be driven');
    expect(readiness.ready).toBe(false);
  });
});

describe('the fallback when nothing here has a sentence', () => {
  it('says what is known, and what to try, for an invalid build with no failure', () => {
    const readiness = readinessOf(drivenPartition(), failing(undefined, 1), helpers);
    expect(readiness.ready).toBe(false);
    expect(readiness.checks).toHaveLength(1);
    expect(readiness.checks[0]).toEqual(
      expect.objectContaining({
        state: 'blocker',
        title: 'This mechanism could not be solved',
        action: 'Go To Joint',
      })
    );
    expect(readiness.checks[0].body).toBe(
      'It has 1 degree of freedom and is driven at joint E, and no motion came out of the pose ' +
        'it starts in. Drag a joint to start it somewhere else, or undo the last change and make ' +
        'it a step at a time.'
    );
  });

  it('says what it knows when there is no ground and no drive either', () => {
    const readiness = readinessOf(undrivenPartition(), failing(undefined, NaN), helpers);
    expect(readiness.checks[0].body).toContain('It has no ground to move against');
    expect(readiness.checks[0].body).toContain('has no driven joint');
    expect(readiness.checks[0].action).toBeUndefined();
  });

  it('uses no internal word for what went wrong', () => {
    const said = readinessOf(drivenPartition(), failing(undefined), helpers)
      .checks.map((check) => `${check.title} ${check.body}`)
      .join(' ')
      .toLowerCase();
    for (const banned of ['failure', 'undefined', 'unknown error', 'null', 'exception']) {
      expect(said, `no "${banned}" in a sentence a reader sees`).not.toContain(banned);
    }
  });

  it('is not reached by a mechanism that is simply valid', () => {
    const valid = failing(undefined);
    Object.assign(valid, { mechanismValid: true });
    const readiness = readinessOf(drivenPartition(), valid, helpers);
    expect(readiness.checks).toEqual([]);
    expect(readiness.ready).toBe(true);
  });
});

describe('a solve that throws', () => {
  // The report this file exists for was, underneath, a thrown exception: it left
  // `updateMechanism` before the machines it was building were stored, so the
  // panel described the drawing from before the edit. That throw is fixed where
  // it was. This is for the next one -- it must come back as a machine that
  // could not be solved, saying so, rather than as nothing at all.
  it('comes back as an invalid machine with the honest fallback under it', () => {
    const partition = drivenPartition();
    const thrown = vi.spyOn(LoopSolver, 'determineLoops').mockImplementation(() => {
      throw new TypeError('reading a joint nothing placed');
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let mechanism: Mechanism;
    try {
      mechanism = new Mechanism(partition.joints, partition.links, [], [], false, 'cm', 10);
    } finally {
      thrown.mockRestore();
      quiet.mockRestore();
    }
    expect(mechanism.isMechanismValid()).toBe(false);
    expect(mechanism.failure).toBe('solver-error');

    const readiness = readinessOf(partition, mechanism, helpers);
    expect(readiness.ready).toBe(false);
    expect(readiness.checks[0].title).toBe('This mechanism could not be solved');
    expect(readiness.checks[0].body).toContain('is driven at joint E');
    expect(readiness.checks[0].body).not.toContain('Driven Input');
  });
});
