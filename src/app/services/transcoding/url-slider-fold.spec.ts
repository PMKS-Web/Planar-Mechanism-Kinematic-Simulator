import { Coord } from '../../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
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
});
