// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { buildMechanismAtScale, MechanismFixture } from '../../test-utils/verification/fixture';
import { weldedBoomFixture } from '../../test-utils/verification/coupled-mount-fixtures';
import { Mechanism } from '../../app/model/mechanism/mechanism';

/**
 * Statics of a ram bolted to a bracket, which is not a two-force member.
 *
 * The rule everyone knows -- replace a cylinder with a force along the line
 * between its mounts -- is a statement about a pin-ended body carrying no load
 * of its own, and `cylinder-forces.spec.ts` checks that the solver reproduces
 * it for the ordinary boom. Welding the rod into a bracket does not by itself
 * break it: the assembly still touches the world at two pins. Hanging a load
 * on the bracket does, and it is the case the existing equations were never
 * asked about.
 *
 * Nothing here is a new force law. The plan's audit found the existing
 * equilibrium model already covers these joint types -- block force rows, a
 * guide couple per Slide, compound ownership resolved recursively -- so what
 * is asserted is that they come out right, not that anything was added.
 */

const S = MODEL_SCALE;
/** Where the witness stands, from `weldedBoomFixture`. */
const WITNESS = { x: -2 * S, y: 5 * S };

function build(load?: MechanismFixture['load']): Mechanism {
  const fixture = weldedBoomFixture(S);
  if (load) fixture.load = load;
  return buildMechanismAtScale(fixture, 1 * S).mechanism;
}

/** The load a bracket carries, across the ram rather than along it. */
const TRANSVERSE = {
  onLink: 'PCW',
  at: [WITNESS.x, WITNESS.y] as [number, number],
  vector: [220, 0] as [number, number],
};

