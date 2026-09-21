// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { Link, RealLink } from '../../app/model/link';
import { buildCompoundPath, transformRigidPath } from '../../app/model/compound-link-path';
import { Cylinder, cylindersIn } from '../../app/model/cylinder';
import { drawnOutlineOf, memberSilhouette } from '../../app/model/cylinder-fusion';
import { barrelFillOf, rodFillOf } from '../../app/model/cylinder-skin';
import { blockPath, MARK } from '../../app/model/joint-marks';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { SliderMark, SliderMarkService } from '../../app/services/slider-mark.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SLIDE_FUSION_PAYLOAD } from '../../test-utils/verification/slide-fusion-scene';

/**
 * A slider's weld plate is the union of its block with what is actually drawn
 * at its rider (decision S18).
 *
 * The plate was built from the rider's plain link path — the thin bar its two
 * joints describe — which is the right shape for every rider but two per
 * cylinder. A cylinder member is drawn by the skin, as a barrel's real profile
 * or a rod's, so the plate laid a second, thinner copy of the part over the
 * part: the doubled barrel at `D`, the doubled rod at `K`. A Pin-in-slot fuses
 * nothing and hoisted that same bar above the block instead, inside the barrel
 * it is the outline of (`G`). And a member welded into a body lost its plate
 * altogether, because the seal at the rod's other end is a slider too and
 * claimed the body before the Slide could reach it (`O`).
 *
 * The payload is the maintainer's own, so every case here is one that was
 * reported rather than one invented to match the fix.
 */

const S = MODEL_SCALE;
const R = 0.15 * S;

let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * S);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

/** The reported drawing, decoded into real Joint and Link objects. */
function reportedScene() {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(SLIDE_FUSION_PAYLOAD);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.finishStructuralEdit(false);
  return {
    ...harness,
    marks: new SliderMarkService().marks(harness.service.joints, R),
    cylinders: cylindersIn(harness.service.joints),
  };
}

/** How many closed loops an outline is made of. One ring is one body. */
function rings(path: string): number {
  return (path.match(/Z/g) ?? []).length;
}

/** A fillet is the one curve `buildCompoundPath` emits. */
function fillets(path: string): number {
  return (path.match(/Q/g) ?? []).length;
}

function markAt(marks: SliderMark[], id: string): SliderMark {
  return marks.find((mark) => mark.id === id)!;
}

/** A world-frame outline carried into a mark's own frame, as the service does. */
function intoSlotFrame(path: string, mark: SliderMark): string {
  const angle = (mark.rotation * Math.PI) / 180;
  const along = { x: mark.x + Math.cos(angle), y: mark.y + Math.sin(angle) };
  return transformRigidPath(path, mark, along, { x: 0, y: 0 }, { x: 1, y: 0 });
}

/** The plate this mark should have: the block, fused with what is drawn at the rider. */
function expectedPlate(mark: SliderMark, rider: RealLink, cylinders: Cylinder[]): string {
  const outline = intoSlotFrame(drawnOutlineOf(cylinders, rider, R)!, mark);
  return buildCompoundPath([outline, blockPath(R)], MARK.plateFillet * R).path;
}

/** Which cylinder this link is a member of, and which half of it. */
function memberRoleOf(cylinders: Cylinder[], link: Link) {
  for (const cylinder of cylinders) {
    if (cylinder.barrel.id === link.id) return { cylinder, role: 'barrel' as const };
    if (cylinder.rod.id === link.id) return { cylinder, role: 'rod' as const };
  }
  return undefined;
}

