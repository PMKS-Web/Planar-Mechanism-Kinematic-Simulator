import { RealJoint, RevJoint } from './joint';
import { RealLink } from './link';
import { ram, rewire, weldBracketOnto } from '../../test-utils/cylinder-graph';
import {
  Cylinder,
  cylindersEnclosing,
  cylinderMounts,
  cylinderMountsAt,
  cylinderOfLinkIn,
  cylindersOfJointIn,
  cylindersOfLinkIn,
  isInsideCylinder,
  isCylinderMount,
  cylindersIn,
} from './cylinder';

/**
 * Who owns a cylinder's bars, once a mount can be welded into something else.
 *
 * A ram is four joints and two links recognized structurally on demand, and
 * the recognition used to answer one question: which two-joint bar is the
 * barrel, which is the rod. That is the right answer for the *skin*, which
 * draws those bars, and the wrong one for an *edit*, which has to move whatever
 * rigid body they belong to. While a mount could not be welded the two were the
 * same link and nothing had to choose. They stop being the same the moment a
 * bracket is welded on, and a pose that moved the bar and not the bracket would
 * leave the bracket standing where the ram used to be.
 *
 * So the descriptor carries both now, and these are the claims that make the
 * pair trustworthy: the leaf is found however deeply it is nested, the root is
 * the body an edit must carry, ambiguity is refused rather than guessed at, and
 * neither answer depends on the order anything was drawn in.
 *
 * Built by hand rather than through the service on purpose. The public weld
 * refused a mount when this was written -- that ban was lifted in step 5 of
 * `docs/cylinder-mount-joints-plan.md` -- and a resolver is a pure function of
 * the graph, so the graph is what it should be tested against.
 */

describe('which body owns a cylinder’s bars', () => {
  it('reads a plain ram as its own root on both sides', () => {
    const parts = ram();
    const joints = parts.joints;
    const [cylinder] = cylindersIn(joints);

    expect(cylinder).toBeDefined();
    expect(cylinder.barrel.id).toBe('AB');
    expect(cylinder.rod.id).toBe('CD');
    // Nothing has swallowed either bar, so each is its own body.
    expect(cylinder.barrelRoot.id).toBe('AB');
    expect(cylinder.rodRoot.id).toBe('CD');
  });

  it('keeps the barrel bar as the skin while the compound becomes the body', () => {
    const parts = ram();
    const { compound } = weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', {
      x: -3,
      y: 4,
    });
    const joints = parts.joints;
    const [cylinder] = cylindersIn(joints);

    expect(cylinder).toBeDefined();
    // The silhouette is still the bar between the two slot joints...
    expect(cylinder.barrel.id).toBe('AB');
    // ...and the thing a drag has to carry is the whole compound.
    expect(cylinder.barrelRoot.id).toBe(compound.id);
    expect(cylinder.rodRoot.id).toBe('CD');
    expect(cylinder.mountA.id).toBe('A');
    expect(cylinder.mountB.id).toBe('D');
  });

  it('does the same on the rod side', () => {
    const parts = ram();
    const { compound } = weldBracketOnto(parts, parts.mountB, parts.rod, 'DY', {
      x: 13,
      y: 4,
    });
    const joints = parts.joints;
    const [cylinder] = cylindersIn(joints);

    expect(cylinder.rod.id).toBe('CD');
    expect(cylinder.rodRoot.id).toBe(compound.id);
    expect(cylinder.barrelRoot.id).toBe('AB');
  });

  it('finds a bar nested more than one subset deep', () => {
    // A bracket welded on, and then the whole thing welded into something
    // larger. Searching one level down would lose the barrel at exactly the
    // point the drawing got complicated.
    const parts = ram();
    const { compound, far } = weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', {
      x: -3,
      y: 4,
    });
    const outerFar = new RevJoint('Z', -6, 8);
    const outerBar = new RealLink('XZ', [far, outerFar]);
    const outer = new RealLink(
      'ABXZ',
      [...compound.joints, outerFar],
      undefined,
      undefined,
      undefined,
      [compound, outerBar]
    );
    far.isWelded = true;
    parts.joints.push(outerFar);
    parts.links = parts.links.filter((link) => link.id !== compound.id);
    parts.links.push(outer);
    rewire(parts.joints, parts.links);

    const [cylinder] = cylindersIn(parts.joints);

    expect(cylinder).toBeDefined();
    expect(cylinder.barrel.id).toBe('AB');
    expect(cylinder.barrelRoot.id).toBe('ABXZ');
  });

  it('refuses a compound holding two candidate rods rather than picking one', () => {
    // Two bars on the pin, both two-joint, both inside one body: which is the
    // rod is not a question the drawing answers, and guessing would make the
    // skin depend on the order the reader drew them.
    const parts = ram();
    const decoy = new RealLink('CE', [parts.seal, new RevJoint('E', 6, 5)]);
    const compound = new RealLink(
      'CDE',
      [...parts.rod.joints, decoy.joints[1]],
      undefined,
      undefined,
      undefined,
      [parts.rod, decoy]
    );
    // Only the compound. The slider's other link used to be its own block.
    parts.seal.links = [compound];

    const joints = parts.joints;
    expect(cylindersIn(joints)).toHaveLength(0);
  });

  it('gives the same answer whichever order the joints arrive in', () => {
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: -3, y: 4 });
    const joints = parts.joints;

    const forward = cylindersIn(joints)[0];
    const backward = cylindersIn([...joints].reverse())[0];

    expect(backward.barrel.id).toBe(forward.barrel.id);
    expect(backward.barrelRoot.id).toBe(forward.barrelRoot.id);
    expect(backward.mountA.id).toBe(forward.mountA.id);
    expect(backward.mountB.id).toBe(forward.mountB.id);
  });
});

