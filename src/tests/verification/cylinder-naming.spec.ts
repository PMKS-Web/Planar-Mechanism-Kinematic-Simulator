import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { Coord } from '../../app/model/coord';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { RealLink } from '../../app/model/link';
import { RealJoint } from '../../app/model/joint';

/**
 * A cylinder is four joints and shows three of them.
 *
 * The one inside it — the barrel's near end, buried under the rod — is never
 * drawn, labeled or listed, so spending a letter on it would run a drawing
 * through the alphabet faster than the joints anyone can see. The seal used to
 * be in that class and is not any more (decision S9): it is the square a reader
 * selects, so it takes the letter after the two ends.
 */
function drawCylinder() {
  const harness = createMechanismHarness();
  harness.service.createCylinderFrom(new Coord(0, 0), new Coord(4 * MODEL_SCALE, 0));
  return harness;
}

describe('Naming the joints of a cylinder', () => {
  it('spends letters on the two ends and the seal, and none on the buried one', () => {
    const { service } = drawCylinder();
    const ids = service.joints.map((joint) => joint.id);
    expect(ids).toHaveLength(4);

    const lettered = ids.filter((id) => /^[A-Za-z]+$/.test(id));
    const inside = ids.filter((id) => !/^[A-Za-z]+$/.test(id));
    // The two ends first, then the seal, in that order.
    expect(lettered.sort()).toEqual(['A', 'B', 'C']);
    const sealed = service.sealedStructures()[0];
    expect([sealed.mountA.id, sealed.mountB.id, sealed.seal.id]).toEqual(['A', 'B', 'C']);
    // And the buried barrel end, hung off the mount's own letter.
    expect(inside.sort()).toEqual(['A1']);
  });

  it('names each member after its own two visible joints', () => {
    const { service } = drawCylinder();
    const sealed = service.sealedStructures()[0];
    expect(service.bodyLabel(sealed.barrel)).toBe('Barrel AC');
    expect(service.bodyLabel(sealed.rod)).toBe('Rod CB');
  });

  it('leaves the next drawn joint the letter after the seal', () => {
    const { service } = drawCylinder();
    // D, not E: the one interior name took none of the alphabet.
    expect(service.determineNextLetter()).toBe('D');
  });

  it('gives a second ram on the same mount names of its own', () => {
    const { service } = drawCylinder();
    const mount = service.joints.find(
      (joint): joint is RealJoint => joint.id === 'A' && joint instanceof RealJoint
    )!;
    service.createCylinderFrom(new Coord(0, 0), new Coord(0, 4 * MODEL_SCALE), undefined, mount);
    const ids = service.joints.map((joint) => joint.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws an outline for a link whose joints are not single characters', () => {
    // The outline used to be built by concatenating joint ids into one string
    // and reading it back a character at a time, so any id longer than one
    // character came apart into characters naming no joint -- which is also
    // what a drawing past its fifty-second joint gets from determineNextLetter.
    const { service } = drawCylinder();
    const barrel = service.links.find(
      (link): link is RealLink => link instanceof RealLink && link.joints.length === 2
    )!;
    expect(barrel.d.length).toBeGreaterThan(0);
    expect(barrel.d).not.toContain('NaN');
  });
});
