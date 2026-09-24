// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { diagnoseMobility, MobilityFix } from '../../app/model/mechanism/free-motion';
import { describeActuatorRefusal } from '../../app/model/actuator';
import { RealJoint } from '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { ReadinessHelpers, readinessOf } from '../../app/model/mechanism/readiness';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  boomWithDanglingLinkFixture,
  bracedFourBarFixture,
  danglingLinkFixture,
  inputOnTheFrameFixture,
  lockedSliderCrankFixture,
  overGroundedFourBarFixture,
  ungroundedPivotFourBarFixture,
} from '../../test-utils/verification/mobility-fixtures';

/**
 * "This mechanism has 2 degrees of freedom" is where the app used to stop. These
 * drawings each have one right answer to the two questions a student then asks
 * -- which part is loose, and what do I change -- and every fix named has to be
 * one the count agrees with, because a suggestion that does not work is worse
 * than none.
 */
describe('which part is loose, and what would fix it', () => {
  const helpers: ReadinessHelpers = {
    cylinderName: (id: string) => id,
    drivenRefusal: () => undefined,
    strokeWarning: () => undefined,
    describeSpeed: () => '10.00 RPM',
  };

  function built(fixture: MechanismFixture) {
    const drawing = buildMechanism(fixture);
    const { mechanisms } = partitionMechanisms(drawing.joints, drawing.links, drawing.forces);
    return { partition: mechanisms[0], mechanism: drawing.mechanism };
  }

  function checkFor(fixture: MechanismFixture) {
    const { partition, mechanism } = built(fixture);
    const readiness = readinessOf(partition, mechanism, helpers);
    expect(readiness.ready).toBe(false);
    return readiness.checks[0];
  }

  const describeFix = (fix: MobilityFix): string =>
    fix.kind === 'delete-link' ? `${fix.kind} ${fix.link.id}` : `${fix.kind} ${fix.joint.id}`;

  describe('too many degrees of freedom', () => {
    it('names the links that fold with the input held, and grounds the pivot that was missed', () => {
      const { partition } = built(ungroundedPivotFourBarFixture());
      const diagnosis = diagnoseMobility(partition);
      expect(diagnosis.looseLinks.map((link) => link.id)).toEqual(['BC', 'CD']);
      expect(diagnosis.fixes.map(describeFix)).toEqual(['ground D']);

      const check = checkFor(ungroundedPivotFourBarFixture());
      expect(check.title).toBe('This mechanism has 3 degrees of freedom');
      expect(check.body).toBe(
        'With the input held still, links BC and CD can still move, so the input alone cannot ' +
          'say where they go. Grounding joint D would leave one degree of freedom.'
      );
      expect(check.at?.id).toBe('D');
      expect(check.action).toBe('Go To Joint');
    });

    it('offers no ground that does not work, and says where a link would finish it', () => {
      // Grounding C is the old advice ("ground another joint"), and it leaves
      // the pair rigid rather than mobile.
      const { partition } = built(danglingLinkFixture());
      const diagnosis = diagnoseMobility(partition);
      expect(diagnosis.fixes).toEqual([]);
      expect(diagnosis.attachAt?.id).toBe('C');

      const check = checkFor(danglingLinkFixture());
      expect(check.body).toContain('link BC can still move');
      expect(check.body).toContain('Attach a link from joint C to a new grounded joint');
      expect(check.body).not.toContain('Grounding');
      expect(check.at?.id).toBe('C');
    });

    it('holds a cylinder input along its own axis, and never names a joint the cylinder places', () => {
      const { partition } = built(boomWithDanglingLinkFixture());
      const diagnosis = diagnoseMobility(partition);
      expect(diagnosis.looseLinks.map((link) => link.id)).toEqual(['CE']);
      expect(diagnosis.looseJoints.map((joint) => joint.id)).toEqual(['E']);

      const check = checkFor(boomWithDanglingLinkFixture());
      expect(check.body).toContain('link CE can still move');
      // N is the barrel's buried inner end and P the square the rod slides on.
      expect(check.body).not.toMatch(/\b[NP]\b/);
      expect(check.at?.id).toBe('E');
    });
  });

  describe('none, or fewer', () => {
    it('finds the brace', () => {
      const { partition } = built(bracedFourBarFixture());
      expect(diagnoseMobility(partition).fixes.map(describeFix)).toEqual(['delete-link BD']);

      const check = checkFor(bracedFourBarFixture());
      expect(check.title).toBe('This mechanism has 0 degrees of freedom');
      expect(check.body).toBe(
        'It is over-constrained, so nothing can move at all. Deleting link BD would leave one ' +
          'degree of freedom.'
      );
      expect(check.at?.id).toBe('BD');
      expect(check.action).toBe('Go To Link');
    });

    it('finds the ground that is one too many, and does not take the coupler away', () => {
      // Deleting BC also leaves one freedom, a crank turning on its own, and
      // is not offered for that reason.
      const { partition } = built(overGroundedFourBarFixture());
      expect(diagnoseMobility(partition).fixes.map(describeFix)).toEqual(['unground C']);
      expect(checkFor(overGroundedFourBarFixture()).body).toContain(
        'Ungrounding joint C would leave one degree of freedom.'
      );
    });

    it('lets a Prismatic slider turn, and does not delete the rod to get there', () => {
      // Deleting BC also leaves one freedom -- the crank's -- by stranding the
      // slider. That is taking the mechanism apart, and it is not offered.
      const { partition } = built(lockedSliderCrankFixture());
      expect(diagnoseMobility(partition).fixes.map(describeFix)).toEqual(['pin-in-slot C']);
      expect(checkFor(lockedSliderCrankFixture()).body).toContain(
        'Making joint C a Pin-in-slot would leave one degree of freedom.'
      );
    });
  });

  describe('an input on a link grounded at both ends', () => {
    it('says the input cannot turn, and why, rather than that there is none', () => {
      const drawing = buildMechanism(inputOnTheFrameFixture());
      const { mechanisms } = partitionMechanisms(drawing.joints, drawing.links, drawing.forces);
      expect(mechanisms.length).toBe(1);
      const partition = mechanisms[0];
      // AB is frame, so the machine is BC alone and the input is nobody's.
      expect(partition.ownJoints.map((joint) => joint.id).sort()).toEqual(['B', 'C']);
      // Built the way the service builds it: handed only the joints it owns,
      // which is what cleared the input and produced "No input is set".
      const mechanism = new Mechanism(
        partition.joints,
        partition.links,
        partition.forces,
        [],
        false,
        'm',
        1,
        'degree',
        new Set(partition.ownJoints.map((joint) => joint.id))
      );
      const checks = readinessOf(partition, mechanism, helpers).checks;
      expect(checks.map((check) => check.title)).toEqual(['The input at joint A cannot turn']);
      expect(checks[0].body).toBe(
        'Its link is also grounded at joint B, so it cannot turn. Unground joint B so the ' +
          'input has something to drive.'
      );
      expect(checks[0].at?.id).toBe('B');
      expect(checks[0].action).toBe('Go To Joint');
    });

    it('grays the input row with the same reason', () => {
      const drawing = buildMechanism(inputOnTheFrameFixture());
      const a = drawing.joints.find((joint) => joint.id === 'A') as RealJoint;
      expect(describeActuatorRefusal(a)?.short).toBe('link is grounded');
    });
  });

  it('checks every fix it offers by counting the edited drawing', () => {
    // The fixes are counted inside the diagnosis; this makes each edit for real
    // and asks the solver's own count, so the two can never quietly disagree.
    const cases: [MechanismFixture, (fixture: MechanismFixture) => MechanismFixture][] = [
      [
        ungroundedPivotFourBarFixture(),
        (fixture) => ({
          ...fixture,
          joints: fixture.joints.map((joint) =>
            joint.id === 'D' ? { ...joint, ground: true } : joint
          ),
        }),
      ],
      [
        bracedFourBarFixture(),
        (fixture) => ({
          ...fixture,
          links: fixture.links.filter((link) => link.joints !== 'BD'),
        }),
      ],
      [
        overGroundedFourBarFixture(),
        (fixture) => ({
          ...fixture,
          joints: fixture.joints.map((joint) =>
            joint.id === 'C' ? { ...joint, ground: false } : joint
          ),
        }),
      ],
    ];
    for (const [fixture, edit] of cases) {
      const fixed = buildMechanism(edit(fixture)).mechanism;
      expect(fixed.dof).toBe(1);
      expect(fixed.isMechanismValid()).toBe(true);
    }
  });
});
