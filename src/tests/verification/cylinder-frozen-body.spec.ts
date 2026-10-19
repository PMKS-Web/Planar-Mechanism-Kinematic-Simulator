// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { fixturePayload } from '../../test-utils/verification/fixture-payload';
import {
  drivenFrozenCylinderBodyFixture,
  frozenCylinderCouplerFixture,
  weldedBarsOracleFixture,
} from '../../test-utils/verification/frozen-cylinder-fixtures';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { Joint, RealJoint } from '../../app/model/joint';
import { describeActuator, describeActuatorRefusal } from '../../app/model/actuator';
import { isFrozenCylinder } from '../../app/model/cylinder-frozen';
import { cylindersIn } from '../../app/model/cylinder';
import { assignBodies } from '../../app/model/mechanism/bodies';

/**
 * Round 4's triangle: the cylinder `C-E-D`, its barrel end welded into `CC1F`
 * and its rod end into `DEF`, the two pinned together at `F`. Copied from
 * `cylinder-both-ends-welded.spec.ts`, which is about what welding `F` does to
 * it; here it is the shape that is *not* frozen.
 */
const CYLINDER_IN_A_TRIANGLE =
  '2v.2_,1E8.5,0.1011.8C,C,0e3,Y4,0.0C1,C1,0W8,ZA,0.8D,D,0N8,aQ,0.fE,E,0UR,ZP,0,CC1F,C,C1.0F,F,0W8,RF,0..ARCC1F,CC1F,0,0,0a6,We,303e9f,C,C1,F,,CC1,CF.ARDEF,DEF,0,0,0RD,Xt,303e9f,E,D,F,,DE,DF.aRCC1,CC1,0,0,0a6,Yd,303e9f,C,C1,,.aRCF,CF,0,0,0a5,Ug,c5cae9,C,F,,.aRDE,DE,0,0,0Qn,Zw,303e9f,E,D,,.aRDF,DF,0,0,0Re,Vr,303e9f,D,F,,...N_D*3spB6m';

/**
 * A cylinder welded into one body at both ends, and the machine that carries it
 * (decision S25).
 *
 * The maintainer:
 *
 * > *"Image 2 shows this incorrect status about nothing being driven because
 * > there's something clearly being driven. ... But this one should be
 * > simulateable"*
 *
 * Both halves of that are checked here. The drawing runs, and it runs *right*:
 * the two joints the seal owns are placed by the body's own rigid motion rather
 * than by the slot equations, the rates are the rigid motion's rates, and the
 * forces are the ones the same body would report drawn as plain welded bars.
 * The second fixture is the case that matters more -- the same body used as a
 * coupler -- because a frozen cylinder is a rigid link and has to behave like
 * the ternary link it is inside a larger machine.
 */

const S = MODEL_SCALE;

/** The body's rigid placement at a sample, read off two of its joints. */
function rigidMotion(from: Joint[], to: Joint[], anchorId: string, alongId: string) {
  const at = (frame: Joint[], id: string) => frame.find((joint) => joint.id === id)!;
  const a0 = at(from, anchorId);
  const b0 = at(from, alongId);
  const a1 = at(to, anchorId);
  const b1 = at(to, alongId);
  const x0 = b0.x - a0.x;
  const y0 = b0.y - a0.y;
  const x1 = b1.x - a1.x;
  const y1 = b1.y - a1.y;
  const square = x0 * x0 + y0 * y0;
  // The rotation that carries the anchor-to-along vector onto its image.
  const cos = (x0 * x1 + y0 * y1) / square;
  const sin = (x0 * y1 - y0 * x1) / square;
  return (point: { x: number; y: number }) => ({
    x: a1.x + cos * (point.x - a0.x) - sin * (point.y - a0.y),
    y: a1.y + sin * (point.x - a0.x) + cos * (point.y - a0.y),
  });
}

/**
 * How far the body's own motion misses a joint's solved position, worst sample.
 *
 * In model units. Nothing in a solved cycle tracks its body exactly: every
 * position is recorded through `roundNumber(x, 4)` and a crank walks 360 of
 * them by repeated rotation, so the grain under all of these numbers is the
 * solver's own rounding rather than anything about cylinders. What the
 * assertions below therefore ask is that the two joints the seal owns track the
 * body *at least as closely as its ordinary pins do* -- which is the whole
 * claim: they are carried, not solved through a slot.
 */
