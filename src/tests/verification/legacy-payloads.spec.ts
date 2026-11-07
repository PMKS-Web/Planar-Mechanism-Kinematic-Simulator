// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { LEGACY_TEMPLATE_PAYLOADS } from '../../test-data/legacy-payloads';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
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
  // Old URLs store thousandths of a user unit; compare their quantized
  // drawing against the precise modern one at that original storage grain.
  const position = (value: number) => Math.round((value / MODEL_SCALE) * 1000);
  const mass = (value: number) => Math.round(value * 1000);
  return {
    joints: service.joints
      .map((joint) => {
        const slot = joint instanceof PrisJoint;
        const real = joint instanceof RealJoint;
        return [
          joint.id,
          slot ? 'slot' : 'pin',
          position(joint.x),
          position(joint.y),
          `m=${slot ? mass((joint as PrisJoint).mass) : 0}`,
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
            .join('')}] m=${mass(link.mass)}`
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

// Modern encodings of templates redrawn since, as they stood before the redraw.
// The 2026-11 review moved both pumps' drive from the beam to the crank, which
// is a different mechanism on purpose; what this file checks is that the old
// bytes still decode to the drawing they always were.
const REDRAWN_TEMPLATES: Record<string, string> = {
  Pumpjack:
    '2v.Ay,1E8.3,0.1011.4A,A,0gB,0oI,0.0M,M,0QZ,0o1,0.2P,P,0d4,0,0.4S,S,0,0,0.0H,H,o0,0,0.5R,R,r8,0eW,OZ..YRAM,AM,0,0,0YN,0oA,303e9f,A,M,,.YRMP,MP,0,0,0Wq,0P1,26A69A,M,P,,.YRPSH,PSH,0,0,3f,0,0d125a,P,S,H,,.YRHR,HR,0,0,pa,0KG,00695C,H,R,,...N_.PJA~0~-2.6990643176077627,PJA~1~-3.217926632074842,PJM~0~-1.6992015124463058,PJM~1~-3.20136248843078,PJR~1~-2.5922962793631443,PJR~2~1.5707963267948966,PLAM~2~-2.1991329150270342,PLAM~3~-3.2096445602528108,PLMP~2~-2.099600756223153,PLMP~3~-1.60068124421539,PLPSH~2~0.2333333333333334,PLHR~3~-1.2961481396815722q*0iiBXx',
  Pumping_Field:
    '2v.Ay,1E8.5,0.1011.4A,A,0gB,0oI,0.0B,B,0QZ,0o1,0.2C,C,0d4,0,0,,,,2SG.4D,D,0,0,0.0E,E,o0,0,0.5F,F,r8,0eW,OZ.4H,H,2Wz,0oI,0.0I,I,2mb,0o1,0.2J,J,2a4,0,0,,,,1z0.4K,K,3B8,0,0.0L,L,3z8,0,0.5M,M,40G,0eW,OZ.4O,O,5i5,0oI,0.0P,P,5xj,0o1,0.2Q,Q,5lC,0,0,,,,2xW.4R,R,6MG,0,0.0S,S,78G,0,0.5T,T,7BO,0eW,OZ..YRAB,AB,0,0,0YN,0oA,303e9f,A,B,,.YRBC,BC,0,0,0Wq,0P1,26A69A,B,C,,.YRCDE,CDE,0,0,3f,0,0d125a,C,D,E,,.YREF,EF,0,0,pa,0KG,00695C,E,F,,.YRHI,HI,0,0,2en,0oA,303e9f,H,I,,.YRIJ,IJ,0,0,2gK,0P1,26A69A,I,J,,.YRJKL,JKL,0,0,3En,0,0d125a,J,K,L,,.YRLM,LM,0,0,3_i,0KG,00695C,L,M,,.YROP,OP,0,0,5pv,0oA,303e9f,O,P,,.YRPQ,PQ,0,0,5rS,0P1,26A69A,P,Q,,.YRQRS,QRS,0,0,6Pv,0,0d125a,Q,R,S,,.YRST,ST,0,0,79q,0KG,00695C,S,T,,...N_.PJA~0~-2.6990643176077627,PJA~1~-3.217926632074842,PJB~0~-1.6992015124463058,PJB~1~-3.20136248843078,PJF~1~-2.5922962793631443,PJF~2~1.5707963267948966,PJH~0~10.300935682392238,PJH~1~-3.217926632074842,PJI~0~11.300798487553694,PJI~1~-3.20136248843078,PJM~1~-2.5922962793631443,PJM~2~1.5707963267948966,PJO~0~23.300935682392236,PJO~1~-3.217926632074842,PJP~0~24.3007984875537,PJP~1~-3.20136248843078,PJT~1~-2.5922962793631443,PJT~2~1.5707963267948966,PLAB~2~-2.1991329150270342,PLAB~3~-3.2096445602528108,PLBC~2~-2.099600756223153,PLBC~3~-1.60068124421539,PLCDE~2~0.2333333333333334,PLEF~3~-1.2961481396815722,PLHI~2~10.800867084972966,PLHI~3~-3.2096445602528108,PLIJ~2~10.900399243776846,PLIJ~3~-1.60068124421539,PLJKL~2~13.233333333333334,PLLM~2~16.299999999999997,PLLM~3~-1.2961481396815722,PLOP~2~23.800867084972964,PLOP~3~-3.2096445602528108,PLPQ~2~23.900399243776846,PLPQ~3~-1.60068124421539,PLQRS~2~26.233333333333334,PLST~2~29.299999999999997,PLST~3~-1.2961481396815722z*1GHiUP',
};

describe('the payloads a release before Stage 1 actually shipped', () => {
  for (const [name, legacy] of Object.entries(LEGACY_TEMPLATE_PAYLOADS)) {
    it(`${name} opens as the mechanism it is today`, () => {
      // Retired cards remain valid shared mechanisms; compare against the retained modern baseline.
      const current =
        REDRAWN_TEMPLATES[name] ??
        TEMPLATE_LINKAGES[name as keyof typeof TEMPLATE_LINKAGES] ??
        RETIRED_TEMPLATES[name];
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
