import '../../app/model/joint';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';

// Force analysis of a sealed cylinder, checked against the oldest result in
// statics: the two-force member.
//
// The cylinder assembly — barrel, rod, block — touches the rest of the world at
// exactly two pins, its mounts, and (with gravity off) carries no load of its
// own. Every statics text solves machines like this boom by replacing the
// cylinder with a force along the line between its mounts; if the matrix
// solver is right, that property has to fall out of it rather than be put in.
// It exercises the floating-carrier side of the guide couple too, since a
// sealed cylinder's slot is cut into the moving barrel.

describe('force analysis of a sealed cylinder', () => {
  const build = () => {
    // At the drawing scale the driven-cylinder kinematics suite pins: a
    // cylinder's stroke is measured against objectScale, and at the wrong one
    // the ram has no travel and the mechanism never runs at all.
    const fixture = cylinderBoomFixture(MODEL_SCALE);
    // A weight hung on the boom tip. The cylinder itself stays unloaded, which
    // is what makes it a two-force member.
    fixture.load = { onLink: 'OC', at: [0, 4 * MODEL_SCALE], vector: [0, -300] };
    return buildMechanismAtScale(fixture, 1 * MODEL_SCALE).mechanism;
  };

  it('solves every frame of the loaded cylinder-driven boom', () => {
    const series = build().getForceAnalysis('static');
    expect(series.diagnostic).toBeUndefined();
    expect(series.successfulFrames).toBe(series.frames.length);
    expect(series.frames.length).toBeGreaterThan(100);
  });

  it('acts as a two-force member: mount reactions along the mount line', () => {
    const mechanism = build();
    const series = mechanism.getForceAnalysis('static');

    series.frames.forEach((frame, t) => {
      const at = (id: string) => mechanism.joints[t].find((joint) => joint.id === id)!;
      const g = at('G');
      const c = at('C');
      const span = Math.hypot(c.x - g.x, c.y - g.y);
      const along = [(c.x - g.x) / span, (c.y - g.y) / span];

      // The world pushing on the barrel at its mount, and the boom pushing on
      // the rod at the other: the only two external forces on the assembly.
      const onBarrel = frame.jointReactionsByLink.get('G')!.get('GN')!;
      const onRod = frame.jointReactionsByLink.get('C')!.get('PC')!;

      expect(onBarrel[0] + onRod[0]).toBeCloseTo(0, 6);
      expect(onBarrel[1] + onRod[1]).toBeCloseTo(0, 6);
      const magnitude = Math.hypot(onBarrel[0], onBarrel[1]);
      expect(magnitude).toBeGreaterThan(0);
      const cross = onBarrel[0] * along[1] - onBarrel[1] * along[0];
      expect(Math.abs(cross) / magnitude).toBeLessThan(1e-8);
    });
  });

  it('obeys the third law where the rod meets the boom', () => {
    const frame = build().getForceAnalysis('static').frames[30];
    const atMount = frame.jointReactionsByLink.get('C')!;
    const onRod = atMount.get('PC')!;
    const onBoom = atMount.get('OC')!;
    expect(onRod[0] + onBoom[0]).toBeCloseTo(0, 8);
    expect(onRod[1] + onBoom[1]).toBeCloseTo(0, 8);
  });
});
