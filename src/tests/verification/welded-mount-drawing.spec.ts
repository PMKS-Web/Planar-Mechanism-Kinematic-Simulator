// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { buildCompoundPath } from '../../app/model/compound-link-path';
import { sealedCylinders } from '../../app/model/cylinder';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { SliderMarkService } from '../../app/services/slider-mark.service';
import { SettingsService } from '../../app/services/settings.service';
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

// A ram is drawn by its skin, and a compound holding one of its bars must
// leave that bar to the skin. Drawing it twice puts the bracket's color under
// the part with a seam where the copy ends -- which the random palette hides
// far more often than it shows, so this asks the geometry instead of looking.
//
// The rod half of this was handled from the start, through a structural test
// that recognizes a rod by its pin. A barrel has no pin, so welding a bracket
// to the *barrel* mount left the barrel in the compound's union. The leaf
// cannot work it out for itself either: after the weld its joints list only
// the compound root, and the sealed PrisJoint that knows the pairing is
// reachable from the rod's pin, which a barrel-welded compound does not hold.

/** A ram with a bar welded to one of its two mounts. */
function weldedAt(end: 'barrel' | 'rod') {
  const harness = createMechanismHarness();
  const service = harness.service;

  service.createCylinderFrom(new Coord(-1 * S, 0), new Coord(5 * S, 0));
  const ram = sealedCylinders(service.joints)[0];
  const mount = (end === 'barrel' ? ram.barrelFar : ram.rodFar) as RealJoint;

  const tip = new RevJoint('W', mount.x + (end === 'barrel' ? -2 : 2) * S, mount.y + 3 * S);
  service.joints.push(tip);
  service.links.push(new RealLink(mount.id + tip.id, [mount, tip]));
  service.finishStructuralEdit(true);
  harness.active.updateSelectedObj(mount);
  service.weldJoint();
  service.finishStructuralEdit(true);

  const compound = service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
  )!;
  const bracket = compound.subset.find(
    (leaf): leaf is RealLink => leaf instanceof RealLink && leaf.joints.some((j) => j.id === tip.id)
  )!;
  return { ...harness, ram: sealedCylinders(service.joints)[0], compound, bracket, mount, tip };
}

/** What the compound would draw if the bracket were all it held. */
function bracketAlone(bracket: RealLink): string {
  bracket.reComputeDPath();
  return buildCompoundPath([bracket.d], SettingsService.objectScale / 4).path;
}

describe('a compound holding one of a ram’s bars', () => {
  (['barrel', 'rod'] as const).forEach((end) => {
    it(`draws the bracket and not the ${end}`, () => {
      const { compound, bracket, ram } = weldedAt(end);
      const member = end === 'barrel' ? ram.barrel : ram.rod;

      // Both bars are in the body -- the weld is real, and mass and mobility
      // depend on it -- and neither is in the outline.
      expect(compound.subset.map((leaf) => leaf.id)).toContain(member.id);
      expect(compound.subset.length).toBe(2);
      expect(compound.d).toBe(bracketAlone(bracket));
    });
  });

  it('says which bars a skin stands in for, and stops saying it when the ram goes', () => {
    const { service, compound, bracket, ram } = weldedAt('barrel');

    expect((ram.barrel as RealLink).drawnByACylinderSkin).toBe(true);
    expect((ram.rod as RealLink).drawnByACylinderSkin).toBe(true);
    expect(bracket.drawnByACylinderSkin).toBe(false);
    expect(compound.drawnByACylinderSkin).toBe(false);

    const wasTheBarrel = ram.barrel as RealLink;
    service.deleteCylinder(ram);
    service.sealedStructures();
    expect(sealedCylinders(service.joints).length).toBe(0);
    expect(wasTheBarrel.drawnByACylinderSkin).toBe(false);
  });

  it('leaves the ram’s bore out of the channels cut into it', () => {
    // The bore is the skin's own business. While the barrel was the carrier
    // this never showed: the barrel is skinned, so the link layer dropped its
    // outline and the channel with it. Welded, the carrier becomes the
    // compound, which is not skinned -- and the bore came out as a filled
    // capsule the length of the barrel, in the bracket's color.
    const { service, ram } = weldedAt('barrel');
    const sealed = service.joints.find(
      (joint): joint is PrisJoint => joint instanceof PrisJoint && joint.isSealed
    )!;

    expect(sealed.carrier?.id).toBe(ram.barrelRoot?.id ?? sealed.carrier?.id);
    const channels = new SliderMarkService().channels(
      service.joints,
      0.15 * SettingsService.objectScale
    );
    expect(channels.length).toBe(0);
  });

  it('still cuts a channel for an ordinary block riding that same compound', () => {
    const { service, compound, tip } = weldedAt('rod');
    // A block on the bracket's far end, riding the compound: an external slot
    // in the very root that also holds the ram's rod. It has to be drawn.
    const [a, b] = compound.subset.find((leaf) => leaf.joints.some((j) => j.id === tip.id))!.joints;
    const anchor = service.joints.find((joint): joint is RealJoint => joint.id === tip.id)!;
    service.cutSlotOn(anchor, { carrier: compound, a, b, x: anchor.x, y: anchor.y });
    service.finishStructuralEdit(true);

    const channels = new SliderMarkService().channels(
      service.joints,
      0.15 * SettingsService.objectScale
    );
    expect(channels.map((channel) => channel.carrierId)).toEqual([compound.id]);
  });
});
