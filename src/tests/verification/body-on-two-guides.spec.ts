import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * A welded tripod standing on two horizontal grounded guides, driven through a
 * two-bar chain, with a bar hanging off it on a pin-in-slot whose far end is
 * attached to nothing.
 *
 * The drawing has more than one freedom and must be refused: the hanging bar
 * may slide along its slot and turn about it, and nothing in the drawing says
 * where it goes. Reported from the app, where it simulated -- and drew that bar
 * at an angle the solver had invented, wandering a degree or so per revolution
 * while the reader watched.
 *
 * What made it simulate is two counting errors meeting in the middle. The bar
 * on a pin-in-slot adds a body and a half joint, so Gruebler gains two; the
 * tripod's two guides are two Slides between the same pair of bodies, each
 * charged for forbidding the same turn, so it loses two. The count came out at
 * exactly one -- the answer that means "this is a mechanism, solve it" -- and
 * the geometry, which says three, is only consulted when the count falls below
 * one. Charging the second Slide for what it actually adds puts the count at
 * two, which is what it was before a slider became one joint, and the drawing
 * is refused again.
 */
const BODY_ON_TWO_GUIDES =
  '2v.D8,6G.K,0.1011.2B,B,0l1,TI,0.8C,C,57,du,0.DD,D,1Dd,02F,0.DE,E,9m,0FH,0.GF,F,0x4,du,0.4G,G,01jU,0K3,0.0H,H,gE,vD,0.1I,I,T4,Pz,0,BCDE,C,D..ARBCDE,BCDE,0,0,9I,Lw,0d125a,B,C,D,E,,BC,CD,CE.ARBF,BF,0,0,0r2,Yb,00695C,B,F,,.ARFG,FG,0,0,01KH,9x,c5cae9,F,G,,.ARHI,HI,0,0,Zf,fb,303e9f,H,I,,.aRBC,BC,0,0,0Kz,Yb,0d125a,B,C,,.aRCD,CD,0,0,fN,Iq,B2DFDB,C,D,,.aRCE,CE,0,0,7S,CK,26A69A,C,E,,...N_9*0T7Guc';

describe('a body standing on two grounded guides', () => {
  it('is the shape this counts wrong: two Slides between the same two bodies', () => {
    // The premise, so a later change to the drawing cannot leave the rest of
    // this file asserting something about a mechanism it no longer describes.
    const { service } = buildMechanismFixture(BODY_ON_TWO_GUIDES);
    const guides = service.joints.filter(
      (joint): joint is PrisJoint => joint instanceof PrisJoint && !joint.rotates && joint.ground
    );
    expect(guides.map((joint) => joint.id).sort()).toEqual(['D', 'E']);
    // Both on the one welded body, so both hold it square against the world.
    for (const guide of guides) {
      expect(guide.links.map((link) => link.id)).toEqual(['BCDE']);
    }
    // And the bar that hangs on the third slot, free at its other end.
    const hanging = service.joints.find((joint) => joint.id === 'I') as PrisJoint;
    expect(hanging.rotates, 'free to turn in its slot').toBe(true);
    const far = service.joints.find((joint) => joint.id === 'H') as RealJoint;
    expect(far.ground, 'and tied to nothing at its far end').toBe(false);
    expect(far.links.map((link) => link.id)).toEqual(['HI']);
  });

  it('is refused rather than solved, because it has more than one freedom', () => {
    const { mechanism } = buildMechanismFixture(BODY_ON_TWO_GUIDES);

    expect(mechanism.dof).toBe(2);
    expect(mechanism.isMechanismValid()).toBe(false);
    // One sample: the drawing as it stands, and no motion worked out from it.
    expect(mechanism.joints.length).toBe(1);
  });
});
