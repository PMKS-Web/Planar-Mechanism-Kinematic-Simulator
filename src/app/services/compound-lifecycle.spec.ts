import '../model/joint';
import { Coord } from '../model/coord';
import { RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { Force } from '../model/force';
import { sealedCylinders } from '../model/cylinder';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { MODEL_SCALE as S } from '../model/render-scale';
import { ActiveObjService } from './active-obj.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';

let previousScale: number;
beforeEach(() => {
  previousScale = SettingsService.objectScale;
  SettingsService._objectScale.next(S);
});
afterEach(() => SettingsService._objectScale.next(previousScale));

/**
 * What a body keeps when it is rebuilt, and what its rebuild owes the rest of
 * the drawing.
 *
 * A compound is not edited in place: every weld, unweld, and removal of a
 * member throws the root away and builds another from what is left. That is
 * fine for the *shape*, and it is where everything else about a body has been
 * quietly lost -- its paint, its name, the inertia and center of mass somebody
 * typed onto it, the force anchored to one of its bars, and the slot cut into
 * one of them, which goes on naming a body that is no longer in the drawing.
 *
 * The distinction every test here turns on is between a body *continuing* and
 * a body *ending*. A compound that gains or loses a member is the same body
 * and keeps what was chosen for it. A compound that splits in two is neither
 * of the pieces, and handing a typed aggregate to both would describe material
 * that is in neither.
 */

/** A ram welded into a bracket of `bars` bars, at one mount or the other. */
function weldedBody(bars = 2, at: 'rod' | 'barrel' = 'rod', weld = true) {
  const h = createMechanismHarness();
  h.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * S, 0));
  const ram = sealedCylinders(h.service.joints)[0];
  const mount = (at === 'rod' ? ram.rodFar : ram.barrelFar) as RealJoint;
  const leaves: RealLink[] = [];
  for (let i = 0; i < bars; i++) {
    const tip = new RevJoint(String.fromCharCode(87 + i), mount.x + (i + 1) * S, mount.y + S);
    const leaf = new RealLink(mount.id + tip.id, [mount, tip], i + 2);
    h.service.joints.push(tip);
    h.service.links.push(leaf);
    leaves.push(leaf);
  }
  wireGraph(h.service);
  h.active.updateSelectedObj(mount);
  if (weld) h.service.weldJoint();
  const root = h.service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
  )!;
  return { ...h, ram, mount, leaves, root };
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

const rootOf = (service: MechanismService) =>
  service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
  );

describe('a repair that invalidates what an earlier repair just fixed', () => {
  it('leaves every slot naming a body that is actually in the drawing', () => {
    // Slots are repaired first, because recognizing a Slide needs a bore to
    // still be a bore. Then the weld pass rebuilds a compound -- new object,
    // new id -- and the bore is left naming the one it replaced. Nothing
    // downstream notices: the mechanism solves, the drawing looks right, and
    // the next save writes a carrier that cannot be decoded.
    const h = weldedBody(1, 'barrel');
    const tip = new RevJoint('Z', h.mount.x, h.mount.y + 3 * S);
    h.service.joints.push(tip);
    h.service.links.push(new RealLink(h.mount.id + tip.id, [h.mount, tip]));

    h.service.finishStructuralEdit(true);

    const live = new Set(h.service.links.map((link) => link.id));
    const bore = sealedCylinders(h.service.joints)[0].slider;
    expect(bore.isFloating, 'the bore is still a bore').toBe(true);
    expect(live.has(bore.carrier!.id), 'and its carrier is a body that exists').toBe(true);
  });

  it('so the drawing can be saved and opened again at once', () => {
    const h = weldedBody(1, 'barrel');
    const tip = new RevJoint('Z', h.mount.x, h.mount.y + 3 * S);
    h.service.joints.push(tip);
    h.service.links.push(new RealLink(h.mount.id + tip.id, [h.mount, tip]));
    h.service.finishStructuralEdit(true);

    expect(() => reopen(h.service)).not.toThrow();
    expect(sealedCylinders(reopen(h.service).joints)).toHaveLength(1);
  });

  it('and settling twice settles no further', () => {
    // The repairs run to a fixed point, so a second finish is a no-op. If it
    // is not, one of them is undoing another and the drawing depends on how
    // many times it has been saved.
    const h = weldedBody(1, 'barrel');
    const tip = new RevJoint('Z', h.mount.x, h.mount.y + 3 * S);
    h.service.joints.push(tip);
    h.service.links.push(new RealLink(h.mount.id + tip.id, [h.mount, tip]));
    h.service.finishStructuralEdit(true);
    const once = encodeUrlOf(h.service, new SettingsService());

    h.service.finishStructuralEdit(true);

    expect(encodeUrlOf(h.service, new SettingsService())).toBe(once);
  });
});

