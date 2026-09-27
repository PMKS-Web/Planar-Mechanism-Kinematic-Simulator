// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Checksum } from '../../app/services/transcoding/checksum';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import {
  BUILT_IN_TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { JOINT_TYPE, LINK_TYPE } from '../../app/services/transcoding/transcoder-data';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { TEMPLATE_BASELINES } from './template-baseline';
import { MODEL_SCALE } from '../../app/model/render-scale';

// The URL codec is a compatibility surface: every mechanism anyone has ever
// shared is a string in this format. These tests pin what the five built-in
// templates decode to and what they solve to, so a solver or codec refactor
// cannot quietly change either. See docs/joint-types-plan.md, Phase 0.

function decode(payload: string): StringTranscoder {
  const transcoder = new StringTranscoder();
  transcoder.decodeURL(payload);
  return transcoder;
}

/**
 * The joints, links, forces and selection — everything but the global-settings
 * prefix and the trailing checksum.
 *
 * The prefix is excluded on purpose: all five templates predate GLOBAL_UNIT and
 * carry three enums, so re-encoding legitimately writes a fourth and shifts the
 * checksum with it. Nothing after that point is allowed to move.
 */
function mechanismSection(payload: string): string {
  return new Checksum().strip(payload).split('.').slice(4).join('.');
}

describe('built-in template URLs', () => {
  for (const templateID of BUILT_IN_TEMPLATE_IDS) {
    const baseline = TEMPLATE_BASELINES[templateID];

    describe(templateID, () => {
      it('decodes to the pinned topology', () => {
        const transcoder = decode(TEMPLATE_LINKAGES[templateID]);

        expect(
          transcoder.getJoints().map((joint) => ({
            id: joint.id,
            type: joint.type,
            x: joint.x,
            y: joint.y,
            isGrounded: joint.isGrounded,
            isInput: joint.isInput,
            isWelded: joint.isWelded,
            angleRadians: joint.angleRadians,
          }))
        ).toEqual(baseline.joints);

        expect(
          transcoder.getLinks().map((link) => ({
            id: link.id,
            type: link.type,
            jointIDs: link.jointIDs,
            subsetLinkIDs: link.subsetLinkIDs,
          }))
        ).toEqual(baseline.links);
      });

      it('re-encodes its joints, links and forces byte-identically', () => {
        // Stronger than the structural round trip below, which compares decoded
        // data and so cannot see a record that gained or lost empty tokens.
        // Every template URL is a string users have already shared.
        expect(mechanismSection(decode(TEMPLATE_LINKAGES[templateID]).encodeURL())).toBe(
          mechanismSection(TEMPLATE_LINKAGES[templateID])
        );
      });

      it('survives a decode/encode/decode round trip unchanged', () => {
        const first = decode(TEMPLATE_LINKAGES[templateID]);
        const second = decode(first.encodeURL());

        expect(second.getJoints()).toEqual(first.getJoints());
        expect(second.getLinks()).toEqual(first.getLinks());
        expect(second.getForces()).toEqual(first.getForces());
      });

      it('solves to the pinned positions', () => {
        const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES[templateID]);

        expect(mechanism.isMechanismValid()).toBe(true);
        expect(mechanism.dof).toBe(1);
        // The sample count fixes the t=0 pose: a mechanism that closes its
        // cycle in a different number of steps has moved its own zero.
        expect(mechanism.joints.length).toBe(baseline.steps);

        baseline.picks.forEach((timestep, index) => {
          // Solved positions are internal model units (user x MODEL_SCALE);
          // the baseline pins what the user sees, so compare in user units.
          // The solver rounds every step to 1e-4 of a model unit, which used
          // to be 1e-4 of a user unit and is now 200x finer — so the 4th
          // user decimal can legitimately move by up to ~2e-4. Half of the
          // last pinned digit is the bound; a real solver change is far
          // coarser than that.
          const frame = mechanism.joints[timestep];
          const sample = baseline.samples[index];
          // By letter, not by place in the array. The order the solver hands
          // joints back in is not something a shared URL ever promised -- it is
          // an artifact of how the drawing was assembled, and folding a
          // slider's three objects into one reorders it. Which joints there
          // are, and where each of them is, is the whole of what this pins.
          expect(frame.map((joint) => joint.id).sort()).toEqual(sample.map(([id]) => id).sort());
          const drawn = new Map(frame.map((joint) => [joint.id, joint]));
          sample.forEach(([id, x, y]) => {
            const joint = drawn.get(id)!;
            expect(joint.x / MODEL_SCALE, `${id} x at t=${timestep}`).toBeCloseTo(x, 3);
            expect(joint.y / MODEL_SCALE, `${id} y at t=${timestep}`).toBeCloseTo(y, 3);
          });
        });
      });
    });
  }
});