function driftOfCarriedJoints(
  mechanism: Mechanism,
  anchorId: string,
  alongId: string,
  carried: string[]
): number {
  let worst = 0;
  for (let t = 1; t < mechanism.joints.length; t++) {
    const carry = rigidMotion(mechanism.joints[0], mechanism.joints[t], anchorId, alongId);
    for (const id of carried) {
      const was = mechanism.joints[0].find((joint) => joint.id === id)!;
      const now = mechanism.joints[t].find((joint) => joint.id === id)!;
      const want = carry(was);
      worst = Math.max(worst, Math.hypot(now.x - want.x, now.y - want.y));
    }
  }
  return worst;
}

function solvedFrozenBody(): Mechanism {
  return buildMechanismAtScale(drivenFrozenCylinderBodyFixture(S), 1 * S).mechanism;
}

function openInApp(payload: string): MechanismService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const mechanism = TestBed.inject(MechanismService);
  TestBed.inject(UrlProcessorService).updateFromURL(payload, false, true, true, false);
  return mechanism;
}

describe('a driven body with a cylinder frozen inside it', () => {
  it('runs, with one degree of freedom and a full cycle', () => {
    const mechanism = solvedFrozenBody();
    expect(mechanism.failure).toBeUndefined();
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.dof).toBe(1);
    // A crank that goes right round: one sample per degree plus the closing one.
    expect(mechanism.joints.length).toBe(361);
  });

  it('carries the seal and the buried end by the body, not through the slot', () => {
    const mechanism = solvedFrozenBody();
    // Measured against the body's own motion, taken from two joints that are
    // nothing to do with the cylinder: the pin it turns on, and the far corner.
    const carried = driftOfCarriedJoints(mechanism, 'E', 'D', ['B', 'N']);
    const pins = driftOfCarriedJoints(mechanism, 'E', 'D', ['A', 'C']);
    expect(carried / S, 'the seal and the buried end ride the body').toBeLessThan(1e-5);
    expect(carried, 'no worse than the body\u2019s own pins').toBeLessThanOrEqual(pins * 1.2);
  });

  it('keeps the part straight and the right length at every sample', () => {
    const mechanism = solvedFrozenBody();
    const at = (t: number, id: string) => mechanism.joints[t].find((joint) => joint.id === id)!;
    const span = (t: number, from: string, to: string) =>
      Math.hypot(at(t, from).x - at(t, to).x, at(t, from).y - at(t, to).y);
    const barrel = span(0, 'A', 'N');
    const rod = span(0, 'B', 'C');
    let worstLength = 0;
    let worstOff = 0;
    for (let t = 1; t < mechanism.joints.length; t++) {
      worstLength = Math.max(worstLength, Math.abs(span(t, 'A', 'N') - barrel));
      worstLength = Math.max(worstLength, Math.abs(span(t, 'B', 'C') - rod));
      // A, B, N and C on one line, which is what a cylinder's skin is drawn on.
      const axisX = at(t, 'C').x - at(t, 'A').x;
      const axisY = at(t, 'C').y - at(t, 'A').y;
      const axis = Math.hypot(axisX, axisY);
      for (const id of ['B', 'N']) {
        const offX = at(t, id).x - at(t, 'A').x;
        const offY = at(t, id).y - at(t, 'A').y;
        worstOff = Math.max(worstOff, Math.abs(offX * axisY - offY * axisX) / axis);
      }
    }
    expect(worstLength / S, 'both members keep their length').toBeLessThan(1e-5);
    expect(worstOff / S, 'A, B, N and C stay on one line').toBeLessThan(1e-5);
  });

  it('gives the seal the velocity a point of a turning body has', () => {
    const mechanism = solvedFrozenBody();
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    const speed = mechanism.inputAngularVelocities[0];
    for (const t of [10, 90, 200, 330]) {
      KinematicsSolver.determineKinematics(
        mechanism.joints[t],
        mechanism.links[t],
        mechanism.inputAngularVelocities[t]
      );
      const pin = mechanism.joints[t].find((joint) => joint.id === 'E')!;
      for (const id of ['B', 'N', 'A', 'C', 'D']) {
        const joint = mechanism.joints[t].find((one) => one.id === id)!;
        const velocity = KinematicsSolver.jointVelMap.get(id)!;
        // v = omega x r about the pin the whole body turns on.
        expect(velocity[0] / S).toBeCloseTo((-speed * (joint.y - pin.y)) / S, 9);
        expect(velocity[1] / S).toBeCloseTo((speed * (joint.x - pin.x)) / S, 9);
      }
    }
  });

  it('matches finite differences of its own samples', () => {
    const mechanism = solvedFrozenBody();
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    const t = 120;
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    const dt = mechanism.timeNum[t + 1] - mechanism.timeNum[t - 1];
    for (const id of ['B', 'N']) {
      const before = mechanism.joints[t - 1].find((joint) => joint.id === id)!;
      const after = mechanism.joints[t + 1].find((joint) => joint.id === id)!;
      const velocity = KinematicsSolver.jointVelMap.get(id)!;
      expect(velocity[0] / S).toBeCloseTo((after.x - before.x) / dt / S, 3);
      expect(velocity[1] / S).toBeCloseTo((after.y - before.y) / dt / S, 3);
    }
  });
});

