// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { loaderBucketFixture } from '../../test-utils/verification/workshop-fixtures';
import { RealLink } from '../../app/model/link';
import { RealJoint } from '../../app/model/joint';

/**
 * A welded body is only worth drawing if it stays one body.
 *
 * The bell crank proves a weld holds two bars at an angle. What this has to
 * prove is the same thing over a shape: four bars fused at two joints, and the
 * whole outline arriving at every pose of the cycle with the same silhouette it
 * was drawn with. A weld that quietly let the scoop flex would still animate,
 * and would still be the wrong picture of a bucket.
 */
describe('a loader bucket welded out of four bars', () => {
  it('is one machine, and the bucket is one body of four', () => {
    const { mechanism, links } = buildMechanism(loaderBucketFixture());
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);

    const bucket = links.find((link) => link.id === 'AMBCD') as RealLink;
    expect(bucket).toBeDefined();
    expect(bucket.subset.map((one) => one.id).sort()).toEqual(['AM', 'CD', 'MB', 'MC']);
  });

  it('welds only where the bucket meets itself', () => {
    const { joints } = buildMechanism(loaderBucketFixture());
    const welded = joints
      .filter((joint) => joint instanceof RealJoint && joint.isWelded)
      .map((joint) => joint.id)
      .sort();
    // A weld fuses everything meeting at its joint. At the arm pin or the tilt
    // pin it would have taken the arm or the tilt link into the bucket, which
    // is a different machine wearing the same drawing.
    expect(welded).toEqual(['C', 'M']);
  });

  it('carries its whole outline rigidly through the cycle', () => {
    const { mechanism } = buildMechanism(loaderBucketFixture());
    const outline: [string, string][] = [
      ['A', 'M'],
      ['M', 'B'],
      ['M', 'C'],
      ['C', 'D'],
      // Across the weld, which is the pair a hinge would let move and a weld
      // must not: the lip against the tilt pin, opposite corners of the body.
      ['B', 'D'],
      ['A', 'D'],
    ];
    const spans = (step: number) =>
      outline.map(([from, to]) => {
        const frame = mechanism.joints[step];
        const a = frame.find((joint) => joint.id === from)!;
        const b = frame.find((joint) => joint.id === to)!;
        return Math.hypot(a.x - b.x, a.y - b.y);
      });

    const first = spans(0);
    expect(mechanism.joints.length).toBeGreaterThan(20);
    for (let step = 1; step < mechanism.joints.length; step++) {
      spans(step).forEach((length, index) => {
        // As a share of the span rather than an absolute distance: the solver
        // carries about a ten-thousandth over a whole cycle, and the spans here
        // differ in size by several times.
        //
        // What this proves is that the compound arrives at every pose with the
        // silhouette it was drawn with — including across the body, where a
        // chain of separate bars would fold. It does not isolate the weld flag,
        // which the test above it does: `subset` alone already makes one body,
        // and taking the flag away leaves the geometry rigid and only the model
        // wrong about why.
        expect(Math.abs(length - first[index]) / first[index]).toBeLessThan(1e-3);
      });
    }
  });

  it('rocks rather than going over the top, the way a loader does', () => {
    const { mechanism } = buildMechanism(loaderBucketFixture());
    const angles = mechanism.joints.map((frame) => {
      const arm = frame.find((joint) => joint.id === 'A')!;
      return Math.atan2(arm.y, arm.x);
    });
    const sweep = Math.max(...angles) - Math.min(...angles);
    expect(sweep).toBeGreaterThan(0.2);
    expect(sweep).toBeLessThan(2 * Math.PI - 0.1);
  });
});
