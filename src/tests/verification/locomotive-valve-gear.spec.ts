import '../../app/model/joint';
import { buildMechanismFixture, mechanismLengthUnit } from '../fixtures/mechanism-fixtures';
import { RealJoint } from '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';

/**
 * A locomotive's drive traced over its drawing: two coupled wheels, a
 * connecting rod to a crosshead on two horizontal slides, and a valve gear
 * whose combination lever S-W hangs from the valve rod and is swung by a pin
 * on the crosshead riding a slot in it. The lever's lower end W is attached
 * to nothing, so the valve rod can slide on its own: the drawing has two
 * freedoms. Gruebler counted one, because the crosshead's second slide is a
 * constraint it charges for and the geometry does not, and the solver was
 * then handed a two-freedom drawing and reported a dead position. Tie W down
 * and the same drawing runs.
 */
const LOCOMOTIVE =
  '2v.6G,Fe.A,0.1011.6A,A,0si,NS,0,,,,02SG.0B,B,0lj,bQ,0.4C,C,0,NS,0.0D,D,6-,bQ,0.GI,I,ks,dj,0.5J,J,ks,dj,0.8K,K,1ky,d4,0.8L,L,r7,dh,0.0O,O,1ky,ku,0.GP,P,1ky,VG,0.8Q,Q,r8,r8,0.0R,R,gb,rF,0.0S,S,oa,17u,0.8T,T,1mW,17u,0.5U,U,1mW,17u,0.0W,W,ds,ku,0.5Y,Y,r8,r8,0.1Z,Z,gb,rF,0,SW,S,W..ARAB,AB,0,0,0pC,UR,c5cae9,A,B,,.ARCD,CD,0,0,3W,UR,303e9f,C,D,,.ARDB,DB,0,0,0KN,bQ,0d125a,D,B,,.YPIJ,IJ,0,0,0,0,,I,J,,.ARDI,DI,0,0,Qx,ca,0d125a,D,I,,.YPTU,TU,0,0,0,0,,T,U,,.ARIKLOPQR,IKLOPQR,0,0,16Z,iY,B2DFDB,I,K,L,O,P,Q,R,,IKL,KOP,QR,QL.ARST,ST,0,0,1HY,17u,00695C,S,T,,.ARSW,SW,0,0,jD,xO,c5cae9,S,W,,.YPQY,QY,0,0,0,0,,Q,Y,,.YPRZ,RZ,0,0,0,0,,R,Z,,.aRIKL,IKL,0,0,16J,dV,B2DFDB,I,K,L,,.aRKOP,KOP,0,0,1ky,d4,00695C,K,O,P,,.aRQR,QR,0,0,ls,rC,303e9f,Q,R,,.aRQL,QL,0,0,r7,kQ,303e9f,Q,L,,...N_.HlAB,HlCD,HlDBX*2FU0kd';

describe('a locomotive drive whose combination lever hangs free', () => {
  it('is refused as a part tied to nothing, not as a dead position', () => {
    const { mechanism } = buildMechanismFixture(LOCOMOTIVE);
    // Gruebler's count, which is what decides whether the solver is tried.
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(false);
    expect((mechanism as unknown as { _failure: string })._failure).toBe('hidden-freedom');
    expect(mechanism.hiddenFreedoms).toBe(2);
  });

  it('runs once the lever’s free end is tied down', () => {
    // W grounded on the decoded drawing -- the URL carries a checksum, so it
    // cannot be edited as text -- and the mechanism built again from it the
    // way the harness builds the first.
    const { service, settings } = buildMechanismFixture(LOCOMOTIVE);
    const w = service.joints.find((joint) => joint.id === 'W') as RealJoint;
    w.ground = true;
    const speed = settings.inputSpeed.value * (Math.PI / 30) * (settings.isInputCW.value ? -1 : 1);
    const tied = new Mechanism(
      service.joints,
      service.links,
      service.forces,
      [],
      true,
      mechanismLengthUnit(settings.lengthUnit.value),
      speed
    );
    expect(tied.dof).toBe(1);
    expect(tied.isMechanismValid()).toBe(true);
    expect(tied.joints.length).toBeGreaterThan(100);
  });
});
