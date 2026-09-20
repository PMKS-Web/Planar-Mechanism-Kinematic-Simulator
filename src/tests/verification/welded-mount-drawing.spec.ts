// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { buildCompoundPath } from '../../app/model/compound-link-path';
import { Cylinder, cylindersIn } from '../../app/model/cylinder';
import { fusedBodiesOf, memberSilhouette } from '../../app/model/cylinder-fusion';
import { barrelFillOf, cylinderSkinFrame, rodFillOf } from '../../app/model/cylinder-skin';
import { CYLINDER } from '../../app/model/joint-marks';
import { uniformBodyOf } from '../../app/model/uniform-body';
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

// Weld a bar to a cylinder's mount and the two are rigid, which is the same
// thing a weld between two ordinary links means -- so it has to draw the same
// way: one
// fill, one continuous outline, a fillet in the elbow (decision S16).
//
// It did not. The compound left the member out of its union altogether, so the
// bracket was its own shape with its own edge and the skin was painted over it
// with a seam and no fillet; at a barrel mount the bracket's round end showed
// as a circle sitting inside the barrel. The member is in the union now, as the
// silhouette the skin draws rather than as the thin bar its two joints
// describe, and `buildCompoundPath` does the rest.
//
// The leaf still cannot work any of this out for itself: after the weld its
// joints list only the compound root, and the sealed PrisJoint that knows the
// pairing is reachable from the rod's pin, which a barrel-welded compound does
// not hold. Both answers are told to it where the structures are resolved.

/** A cylinder with a bar welded to one of its two mounts. */
function weldedAt(end: 'barrel' | 'rod') {
  const harness = createMechanismHarness();
  const service = harness.service;

  service.createCylinderFrom(new Coord(-1 * S, 0), new Coord(5 * S, 0));
  const ram = cylindersIn(service.joints)[0];
  const mount = (end === 'barrel' ? ram.mountA : ram.mountB) as RealJoint;

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
  return { ...harness, ram: cylindersIn(service.joints)[0], compound, bracket, mount, tip };
}

/** What the compound would draw if the bracket were all it held. */
function bracketAlone(bracket: RealLink): string {
  bracket.reComputeDPath();
  return buildCompoundPath([bracket.d], SettingsService.objectScale / 4).path;
}

/** How many closed loops a built outline is made of. One ring is one body. */
function rings(path: string): number {
  return (path.match(/Z/g) ?? []).length;
}

/** How many corners of it were filleted -- a fillet is the one curve this emits. */
function fillets(path: string): number {
  return (path.match(/Q/g) ?? []).length;
}

/** Two ordinary bars welded at their shared joint, for the drawing to be held against. */
function ordinaryWeldedPair() {
  const harness = createMechanismHarness();
  const service = harness.service;
  const first = service.addBar(new Coord(0, 0), new Coord(3 * S, 2 * S))!;
  const elbow = first.joints[1] as RealJoint;
  service.addBarFrom(elbow, new Coord(6 * S, -1 * S));
  service.finishStructuralEdit(true);
  harness.active.updateSelectedObj(elbow);
  service.weldJoint();
  service.finishStructuralEdit(true);
  return service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
  )!;
}

