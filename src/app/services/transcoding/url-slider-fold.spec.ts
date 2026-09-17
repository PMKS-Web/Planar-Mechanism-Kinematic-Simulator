import { Injector } from '@angular/core';
import { Coord } from '../../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { JointTypeService } from '../joint-type.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { createMechanismHarness, wireGraph } from '../../../test-utils/mechanism-harness';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * Every URL ever shared spells a slider as three objects, and a slider is one
 * joint now (Stage 1 of `docs/joint-type-and-cylinder-plan.md`). This is the
 * seam: the reader folds the prismatic joint, its coincident pin and the
 * zero-length block joining them into the single joint that carries all three's
 * state, and it has to be exact, because undo and redo are URL replay.
 *
 * The legacy payloads here are not hand-typed strings. A drawing built the old
 * way encodes to exactly the old form -- the writer writes whatever the model
 * holds -- so building the trio and encoding it is both shorter and safer than
 * pasting bytes that could drift from what the app used to produce.
 */

const S = MODEL_SCALE;

function targetService(): MechanismService {
  return {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
}

function encode(source: { joints: unknown; links: unknown; forces: unknown }): string {
  return urlGeneratorFor(
    { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService()
  ).generateUrlQuery();
}

function rebuild(encoded: string): MechanismService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = targetService();
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

/**
 * A slider-crank in the shape every shared URL has it: crank AB, rod BC, and at
 * C a pin with a coincident prismatic joint P joined by the block CP, which is
 * where the mass lived. `welded` is what made it a Slide rather than a
 * pin-in-slot -- the bit that is `rotates` on the joint now.
 */
function legacySliderCrank({ welded, mass }: { welded: boolean; mass: number }) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 1 * S, 0);
  const pin = new RevJoint('C', 3 * S, 0);
  const slider = new PrisJoint('P', 3 * S, 0, false, true);
  slider.angle_rad = 0;
  pin.isWelded = welded;

  const crank = new RealLink('AB', [a, b], 2, 3, new Coord(0.5 * S, 0));
  const rod = new RealLink('BC', [b, pin], 4, 5, new Coord(2 * S, 0));
  const block = new Link('CP', [pin, slider], mass);

  [a, b].forEach((joint) => joint.links.push(crank));
  [b, pin].forEach((joint) => joint.links.push(rod));
  pin.links.push(block);
  slider.links.push(block);

  return { joints: [a, b, pin, slider], links: [crank, rod, block], forces: [] };
}

/**
 * A bent bar A-B-C with a Slide at the elbow B, in the spelling every shared
 * URL has it: the pin at B is welded, the block BP pairs it with the slider,
 * and the two riders are fused into the compound ABC. The compound is what
 * separates this from the crank above: one rider needs no body built for it,
 * two fuse into one, and the flag is the record of that body.
 */
function legacyTwoRiderSlide() {
  const a = new RevJoint('A', 0, 0);
  const pin = new RevJoint('B', 2 * S, 0);
  const slider = new PrisJoint('P', 2 * S, 0, false, true);
  slider.angle_rad = 0;
  const c = new RevJoint('C', 3 * S, 2 * S);
  pin.isWelded = true;

  const ab = new RealLink('AB', [a, pin], 2, 3, new Coord(1 * S, 0));
  const bc = new RealLink('BC', [pin, c], 4, 5, new Coord(2.5 * S, 1 * S));
  const compound = new RealLink('ABC', [a, pin, c], 6, 8, new Coord(1.5 * S, 0.5 * S));
  compound.subset = [ab, bc];
  const block = new Link('BP', [pin, slider], 1);

  [a, pin].forEach((joint) => joint.links.push(ab));
  [pin, c].forEach((joint) => joint.links.push(bc));
  [a, pin, c].forEach((joint) => joint.links.push(compound));
  pin.links.push(block);
  slider.links.push(block);

  return { joints: [a, pin, slider, c], links: [compound, block], forces: [] };
}

