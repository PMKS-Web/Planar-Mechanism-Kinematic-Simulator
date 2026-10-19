// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { LEGACY_TEMPLATE_PAYLOADS } from '../../test-data/legacy-payloads';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { MechanismService } from '../../app/services/mechanism.service';

/**
 * The seventeen payloads a shipped release emitted, against the seventeen the
 * app writes today.
 *
 * Stage 1 of `docs/joint-type-and-cylinder-plan.md` changed what a slider is
 * and left the URL reading both spellings. `url-slider-fold.spec.ts` proves the
 * fold on a trio it builds itself, which is the right way to test it and cannot
 * catch a byte the old *writer* produced that the new reader mis-parses. These
 * are those bytes: for each template, the old string and the new one have to
 * decode to the same drawing.
 *
 * Compared on what a reader would notice -- which joints there are, where they
 * are, what they weigh, whether they slide and whether they turn in their slot,
 * and which bodies join which joints. Not compared byte for byte: the new
 * payload is deliberately the short spelling, which is the whole change.
 */
interface Shape {
  joints: string[];
  links: string[];
}

function shapeOf(service: MechanismService): Shape {
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return {
    joints: service.joints
      .map((joint) => {
        const slot = joint instanceof PrisJoint;
        const real = joint instanceof RealJoint;
        return [
          joint.id,
          slot ? 'slot' : 'pin',
          round(joint.x),
          round(joint.y),
          `m=${slot ? round((joint as PrisJoint).mass) : 0}`,
          `rotates=${slot ? (joint as PrisJoint).rotates : '-'}`,
          `ground=${real ? (joint as RealJoint).ground : '-'}`,
          `input=${real ? (joint as RealJoint).input : '-'}`,
        ].join(' ');
      })
      .sort(),
    links: service.links
      .filter((link): link is RealLink => link instanceof RealLink)
      .map(
        (link) =>
          `${link.id}[${link.joints
            .map((joint) => joint.id)
            .sort()
            .join('')}] m=${Math.round(link.mass * 1e6) / 1e6}`
      )
      .sort(),
  };
}

describe('the payloads a release before Stage 1 actually shipped', () => {
  for (const [name, legacy] of Object.entries(LEGACY_TEMPLATE_PAYLOADS)) {
    it(`${name} opens as the mechanism it is today`, () => {
      const current = TEMPLATE_LINKAGES[name as keyof typeof TEMPLATE_LINKAGES];
      expect(current, `${name} is still a template`).toBeDefined();

      const was = shapeOf(buildMechanismFixture(legacy).service);
      const now = shapeOf(buildMechanismFixture(current).service);

      // The old spelling has one extra joint per slider -- the coincident pin
      // the fold keeps the letter of -- so a payload that decoded without
      // folding would show up here as a joint count that does not match.
      expect(was.joints.length, 'same joints').toBe(now.joints.length);
      expect(was).toEqual(now);
    });
  }
});