describe('a compound holding one of a cylinder’s bars', () => {
  (['barrel', 'rod'] as const).forEach((end) => {
    it(`draws the ${end} and the bracket as one body`, () => {
      const { compound, bracket, ram } = weldedAt(end);
      const member = (end === 'barrel' ? ram.barrel : ram.rod) as RealLink;

      // Both bars are in the body -- the weld is real, and mass and mobility
      // depend on it -- and the member's own silhouette is what the body's
      // outline was built from.
      expect(compound.subset.map((leaf) => leaf.id)).toContain(member.id);
      expect(compound.subset.length).toBe(2);
      expect(member.skinSilhouette).toBeTruthy();
      expect(compound.d).not.toBe(bracketAlone(bracket));

      // One ring, not two, and the union really did take the silhouette: the
      // fused outline is the same shape the bracket and that silhouette make
      // together, to the character.
      expect(rings(compound.d)).toBe(1);
      expect(compound.d).toBe(
        buildCompoundPath([bracket.d, member.skinSilhouette!], SettingsService.objectScale / 4).path
      );
    });

    it(`fillets the ${end}'s elbow the way an ordinary weld is filleted`, () => {
      const { compound } = weldedAt(end);
      // Held against a pair of ordinary bars welded at their shared joint,
      // because "filleted" is a property of that drawing and not a number worth
      // pinning on its own. An elbow of two bars softens the one sharp notch
      // its union has; a bracket leaving a member that is wider than it has two.
      const ordinary = fillets(ordinaryWeldedPair().d);
      expect(ordinary).toBeGreaterThanOrEqual(1);
      expect(fillets(compound.d)).toBeGreaterThanOrEqual(ordinary);
    });

    it(`keeps the ${end}'s own cut square through the union`, () => {
      // The union fillets every corner it finds and cannot tell the elbow,
      // where two parts meet, from the barrel's mouth or the rod's back, where
      // nothing does. Filleted, the mouth stops being a cut plane and the rod
      // lifts off the black head block it is flush with, letting the black
      // through at both corners. `CYLINDER.cutEase` is what stops it.
      const { compound, bracket, ram } = weldedAt(end);
      const r = 0.15 * SettingsService.objectScale;
      const fillet = SettingsService.objectScale / 4;
      const squared = buildCompoundPath([bracket.d, memberSilhouette(ram, end, r, 0)], fillet).path;

      cutCorners(ram, end, r).forEach((corner) => {
        expect(nearestEdgePointTo(compound.d, corner)).toBeLessThan(CYLINDER.cutEase * r * 1.5);
        // And without the ease the outline turns a whole fillet short of that
        // same corner, which is the failure this is standing in front of.
        expect(nearestEdgePointTo(squared, corner)).toBeGreaterThan(fillet / 2);
      });
    });
  });

  it('says which bars a skin draws, and stops saying it when the part goes', () => {
    const { service, compound, bracket, ram } = weldedAt('barrel');

    expect((ram.barrel as RealLink).drawnByACylinderSkin).toBe(true);
    expect((ram.rod as RealLink).drawnByACylinderSkin).toBe(true);
    expect((ram.barrel as RealLink).skinSilhouette).toBeTruthy();
    expect(bracket.drawnByACylinderSkin).toBe(false);
    expect(bracket.skinSilhouette).toBeUndefined();
    expect(compound.drawnByACylinderSkin).toBe(false);

    const wasTheBarrel = ram.barrel as RealLink;
    service.deleteCylinder(ram);
    service.sealedStructures();
    expect(cylindersIn(service.joints).length).toBe(0);
    expect(wasTheBarrel.drawnByACylinderSkin).toBe(false);
    expect(wasTheBarrel.skinSilhouette).toBeUndefined();
  });

  it('paints the fused body in one color, and gives the fills back on unweld', () => {
    const { service, active, compound, ram, mount } = weldedAt('barrel');
    const barrelOwn = (ram.barrel as RealLink).fill;
    compound.fill = '#1f8a80';

    // One body, one color: the member is drawn in its root's fill, exactly as
    // an ordinary bar welded into a body is.
    expect(barrelFillOf(ram)).toBe('#1f8a80');
    // And a rod that has chosen nothing follows its barrel, which is now the
    // body -- so the whole part reads as one drawing rather than two.
    expect(ram.rod.ownColor).toBe(false);
    expect(rodFillOf(ram)).toBe('#1f8a80');

    active.updateSelectedObj(service.joints.find((joint) => joint.id === mount.id)!);
    service.unweldSelectedJoint();
    service.finishStructuralEdit(true);
    const freed = cylindersIn(service.joints)[0];
    // Its own body again, drawn from its own two joints and in its own color.
    expect(freed.barrelRoot.id).toBe(freed.barrel.id);
    expect(barrelFillOf(freed)).toBe(barrelOwn);
    expect((freed.barrel as RealLink).skinSilhouette).toBeTruthy();
  });

  it('leaves the compound’s mass, inertia and center of mass alone', () => {
    const { service, compound, ram } = weldedAt('rod');
    const leaves = compound.subset.filter((leaf): leaf is RealLink => leaf instanceof RealLink);
    leaves.forEach((leaf, index) => (leaf.mass = index + 1));
    service.finishStructuralEdit(true);

    // Straight off the joints, by the mass-weighted sum `uniformBodyFor` runs.
    // Nothing here can see a silhouette: the rod's is wider than the bar its
    // two joints describe and reaches back behind the seal, so a center of mass
    // that had drifted toward the picture would miss this by a visible margin.
    const totalMass = leaves.reduce((sum, leaf) => sum + leaf.mass, 0);
    const expected = leaves.reduce(
      (sum, leaf) => {
        const centroid = uniformBodyOf(leaf.joints).centroid;
        return {
          x: sum.x + (leaf.mass * centroid.x) / totalMass,
          y: sum.y + (leaf.mass * centroid.y) / totalMass,
        };
      },
      { x: 0, y: 0 }
    );
    expect(compound.CoM.x).toBeCloseTo(expected.x, 6);
    expect(compound.CoM.y).toBeCloseTo(expected.y, 6);

    // And the painted outline really is a separate thing: take the silhouettes
    // away, rebuild the picture, and the numbers do not move.
    const before = {
      mass: compound.mass,
      com: compound.CoM,
      moi: compound.massMoI,
      d: compound.d,
    };
    (ram.rod as RealLink).skinSilhouette = undefined;
    compound.reComputeDPath();
    expect(compound.d).not.toBe(before.d);
    expect(compound.mass).toBe(before.mass);
    expect(compound.CoM.x).toBeCloseTo(before.com.x, 9);
    expect(compound.CoM.y).toBeCloseTo(before.com.y, 9);
    expect(compound.massMoI).toBeCloseTo(before.moi, 9);
  });

  it('gives the export the body without the member fused into it', () => {
    // A parts drawing, not a picture: the cylinder is already exported as its
    // own barrel and rod on their own layer, so a bracket face carrying the
    // barrel as well would lay a second, differently shaped barrel over it.
    const { compound, bracket } = weldedAt('barrel');
    const loops = compound.outlineLoops();
    expect(loops.length).toBe(1);
    const unfused = buildCompoundPath([bracket.d], SettingsService.objectScale / 4);
    expect(loops[0].length).toBe(unfused.rings[0].length - 1);
  });

  it('leaves the bore out of the channels cut into it', () => {
    // The bore is the skin's own business. While the barrel was the carrier
    // this never showed: the barrel is skinned, so the link layer dropped its
    // outline and the channel with it. Welded, the carrier becomes the
    // compound -- and the bore came out as a filled capsule the length of the
    // barrel, in the bracket's color. Still true now the compound is what
    // paints the barrel: the guard is what keeps the bore out, not the layer.
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
    const { service, compound, mount, tip } = weldedAt('rod');
    // A block riding the bracket, on the line between the bracket's own two
    // joints: an external slot in the very root that also holds the rod.
    // It has to be drawn.
    //
    // The block is a joint of its own rather than the bracket's far end. It
    // could be that end while a slider was a pin with a prismatic twin beside
    // it, because the twin rode the slot and the pin went on being a slot
    // joint; a slider is that joint now (Stage 1 of
    // `docs/joint-type-and-cylinder-plan.md`), and a slot cannot be drawn
    // through the joint that rides it.
    const rider = new RevJoint('Z', (mount.x + tip.x) / 2, (mount.y + tip.y) / 2);
    service.joints.push(rider);
    service.cutSlotOn(rider, { carrier: compound, a: mount, b: tip, x: rider.x, y: rider.y });
    service.finishStructuralEdit(true);

    const channels = new SliderMarkService().channels(
      service.joints,
      0.15 * SettingsService.objectScale
    );
    expect(channels.map((channel) => channel.carrierId)).toEqual([compound.id]);
  });
});