/** The same elbow as one joint: the slider carries the weld and the compound. */
function twoRiderSlide() {
  const a = new RevJoint('A', 0, 0);
  const slider = new PrisJoint('B', 2 * S, 0, false, true);
  slider.angle_rad = 0;
  slider.rotates = false;
  slider.isWelded = true;
  const c = new RevJoint('C', 3 * S, 2 * S);

  const ab = new RealLink('AB', [a, slider], 2, 3, new Coord(1 * S, 0));
  const bc = new RealLink('BC', [slider, c], 4, 5, new Coord(2.5 * S, 1 * S));
  const compound = new RealLink('ABC', [a, slider, c], 6, 8, new Coord(1.5 * S, 0.5 * S));
  compound.subset = [ab, bc];

  [a, slider].forEach((joint) => joint.links.push(ab));
  [slider, c].forEach((joint) => joint.links.push(bc));
  [a, slider, c].forEach((joint) => joint.links.push(compound));

  return { joints: [a, slider, c], links: [compound], forces: [] };
}

/** Decode into a real service, so a change of type can be asked of the result. */
function rebuildLive(encoded: string) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  new MechanismBuilder(
    harness.service,
    decoder,
    harness.injector.get(SettingsService),
    harness.active
  ).build(false);
  wireGraph(harness.service);
  const types = Injector.create({
    providers: [{ provide: JointTypeService, deps: [] }],
    parent: harness.injector,
  }).get(JointTypeService);
  return { harness, types };
}