// The slider-crank is the template that exercises the prismatic path, so its
// structure gets asserted explicitly rather than only through the snapshot.
describe('Slider_Crank prismatic structure', () => {
  it('stores the slider as one grounded prismatic joint, with no block beside it', () => {
    // The stored form. This payload used to spell the slider as three objects
    // -- a pin, a coincident prismatic joint, and a zero-length block link
    // joining them -- because that is what the writer emitted when it was
    // typed in. The reader folds that spelling and the writer cannot produce
    // it any more, so regenerating the payload rewrote it into the one joint
    // (Stage 1 of `docs/joint-type-and-cylinder-plan.md`).
    //
    // That a URL in the *old* spelling still opens to the same drawing is
    // proved in `services/transcoding/url-slider-fold.spec.ts`, which builds
    // the trio and encodes it rather than pasting bytes that could drift from
    // what the app used to write. This asserts the other half: that nothing
    // here still emits the old spelling.
    const transcoder = decode(TEMPLATE_LINKAGES['Slider_Crank']);
    const jointC = transcoder.getJoints().find((joint) => joint.id === 'C')!;

    expect(transcoder.getJoints().map((joint) => joint.id)).toEqual(['A', 'B', 'C']);
    expect(jointC.type).toBe(JOINT_TYPE.PRISMATIC);
    expect(jointC.isGrounded).toBe(true);

    expect(transcoder.getLinks().map((link) => link.id)).toEqual(['AB', 'BC']);
    expect(transcoder.getLinks().some((link) => link.type === LINK_TYPE.PISTON)).toBe(false);
  });

  it('opens as that one joint, and the rod holds it at every timestep', () => {
    // The test above is what the URL *says*; this is what opening it gives.
    // The joint carries the pin's letter -- C, the one the canvas always drew
    // and the one link BC is named after, since a slider's own letter is never
    // shown.
    //
    // Keeping a pin and a prismatic joint coincident used to be a constraint
    // the solver had to meet at every timestep, and this is where that was
    // checked. There are no longer two of them to come apart, so what is
    // checked instead is that the one joint is the one the rod is holding --
    // at every timestep, not only the first.
    const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES['Slider_Crank']);

    expect(mechanism.links[0].every((link) => link instanceof RealLink)).toBe(true);
    expect(mechanism.links[0].map((link) => link.id).sort()).toEqual(['AB', 'BC']);

    for (let timestep = 0; timestep < mechanism.joints.length; timestep++) {
      const joints = mechanism.joints[timestep];
      expect(joints.map((joint) => joint.id).sort(), `t=${timestep}`).toEqual(['A', 'B', 'C']);
      const jointC = joints.find((joint) => joint.id === 'C')!;
      expect(jointC, `t=${timestep}`).toBeInstanceOf(PrisJoint);
      // Identity, not id: a rod holding some other copy of the joint would read
      // a position that never moves.
      const rod = mechanism.links[timestep].find((link) => link.id === 'BC')!;
      expect(rod.joints, `t=${timestep}`).toContain(jointC);
    }
  });

  it('keeps the slider on its guide line for the whole cycle', () => {
    const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES['Slider_Crank']);

    // The template's guide is horizontal, so the slider's y is the invariant
    // the circle-line intersection has to preserve. This is the assertion the
    // parametric-line rewrite must not move.
    const guideY = mechanism.joints[0].find((joint) => joint.id === 'C')!.y;
    const prismatic = mechanism.joints[0].find(
      (joint) => joint instanceof PrisJoint
    ) as unknown as RealJoint;
    expect((prismatic as unknown as PrisJoint).angle_rad).toBe(0);

    for (let timestep = 0; timestep < mechanism.joints.length; timestep++) {
      // Bit-exact equality held in the unscaled world; at model scale one
      // solve path leaves float noise ~1e-13 of a model unit. Six decimals of
      // a model unit is 5e-9 of a user unit — the invariant, minus the bits.
      expect(mechanism.joints[timestep].find((joint) => joint.id === 'C')!.y).toBeCloseTo(
        guideY,
        6
      );
    }
  });
});
