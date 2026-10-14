// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../model/joint';
import { Coord } from '../../model/coord';
import { PrisJoint, RealJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { cylinderAtSeal, cylindersIn } from '../../model/cylinder';
import { MODEL_SCALE } from '../../model/render-scale';
import { LEGACY_TEMPLATE_PAYLOADS } from '../../../test-data/legacy-payloads';
import { createMechanismHarness, wireGraph } from '../../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../../test-utils/url-encoding';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';

/**
 * A cylinder's seal is the square a reader selects, so it wears a letter
 * (decision S9).
 *
 * Creation hands one out; this is the other half, which is every drawing
 * already shared. A seal used to be interior — no marker, no hitbox, no row —
 * so creation spent an *interior* name on it, `A2`, and that name would now
 * read on the canvas, in a panel title and in an export column. The reader
 * gives such a seal the next free letter as the last step of the build.
 *
 * What has to survive it is everything a payload attaches by id: the link ids
 * are rebuilt from the joints, and the locks, holds, forces and center-of-mass
 * anchors stay on the bodies that carried them. The codec is untouched — this
 * renames objects after they are built — so the proof that nothing else moved
 * is that the geometry decodes to the same numbers and a second pass changes
 * nothing at all.
 */

const S = MODEL_SCALE;

function decoded(url: string): MechanismService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(url);
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

function reencode(target: MechanismService): string {
  return encodeUrlOf(target, new SettingsService());
}

/** Every leaf and compound at or under these roots. */
function everyLink(roots: Link[]): Link[] {
  return roots.flatMap((link) =>
    link instanceof RealLink && link.subset.length > 0 ? [link, ...everyLink(link.subset)] : [link]
  );
}

/**
 * The drawing a release before this one wrote: a cylinder whose seal carries an
 * interior name, with a bracket on its rod end holding a length, a load on that
 * bracket, a lock on the part and a hand-placed center of mass.
 *
 * Built through `createCylinderFrom` and then *demoted*, rather than assembled
 * by hand: the shape has to be one the app itself produced, and the only thing
 * that has changed about it is the two names.
 */
function oldStyleDrawing(options: { welded?: boolean } = {}) {
  const harness = createMechanismHarness();
  const { service, active } = harness;
  service.createCylinderFrom(new Coord(0, 0), new Coord(4 * S, 0));
  const ram = service.sealedStructures()[0];
  const mount = ram.mountB as RealJoint;

  const bracket = service.addBarFrom(mount, new Coord(mount.x + S, mount.y + S)) as RealLink;
  const tip = bracket.joints.find((joint) => joint.id !== mount.id) as RealJoint;
  if (options.welded) {
    active.updateSelectedObj(mount);
    service.weldJoint();
  }
  // Three things a payload attaches by id, each on the bracket so that the
  // rename cannot be said to have worked by leaving everything alone.
  bracket.hold = 'length';
  bracket.comIsCustom = true;
  bracket.CoM = new Coord(tip.x + 0.2 * S, tip.y - 0.1 * S);
  bracket.comAnchor = { joint: tip.id };
  bracket.captureComOffset();
  service.createForce(new Coord(tip.x, tip.y), new Coord(tip.x, tip.y + S), bracket);
  // A Lock on a cylinder is one mark on the seal (decision S8).
  (ram.seal as RealJoint).locked = true;

  demoteSeal(service);
  wireGraph(service);
  return { harness, service, bracketId: bracket.id, tipId: tip.id };
}

/**
 * Put the seal's name back the way the last release wrote it: an interior name
 * hung off the barrel's own mount, with every link id rebuilt around it.
 */
function demoteSeal(service: MechanismService): string {
  const ram = service.sealedStructures()[0];
  const was = ram.seal.id;
  const demoted = `${ram.mountA.id}2`;
  ram.seal.id = demoted;
  for (const link of everyLink(service.links)) {
    if (!link.joints.some((joint) => joint.id === demoted)) continue;
    link.id = link.joints
      .map((joint) => joint.id)
      .sort()
      .join('');
    link.fixedLocations = link.fixedLocations.map((location) =>
      location.id === was ? { id: demoted, label: demoted } : location
    );
  }
  return demoted;
}

const LETTERS = /^[A-Za-z]+$/;

describe('a seal that arrives with an interior name', () => {
  it('is given the next free letter, and the links holding it are renamed', () => {
    const { service } = oldStyleDrawing();
    const before = service.sealedStructures()[0];
    expect(before.seal.id, 'the fixture really is an old payload').toBe('A2');

    const target = decoded(reencode(service));
    const ram = cylindersIn(target.joints)[0];
    expect(ram, 'the cylinder still resolves').toBeDefined();
    expect(ram.seal.id).toMatch(LETTERS);
    // The letter creation would have reached for, over the joints this payload
    // actually carries: A and C are the ends and D is the bracket's tip, so the
    // seal that was demoted to `A2` comes back as E.
    expect(ram.seal.id).toBe('E');
    // Unnamed, a joint reads as its id -- which is the whole point of giving
    // it one a reader can be shown.
    expect(ram.seal.name).toBe('E');
    // The buried barrel end is never renamed: nothing shows it, and its name is
    // what keeps `determineNextLetter` from counting it.
    expect(ram.inner.id).toBe('A1');
    // A link id is the sorted concatenation of its joints', so the rod's moved
    // with the seal and the barrel's did not.
    expect(ram.rod.id).toBe('CE');
    expect(ram.barrel.id).toBe('AA1');
  });

  it('moves no geometry, and keeps every mark on the body that carried it', () => {
    const { service, bracketId, tipId } = oldStyleDrawing();
    const was = new Map(service.joints.map((joint) => [joint.id, { x: joint.x, y: joint.y }]));
    const ram = service.sealedStructures()[0];

    const target = decoded(reencode(service));
    const now = cylindersIn(target.joints)[0];
    // By role, because the seal's *name* is the one thing that changed.
    const pairs: [{ x: number; y: number }, string][] = [
      [now.mountA, ram.mountA.id],
      [now.inner, ram.inner.id],
      [now.seal, ram.seal.id],
      [now.mountB, ram.mountB.id],
    ];
    for (const [joint, id] of pairs) {
      // The codec rounds to a thousandth of a user unit, so this is what "did
      // not move" means for any decode.
      expect(Math.hypot(joint.x - was.get(id)!.x, joint.y - was.get(id)!.y)).toBeLessThan(
        0.002 * S
      );
    }

    const bracket = target.links.find((link) => link.id === bracketId) as RealLink;
    expect(bracket, 'the bracket came back under its own name').toBeDefined();
    expect(bracket.hold).toBe('length');
    expect(bracket.comAnchor).toEqual({ joint: tipId });
    expect(target.forces).toHaveLength(1);
    expect(target.forces[0].link.id).toBe(bracketId);
    // The Lock rode on the seal, whose id the payload spells the old way; it is
    // re-armed before the rename and so lands on the joint it belongs to.
    const seal = target.joints.find((joint) => joint.id === now.seal.id) as RealJoint;
    expect(seal.locked).toBe(true);
  });

  it('leaves a name somebody chose alone, and still gives the id a letter', () => {
    const { service } = oldStyleDrawing();
    service.sealedStructures()[0].seal.name = 'Seal';

    const ram = cylindersIn(decoded(reencode(service)).joints)[0];
    expect(ram.seal.id).toMatch(LETTERS);
    expect(ram.seal.name).toBe('Seal');
  });

  it('settles after one pass, which is what undo replaying a URL needs', () => {
    const { service } = oldStyleDrawing();
    const first = reencode(decoded(reencode(service)));
    const second = reencode(decoded(first));
    expect(second).toBe(first);
  });

  it("follows a welded mount's compound as well as the bar inside it", () => {
    const { service } = oldStyleDrawing({ welded: true });
    const target = decoded(reencode(service));
    const ram = cylindersIn(target.joints)[0];

    expect(ram.rodRoot.id, 'the rod was swallowed by the bracket').not.toBe(ram.rod.id);
    // Every body holding the seal names it by its new letter, leaf and compound
    // alike -- an id built from a joint that no longer answers is a body no
    // panel, export column or URL can name.
    for (const link of everyLink(target.links)) {
      if (!link.joints.some((joint) => joint.id === ram.seal.id)) continue;
      expect(link.id, link.id).toContain(ram.seal.id);
      expect(link.id, link.id).not.toContain('A2');
    }
  });
});

describe('a seal that already has a letter', () => {
  it('keeps it, through a payload a shipped release actually wrote', () => {
    // `Cylinder_Boom` as the last release before Stage 1 emitted it. It spells
    // its slider the old way -- a prismatic joint, a coincident pin and a
    // zero-length block joining them -- and the fold keeps the *pin's* letter,
    // `P`, which is a name a reader can be shown. Nothing here to rename.
    const target = decoded(LEGACY_TEMPLATE_PAYLOADS['Cylinder_Boom']);
    const seal = target.joints.find((joint): joint is PrisJoint => joint instanceof PrisJoint)!;
    expect(cylinderAtSeal(seal), 'the payload really is a cylinder').toBeDefined();
    expect(seal.id).toBe('P');
    expect(reencode(decoded(reencode(target)))).toBe(reencode(target));
  });

  it('keeps it through a drawing this release wrote, which never demotes one', () => {
    const harness = createMechanismHarness();
    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(4 * S, 0));
    wireGraph(harness.service);
    const url = reencode(harness.service);
    const target = decoded(url);
    const ram = cylindersIn(target.joints)[0];
    // The slide takes the letter after the end the gesture started from (S9).
    expect(ram.seal.id).toBe('B');
    expect(reencode(target)).toBe(url);
  });
});
