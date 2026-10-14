import '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { ForceAnalysisSeries } from '../../app/model/mechanism/force-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { offsetLoadFourBarFixture } from '../../test-utils/verification/force-fixtures';

// An offset load exercises moments as well as both force components. Changing
// which end wears the arrowhead must not move its point of application.
function loadedRocker(local: boolean, flips: number, keepVector: boolean, gravity: boolean) {
  const fixture = offsetLoadFourBarFixture();
  fixture.load!.local = local;
  fixture.gravity = gravity;
  const built = buildMechanism(fixture);
  const force = built.forces[0];
  const anchor = force.startCoord.clone();
  for (let i = 0; i < flips; i++) force.flipForce();
  // The same physical load drawn toward its application point instead of away
  // from it: the handle moves to the opposite side, the application stays put.
  if (keepVector) force.setComponents(...fixture.load!.vector);
  expect(force.arrowOutward).toBe(flips % 2 === 0);
  expect(force.startCoord).toEqual(anchor);
  return new Mechanism(
    built.joints,
    built.links,
    built.forces,
    [],
    gravity,
    'm',
    fixture.inputAngVel,
    'degree'
  );
}

function expectSameLoads(actual: ForceAnalysisSeries, expected: ForceAnalysisSeries, sign = 1) {
  expect(expected.frames.length).toBeGreaterThan(50);
  expect(expected.successfulFrames).toBe(expected.frames.length);
  expect(actual.successfulFrames).toBe(expected.frames.length);
  expect(actual.frames).toHaveLength(expected.frames.length);
  // Refuse an all-zero comparison: this test needs a load that reaches the solver.
  expect(
    Math.max(...expected.frames.map((frame) => Math.abs(frame.inputEffort!.valueSI)))
  ).toBeGreaterThan(1);
  const same = (value: number, reference: number) => {
    expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(value - sign * reference)).toBeLessThan(
      1e-8 * Math.max(1, Math.abs(reference))
    );
  };
  actual.frames.forEach((frame, index) => {
    const reference = expected.frames[index];
    expect(frame.status).toBe('ok');
    expect(frame.timeSeconds).toBe(reference.timeSeconds);
    expect(frame.inputEffort!.jointId).toBe(reference.inputEffort!.jointId);
    expect(frame.inputEffort!.kind).toBe(reference.inputEffort!.kind);
    same(frame.inputEffort!.valueSI, reference.inputEffort!.valueSI);
    expect([...frame.jointReactionsByLink.keys()]).toEqual([
      ...reference.jointReactionsByLink.keys(),
    ]);
    reference.jointReactionsByLink.forEach((byLink, joint) => {
      const reactions = frame.jointReactionsByLink.get(joint)!;
      expect([...reactions.keys()]).toEqual([...byLink.keys()]);
      byLink.forEach((reaction, link) => {
        same(reactions.get(link)![0], reaction[0]);
        same(reactions.get(link)![1], reaction[1]);
      });
    });
  });
}

describe('flipped force solver equivalence', () => {
  for (const local of [false, true]) {
    const name = local ? 'Local' : 'Grid';
    it(`${name}: equivalent pushing and pulling arrows give the same static and dynamic results`, () => {
      const pulling = loadedRocker(local, 0, true, true);
      const pushing = loadedRocker(local, 1, true, true);
      expect(pushing.forces.every((forces) => !forces[0].arrowOutward)).toBe(true);
      expect(pulling.forces.every((forces) => forces[0].arrowOutward)).toBe(true);
      for (const mode of ['static', 'dynamic'] as const) {
        expectSameLoads(pushing.getForceAnalysis(mode), pulling.getForceAnalysis(mode));
      }
    });

    it(`${name}: flipping the load reverses static reactions and torque; flipping twice restores them`, () => {
      // With gravity and inertia absent, reversing the only load must negate
      // every signed result, keeping its magnitude. Otherwise Flip is cosmetic.
      const original = loadedRocker(local, 0, false, false).getForceAnalysis('static');
      expectSameLoads(
        loadedRocker(local, 1, false, false).getForceAnalysis('static'),
        original,
        -1
      );
      expectSameLoads(loadedRocker(local, 2, false, false).getForceAnalysis('static'), original);
    });
  }
});
