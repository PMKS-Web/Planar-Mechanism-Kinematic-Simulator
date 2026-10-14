import '../../app/model/joint';
import { Joint, PrisJoint, RealJoint } from '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * A bar welded to its block on a horizontal grounded guide, with its far end
 * a pin-in-slot riding a slot cut into the crank.
 *
 * The Slide fixes the bar's angle, so the bar can only translate along the
 * guide and its far end runs along a line parallel to it. The crank's slot
 * says where on that line the far end may be. One unknown -- how far the
 * block has slid -- and one equation, so the drawing is a mechanism, and the
 * count agrees.
 *
 * The walk solved it wrong, for a while, without a word. Nothing in it looked
 * at `rotates`: the far end was placed as a rider on the crank's slot,
 * measured from the block where it was *drawn* -- the block is a grounded
 * slider, which the walk seeds as known before it starts and which only its
 * own step ever moves -- and the block was then placed back on its guide at
 * the bar's length from the far end. Self-consistent every sample, and wrong:
 * the block sat still for the whole cycle while the bar swung through some
 * twenty-five degrees at a joint that forbids it any. Before a slider was one
 * joint the weld fused bar and block into one link, and the walk kept them
 * square through the link itself; with the weld a flag on the joint, the
 * walk had to be taught to read it.
 *
 * It reads it through `slideAssemblies` now, like the mobility count and the
 * kinematic solver do. A joint of a body a grounded Slide holds square is
 * never placed by a primitive that turns the body, and the assembly step
 * has a source for this shape: slide until the far end lands on the slot.
 */
const BAR_ON_A_SLIDE_IN_A_CRANK_SLOT =
  '2v.43,1E8.2,0.1011.6A,A,0s9,0Ch,0,,,,0VG.0B,B,0G3,Ca,0.GC,C,0nH,H2,0.DD,D,04E,Uh,0.1E,E,0UP,EW,0,ABC,B,C..ARABC,ABC,0,0,0dq,5f,c5cae9,A,B,C,,.ARDE,DE,0,0,0HJ,Mc,303e9f,D,E,,...N_s*0g65fY';