describe('which pass of the skin paints a welded body', () => {
  const markFor = (cylinder: Cylinder) => ({ id: cylinder.seal.id, cylinder });

  it('paints a barrel’s body under the head and a rod’s body over it', () => {
    const barrelEnd = weldedAt('barrel');
    const underTheHead = fusedBodiesOf([markFor(barrelEnd.ram)]);
    expect([...underTheHead.keys()]).toEqual([`${barrelEnd.ram.seal.id}:barrel`]);

    const rodEnd = weldedAt('rod');
    const overTheHead = fusedBodiesOf([markFor(rodEnd.ram)]);
    expect([...overTheHead.keys()]).toEqual([`${rodEnd.ram.seal.id}:rod`]);
  });

  it('paints a bracket two cylinders are welded to exactly once, in the rod’s place', () => {
    // A boom and a stick: one part's rod mount is the next one's barrel mount,
    // and a bracket welded there belongs to both. Painted once per pass it
    // would be drawn twice at its own alpha, over itself; painted in the
    // barrel's place the rod would vanish under the black head it is supposed
    // to be lying on, which is the cue the whole drawing rests on.
    const harness = createMechanismHarness();
    const service = harness.service;
    service.createCylinderFrom(new Coord(-5 * S, -1 * S), new Coord(0, 0));
    const boom = cylindersIn(service.joints)[0];
    service.createCylinderFrom(
      new Coord(0, 0),
      new Coord(4 * S, 3 * S),
      undefined,
      boom.mountB as RealJoint
    );
    service.addBarFrom(boom.mountB as RealJoint, new Coord(-1 * S, 3 * S));
    service.finishStructuralEdit(true);
    harness.active.updateSelectedObj(boom.mountB);
    service.weldJoint();
    service.finishStructuralEdit(true);

    const rams = service.sealedStructures();
    expect(rams.length).toBe(2);
    const shared = rams.filter((ram) => ram.rodRoot.id !== ram.rod.id);
    expect(shared.length).toBe(1);

    const painted = fusedBodiesOf(rams.map(markFor));
    expect(painted.size).toBe(1);
    const [key, only] = [...painted.entries()][0];
    expect(key).toBe(`${shared[0].seal.id}:rod`);
    // And both members it holds are listed, so each still has a region of its
    // own to be picked by.
    expect(only.members.map((member) => member.role).sort()).toEqual(['barrel', 'rod']);
  });

  it('answers nothing at all for a part nobody has welded', () => {
    const harness = createMechanismHarness();
    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(6 * S, 0));
    harness.service.finishStructuralEdit(true);
    const loose = harness.service.sealedStructures()[0];
    expect(fusedBodiesOf([markFor(loose)]).size).toBe(0);
    // The silhouette exists either way -- it is what the skin draws from -- and
    // nothing asks for it while the member is a body of its own.
    expect(memberSilhouette(loose, 'barrel', 0.15 * SettingsService.objectScale)).toContain('M');
  });
});