describe('a body that goes on being the same body', () => {
  for (const reversed of [false, true]) {
    it(`keeps what somebody chose for it, members listed ${reversed ? 'backwards' : 'forwards'}`, () => {
      // Mass survived this already, because it is a sum of the members. The
      // things that are the *root's own* did not: an inertia and a center of
      // mass typed onto the body, the anchor they were placed against, the
      // name, and the paint. Rebuilt from its leaves, the body came back under
      // a generated id with a computed aggregate in place of the numbers.
      const h = weldedBody(2);
      if (reversed) h.root.subset.reverse();
      h.root.name = 'Fabricated bracket';
      h.root.fill = '#123456';
      h.root.massMoI = 0.005;
      h.root.moiIsCustom = true;
      h.root.comAnchor = 'grid';
      h.root.placeCustomCoM(new Coord(4 * S, 0.6 * S));
      const massBefore = h.root.mass;

      h.service.deleteCylinder(sealedCylinders(h.service.joints)[0]);

      const survivor = rootOf(h.service)!;
      expect(survivor, 'still one body').toBeDefined();
      expect(survivor.mass, 'a massless part carried no mass away').toBe(massBefore);
      expect(survivor.moiIsCustom).toBe(true);
      expect(survivor.massMoI).toBe(0.005);
      expect(survivor.comIsCustom).toBe(true);
      expect(survivor.comAnchor, 'the anchor the point was placed against').toBe('grid');
      expect([survivor.CoM.x, survivor.CoM.y]).toEqual([4 * S, 0.6 * S]);
      expect(survivor.name).toBe('Fabricated bracket');
      expect(survivor.fill).toBe('#123456');
    });
  }

  it('keeps its paint when it gains a member as well as when it loses one', () => {
    // Expansion goes through a different door from splitting, and only the
    // splitting one had been taught this.
    const h = weldedBody(1);
    h.root.fill = '#123456';
    const tip = new RevJoint('Z', h.mount.x, h.mount.y - 2 * S);
    h.service.joints.push(tip);
    h.service.links.push(new RealLink(h.mount.id + tip.id, [h.mount, tip]));

    h.service.finishStructuralEdit(true);

    expect(rootOf(h.service)!.fill).toBe('#123456');
  });

  it('stays derived when its members are a mix of typed and automatic', () => {
    // `custom` on a root means somebody overrode *this body*, not that one of
    // its parts was overridden. Read the other way it froze the aggregate
    // against the only derivation that reads a member's shape -- so an
    // automatic bar's contribution was whatever number was last left on it,
    // and removing an unrelated massless part dropped it entirely.
    const h = weldedBody(2);
    // On a *bracket* bar, not on the ram's own leaf: the ram is about to be
    // deleted, and a number typed onto something that is leaving proves
    // nothing about what stays.
    const typed = h.leaves[0];
    typed.massMoI = 0.0001;
    typed.moiIsCustom = true;
    h.service.updateMechanism(false);
    const before = h.root.massMoI;

    h.service.deleteCylinder(sealedCylinders(h.service.joints)[0]);

    const survivor = rootOf(h.service)!;
    expect(survivor.moiIsCustom, 'a body of members is derived from them').toBe(false);
    expect(survivor.massMoI, 'and nothing was dropped').toBeCloseTo(before, 9);
  });
});

describe('a force put on one bar of a body', () => {
  it('comes back to that bar when the weld comes off', () => {
    // Where two leaves meet, every candidate is exactly as far from the
    // anchor, and the tie-break that followed sent a bracket's load to a
    // cylinder's rod without anything having moved. The bar it was put on is
    // remembered instead.
    // Put on the bar while it is still a bar, which is the only moment a
    // reader can point at it.
    const h = weldedBody(2, 'rod', false);
    const bar = h.leaves[1];
    const force = new Force(
      'F1',
      bar,
      new Coord(bar.joints[0].x, bar.joints[0].y),
      new Coord(5 * S, 5 * S)
    );
    h.service.forces.push(force);
    (
      h.service as unknown as { attachForceToLink: (f: Force, l: RealLink) => void }
    ).attachForceToLink(force, bar);
    h.active.updateSelectedObj(h.mount);
    h.service.weldJoint();
    expect(force.link.subset.length, 'the weld takes it').toBeGreaterThan(0);

    h.service.unWeldJoint(h.mount);

    expect(force.link.id, 'and the unweld gives it back').toBe(bar.id);
    expect(force.link.forces.some((one) => one.id === 'F1')).toBe(true);
  });
});

describe('the Delete row on a welded body', () => {
  it('counts the ram’s far mount, which the click also removes', () => {
    // The row counted the joints of the selected body alone. Deleting the body
    // takes the ram whole, and the ram's *other* mount is a joint at the far
    // end of the drawing that the reader can see and was not told about.
    const h = weldedBody(2);
    const farMount = h.ram.barrelFar.id;

    const predicted = h.service.jointsOrphanedByDeleting(h.root).map((joint) => joint.id);
    h.active.updateSelectedObj(h.root);
    h.service.deleteLink();

    expect(
      h.service.joints.some((joint) => joint.id === farMount),
      'it goes'
    ).toBe(false);
    expect(predicted, 'and the row said so').toContain(farMount);
    // And says nothing about the three joints inside the ram, which are never
    // drawn and would be a number the reader cannot check.
    for (const hidden of [h.ram.barrelNear.id, h.ram.pin.id, h.ram.slider.id]) {
      expect(predicted).not.toContain(hidden);
    }
  });
});
