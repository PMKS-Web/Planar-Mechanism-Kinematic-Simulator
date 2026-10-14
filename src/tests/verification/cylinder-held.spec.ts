// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { fixturePayload } from '../../test-utils/verification/fixture-payload';
import {
  followerCylinderFixture,
  heldCouplerFixture,
  heldCylinderTriangleFixture,
  mixedCylinderFixture,
} from '../../test-utils/verification/held-cylinder-fixtures';
import { velocityAgreesWithPositions } from '../../test-utils/verification/rates';
import { cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { Joint, PrisJoint, RealJoint } from '../../app/model/joint';
import { Link } from '../../app/model/link';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { cylinderHolds } from '../../app/model/mechanism/cylinder-hold';
import { readinessOf, ReadinessHelpers } from '../../app/model/mechanism/readiness';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { cylindersIn } from '../../app/model/cylinder';

/**
 * A cylinder nothing drives holds its length (decision S28).
 *
 * The four fixtures are the whole argument: two drawings that run only because
 * their passive rams hold, one that must never hold because the machine itself
 * moves its ram, and one with both kinds in one machine.
 */

const S = MODEL_SCALE;

function built(fixture: ReturnType<typeof heldCouplerFixture>) {
  return buildMechanismAtScale(fixture, 1 * S);
}

const triangle = () => built(heldCylinderTriangleFixture(S));
const coupler = () => built(heldCouplerFixture(S));
const follower = () => built(followerCylinderFixture(S));
const mixed = () => built(mixedCylinderFixture(S));

/** The seals holding their length, as a sorted list so an order cannot hide. */
function heldSeals(joints: Joint[], links: Link[]): string[] {
  return [...cylinderHolds(joints, links).held].sort();
}

describe('which cylinders hold their length', () => {
  it('holds all three of the triangle, so it turns as one rigid body', () => {
    const { mechanism, joints, links } = triangle();
    expect(heldSeals(joints, links)).toEqual(['B', 'D', 'F']);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.joints.length).toBeGreaterThan(300);
  });

  it('holds the four-bar coupler, and the count drops from two to one', () => {
    const { mechanism, joints, links } = coupler();
    expect(heldSeals(joints, links)).toEqual(['S']);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
  });

  it('never holds a cylinder the machine itself moves', () => {
    const { mechanism, joints, links } = follower();
    expect(heldSeals(joints, links)).toEqual([]);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    // The whole point of the follower: its length changes as the crank turns.
    const along = (frame: number) => {
      const at = (id: string) => mechanism.joints[frame].find((joint) => joint.id === id)!;
      return Math.hypot(at('P').x - at('G').x, at('P').y - at('G').y);
    };
    const spans = mechanism.joints.map((_, frame) => along(frame));
    expect(Math.max(...spans) - Math.min(...spans)).toBeGreaterThan(0.2 * S);
  });

  it('holds only the surplus ram where a machine has one of each', () => {
    const { mechanism, joints, links } = mixed();
    // `T` is the ram on the dyad nothing determines; `S` is the strut the
    // four-bar moves, and holding it would make a structure of a mechanism.
    expect(heldSeals(joints, links)).toEqual(['T']);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
  });

  it('answers the same however the cylinders are listed', () => {
    const { joints, links } = triangle();
    const forwards = heldSeals(joints, links);
    const backwards = heldSeals([...joints].reverse(), [...links].reverse());
    expect(backwards).toEqual(forwards);
    const shuffled = heldSeals(
      [...joints].sort((a, b) => b.id.localeCompare(a.id)),
      [...links].sort((a, b) => b.id.localeCompare(a.id))
    );
    expect(shuffled).toEqual(forwards);
  });

  it('leaves a driven cylinder and its templates alone', () => {
    const boom = built(cylinderBoomFixture(S));
    expect(heldSeals(boom.joints, boom.links)).toEqual([]);
    expect(boom.mechanism.isMechanismValid()).toBe(true);
  });
});