describe('the forces inside a frozen cylinder', () => {
  /** The same body twice: once with the cylinder in it, once as plain bars. */
  const pair = (mode: 'static' | 'dynamic') => {
    const loaded = (fixture: ReturnType<typeof drivenFrozenCylinderBodyFixture>) => ({
      ...fixture,
      // Weight, so there is something to react against: with no load at all
      // every reaction is zero and the comparison below would pass vacuously.
      gravity: true,
    });
    const frozen = buildMechanismAtScale(
      loaded(drivenFrozenCylinderBodyFixture(S)),
      1 * S
    ).mechanism;
    const bars = buildMechanismAtScale(loaded(weldedBarsOracleFixture(S)), 1 * S).mechanism;
    return { frozen: frozen.getForceAnalysis(mode), bars: bars.getForceAnalysis(mode) };
  };

  it('solves every frame rather than refusing the shape', () => {
    const { frozen } = pair('static');
    expect(frozen.diagnostic).toBeUndefined();
    expect(frozen.successfulFrames).toBe(frozen.frames.length);
    expect(frozen.frames.length).toBe(361);
  });

  it('reports the same reactions as the same body drawn as welded bars', () => {
    for (const mode of ['static', 'dynamic'] as const) {
      const { frozen, bars } = pair(mode);
      expect(bars.successfulFrames, `${mode}: the oracle itself solves`).toBe(bars.frames.length);
      expect(frozen.successfulFrames).toBe(frozen.frames.length);
      for (const t of [0, 45, 120, 250, 359]) {
        const here = frozen.frames[t];
        const there = bars.frames[t];
        const mine = here.jointReactions.get('E')!;
        const theirs = there.jointReactions.get('E')!;
        expect(mine[0], `${mode} @${t} Ex`).toBeCloseTo(theirs[0], 6);
        expect(mine[1], `${mode} @${t} Ey`).toBeCloseTo(theirs[1], 6);
        expect(here.inputEffort?.valueSI, `${mode} @${t} torque`).toBeCloseTo(
          there.inputEffort!.valueSI,
          6
        );
      }
      // And the reactions are not all zero, which would make the above vacuous.
      const biggest = Math.max(
        ...frozen.frames.map((frame) => Math.hypot(...(frame.jointReactions.get('E') ?? [0, 0])))
      );
      expect(biggest).toBeGreaterThan(1);
    }
  });

  it('offers no force between the barrel and the rod', () => {
    // The force the two members press on each other with is internal to one
    // rigid body and statically indeterminate: infinitely many satisfy
    // equilibrium. So there is no guide couple to report, rather than a number
    // the solver made up.
    const { frozen } = pair('static');
    expect([...frozen.frames[100].guideCouples.keys()]).toEqual([]);
  });
});

describe('a frozen cylinder as a four-bar coupler', () => {
  const solved = () => buildMechanismAtScale(frozenCylinderCouplerFixture(S), 1 * S).mechanism;

  it('runs like the ternary link it is', () => {
    const mechanism = solved();
    expect(mechanism.failure).toBeUndefined();
    expect(mechanism.dof).toBe(1);
    expect(mechanism.joints.length).toBe(361);
  });

  it('carries the cylinder rigidly with the coupler', () => {
    const mechanism = solved();
    // The coupler's own two pins are the frame the cylinder is measured in.
    const carried = driftOfCarriedJoints(mechanism, 'P', 'Q', ['N', 'S']);
    const pins = driftOfCarriedJoints(mechanism, 'P', 'Q', ['A', 'C', 'D']);
    expect(carried / S).toBeLessThan(1e-5);
    expect(carried).toBeLessThanOrEqual(pins * 1.2);
  });

  it('solves its forces at every frame', () => {
    const series = solved().getForceAnalysis('static');
    expect(series.diagnostic).toBeUndefined();
    expect(series.successfulFrames).toBe(series.frames.length);
  });
});

