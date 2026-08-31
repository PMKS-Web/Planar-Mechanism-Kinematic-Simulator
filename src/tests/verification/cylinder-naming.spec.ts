import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { Coord } from '../../app/model/coord';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { RealLink } from '../../app/model/link';
import { RealJoint } from '../../app/model/joint';

/**
 * A ram is five joints and shows two of them.
 *
 * The three inside it — the barrel's near end, the pin, the slider — are never
 * drawn, labeled or listed, so spending a letter on each ran a drawing through
 * the alphabet three times faster than the joints anyone could see.
 */
function drawCylinder() {
  const harness = createMechanismHarness();
  harness.service.createCylinderFrom(new Coord(0, 0), new Coord(4 * MODEL_SCALE, 0));
  return harness;
}

describe('Naming the joints of a cylinder', () => {
  it('spends letters on the two mounts and no others', () => {
    const { service } = drawCylinder();
    const ids = service.joints.map((joint) => joint.id);
    expect(ids).toHaveLength(5);

    const lettered = ids.filter((id) => /^[A-Za-z]+$/.test(id));
    const inside = ids.filter((id) => !/^[A-Za-z]+$/.test(id));
    // The mounts, which a reader points at and a panel names.
    expect(lettered.sort()).toEqual(['A', 'B']);
    // And the interior, hung off the mount's own letter.
    expect(inside.sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('leaves the next drawn joint the letter after the mounts', () => {
    const { service } = drawCylinder();
    // C, not F: the three interior names took none of the alphabet.
    expect(service.determineNextLetter()).toBe('C');
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