describe('what a held machine solves to', () => {
  it('keeps every held cylinder exactly its drawn length at every sample', () => {
    const { mechanism, joints, links } = triangle();
    const parts = cylindersIn(joints);
    void links;
    for (const cylinder of parts) {
      const ends = [cylinder.mountA.id, cylinder.mountB.id];
      const spanAt = (frame: number) => {
        const at = (id: string) => mechanism.joints[frame].find((joint) => joint.id === id)!;
        const [a, b] = ends.map(at);
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      const drawn = spanAt(0);
      for (let frame = 0; frame < mechanism.joints.length; frame += 17) {
        expect(Math.abs(spanAt(frame) - drawn) / S).toBeLessThan(1e-3);
      }
    }
  });

  it('carries the seal along its own bore without drift', () => {
    const { mechanism, joints } = triangle();
    for (const cylinder of cylindersIn(joints)) {
      const alongAt = (frame: number) => {
        const at = (id: string) => mechanism.joints[frame].find((joint) => joint.id === id)!;
        const a = at(cylinder.mountA.id);
        const seal = at(cylinder.seal.id);
        return Math.hypot(seal.x - a.x, seal.y - a.y);
      };
      const drawn = alongAt(0);
      for (let frame = 0; frame < mechanism.joints.length; frame += 23) {
        expect(Math.abs(alongAt(frame) - drawn) / S).toBeLessThan(1e-3);
      }
    }
  });

  it('gives every part of a held machine rates its own positions agree with', () => {
    const agreement = velocityAgreesWithPositions(triangle());
    expect(agreement.compared).toBeGreaterThan(50);
    expect(agreement.unsolved).toEqual([]);
    expect(agreement.worst).toBeLessThan(0.05);
  });
});

/**
 * A held cylinder against the plain bar it stands for.
 *
 * The oracle the rule promises: replace the ram by a rigid bar of the same mass
 * and center of mass, and every external reaction and the input torque have to
 * agree. The four-bar is the fixture to ask it of, because it is determinate
 * both ways -- the triangle is not, and says so (see below).
 */
function barInsteadOfCylinder(scale: number) {
  const fixture = heldCouplerFixture(scale);
  const { sliders, welds, ...rest } = fixture;
  void sliders;
  return {
    ...rest,
    // The two members become one bar between the same two mounts, carrying
    // both of their masses.
    joints: rest.joints.filter((joint) => !['N', 'S'].includes(joint.id)),
    links: [{ joints: 'AB' }, { joints: 'BC', mass: 2, moi: 2 }, { joints: 'CD' }],
    welds: (welds ?? []).filter((id) => id !== 'S'),
  };
}

describe('the forces a held cylinder carries', () => {
  it('reports the same reactions as the bar it stands for', () => {
    const ram = built(heldCouplerFixture(S));
    const bar = built(barInsteadOfCylinder(S));
    const frameOf = (one: typeof ram) =>
      ForceSolver.analyzeFrame(
        one.mechanism.joints[0],
        one.mechanism.links[0],
        'static',
        true,
        'cm'
      );
    const withRam = frameOf(ram);
    const withBar = frameOf(bar);
    expect(withRam.status).toBe('ok');
    expect(withBar.status).toBe('ok');
    for (const id of ['A', 'D']) {
      const a = withRam.jointReactions.get(id)!;
      const b = withBar.jointReactions.get(id)!;
      expect(a[0]).toBeCloseTo(b[0], 6);
      expect(a[1]).toBeCloseTo(b[1], 6);
    }
    expect(withRam.inputEffort!.valueSI).toBeCloseTo(withBar.inputEffort!.valueSI, 6);
  });

  it('names the holding force, and the seal it holds balances', () => {
    const { mechanism } = built(heldCouplerFixture(S));
    const frame = ForceSolver.analyzeFrame(
      mechanism.joints[0],
      mechanism.links[0],
      'static',
      true,
      'cm'
    );
    expect(frame.status).toBe('ok');
    const holding = frame.holdingForces.get('S');
    expect(holding).toBeDefined();
    expect(Number.isFinite(holding!)).toBe(true);
    expect(Math.abs(holding!)).toBeGreaterThan(0);

    // The seal's own free body: everything that pushes on it -- the slot's
    // normal force, the pin it shares with the rod -- plus the axial hold, and
    // its own weight. A massless seal balances at zero.
    const seal = mechanism.joints[0].find((joint) => joint.id === 'S')! as PrisJoint;
    const onSeal = frame.jointReactionsByLink.get('S')!.get('S')!;
    const axis = [Math.cos(seal.slotAngle), Math.sin(seal.slotAngle)];
    expect(onSeal[0] + holding! * axis[0]).toBeCloseTo(0, 6);
    expect(onSeal[1] + holding! * axis[1]).toBeCloseTo(0, 6);
  });

  it('holds exactly the axial pull of a massless rod', () => {
    // With the rod weightless the ram is a two-force member: what it holds is
    // the axial component of the pin force at the far mount, and nothing else.
    const weightless = heldCouplerFixture(S);
    weightless.links = weightless.links.map((link) =>
      link.joints === 'CS' ? { ...link, mass: 0, moi: 0 } : link
    );
    const { mechanism } = built(weightless);
    const frame = ForceSolver.analyzeFrame(
      mechanism.joints[0],
      mechanism.links[0],
      'static',
      true,
      'cm'
    );
    expect(frame.status).toBe('ok');
    const seal = mechanism.joints[0].find((joint) => joint.id === 'S')!;
    const far = mechanism.joints[0].find((joint) => joint.id === 'C')!;
    const span = Math.hypot(far.x - seal.x, far.y - seal.y);
    const axis = [(far.x - seal.x) / span, (far.y - seal.y) / span];
    const atFar = frame.jointReactionsByLink.get('C')!.get('CS')!;
    const along = atFar[0] * axis[0] + atFar[1] * axis[1];
    expect(Math.abs(along)).toBeCloseTo(Math.abs(frame.holdingForces.get('S')!), 6);
  });

  it('says a triangle of held cylinders is indeterminate, as its bars would be', () => {
    const { mechanism } = triangle();
    const frame = ForceSolver.analyzeFrame(
      mechanism.joints[0],
      mechanism.links[0],
      'static',
      true,
      'cm'
    );
    // Two bodies pinned at two points share their load in no unique way. It is
    // the drawing that is indeterminate, not the held cylinder: the same shape
    // drawn as plain bars reports the same thing.
    expect(frame.status).toBe('unsupported-topology');
    expect(frame.message).toContain('more supports');
  });
});

/** The four stubs `readinessOf` needs, none of which these cases exercise. */
const helpers: ReadinessHelpers = {
  cylinderName: (id) => id,
  drivenRefusal: () => undefined,
  strokeWarning: () => undefined,
  describeSpeed: () => '10 RPM',
};

function readinessFor(one: ReturnType<typeof triangle>) {
  const { mechanisms } = partitionMechanisms(one.joints, one.links, one.forces);
  return readinessOf(mechanisms[0], one.mechanism, helpers);
}

describe('what the reader is told', () => {
  it('names the cylinders, their length and how to make one move', () => {
    const readiness = readinessFor(triangle());
    const note = readiness.checks.find((check) => check.state === 'note')!;
    expect(note.title).toBe('Cylinders are holding their length');
    expect(note.body).toContain('cylinders AC, CE and EA');
    expect(note.body).toContain('holds the length it was drawn at');
    expect(note.body).toContain('Driven Input');
    // A note is not a fault, so it does not stop the machine being ready.
    expect(readiness.checks.some((check) => check.state === 'blocker')).toBe(false);
    expect(readiness.ready).toBe(true);
  });

  it('shows the effective mobility, not the count', () => {
    const readiness = readinessFor(triangle());
    const dof = readiness.facts.find((fact) => fact.label === 'Degrees of freedom')!;
    expect(dof.value).toBe('1');
    expect(dof.bad).toBe(false);
  });

  it('never names a joint the reader has not been shown', () => {
    const one = triangle();
    const interior = cylindersIn(one.joints).map((cylinder) => cylinder.inner.id);
    expect(interior.length).toBe(3);
    const readiness = readinessFor(one);
    const said = readiness.checks
      .map((check) => `${check.title} ${check.body}`)
      .concat(readiness.facts.map((fact) => `${fact.label} ${fact.value}`))
      .join(' ');
    for (const id of interior) {
      expect(new RegExp(`\\b${id}\\b`).test(said)).toBe(false);
    }
  });

  it('says nothing drives it, rather than counting freedoms, with the input off', () => {
    const undriven = heldCylinderTriangleFixture(S);
    undriven.joints = undriven.joints.map((joint) =>
      joint.input ? { ...joint, input: false } : joint
    );
    const one = built(undriven);
    // Holding the three rams leaves exactly the one freedom an input would
    // drive, so the true blocker is the missing drive.
    expect(one.mechanism.dof).toBe(1);
    expect(one.mechanism.failure).toBe('not-driven');
    const readiness = readinessFor(one);
    const blocker = readiness.checks.find((check) => check.state === 'blocker')!;
    expect(blocker.title).toBe('Nothing drives this mechanism');
    expect(blocker.body).not.toContain('degrees of freedom');
  });
});

describe('nothing about a held cylinder is stored', () => {
  it('is derived again from a URL, which says nothing about it', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const service = TestBed.inject(MechanismService);
    const payload = fixturePayload(heldCylinderTriangleFixture(S), 1 * S);
    TestBed.inject(UrlProcessorService).updateFromURL(payload, false, true);
    expect(service.mechanisms[0]?.isMechanismValid()).toBe(true);
    expect([...(service.mechanisms[0] as Mechanism).heldCylinderSeals].sort()).toEqual([
      'B',
      'D',
      'F',
    ]);
    // Shared onward and reopened, it is the same machine holding the same
    // three lengths -- the codec carries no bit that could have said so.
    const again = TestBed.inject(UrlGenerationService).generateUrlQuery();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reopened = TestBed.inject(MechanismService);
    TestBed.inject(UrlProcessorService).updateFromURL(again, false, true);
    expect(reopened.mechanisms[0]?.isMechanismValid()).toBe(true);
    expect([...(reopened.mechanisms[0] as Mechanism).heldCylinderSeals].sort()).toEqual([
      'B',
      'D',
      'F',
    ]);
  });
});

describe('the drive can be moved onto a held cylinder', () => {
  it('drives the one that takes the input and re-judges the rest', () => {
    const driven = heldCylinderTriangleFixture(S);
    driven.joints = driven.joints.map((joint) =>
      joint.id === 'G' ? { ...joint, input: false } : joint
    );
    driven.sliders = (driven.sliders ?? []).map((slider) =>
      slider.at === 'B' ? { ...slider, input: true } : slider
    );
    const { joints, links } = built(driven);
    const held = heldSeals(joints, links);
    // The driven ram is never held, and the two it leaves are judged against
    // its own travel rather than against the pin that used to drive.
    expect(held).not.toContain('B');
    expect((joints.find((joint) => joint.id === 'B') as RealJoint).input).toBe(true);
  });
});