describe('what a frozen cylinder is, and what it refuses', () => {
  it('costs no freedom, because it joins one body to itself', () => {
    const { mechanism, joints, links } = buildMechanismAtScale(
      drivenFrozenCylinderBodyFixture(S),
      1 * S
    );
    const { bodiesAt } = assignBodies(joints, links);
    const seal = joints.find((joint) => joint.id === 'B') as RealJoint;
    expect(bodiesAt(seal).size, 'one body on both sides of the seal').toBe(1);
    // One body pinned to the world, and nothing else charged for.
    expect(mechanism.dof).toBe(1);
  });

  it('is frozen by the body assignment and by the two roots alone', () => {
    const { joints, links } = buildMechanismAtScale(drivenFrozenCylinderBodyFixture(S), 1 * S);
    const { bodyOf } = assignBodies(joints, links);
    const cylinder = cylindersIn(joints)[0];
    expect(isFrozenCylinder(cylinder, bodyOf)).toBe(true);
    expect(isFrozenCylinder(cylinder)).toBe(true);
  });

  it('is not frozen when it is an ordinary cylinder', () => {
    const { joints, links } = buildMechanismAtScale(frozenCylinderCouplerFixture(S), 1 * S);
    const { bodyOf } = assignBodies(joints, links);
    // Sanity in the other direction: the coupler's cylinder *is* frozen, and
    // an ordinary one is not. The boom is the ordinary one.
    expect(isFrozenCylinder(cylindersIn(joints)[0], bodyOf)).toBe(true);
  });
});

/**
 * Round 4's triangle, which is **not** this and has to keep giving true answers.
 *
 * A cylinder whose two end joints are welded into *two* bodies that meet again
 * at a pin. The two are not one body, so the seal is a real sliding pair and
 * nothing here is frozen — and the pair is rigid to *itself* all the same,
 * because a pin and a Slide between the same two bodies take all three of the
 * freedoms between them. Which makes the slot row redundant, and Gruebler
 * cannot see that: it counts 0 and `mobility.ts` rescues it to 1. One is the
 * true answer — the rigid pair turns as one body about whatever grounds it.
 */
describe('a cylinder held by two bodies that meet at a pin', () => {
  function triangle() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const service = TestBed.inject(MechanismService);
    TestBed.inject(UrlProcessorService).updateFromURL(CYLINDER_IN_A_TRIANGLE, false, true);
    return service;
  }
  const at = (service: MechanismService, id: string) =>
    service.joints.find((joint) => joint.id === id) as RealJoint;

  it('is not frozen: its two ends are in two bodies', () => {
    const service = triangle();
    const cylinder = service.sealedStructures()[0];
    expect(cylinder.barrelRoot.id).not.toBe(cylinder.rodRoot.id);
    const { bodyOf } = assignBodies(service.joints, service.links);
    expect(isFrozenCylinder(cylinder, bodyOf)).toBe(false);
    expect(isFrozenCylinder(cylinder)).toBe(false);
    // So its seal is an ordinary sliding joint, and takes a drive like one.
    expect(typeof describeActuator(cylinder.seal)).not.toBe('string');
  });

  it('counts one freedom once it is grounded, which is the true one', () => {
    const service = triangle();
    TestBed.inject(ActiveObjService).updateSelectedObj(at(service, 'C'));
    service.toggleGround();
    service.updateMechanism(true);
    // Gruebler charges for the slot row the pin and the Slide already made
    // redundant and comes to 0; the geometry rescues it to the 1 the assembly
    // actually has — turning bodily about the pin that grounds it.
    expect(service.mechanisms[0].dof).toBe(1);
  });

  it('says nothing false when its ram is driven and cannot move', () => {
    const service = triangle();
    const active = TestBed.inject(ActiveObjService);
    active.updateSelectedObj(at(service, 'C'));
    service.toggleGround();
    active.updateSelectedObj(service.sealedStructures()[0].seal);
    service.adjustInput();
    service.updateMechanism(true);

    const readiness = service.readinessOfEachMechanism();
    const said = readiness.flatMap((one) => one.checks).map((one) => `${one.title} ${one.body}`);
    // The ram genuinely cannot move the pair, and the app says so rather than
    // telescoping the rod out of its barrel.
    expect(readiness[0].ready).toBe(false);
    expect(said.join(' ')).toContain('Nothing moves when the input turns');
    // And never the sentence this package is about: a joint *is* driven here.
    expect(said.join(' ')).not.toContain('Nothing drives');
    expect(said.join(' ')).not.toContain('switch on Driven Input');
  });

  it('refuses a drive on its seal, saying which welds to undo', () => {
    const { joints, links } = buildMechanismAtScale(drivenFrozenCylinderBodyFixture(S), 1 * S);
    void links;
    const seal = joints.find((joint) => joint.id === 'B') as RealJoint;
    expect(describeActuator(seal)).toBe(
      "Both of this cylinder's end joints are welded into Link ABCDE, so it cannot extend. " +
        'Unweld joint A or joint C, or drive a different joint.'
    );
    expect(describeActuatorRefusal(seal)?.short).toBe('cannot extend');
  });
});