describe('the roles a joint plays on a cylinder', () => {
  const parts = ram();
  const joints = parts.joints;
  const cylinders = cylindersIn(joints);
  const cylinder: Cylinder = cylinders[0];

  it('names exactly the two joints the drawing attaches by', () => {
    expect(cylinderMounts(cylinder).map((one) => one.id)).toEqual(['A', 'D']);
    expect(isCylinderMount(cylinder, parts.mountA)).toBe(true);
    expect(isCylinderMount(cylinder, parts.mountB)).toBe(true);
    expect(isCylinderMount(cylinder, parts.seal)).toBe(false);
  });

  it('keeps mount and interior apart, since they answer opposite questions', () => {
    expect(cylinderMountsAt(cylinders, parts.mountA)).toHaveLength(1);
    expect(cylindersEnclosing(cylinders, parts.mountA)).toHaveLength(0);

    // Two interior joints, where there were three: the slider and the pin the
    // rod hangs on are one joint (Stage 1 of
    // `docs/joint-type-and-cylinder-plan.md`).
    for (const inside of [parts.inner, parts.seal]) {
      expect(isInsideCylinder(cylinder, inside)).toBe(true);
      expect(cylindersEnclosing(cylinders, inside)).toHaveLength(1);
      expect(cylinderMountsAt(cylinders, inside)).toHaveLength(0);
    }
  });

  it('answers membership for every joint, which is the third and different question', () => {
    for (const member of joints) {
      expect(cylindersOfJointIn(cylinders, member)).toHaveLength(1);
    }
    expect(cylindersOfJointIn(cylinders, new RevJoint('Q', 99, 99))).toHaveLength(0);
  });
});

describe('which cylinders a link owns', () => {
  it('reports both rams welded into one bracket, not just the first', () => {
    // Deleting this bracket takes two cylinders with it. A first match would
    // take one and leave the other's joints behind.
    const first = ram('1');
    const second = ram('2');
    const shared = new RevJoint('S', -3, 4);
    const compound = new RealLink(
      'shared',
      [first.mountA, second.mountA, shared],
      undefined,
      undefined,
      undefined,
      [first.barrel, second.barrel]
    );
    first.mountA.links = [compound];
    second.mountA.links = [compound];

    const joints = [
      first.mountA,
      first.inner,
      first.mountB,
      first.seal,
      second.mountA,
      second.inner,
      second.mountB,
      second.seal,
    ];
    const cylinders = cylindersIn(joints);
    expect(cylinders).toHaveLength(2);

    const owned = cylindersOfLinkIn(cylinders, compound);
    expect(owned).toHaveLength(2);
    expect(owned.map((one) => one.barrel.id).sort()).toEqual(['A1B1', 'A2B2']);
    // The singular question still has an answer, and it is one of those two.
    expect(cylinderOfLinkIn(cylinders, compound)).toBeDefined();
  });

  it('says nothing about a neighboring bar that merely touches a mount', () => {
    const parts = ram();
    const joints = parts.joints;
    const cylinders = cylindersIn(joints);
    const neighbor = new RealLink('AN', [parts.mountA, new RevJoint('N', -4, 0)]);

    // Pinned to a mount is not membership: the neighbor keeps its own menus
    // and is not swept up by a delete that follows the cylinder.
    expect(cylindersOfLinkIn(cylinders, neighbor)).toHaveLength(0);
  });
});
