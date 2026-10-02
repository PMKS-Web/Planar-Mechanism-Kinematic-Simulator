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

// Modern encodings retained when the duplicate library cards were retired.
const RETIRED_TEMPLATES: Record<string, string> = {
  Backhoe_Bucket:
    '2v.Ay,Im.5,0.1011.4A,A,01jO,0,0.0B,B,0sb,Py,0.hC,C,018N,HX,0,AB,A,B.0D,D,0Ha,hT,0.4G,G,0,0,0.0H,H,VG,Im,0.4J,J,o0,0P0,0.0K,K,1BI,2i,0.0T,T,1NW,0ee,0..YRAB,AB,0,0,01H-,C_,303e9f,A,B,,.YRCD,CD,0,0,0iz,UV,26A69A,C,D,,.YRDGH,DGH,0,0,4a,Kl,0d125a,D,G,H,,.YRHK,HK,0,0,rH,Ak,00695C,H,K,,.YRJKT,JKT,0,0,16x,0K-,303e9f,J,K,T,,...N_C*3qHKRi',
  Landing_Gear:
    '2v.Ay,5U.5,0.1011.4A,A,Zy,38,0.0B,B,bm,03h,0.GC,C,iS,0Sa,0.4D,D,Cw,JG,0.0E,E,NL,9f,0.hF,F,RL,5z,0,DE,D,E.4G,G,0Zy,38,0.0H,H,0bm,03h,0.GI,I,0iS,0Sa,0.4J,J,0Cw,JG,0.0K,K,0NL,9f,0.hL,L,0RL,5z,0,JK,J,K..YRABC,Starboard leg,0,0,dO,09j,303e9f,A,B,C,,.YRDE,DE,0,0,I7,ET,0d125a,D,E,,.YRBF,BF,0,0,WZ,19,26A69A,B,F,,.YRGHI,Port leg,0,0,0dO,09j,303e9f,G,H,I,,.YRJK,JK,0,0,0I7,ET,0d125a,J,K,,.YRHL,HL,0,0,0WZ,19,00695C,H,L,,...N_j*3XB8Vd',
};

describe('the payloads a release before Stage 1 actually shipped', () => {
  for (const [name, legacy] of Object.entries(LEGACY_TEMPLATE_PAYLOADS)) {
    it(`${name} opens as the mechanism it is today`, () => {
      // Retired cards remain valid shared mechanisms; compare against the retained modern baseline.
      const current =
        TEMPLATE_LINKAGES[name as keyof typeof TEMPLATE_LINKAGES] ?? RETIRED_TEMPLATES[name];
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
