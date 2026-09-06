import '../../app/model/joint';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * A coupler on three equal parallel cranks, drawn with every crank lying
 * along the coupler. Gruebler counts it at zero, and the geometry rescue used
 * to agree at this one pose: it has two first-order freedoms here -- translate
 * the coupler, and turn it -- and the elimination handed them back mixed, so
 * each basis vector died at second order alone though the translation goes
 * anywhere. The user's own drawing, which refused to simulate until a crank
 * was nudged off the line.
 */
const FLAT_THREE_CRANK =
  '2v.1a,7q.A,0.1011.MA,A,0cI,8c,0,,,,02SG.GC,C,0ZA,8c,0.0D,D,0H_,8c,0.GJ,J,0pa,8c,0.4K,K,0si,8c,0.4M,M,0L6,8c,0..1RAC,ABC,0,0,0ak,8c,c5cae9,A,C,,.ARCDJ,CDJ,0,0,0Yn,8c,303e9f,C,D,J,,.1RJK,JKL,0,0,0r8,8c,26A69A,K,J,,.1RDM,DMN,0,0,0JY,8c,00695C,M,D,,...N_2*1Pbvu1';

describe('a parallelogram drawn flat, with a redundant third crank', () => {
  it('has one freedom at the flat pose and runs a whole cycle', () => {
    const { mechanism } = buildMechanismFixture(FLAT_THREE_CRANK);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.joints.length).toBeGreaterThan(300);
  });
});
