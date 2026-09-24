// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { Link, RealLink } from '../../app/model/link';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { BuiltMechanism } from '../../test-utils/verification/fixture';
import { RATE_TOLERANCE, velocityAgreesWithPositions } from '../../test-utils/verification/rates';

/**
 * What a build does when the joint-by-joint walk cannot take a first step.
 *
 * The walk places joints outward from the input, and some library drawings
 * cannot be put in that order once the input is moved to another joint -- a
 * scissor lift driven from its floor pivot, a hood hinge from its grounded arm.
 * Each was reported as a dead position with advice to drag a joint off a limit
 * the drawing was not at. The simultaneous route solves every one of them, so a
 * build now asks it once before calling anything a dead position.
 */
describe('a walk that cannot start is handed to the simultaneous route', () => {
  const settings = new SettingsService();

  function decode(id: keyof typeof TEMPLATE_LINKAGES): { joints: Joint[]; links: Link[] } {
    const decoder = new StringTranscoder();
    decoder.decodeURL(TEMPLATE_LINKAGES[id]);
    const target = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true, false);
    return { joints: target.joints, links: target.links };
  }

  /** The template with its input moved to `at`, built as the service builds the machine it is in. */
  function drivenFrom(id: keyof typeof TEMPLATE_LINKAGES, at: string): Mechanism {
    const drawing = decode(id);
    drawing.joints.forEach((joint) => {
      if (joint instanceof RealJoint) joint.input = joint.id === at;
    });
    const partition = partitionMechanisms(drawing.joints, drawing.links).mechanisms.find((one) =>
      one.ownJoints.some((joint) => joint.id === at)
    )!;
    return new Mechanism(
      partition.joints,
      partition.links,
      partition.forces,
      [],
      false,
      'cm',
      1,
      'adaptive',
      new Set(partition.ownJoints.map((joint) => joint.id))
    );
  }

  /** The most any two joints of one link drift apart over the cycle, against the drawing's size. */
  function worstStretch(mechanism: Mechanism): number {
    const start = mechanism.joints[0];
    const span = Math.max(
      ...start.flatMap((a) => start.map((b) => Math.hypot(a.x - b.x, a.y - b.y)))
    );
    let worst = 0;
    mechanism.links.forEach((links, sample) => {
      for (const link of links) {
        if (!(link instanceof RealLink)) continue;
        const [first, ...rest] = link.joints;
        for (const other of rest) {
          const at0 = (id: string) => mechanism.joints[0].find((joint) => joint.id === id)!;
          const atT = (id: string) => mechanism.joints[sample].find((joint) => joint.id === id)!;
          const then = Math.hypot(
            at0(first.id).x - at0(other.id).x,
            at0(first.id).y - at0(other.id).y
          );
          const now = Math.hypot(
            atT(first.id).x - atT(other.id).x,
            atT(first.id).y - atT(other.id).y
          );
          worst = Math.max(worst, Math.abs(now - then) / span);
        }
      }
    });
    return worst;
  }

  /** How far the furthest-travelling joint gets from where it was drawn. */
  function travel(mechanism: Mechanism): number {
    let furthest = 0;
    for (const joint of mechanism.joints[0]) {
      for (const sample of mechanism.joints) {
        const there = sample.find((one) => one.id === joint.id)!;
        furthest = Math.max(furthest, Math.hypot(there.x - joint.x, there.y - joint.y));
      }
    }
    return furthest;
  }

  const walkCannotStart: [keyof typeof TEMPLATE_LINKAGES, string][] = [
    ['Scissor_Lift', 'A'],
    ['Scissor_Lift', 'S'],
    ['Hood_Hinge', 'A'],
    ['Slotted_Tool_Drive', 'E'],
    ['Cylinder_Boom', 'G'],
    ['Aircraft_Landing_Gear', 'I'],
  ];

  for (const [id, at] of walkCannotStart) {
    it(`solves ${id} driven from joint ${at}, a cycle that keeps every link rigid`, () => {
      const mechanism = drivenFrom(id, at);
      expect(mechanism.failure).toBeUndefined();
      expect(mechanism.isMechanismValid()).toBe(true);
      expect(mechanism.joints.length).toBeGreaterThan(100);
      expect(travel(mechanism)).toBeGreaterThan(0);
      expect(worstStretch(mechanism)).toBeLessThan(1e-3);
    });
  }

  for (const [id, at] of walkCannotStart) {
    it(`finds velocities for ${id} driven from joint ${at} that agree with its motion`, () => {
      // The route that placed the joints is the one the rates come from: it is
      // part of the drive state a build keeps. Differencing the positions is a
      // cross-check that does not share that route. Sampled as the app samples
      // them: at a degree apiece the scissor lift driven from its floor pivot
      // swings through only thirty samples, too coarse for the stencil's own
      // error to stay under one percent at the turn, and the app re-cuts a
      // swing that short into a full turn's worth.
      const mechanism = drivenFrom(id, at);
      const agreement = velocityAgreesWithPositions({ mechanism } as BuiltMechanism);
      expect(agreement.unsolved).toEqual([]);
      expect(agreement.stationary).toEqual([]);
      expect(agreement.compared).toBeGreaterThan(100);
      expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
    });
  }

  it('leaves the switch it borrowed as it found it', () => {
    drivenFrom('Scissor_Lift', 'A');
    expect(PositionSolver.forceCoupledRoute).toBe(false);
  });

  it('still reports a real dead center, which neither route can start from', () => {
    // The Scotch yoke driven from its yoke, drawn at the end of the stroke.
    expect(drivenFrom('Scotch_Yoke', 'C').failure).toBe('dead-position');
  });
});