describe('the frozen body in the app', () => {
  const said = (service: MechanismService) =>
    service.readinessOfEachMechanism().flatMap((one) => one.checks);

  it('opens ready, with no blocker at all', () => {
    const service = openInApp(fixturePayload(drivenFrozenCylinderBodyFixture()));
    const readiness = service.readinessOfEachMechanism();
    expect(readiness).toHaveLength(1);
    expect(readiness[0].ready).toBe(true);
    expect(said(service).filter((check) => check.state === 'blocker')).toEqual([]);
  });

  it('never says nothing drives it, because joint E does', () => {
    const service = openInApp(fixturePayload(drivenFrozenCylinderBodyFixture()));
    const driven = service.joints.find((joint) => (joint as RealJoint).input) as RealJoint;
    expect(driven.id).toBe('E');
    const text = said(service)
      .map((check) => `${check.title} ${check.body}`)
      .join(' ');
    expect(text).not.toContain('Nothing drives');
    expect(text).not.toContain('switch on Driven Input');
  });

  it('warns that the cylinder cannot extend, instead of blaming the linkage', () => {
    const service = openInApp(fixturePayload(drivenFrozenCylinderBodyFixture()));
    const warnings = said(service).filter((check) => check.state === 'warning');
    expect(warnings.map((check) => check.title)).toEqual(['A cylinder cannot extend']);
    expect(warnings[0].body).toContain('both of its end joints are welded into Link ABCDE');
    expect(warnings[0].body).toContain('Unweld joint A or joint C');
    // The reach warning is about a linkage binding on a ram, and nothing here
    // is binding on anything.
    expect(warnings[0].body).not.toContain('stroke —');
  });

  it('names no joint the reader has never been shown', () => {
    const service = openInApp(fixturePayload(drivenFrozenCylinderBodyFixture()));
    const inner = service.sealedStructures()[0].inner.id;
    const text = said(service)
      .map((check) => `${check.title} ${check.body}`)
      .join(' ');
    expect(service.visibleJoints().map((joint) => joint.id)).not.toContain(inner);
    expect(text).not.toContain(inner);
  });

  it('opens both drawings again as the same drawings', () => {
    for (const fixture of [drivenFrozenCylinderBodyFixture, frozenCylinderCouplerFixture]) {
      const service = openInApp(fixturePayload(fixture()));
      const before = service.joints.map((joint) => `${joint.id}@${joint.x},${joint.y}`).sort();
      const url = TestBed.inject(UrlGenerationService).generateUrlQuery();

      const reopened = openInApp(url);
      expect(reopened.joints.map((joint) => `${joint.id}@${joint.x},${joint.y}`).sort()).toEqual(
        before
      );
      expect(cylindersIn(reopened.joints)).toHaveLength(1);
      expect(reopened.readinessOfEachMechanism()[0].ready).toBe(true);
    }
  });

  it('grays Add Input on the seal with the reason the model gives', () => {
    const service = openInApp(fixturePayload(drivenFrozenCylinderBodyFixture()));
    const seal = service.sealedStructures()[0].seal;
    TestBed.inject(ActiveObjService).updateSelectedObj(seal);
    expect(describeActuatorRefusal(seal)?.long).toContain('so it cannot extend');
  });
});