describe('folding a three-object slider into one joint', () => {
  it('keeps the pin’s id, so nothing that named it has to be repaired', () => {
    const target = rebuild(encode(legacySliderCrank({ welded: true, mass: 1.318 })));

    // The pin's letter is the one the canvas has always drawn -- a slider's own
    // letter is never shown -- so keeping it leaves the drawing lettered exactly
    // as it was, and every link id built from it still names something.
    expect(target.joints.map((joint) => joint.id)).toEqual(['A', 'B', 'C']);
    expect(target.links.map((link) => link.id)).toEqual(['AB', 'BC']);

    const slider = target.joints.find((joint) => joint.id === 'C');
    expect(slider).toBeInstanceOf(PrisJoint);
  });

  it('carries the block’s mass and the pin’s weld onto that joint', () => {
    const target = rebuild(encode(legacySliderCrank({ welded: true, mass: 1.318 })));
    const slider = target.joints.find((joint) => joint.id === 'C') as PrisJoint;

    expect(slider.mass).toBeCloseTo(1.318, 9);
    // The pin was welded, which is what a Slide used to be: the rider cannot
    // turn against the slot.
    expect(slider.rotates).toBe(false);
    // And the weld bit itself means nothing on a slider any more.
    expect(slider.isWelded).toBe(false);
  });

  it('reads an unwelded pin as a pin-in-slot', () => {
    const target = rebuild(encode(legacySliderCrank({ welded: false, mass: 0 })));
    const slider = target.joints.find((joint) => joint.id === 'C') as PrisJoint;

    expect(slider.rotates).toBe(true);
    expect(slider.mass).toBe(0);
  });

  it('leaves no block behind, and points the rider at the joint itself', () => {
    const target = rebuild(encode(legacySliderCrank({ welded: true, mass: 1.318 })));
    const slider = target.joints.find((joint) => joint.id === 'C') as PrisJoint;
    const rod = target.links.find((link) => link.id === 'BC')!;

    expect(target.links.every((link) => link instanceof RealLink)).toBe(true);
    // Identity, not id: a rider holding some other copy of the joint reads a
    // position that never moves.
    expect(rod.joints).toContain(slider);
    expect(slider.links).toContain(rod);
  });

  it('moves nothing: the geometry and the slot are what the URL said', () => {
    const target = rebuild(encode(legacySliderCrank({ welded: true, mass: 1.318 })));
    const slider = target.joints.find((joint) => joint.id === 'C') as PrisJoint;

    expect(slider.x).toBeCloseTo(3 * S, 6);
    expect(slider.y).toBeCloseTo(0, 6);
    expect(slider.ground).toBe(true);
    expect(slider.slotAngle).toBeCloseTo(0, 6);
    expect(target.joints.find((joint) => joint.id === 'A')!.x).toBeCloseTo(0, 6);
    expect(target.joints.find((joint) => joint.id === 'B')!.x).toBeCloseTo(1 * S, 6);
  });

  it('writes the short form afterwards, and reads its own writing back the same', () => {
    const once = rebuild(encode(legacySliderCrank({ welded: true, mass: 1.318 })));
    const written = encode(once as unknown as { joints: unknown; links: unknown; forces: unknown });

    // No piston record: the block is not a thing any more, so there is nothing
    // to write one from.
    const records = written.split('.');
    expect(records.some((record) => /^[A-Za-z0-9_-]P/.test(record))).toBe(false);

    // Undo and redo replay URLs, so the second read has to land on the same
    // drawing as the first -- otherwise a single undo would quietly change the
    // mechanism it was undoing.
    const twice = rebuild(written);
    const shape = (target: MechanismService) => ({
      joints: target.joints.map((joint) => ({
        id: joint.id,
        prismatic: joint instanceof PrisJoint,
        rotates: joint instanceof PrisJoint ? joint.rotates : undefined,
        mass: joint instanceof PrisJoint ? joint.mass : undefined,
        ground: joint instanceof RealJoint ? joint.ground : undefined,
        x: Math.round(joint.x * 1000) / 1000,
        y: Math.round(joint.y * 1000) / 1000,
      })),
      links: target.links.map((link) => `${link.id}[${link.joints.map((one) => one.id).join('')}]`),
    });
    expect(shape(twice)).toEqual(shape(once));
  });

  it('keeps a renamed pin’s name on the joint that survives it', () => {
    const source = legacySliderCrank({ welded: false, mass: 0 });
    (source.joints[2] as RevJoint).name = 'Carriage';

    const target = rebuild(encode(source));
    expect(target.joints.find((joint) => joint.id === 'C')!.name).toBe('Carriage');
  });

  it('keeps a lock that stood on the prismatic joint, whose id goes away', () => {
    // A locked ram arrives as `J` on the prismatic record: the fold renames
    // the survivor to the pin's id after the transcoder has validated, so the
    // mark has to be resolved through the rename or it is dropped in silence.
    const source = legacySliderCrank({ welded: true, mass: 1 });
    (source.joints[3] as PrisJoint).locked = true;

    const target = rebuild(encode(source));
    expect((target.joints.find((joint) => joint.id === 'C') as RealJoint).locked).toBe(true);
  });

  it('keeps a color that stood on the prismatic joint', () => {
    const source = legacySliderCrank({ welded: false, mass: 0 });
    (source.joints[3] as PrisJoint).colorFamily = 'd';

    const target = rebuild(encode(source));
    expect(target.joints.find((joint) => joint.id === 'C')!.colorFamily).toBe('d');
  });

  it('keeps the weld-point flag where a compound stands at the slider', () => {
    // The pin's weld bit is spent on `rotates`, so without its own record the
    // flag would come back false with the compound still standing: a weld
    // nothing can split, because unwelding returns early on the missing flag
    // and still flips the type.
    const target = rebuild(encode(legacyTwoRiderSlide()));
    const slider = target.joints.find((joint) => joint.id === 'B') as PrisJoint;

    expect(slider.rotates).toBe(false);
    expect(slider.isWelded).toBe(true);
    expect(
      target.links.some(
        (link) =>
          link instanceof RealLink && link.subset.length === 2 && link.joints.includes(slider)
      )
    ).toBe(true);
  });

  it('writes the slider’s weld in the short form and reads it back', () => {
    const once = rebuild(encode(twoRiderSlide()));
    const slider = once.joints.find((joint) => joint.id === 'B') as PrisJoint;

    expect(slider.isWelded).toBe(true);
    expect(once.links.some((link) => link instanceof RealLink && link.subset.length === 2)).toBe(
      true
    );
  });

  it('drops a stale pin ground on a slot that rides a carrier', () => {
    // An older drawing kept the ground on the pin after the slot went
    // floating. Carrying it across would write a slider that is both grounded
    // and carried -- a URL the decoder refuses, so the save after the reopen
    // would be the one that throws.
    const source = legacySliderCrank({ welded: false, mass: 0 });
    const pin = source.joints[2] as RevJoint;
    const slider = source.joints[3] as PrisJoint;
    // The crank, not the rod: the slot's joints must be carrier members
    // without naming the fold pair, and only the crank offers two.
    const crank = source.links[0] as RealLink;
    slider.slideOn(crank, source.joints[0], source.joints[1]);
    pin.ground = true;

    const target = rebuild(encode(source));
    const folded = target.joints.find((joint) => joint.id === 'C') as PrisJoint;
    expect(folded.isFloating).toBe(true);
    expect(folded.ground).toBe(false);

    const again = rebuild(
      encode(target as unknown as { joints: unknown; links: unknown; forces: unknown })
    );
    const twice = again.joints.find((joint) => joint.id === 'C') as PrisJoint;
    expect(twice.isFloating).toBe(true);
    expect(twice.carrier?.id).toBe('AB');
  });

  it('rebinds a slot through a folded pin when the carrier is welded in', () => {
    // The carrier is a leaf of a compound by the time the fold runs, so
    // resolving it against the roots alone leaves the slot joints pointing at
    // the pin object that was just spliced out of the drawing.
    const a = new RevJoint('A', 0, 0);
    const pin = new RevJoint('X', 4 * S, 0);
    const d = new RevJoint('D', 0, 4 * S);
    const e = new RevJoint('E', 4 * S, 4 * S);
    const slider = new PrisJoint('P', 4 * S, 0, false, true);
    slider.angle_rad = 0;
    const floater = new PrisJoint('S', 2 * S, 3 * S);
    // The carrier is the bar the folded pin ends: the slot's joints must be
    // carrier members, so only a pin on the carrier can put a fold in a slot
    // line. Welded into the compound, it is a leaf by the time the fold runs.
    const ax = new RealLink('AX', [a, pin], 2, 3, new Coord(2 * S, 0));
    const de = new RealLink('DE', [d, e], 2, 3, new Coord(2 * S, 4 * S));
    const compound = new RealLink('AXDE', [a, pin, d, e], 4, 6, new Coord(2 * S, 2 * S));
    compound.subset = [ax, de];
    const block = new Link('XP', [pin, slider], 0);
    floater.slideOn(ax, pin, a);
    [a, pin].forEach((joint) => joint.links.push(ax));
    [d, e].forEach((joint) => joint.links.push(de));
    [a, pin, d, e].forEach((joint) => joint.links.push(compound));
    pin.links.push(block);
    slider.links.push(block);

    const target = rebuild(
      encode({ joints: [a, pin, d, e, slider, floater], links: [compound, block], forces: [] })
    );
    const live = target.joints.find((joint) => joint.id === 'X') as PrisJoint;
    const rebound = target.joints.find((joint) => joint.id === 'S') as PrisJoint;
    expect(rebound.isFloating).toBe(true);
    expect(rebound.carrier?.id).toBe('AX');
    // Identity, not id: the pin object is gone from the drawing, so a slot
    // still naming it reads a line that never moves.
    expect(rebound.slotJointA).toBe(live);
  });

  it('splits the compound when Pin-in-slot is chosen after a round trip', () => {
    // The whole path: encode the one-joint form, decode it into a live
    // drawing, and ask for the other type. Before the weld token the flag
    // came back false and this flipped `rotates` with the bars still fused.
    const { harness, types } = rebuildLive(encode(twoRiderSlide()));
    const slider = harness.service.joints.find((joint) => joint.id === 'B') as PrisJoint;
    expect(slider.isWelded, 'the flag survived the round trip').toBe(true);

    expect(types.set(slider, 'pin-in-slot')).toBe(true);

    const after = harness.service.joints.find((joint) => joint.id === 'B') as PrisJoint;
    expect(after.rotates).toBe(true);
    expect(after.isWelded).toBe(false);
    expect(
      harness.service.links.every((link) => !(link instanceof RealLink) || link.subset.length === 0)
    ).toBe(true);
    expect(harness.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC']);
  });
});
