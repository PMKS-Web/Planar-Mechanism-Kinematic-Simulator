import '../../model/joint';
import { Coord } from '../../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { sealedCylinderAt, sealedCylinders } from '../../model/cylinder';
import { createMechanismHarness, wireGraph } from '../../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../../test-utils/url-encoding';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

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
 * A drawing with a welded mount, written out and read back.
 *
 * The encoding is unchanged and does not need to change: it already carries
 * weld flags, subsets, blocks and carrier references. What has to be true is
 * that the decode *builds the compound* rather than merely keeping the flag --
 * `reconcileAssemblyWelds` repairs a flag that has outrun its compound only
 * where there is something to repair to, so a payload whose bracket did not
 * come back would come back unwelded and say nothing about it.
 */

/** A ram from the origin, with a bracket bar on its rod mount, welded. */
function weldedMountDrawing() {
  const harness = createMechanismHarness();
  harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * S, 0));
  const slider = harness.service.joints.find(
    (joint): joint is PrisJoint => joint instanceof PrisJoint
  )!;
  const sealed = sealedCylinderAt(slider.connectedJoints[0] ?? slider)!;
  const mount = sealed.rodFar as RealJoint;
  const tip = new RevJoint('W', mount.x + S, mount.y + S);
  const bracket = new RealLink(mount.id + tip.id, [mount, tip]);
  harness.service.joints.push(tip);
  harness.service.links.push(bracket);
  wireGraph(harness.service);
  harness.active.updateSelectedObj(mount);
  harness.service.weldJoint();
  return { ...harness, sealed, mount, tip, bracketId: mount.id + tip.id };
}

function reopen(source: MechanismService): MechanismService {
  const encoded = encodeUrlOf(source, new SettingsService());
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

describe('a welded mount through the URL', () => {
  it('comes back as a compound, not as a flag with the bracket detached', () => {
    const h = weldedMountDrawing();

    const target = reopen(h.service);

    const compounds = target.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    );
    expect(compounds, 'the compound is rebuilt').toHaveLength(1);
    expect(compounds[0].subset.map((leaf) => leaf.id).sort()).toEqual(
      [h.sealed.rod.id, h.bracketId].sort()
    );
    const mount = target.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
    expect(mount.isWelded, 'and the flag with it').toBe(true);
  });

  it('is still a ram on the other side', () => {
    const h = weldedMountDrawing();

    const target = reopen(h.service);

    const cylinders = sealedCylinders(target.joints);
    expect(cylinders).toHaveLength(1);
    expect(cylinders[0].slider.isSealed).toBe(true);
    expect(cylinders[0].pin.isWelded).toBe(true);
    // The rod is a leaf of the compound now, and the resolver follows it there.
    expect(cylinders[0].rod.id).toBe(h.sealed.rod.id);
    expect(cylinders[0].rodFar.id).toBe(h.mount.id);
  });

  it('writes the same bytes the second time round', () => {
    // Encode, decode, encode: a drawing that changed on the way through would
    // drift a little more with every save, and the difference would first show
    // up as a mechanism that no longer matches the link somebody shared.
    const h = weldedMountDrawing();
    const once = encodeUrlOf(h.service, new SettingsService());
    const target = reopen(h.service);

    expect(encodeUrlOf(target, new SettingsService())).toBe(once);
  });

  it('keeps a hold set on one leaf of the compound', () => {
    const h = weldedMountDrawing();
    const compound = h.service.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    const leaf = compound.subset.find((member) => member.id === h.bracketId) as RealLink;
    leaf.hold = 'length';

    const target = reopen(h.service);

    const rebuilt = target.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    const back = rebuilt.subset.find((member) => member.id === h.bracketId) as RealLink;
    expect(back.hold).toBe('length');
  });

  it('keeps a block on the other mount, on its own guide', () => {
    // Two blocks on two distinct pins: the ram's own, sealed and floating, and
    // an external one on the barrel's mount.
    const h = weldedMountDrawing();
    const far = h.service.joints.find((joint) => joint.id === h.sealed.barrelFar.id)!;
    h.active.updateSelectedObj(far);
    (h.service as unknown as { sliderTopology: () => void }).sliderTopology();
    h.service.finishStructuralEdit(true);

    const target = reopen(h.service);

    const blocks = target.joints.filter((joint): joint is PrisJoint => joint instanceof PrisJoint);
    expect(blocks, 'two blocks, on two pins').toHaveLength(2);
    expect(blocks.filter((block) => block.isSealed)).toHaveLength(1);
    expect(sealedCylinders(target.joints)).toHaveLength(1);
  });

  it('survives a merge that renames one end of the ram’s own slot', () => {
    // The slot inside a ram names two joints of the barrel, and a merge onto
    // the barrel's mount replaces one of those names. Encoded by reference,
    // the payload would point at a joint that no longer exists.
    const h = weldedMountDrawing();
    const loose = new RevJoint('Q', h.sealed.barrelFar.x - S, h.sealed.barrelFar.y);
    const stub = new RevJoint('R', h.sealed.barrelFar.x - 2 * S, h.sealed.barrelFar.y + S);
    h.service.joints.push(loose, stub);
    h.service.links.push(new RealLink('QR', [loose, stub]));
    wireGraph(h.service);

    expect(h.service.mergeJoints(loose, h.sealed.barrelFar as RealJoint)).toBeUndefined();
    h.service.finishStructuralEdit(true);

    const target = reopen(h.service);
    expect(sealedCylinders(target.joints)).toHaveLength(1);
    const slider = target.joints.find(
      (joint): joint is PrisJoint => joint instanceof PrisJoint && joint.isSealed
    )!;
    expect(slider.isFloating).toBe(true);
    expect(target.joints.some((joint) => joint.id === slider.slotJointA!.id)).toBe(true);
    expect(target.joints.some((joint) => joint.id === slider.slotJointB!.id)).toBe(true);
  });
});