describe("a bar on a grounded Slide whose far end rides the crank's slot", () => {
  it('is that shape: a Slide at D holding DE, and E a pin-in-slot on the crank body', () => {
    // The premise, so a later change to the drawing cannot leave the rest of
    // this file asserting something about a mechanism it no longer describes.
    const { service } = buildMechanismFixture(BAR_ON_A_SLIDE_IN_A_CRANK_SLOT);
    const block = service.joints.find((joint) => joint.id === 'D') as PrisJoint;
    expect(block).toBeInstanceOf(PrisJoint);
    expect(block.ground, 'on a guide fixed in the world').toBe(true);
    expect(block.rotates, 'and welded to the bar it carries').toBe(false);
    expect(block.angle_rad, 'the guide is horizontal').toBe(0);
    expect(block.links.map((link) => link.id)).toEqual(['DE']);

    const farEnd = service.joints.find((joint) => joint.id === 'E') as PrisJoint;
    expect(farEnd).toBeInstanceOf(PrisJoint);
    expect(farEnd.rotates, 'free to turn in its slot').toBe(true);
    expect(farEnd.carrier?.id, 'the slot is cut into the crank body').toBe('ABC');
    expect([farEnd.slotJointA?.id, farEnd.slotJointB?.id]).toEqual(['B', 'C']);
    expect(farEnd.links.map((link) => link.id)).toEqual(['DE']);

    const crank = service.joints.find((joint) => joint.id === 'A') as RealJoint;
    expect(crank.ground && crank.input, 'driven at a grounded pivot').toBe(true);
  });

  describe('solved', () => {
    const { mechanism } = buildMechanismFixture(BAR_ON_A_SLIDE_IN_A_CRANK_SLOT);
    const frames = mechanism.joints;
    const at = (frame: Joint[], id: string) => frame.find((joint) => joint.id === id)!;
    const drawn = frames[0];
    const weldedAngle = Math.atan2(
      at(drawn, 'E').y - at(drawn, 'D').y,
      at(drawn, 'E').x - at(drawn, 'D').x
    );
    const barLength = Math.hypot(
      at(drawn, 'E').x - at(drawn, 'D').x,
      at(drawn, 'E').y - at(drawn, 'D').y
    );
    // The drawn pose is the reader's, not the solver's, and the walk never
    // corrects it: the far end was snapped onto the slot and then written to
    // the URL at a thousandth of a unit, which leaves it a tenth of a model
    // unit off the line. The rock passes back through that exact pose each
    // time it returns to where it started, so those frames are the drawing
    // and every other frame is the solve.
    const isDrawnPose = (frame: Joint[]) =>
      frame.every(
        (joint, index) =>
          Math.abs(joint.x - drawn[index].x) < 1e-9 && Math.abs(joint.y - drawn[index].y) < 1e-9
      );
    const solved = frames.filter((frame) => !isDrawnPose(frame));

    it('is a mechanism, and is solved as one', () => {
      expect(mechanism.dof).toBe(1);
      expect(mechanism.isMechanismValid()).toBe(true);
      expect(frames.length).toBeGreaterThan(300);
      // The drawing, its two returns, and nothing else exempt.
      expect(frames.length - solved.length).toBe(3);
    });

    it('keeps the bar at the angle it was welded at, on every sample', () => {
      for (const frame of frames) {
        const d = at(frame, 'D');
        const e = at(frame, 'E');
        // Four-decimal positions on a bar some four hundred units long leave
        // the angle good to well under a millionth of a radian.
        expect(Math.atan2(e.y - d.y, e.x - d.x)).toBeCloseTo(weldedAngle, 6);
        expect(Math.hypot(e.x - d.x, e.y - d.y)).toBeCloseTo(barLength, 3);
      }
    });

    it('slides the block along its guide, rather than leaving it where it was drawn', () => {
      const travel = frames.map((frame) => at(frame, 'D').x);
      for (const frame of frames) {
        expect(at(frame, 'D').y).toBeCloseTo(at(drawn, 'D').y, 9);
      }
      // Some hundred and thirty model units of stroke on a crank of a few
      // hundred. Before the fix this was zero to the fourth decimal.
      expect(Math.max(...travel) - Math.min(...travel)).toBeGreaterThan(100);
    });

    it("keeps the far end on the crank's slot, which is the whole of what locates the bar", () => {
      for (const frame of frames) {
        const b = at(frame, 'B');
        const c = at(frame, 'C');
        const e = at(frame, 'E');
        const dx = c.x - b.x;
        const dy = c.y - b.y;
        const separation = Math.hypot(dx, dy);
        // Off the line, and along it from the channel's midpoint. The far end
        // has to stay on the line and inside the channel.
        const off = ((e.x - b.x) * dy - (e.y - b.y) * dx) / separation;
        const along = ((e.x - (b.x + c.x) / 2) * dx + (e.y - (b.y + c.y) / 2) * dy) / separation;
        expect(Math.abs(off)).toBeLessThan(isDrawnPose(frame) ? 1 : 1e-3);
        expect(Math.abs(along)).toBeLessThanOrEqual(separation / 2 + 1e-2 * separation);
      }
    });

    it('places the block where the closed form puts it', () => {
      // The far end's height never changes, so it is the one point of the
      // crank's slot line at that height, and the block is the bar's length
      // behind it at the welded angle. Nothing here is iterative.
      const height = at(drawn, 'E').y;
      const reach = at(drawn, 'E').x - at(drawn, 'D').x;
      for (const frame of solved) {
        const b = at(frame, 'B');
        const c = at(frame, 'C');
        const slope = (c.x - b.x) / (c.y - b.y);
        const exact = b.x + (height - b.y) * slope;
        // The slope amplifies the four-decimal rounding of B and C where the
        // slot leans toward the guide, so the allowance leans with it.
        expect(Math.abs(at(frame, 'E').x - exact)).toBeLessThan(1e-3 * (1 + Math.abs(slope)));
        expect(at(frame, 'D').x).toBeCloseTo(at(frame, 'E').x - reach, 9);
      }
    });

    it('rocks, because the far end runs out of the channel before the slot can lie along the guide', () => {
      // As the crank turns the slot toward the guide's own direction, the far
      // end has to run further and further along it to stay at its height,
      // and it reaches the end of the channel first. That is a limit of the
      // travel like any other, so the crank reverses there and the drawing
      // rocks rather than turning through.
      const directions = new Set(mechanism.inputAngularVelocities.map(Math.sign));
      expect(directions.size).toBe(2);
    });

    it('finds rates that are the derivatives of the positions', () => {
      KinematicsSolver.resetVariables();
      KinematicsSolver.requiredLoops = mechanism.requiredLoops;
      const velocity: number[] = [];
      for (let t = 0; t < frames.length; t++) {
        KinematicsSolver.determineKinematics(
          frames[t],
          mechanism.links[t],
          mechanism.inputAngularVelocities[t]
        );
        const d = KinematicsSolver.jointVelMap.get('D')!;
        const e = KinematicsSolver.jointVelMap.get('E')!;
        // The bar cannot turn, so the block and the far end move as one, and
        // neither may have a vertical rate on a horizontal guide.
        expect(Math.abs(d[1])).toBeLessThan(1e-9);
        expect(e[0]).toBeCloseTo(d[0], 9);
        expect(Math.abs(e[1])).toBeLessThan(1e-9);
        velocity.push(d[0]);
      }
      // Against a central difference of the block's own positions, one sample
      // either side, away from the reversals where the difference has no
      // meaning and away from the drawn pose, which is not on the curve the
      // solve traces. The positions carry four decimals and the samples are
      // a degree apart, so a few percent of the peak is what the arithmetic
      // can promise; the solver actually agrees to a few hundredths of one.
      const dt = mechanism.timeNum[1] - mechanism.timeNum[0];
      const peak = Math.max(...velocity.map(Math.abs));
      const turning = mechanism.inputAngularVelocities;
      for (let t = 2; t < frames.length - 2; t++) {
        if (turning[t - 2] !== turning[t + 2]) continue;
        if ([t - 1, t, t + 1].some((near) => isDrawnPose(frames[near]))) continue;
        const differenced = (at(frames[t + 1], 'D').x - at(frames[t - 1], 'D').x) / (2 * dt);
        expect(Math.abs(velocity[t] - differenced)).toBeLessThan(0.03 * peak);
      }
    });
  });
});