describe('a ram whose rod is welded into a bracket', () => {
  it('solves every frame, loaded and unloaded', () => {
    for (const load of [undefined, TRANSVERSE]) {
      const series = build(load).getForceAnalysis('static');
      expect(series.diagnostic).toBeUndefined();
      expect(series.successfulFrames).toBe(series.frames.length);
      expect(series.frames.length).toBeGreaterThan(100);
    }
  });

  it('is still a two-force member while nothing is hung on the bracket', () => {
    // Welding changes what the body *can* transmit, not what it does: with no
    // load on it the assembly still meets the world at two pins only, and
    // equilibrium puts both reactions on the line between them.
    const mechanism = build({ onLink: 'OC', at: [0, 4 * S], vector: [0, -300] });
    const series = mechanism.getForceAnalysis('static');

    series.frames.forEach((frame, t) => {
      const at = (id: string) => mechanism.joints[t].find((joint) => joint.id === id)!;
      const g = at('G');
      const c = at('C');
      const span = Math.hypot(c.x - g.x, c.y - g.y);
      const along = [(c.x - g.x) / span, (c.y - g.y) / span];
      const onBarrel = frame.jointReactionsByLink.get('G')!.get('GN')!;
      const onCompound = frame.jointReactionsByLink.get('C')!.get('PCW')!;

      expect(onBarrel[0] + onCompound[0]).toBeCloseTo(0, 6);
      expect(onBarrel[1] + onCompound[1]).toBeCloseTo(0, 6);
      const magnitude = Math.hypot(onBarrel[0], onBarrel[1]);
      expect(magnitude).toBeGreaterThan(0);
      expect(Math.abs(onBarrel[0] * along[1] - onBarrel[1] * along[0]) / magnitude).toBeLessThan(
        1e-8
      );
    });
  });

  it('stops being one the moment the bracket carries a load', () => {
    const mechanism = build(TRANSVERSE);
    const series = mechanism.getForceAnalysis('static');
    let worstOffAxis = 0;

    series.frames.forEach((frame, t) => {
      const at = (id: string) => mechanism.joints[t].find((joint) => joint.id === id)!;
      const g = at('G');
      const c = at('C');
      const span = Math.hypot(c.x - g.x, c.y - g.y);
      const along = [(c.x - g.x) / span, (c.y - g.y) / span];
      const onBarrel = frame.jointReactionsByLink.get('G')!.get('GN')!;
      const magnitude = Math.hypot(onBarrel[0], onBarrel[1]);
      worstOffAxis = Math.max(
        worstOffAxis,
        Math.abs(onBarrel[0] * along[1] - onBarrel[1] * along[0]) / Math.max(magnitude, 1e-9)
      );
    });

    // Not a rounding wobble off the mount line: a real transverse component,
    // which is the moment the bracket is feeding into the part.
    expect(worstOffAxis).toBeGreaterThan(0.05);
  });

  it('balances, load and all, force and moment', () => {
    // The whole of the check that matters: take the body the ram and its
    // bracket make, add up everything the outside world does to it, and it
    // must come to nothing -- in force and about a point.
    const mechanism = build(TRANSVERSE);
    const series = mechanism.getForceAnalysis('static');

    series.frames.forEach((frame, t) => {
      const at = (id: string) => mechanism.joints[t].find((joint) => joint.id === id)!;
      const g = at('G');
      const c = at('C');
      const onBarrel = frame.jointReactionsByLink.get('G')!.get('GN')!;
      const onCompound = frame.jointReactionsByLink.get('C')!.get('PCW')!;
      // The load as components: `startCoord` is where it acts and the span to
      // `endCoord` is the unit direction it was built along, scaled by `mag`.
      const force = mechanism.forces[t][0];
      const reach = Math.hypot(
        force.endCoord.x - force.startCoord.x,
        force.endCoord.y - force.startCoord.y
      );
      const applied = [
        (force.mag * (force.endCoord.x - force.startCoord.x)) / reach,
        (force.mag * (force.endCoord.y - force.startCoord.y)) / reach,
      ];

      expect(onBarrel[0] + onCompound[0] + applied[0], `x at ${t}`).toBeCloseTo(0, 5);
      expect(onBarrel[1] + onCompound[1] + applied[1], `y at ${t}`).toBeCloseTo(0, 5);

      // Moments about the barrel's own mount, so its reaction drops out.
      const moment =
        (c.x - g.x) * onCompound[1] -
        (c.y - g.y) * onCompound[0] +
        (force.startCoord.x - g.x) * applied[1] -
        (force.startCoord.y - g.y) * applied[0];
      const scale = Math.max(
        Math.hypot(onCompound[0], onCompound[1]) * Math.hypot(c.x - g.x, c.y - g.y),
        1
      );
      expect(Math.abs(moment) / scale, `moment at ${t}`).toBeLessThan(1e-5);
    });
  });

  it('obeys the third law where the bracket meets the boom', () => {
    const frame = build(TRANSVERSE).getForceAnalysis('static').frames[30];
    const atMount = frame.jointReactionsByLink.get('C')!;
    const onCompound = atMount.get('PCW')!;
    const onBoom = atMount.get('OC')!;
    expect(onCompound[0] + onBoom[0]).toBeCloseTo(0, 8);
    expect(onCompound[1] + onBoom[1]).toBeCloseTo(0, 8);
  });

  it('asks the ram for more effort when the bracket is loaded across it', () => {
    // The number a reader is actually after: what the actuator has to push.
    // A load the old two-force reading cannot see is one the effort must.
    const unloaded = build().getForceAnalysis('static').frames[30].inputEffort!;
    const loaded = build(TRANSVERSE).getForceAnalysis('static').frames[30].inputEffort!;

    expect(unloaded).toBeDefined();
    expect(loaded).toBeDefined();
    expect(Math.abs(loaded.valueSI - unloaded.valueSI)).toBeGreaterThan(1);
  });

  it('solves as a dynamic problem too, with the bodies carrying their mass', () => {
    const series = build(TRANSVERSE).getForceAnalysis('dynamic');
    expect(series.diagnostic).toBeUndefined();
    expect(series.successfulFrames).toBe(series.frames.length);
    // Inertia is a real term here, not a rounding of the static answer: the
    // ram accelerates the bracket, and the two analyses disagree because of it.
    const statics = build(TRANSVERSE).getForceAnalysis('static');
    const at = 30;
    const dynamic = series.frames[at].jointReactionsByLink.get('G')!.get('GN')!;
    const still = statics.frames[at].jointReactionsByLink.get('G')!.get('GN')!;
    expect(Math.hypot(dynamic[0] - still[0], dynamic[1] - still[1])).toBeGreaterThan(1e-6);
  });
});
