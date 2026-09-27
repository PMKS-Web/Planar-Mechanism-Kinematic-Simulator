// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { Checksum } from '../../app/services/transcoding/checksum';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { slideAssemblyAt } from '../../app/model/slide-assembly';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { urlGeneratorFor } from '../../test-utils/url-encoding';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { SettingsService } from '../../app/services/settings.service';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import {
  invertedSliderCrankFixture,
  scotchYokeFixture,
} from '../../test-utils/verification/slot-fixtures';
import { teachingLabFourBarFixture } from '../../test-utils/verification/fixtures';

// The 2x2 of docs/joint-types-plan.md §2.1 was a property of an *assembly*
// rather than of one serialized joint: the slot lived on the PrisJoint and the
// weld on the coincident RevJoint beside it, and nothing in the model enforced
// the pairing, so the pair had to be asserted rather than assumed (§3.5). Both
// facts are one joint's now -- it slides, and `rotates` says whether its riders
// may turn against the slot -- so what these check is that each cell survives
// the trip out to model objects and back, and that a rebuilt Slide is still one
// after the reconcile pass has looked at it.

/**
 * The joints, links, forces and selection — everything but the global-settings
 * prefix and the trailing checksum, which move for reasons unrelated to the
 * 2x2 (see template-url.spec.ts).
 */
function mechanismSection(payload: string): string {
  return new Checksum().strip(payload).split('.').slice(4).join('.');
}

/** A four-bar with one joint welded: the compound cell of the 2x2. */
function compoundWeldFixture() {
  return { ...teachingLabFourBarFixture(), welds: ['B'] };
}

const CELLS = [
  { name: 'pin', fixture: teachingLabFourBarFixture(), welded: [] as string[], slider: false },
  { name: 'compound weld', fixture: compoundWeldFixture(), welded: ['B'], slider: false },
  { name: 'slot', fixture: invertedSliderCrankFixture(), welded: [], slider: true },
  { name: 'slide', fixture: scotchYokeFixture(), welded: ['C'], slider: true },
];

describe('every cell of the 2x2', () => {
  it('round-trips its flags through the URL', () => {
    for (const cell of CELLS) {
      const decoder = new StringTranscoder();
      decoder.decodeURL(fixturePayload(cell.fixture));

      const weldedIds = decoder
        .getJoints()
        .filter((joint) => joint.isWelded)
        .map((joint) => joint.id);
      expect(weldedIds, `${cell.name}: welded joints`).toEqual(cell.welded);

      const hasPrismatic = decoder.getJoints().some((joint) => joint.type === 0);
      expect(hasPrismatic, `${cell.name}: has a slider`).toBe(cell.slider);
    }
  });

  it('rebuilds into model objects and re-encodes byte-identically', () => {
    // Through MechanismBuilder, not just the transcoder. Decoding and
    // re-encoding the same transcoder barely leaves the codec: it would pass
    // with the model side of the pairing entirely broken. What has to survive
    // is the trip out to real Joint and Link objects and back.
    for (const cell of CELLS) {
      const first = fixturePayload(cell.fixture);
      const rebuilt = buildMechanismFixture(first);

      const reencoded = urlGeneratorFor(rebuilt.service, rebuilt.settings).generateUrlQuery();
      expect(mechanismSection(reencoded), `${cell.name}`).toBe(mechanismSection(first));
    }
  });

  it('rebuilds a Slide that the reconcile pass then leaves alone', () => {
    // A rebuilt Slide has a weld flag and no compound, which is exactly the
    // shape the strip rule looks for. It must recognize the assembly instead.
    const { service, active } = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(fixturePayload(scotchYokeFixture()));
    new MechanismBuilder(service, decoder, new SettingsService(), active).build(true);
    // The Slide is the grounded sliding joint C, and it records itself in
    // `rotates`: the coincident pin whose `isWelded` used to carry that is the
    // object a slider no longer has.
    const welded = service.joints.find((joint) => joint.id === 'C') as PrisJoint;

    expect(welded.rotates).toBe(false);
    expect(slideAssemblyAt(welded)).toBeDefined();

    service.finishStructuralEdit(false);

    expect(welded.rotates, 'survives a reconcile').toBe(false);
    expect(slideAssemblyAt(welded)).toBeDefined();
  });
});

describe('a Slide across the per-timestep copies', () => {
  it('keeps the Slide at the last timestep, not just the first', () => {
    // A per-timestep copy rebuilds every joint and link, and `mechanism.ts`
    // switches on the constructor to do it -- so a flag that copies but a
    // structure that does not would leave a Slide the reconcile rules then
    // strip. What used to be copied as a welded pin plus a block is one joint
    // carrying `rotates` and its own mass now, and both have to survive.
    const built = buildMechanism(scotchYokeFixture());
    const last = built.mechanism.joints.length - 1;

    for (const step of [0, 1, Math.floor(last / 2), last]) {
      const joints = built.mechanism.joints[step];
      const slider = joints.find((joint) => joint.id === 'C') as PrisJoint;

      expect(slider, `slider at step ${step}`).toBeInstanceOf(PrisJoint);
      expect(slider.rotates, `Slide at step ${step}`).toBe(false);

      const assembly = slideAssemblyAt(slider);
      expect(assembly, `assembly at step ${step}`).toBeDefined();
      expect(assembly!.riders[0], `rider at step ${step}`).toBeInstanceOf(RealLink);
      // The rider is a body of the mechanism at this step, which is what the
      // block used to be asked for here.
      expect(built.mechanism.links[step], `rider is a body at step ${step}`).toContain(
        assembly!.riders[0]
      );
    }
  });
});
