// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { sealedCylinders } from '../../app/model/cylinder';
import { assignBodies } from '../../app/model/mechanism/bodies';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MODEL_SCALE } from '../../app/model/render-scale';

const S = MODEL_SCALE;

let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * S);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

/**
 * The welded-mount mechanism a reader can actually draw, end to end.
 *
 * `coupled-mount-fixtures.ts` holds five that are *constraint sets*: they are
 * handed to the solver directly, and one of them -- `weldedBoomFixture` --
 * describes a graph the editor would repair into something else, because three
 * bodies meet at its welded joint and only two are in the compound. That is a
 * fine way to check algebra and a bad way to claim the feature works.
 *
 * This one is built the way the app builds it: draw a ram, hang a bar on a
 * mount, weld it, pin a boom to the bar's far end. Every step goes through the
 * service, so the reconcilers run, and what comes out is what a reader would
 * have. Then it is written to a URL and read back -- which is also what undo
 * and redo do, the history being a stack of them -- and has to be the same
 * mechanism on the other side.
 *
 * The boom hangs on the bracket's *far* joint rather than on the welded mount,
 * and that is not incidental: a weld says every body meeting there is rigid,
 * so a boom pinned to the mount is not pinned, it is welded, and the freedom
 * being drawn is gone.
 */
function drawIt() {
  const harness = createMechanismHarness();
  const service = harness.service;

  service.createCylinderFrom(new Coord(-4 * S, 0), new Coord(2 * S, 0));
  const ram = sealedCylinders(service.joints)[0];
  const mount = ram.rodFar as RealJoint;
  (ram.barrelFar as RealJoint).ground = true;

  // A bracket on the rod mount, then the weld that fuses it to the rod.
  const elbow = new RevJoint('W', mount.x + 2 * S, mount.y + 3 * S);
  service.joints.push(elbow);
  service.links.push(new RealLink(mount.id + elbow.id, [mount, elbow]));
  service.finishStructuralEdit(true);
  harness.active.updateSelectedObj(mount);
  service.weldJoint();

  // The boom, pinned to the bracket's far end and to ground.
  const anchor = new RevJoint('Z', elbow.x + 3 * S, elbow.y + S);
  anchor.ground = true;
  service.joints.push(anchor);
  service.links.push(new RealLink(elbow.id + anchor.id, [elbow, anchor]));
  service.finishStructuralEdit(true);

  service.toggleCylinderInput(sealedCylinders(service.joints)[0]);
  service.updateMechanism(true);
  return { ...harness, mountId: mount.id, elbowId: elbow.id, anchorId: anchor.id };
}

/** What has to be the same on both sides of a save. */
function shapeOf(service: MechanismService) {
  const compound = service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
  );
  const rams = sealedCylinders(service.joints);
  const bodies = assignBodies(service.joints, service.links);
  return {
    joints: service.joints.map((joint) => joint.id).sort(),
    links: service.links.map((link) => link.id).sort(),
    compound: compound ? compound.subset.map((leaf) => leaf.id).sort() : undefined,
    welded: service.joints
      .filter((joint) => joint instanceof RealJoint && joint.isWelded)
      .map((joint) => joint.id)
      .sort(),
    rams: rams.length,
    sealed: rams.every((ram) => ram.slider.isSealed && ram.slider.isFloating),
    movingBodies: bodies.movingBodies.size,
  };
}

function reopen(source: MechanismService): MechanismService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encodeUrlOf(source, new SettingsService()));
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

describe('the welded-mount mechanism a reader can draw', () => {
  it('comes out of the editor as one body of two leaves, and runs', () => {
    const h = drawIt();

    const shape = shapeOf(h.service);
    expect(shape.rams, 'still one ram').toBe(1);
    expect(shape.sealed, 'still sealed, still in its bore').toBe(true);
    expect(shape.compound, 'the rod and the bracket are one body').toHaveLength(2);
    expect(shape.welded).toContain(h.mountId);

    const machine = h.service.mechanisms[0];
    expect(machine.dof, 'one freedom').toBe(1);
    expect(machine.isMechanismValid()).toBe(true);
    expect(machine.joints.length, 'a whole cycle of samples').toBeGreaterThan(100);
  });

  it('is the same mechanism after a save and a reopen', () => {
    // Which is also what undo and redo do: the history is a stack of these.
    const h = drawIt();
    const before = shapeOf(h.service);

    const after = shapeOf(reopen(h.service));

    expect(after).toEqual(before);
  });

  it('and still runs, with the same freedom, on the other side', () => {
    const h = drawIt();
    const reopened = reopen(h.service);

    // Rebuilt through the service so the reopened drawing is solved the way a
    // reopened drawing is.
    const fresh = createMechanismHarness();
    fresh.service.joints = reopened.joints;
    fresh.service.links = reopened.links;
    fresh.service.forces = reopened.forces;
    fresh.service.finishStructuralEdit(false);

    const machine = fresh.service.mechanisms[0];
    expect(machine.dof).toBe(1);
    expect(machine.isMechanismValid()).toBe(true);
    expect(machine.joints.length).toBeGreaterThan(100);
  });

  it('carries its bracket rigidly through the whole cycle', () => {
    // The off-axis half. A body is rigid or it is not, and the joint that is
    // not on the ram's axis is the only one that can tell: a compound that
    // quietly deformed would keep every joint on the axis in its place.
    const h = drawIt();
    const machine = h.service.mechanisms[0];
    const spanAt = (t: number) => {
      const pose = machine.joints[t];
      const mount = pose.find((joint) => joint.id === h.mountId)!;
      const elbow = pose.find((joint) => joint.id === h.elbowId)!;
      const pin = pose.find((joint) => joint.id === sealedCylinders(h.service.joints)[0].pin.id)!;
      return {
        arm: Math.hypot(elbow.x - mount.x, elbow.y - mount.y),
        // The angle the bracket stands at, in the rod's own frame: the number
        // a weld is a claim about.
        opening:
          Math.atan2(elbow.y - mount.y, elbow.x - mount.x) -
          Math.atan2(pin.y - mount.y, pin.x - mount.x),
      };
    };
    const start = spanAt(0);

    for (let t = 1; t < machine.joints.length; t++) {
      const now = spanAt(t);
      expect(Math.abs(now.arm - start.arm), `the bracket's length at ${t}`).toBeLessThan(1e-3);
      const turned = Math.atan2(
        Math.sin(now.opening - start.opening),
        Math.cos(now.opening - start.opening)
      );
      expect(Math.abs(turned), `the bracket's angle to the rod at ${t}`).toBeLessThan(1e-6);
    }
  });
});