describe('the drawing four wrong plates were reported on', () => {
  it('decodes to the four cases the report names', () => {
    const { service, marks } = reportedScene();
    const typeOf = (id: string) => {
      const joint = service.joints.find((one) => one.id === id) as PrisJoint;
      return { prismatic: !joint.rotates, ground: joint.ground, sealed: joint.isSealed };
    };

    expect(typeOf('D')).toEqual({ prismatic: true, ground: true, sealed: false });
    expect(typeOf('G')).toEqual({ prismatic: false, ground: true, sealed: false });
    expect(typeOf('K')).toEqual({ prismatic: true, ground: true, sealed: false });
    expect(typeOf('O')).toEqual({ prismatic: true, ground: true, sealed: false });
    // Four reported sliders and the four seals that drive them.
    expect(marks.map((mark) => mark.id)).toEqual(['D', 'F', 'G', 'I', 'K', 'L', 'N', 'O']);
  });

  (['D', 'K', 'O'] as const).forEach((id) => {
    it(`${id}: one plate, one outline, and it is the block fused with what is drawn`, () => {
      const { marks, cylinders } = reportedScene();
      const mark = markAt(marks, id);
      const plate = mark.plate!;

      // One rider, one closed outline, and a filleted one -- which is what
      // "one continuous stroke with a fillet between them" means here.
      expect(plate.links.length).toBe(1);
      expect(rings(plate.outline)).toBe(1);
      expect(fillets(plate.outline)).toBeGreaterThan(0);
      // And to the character, the union of the block with the rider's drawn
      // outline. At O that outline reaches the plate through the body which
      // has already swallowed the rod, which is why the rider is asked rather
      // than the member.
      expect(plate.outline).toBe(expectedPlate(mark, plate.links[0] as RealLink, cylinders));
    });
  });

  it('D and K take the member’s silhouette, not the bar its two joints describe', () => {
    const { marks, cylinders } = reportedScene();
    for (const id of ['D', 'K'] as const) {
      const member = markAt(marks, id).plate!.links[0] as RealLink;
      const found = memberRoleOf(cylinders, member)!;
      const silhouette = memberSilhouette(found.cylinder, found.role, R);

      expect(found.role, id).toBe(id === 'D' ? 'barrel' : 'rod');
      expect(drawnOutlineOf(cylinders, member, R)).toBe(silhouette);
      expect(silhouette).not.toBe(member.d);
      // The old plate is still buildable, and it is a different shape: the thin
      // bar fits inside the part, which is exactly how it drew.
      expect(markAt(marks, id).plate!.outline).not.toBe(
        buildCompoundPath(
          [intoSlotFrame(member.d, markAt(marks, id)), blockPath(R)],
          MARK.plateFillet * R
        ).path
      );
    }
  });

  it('paints each fused part in the ink that part is drawn in', () => {
    const { marks, cylinders } = reportedScene();

    for (const id of ['D', 'K', 'O']) {
      const plate = markAt(marks, id).plate!;
      const rider = plate.links[0] as RealLink;
      const found = memberRoleOf(cylinders, rider);
      const drawn = !found
        ? rider.fill
        : found.role === 'barrel'
          ? barrelFillOf(found.cylinder)
          : rodFillOf(found.cylinder);
      expect(plate.fill, id).toBe(drawn);
    }
    // The body at O is light green, which is the whole of what the report asks
    // for there: a plate at all, in the part's own color.
    expect(markAt(marks, 'O').plate!.fill).toBe('#B2DFDB');
  });

  it('G fuses nothing: no plate, and no plain bar hoisted above the block', () => {
    const { marks } = reportedScene();
    const pinInSlot = markAt(marks, 'G');

    expect(pinInSlot.welded).toBe(false);
    expect(pinInSlot.plate).toBeUndefined();
    // The barrel is drawn by the skin, one layer up, so this layer draws it
    // nowhere. A rider here was the bar showing through the barrel.
    expect(pinInSlot.riders).toEqual([]);
  });

  it('a seal plates nothing and claims nothing, so the Slide at O still has a rider', () => {
    const { service, marks } = reportedScene();
    const seals = marks.filter((mark) => mark.joint.isSealed);

    expect(seals.map((mark) => mark.id)).toEqual(['F', 'I', 'L', 'N']);
    expect(seals.every((mark) => mark.plate === undefined && mark.riders.length === 0)).toBe(true);
    // N is the seal on the rod the body at O holds, and it comes first in the
    // joint list: claiming that body there is what left O with a bare block.
    const seal = service.joints.find((one) => one.id === 'N') as RealJoint;
    const body = seal.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    expect(markAt(marks, 'O').plate!.links.map((link) => link.id)).toEqual([body.id]);
    expect(body.subset.map((leaf: Link) => leaf.id)).toEqual(['NO', 'OP']);
  });

  it('cuts no bore into a plate: a ram’s bore is not an ordinary channel', () => {
    const { marks } = reportedScene();
    // The barrel at D carries the sealed sliding joint, so it is a slot carrier
    // in every structural sense. Cutting that slot into the plate, now that the
    // plate draws the barrel's real profile, hollowed the part into a fork.
    expect(markAt(marks, 'D').plate!.cuts).toEqual([]);
    expect(markAt(marks, 'D').plate!.path).toBe(markAt(marks, 'D').plate!.outline);
  });
});

describe('an ordinary Slide, which none of this touches', () => {
  /** A bar pinned to a grounded Prismatic slider, with no cylinder anywhere. */
  function plainSlide() {
    const harness = createMechanismHarness();
    const slider = new PrisJoint('C', 0, 0, false, true);
    slider.rotates = false;
    const tip = new RevJoint('W', 3 * S, 2 * S);
    const bar = new RealLink('CW', [slider as RealJoint, tip]);
    slider.links = [bar];
    tip.links = [bar];
    harness.service.joints.push(slider, tip);
    harness.service.links.push(bar);
    harness.service.finishStructuralEdit(true);
    return { ...harness, bar, marks: new SliderMarkService().marks(harness.service.joints, R) };
  }

  it('still draws the plate the rider’s own path makes with the block', () => {
    const { marks, bar } = plainSlide();
    const mark = markAt(marks, 'C');

    // Byte-identical to what the plate was before a plate knew about skins:
    // `drawnOutlineOf` answers with the link's own path for every body but a
    // cylinder member, so an ordinary Slide goes through the same code and
    // comes out the same shape.
    expect(mark.plate!.outline).toBe(expectedPlate(mark, bar, []));
    expect(mark.plate!.outline).toBe(
      buildCompoundPath([intoSlotFrame(bar.d, mark), blockPath(R)], MARK.plateFillet * R).path
    );
    expect(mark.plate!.fill).toBe(bar.fill);
  });
});