/** The two corners of a member's square cut, in the drawing's own coordinates. */
function cutCorners(ram: Cylinder, role: 'barrel' | 'rod', r: number): { x: number; y: number }[] {
  const frame = cylinderSkinFrame(ram, r);
  const along = role === 'barrel' ? frame.mouth : -frame.headHalf * Math.sign(frame.reach || 1);
  const across = (role === 'barrel' ? CYLINDER.barrelHalf : CYLINDER.rodHalf) * r;
  const cos = Math.cos(frame.angleRad);
  const sin = Math.sin(frame.angleRad);
  return [across, -across].map((side) => ({
    x: frame.x + along * cos - side * sin,
    y: frame.y + along * sin + side * cos,
  }));
}

/**
 * How far the nearest point *on* a built outline falls from a given point.
 *
 * A filleted corner is written `Q <corner> <after>`, so the corner itself is
 * still in the path as the control point -- counting every number would say a
 * rounded corner is exactly where the square one was. Only the on-curve points
 * are read: the `L` and `M` targets, and a `Q`'s second pair.
 */
function nearestEdgePointTo(path: string, point: { x: number; y: number }): number {
  const tokens = path.match(/[MLQZ]|-?\d+(\.\d+)?(e[-+]?\d+)?/gi) ?? [];
  let nearest = Infinity;
  const number = (at: number) => Number(tokens[at]);
  for (let index = 0; index < tokens.length; index++) {
    const command = tokens[index].toUpperCase();
    if (command !== 'M' && command !== 'L' && command !== 'Q') continue;
    const at = index + (command === 'Q' ? 3 : 1);
    nearest = Math.min(nearest, Math.hypot(number(at) - point.x, number(at + 1) - point.y));
    index = at + 1;
  }
  return nearest;
}
