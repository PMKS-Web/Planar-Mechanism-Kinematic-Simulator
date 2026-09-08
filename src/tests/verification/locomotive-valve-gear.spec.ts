import '../../app/model/joint';
import { buildMechanismFixture, mechanismLengthUnit } from '../fixtures/mechanism-fixtures';
import { Joint, RealJoint } from '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';

/**
 * A locomotive's drive traced over its drawing: two coupled wheels, a
 * connecting rod to a crosshead on two horizontal slides, and a valve gear
 * whose combination lever S-W hangs from the valve rod and is swung by a pin
 * on the crosshead riding a slot in it. The lever's lower end W is attached
 * to nothing, so the valve rod can slide on its own: the drawing has two
 * freedoms. Gruebler counted one, because the crosshead's second slide is a
 * constraint it charges for and the geometry does not, and the solver was
 * then handed a two-freedom drawing and reported a dead position.
 *
 * Tying W down is half the cure. The valve rod's far end T is welded to its
 * block -- a Slide, which holds the rod level -- and a rod that cannot tilt
 * cannot follow a pin on a lever that swings. Unweld T as well and it runs.
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

  it('is still refused with W tied down, because the welded valve rod cannot tilt', () => {
    // W grounded on the decoded drawing -- the URL carries a checksum, so it
    // cannot be edited as text -- and the mechanism built again from it the
    // way the harness builds the first. The lever now turns about W, so its
    // pin S moves on a circle; the rod S-T is welded to the block at T, which
    // the guide holds level, so S may only move along the guide. Nothing can
    // move, and the geometry says so. (It used to say one freedom, reading
    // the slot in the lever as horizontal, and the solver then animated the
    // rod tilting through a weld that forbids it.)
    const { service, settings } = buildMechanismFixture(LOCOMOTIVE);
    const w = service.joints.find((joint) => joint.id === 'W') as RealJoint;
    w.ground = true;
    const tied = rebuild(service, settings);
    expect(tied.dof).toBeLessThan(1);
    expect(tied.isMechanismValid()).toBe(false);
    expect(tied.failure).toBe('mobility');
  });

  it('runs once W is tied down and the valve rod is free to tilt at T', () => {
    const { service, settings } = buildMechanismFixture(LOCOMOTIVE);
    const w = service.joints.find((joint) => joint.id === 'W') as RealJoint;
    w.ground = true;
    const t = service.joints.find((joint) => joint.id === 'T') as RealJoint;
    t.isWelded = false;
    const tied = rebuild(service, settings);
    expect(tied.dof).toBe(1);
    expect(tied.isMechanismValid()).toBe(true);
    expect(tied.joints.length).toBeGreaterThan(100);
  });
});

/** The same drive, built again from the fixture's editable joints. */
function rebuild(service: MechanismService, settings: SettingsService): Mechanism {
  const speed = settings.inputSpeed.value * (Math.PI / 30) * (settings.isInputCW.value ? -1 : 1);
  return new Mechanism(
    service.joints,
    service.links,
    service.forces,
    [],
    true,
    mechanismLengthUnit(settings.lengthUnit.value),
    speed
  );
}

/**
 * The same drive with its combination lever pinned to the frame at a third
 * joint, c, that is not on the lever's slot S-W. Reported as "should this
 * simulate?" after the app called it a part tied to nothing.
 */
const PINNED_LEVER =
  '2v.6G,Fe.A,0.1011.4A,A,0pH,PI,0.0B,B,0mS,ef,0.6C,C,3R,PI,0.0D,D,6G,ef,0.GI,I,ks,dj,0.5J,J,ks,dj,0.8K,K,1ky,d4,0.8L,L,r7,dh,0.0O,O,1ky,ku,0.GP,P,1ky,VG,0.8Q,Q,r8,r8,0.0R,R,gT,qz,0.0S,S,oa,17u,0.8T,T,1mW,17u,0.5U,U,1mW,17u,0.0W,W,ds,ku,0.5Y,Y,r8,r8,0.Ga,a,44,2g,0.Gb,b,0mS,2W,0.Kc,c,mS,xO,0.1d,d,gT,qz,0,SWc,S,W..1RABb,AB,0,0,0nO,Mq,c5cae9,A,B,b,,.1RCDa,CD,0,0,4b,Mt,303e9f,C,D,a,,.ARDB,DB,0,0,0L6,ef,0d125a,D,B,,.YPIJ,IJ,0,0,0,0,,I,J,,.ARDI,DI,0,0,QZ,eB,0d125a,D,I,,.YPTU,TU,0,0,0,0,,T,U,,.YPQY,QY,0,0,0,0,,Q,Y,,.ARST,ST,0,0,1HY,17u,00695C,S,T,,.ARSWc,SW,0,0,kI,xO,c5cae9,S,W,c,,.ARIKLOPQR,IKLOPQR,0,0,16Y,iW,B2DFDB,I,K,L,Q,O,P,R,,IKL,QL,KOP,QR.YPRd,Rd,0,0,0,0,,R,d,,.aRIKL,IKL,0,0,16J,dV,B2DFDB,I,K,L,,.aRQL,QL,0,0,r7,kQ,303e9f,Q,L,,.aRKOP,KOP,0,0,1ky,d4,00695C,K,O,P,,.aRQR,QR,0,0,lo,r3,303e9f,Q,R,,...N_.HlDB4*4Mw0vn';

describe('the same drive with its combination lever pinned to the frame', () => {
  it('is refused as drawn, for the weld at T rather than for a part tied to nothing', () => {
    // Gruebler counts -1: two slides on the crosshead, charged twice. The
    // geometry, which used to rescue this to one and then call the solver's
    // failure a hidden freedom, now sees the weld at T for the lock it is.
    const { mechanism } = buildMechanismFixture(PINNED_LEVER);
    expect(mechanism.dof).toBeLessThan(1);
    expect(mechanism.isMechanismValid()).toBe(false);
    expect(mechanism.failure).toBe('mobility');
    expect(mechanism.hiddenFreedoms).toBeUndefined();
  });

  describe('with the valve rod free to tilt at T', () => {
    const { service, settings } = buildMechanismFixture(PINNED_LEVER);
    (service.joints.find((joint) => joint.id === 'T') as RealJoint).isWelded = false;
    const free = rebuild(service, settings);
    const frames = free.joints;
    const at = (frame: Joint[], id: string) => frame.find((one) => one.id === id)!;

    it('runs: Gruebler still says -1, the geometry says one, and the solver agrees', () => {
      expect(free.dof).toBe(1);
      expect(free.isMechanismValid()).toBe(true);
      expect(free.failure).toBeUndefined();
      expect(frames.length).toBeGreaterThan(100);
    });

    it('swings the lever about c, which is not on its slot', () => {
      // The inverse-slot primitive used to swing a carrier only about one of
      // its slot joints, and this lever's only known joint is its pivot c.
      // Now it swings about any known pin, keeping the pivot's offset from the
      // slot line -- so c stays put, the lever stays rigid, and the block d
      // stays on the line S-W, all to the drawing's own precision.
      const cS = Math.hypot(
        at(frames[0], 'c').x - at(frames[0], 'S').x,
        at(frames[0], 'c').y - at(frames[0], 'S').y
      );
      const cW = Math.hypot(
        at(frames[0], 'c').x - at(frames[0], 'W').x,
        at(frames[0], 'c').y - at(frames[0], 'W').y
      );
      for (const frame of frames) {
        const c = at(frame, 'c');
        const s = at(frame, 'S');
        const w = at(frame, 'W');
        const d = at(frame, 'd');
        expect(c.x).toBe(at(frames[0], 'c').x);
        expect(c.y).toBe(at(frames[0], 'c').y);
        expect(Math.hypot(c.x - s.x, c.y - s.y)).toBeCloseTo(cS, 3);
        expect(Math.hypot(c.x - w.x, c.y - w.y)).toBeCloseTo(cW, 3);
        const length = Math.hypot(w.x - s.x, w.y - s.y);
        const off = ((w.x - s.x) * (d.y - s.y) - (w.y - s.y) * (d.x - s.x)) / length;
        // The block was drawn a twentieth of a unit off the line; it keeps
        // exactly that, on a slot three hundred and fifty long.
        expect(Math.abs(off)).toBeLessThan(0.05);
      }
    });

    it('rocks rather than turning, because the block reaches the end of its slot', () => {
      // Not a limitation of the solve: the slot as drawn is shorter than the
      // block's travel. Extend W and the crank turns all the way round.
      const speeds = free.inputAngularVelocities;
      const reversal = speeds.findIndex((speed) => Math.sign(speed) !== Math.sign(speeds[0]));
      expect(reversal).toBeGreaterThan(0);
      const last = frames[reversal - 1];
      const s = at(last, 'S');
      const w = at(last, 'W');
      const d = at(last, 'd');
      const along =
        ((d.x - s.x) * (w.x - s.x) + (d.y - s.y) * (w.y - s.y)) /
        Math.hypot(w.x - s.x, w.y - s.y) ** 2;
      expect(along).toBeGreaterThan(0.85);
    });

    it('solves its rates, with more loops than rates, and they are the positions’ derivatives', () => {
      // Five loops, eight rates: the crosshead's two slides and the
      // parallelogram write rows that repeat each other, and the least-squares
      // answer is the exact one. The lever's joints are carried from c, the
      // grounded pivot, so the rates hold from frame to frame rather than
      // drifting on a seed left over from the frame before.
      KinematicsSolver.resetVariables();
      KinematicsSolver.requiredLoops = free.requiredLoops;
      expect(free.requiredLoops.length).toBeGreaterThan(4);
      const time = free.timeNum;
      const speeds = free.inputAngularVelocities;
      const reversal = speeds.findIndex((speed) => Math.sign(speed) !== Math.sign(speeds[0]));
      const velocity = new Map<string, number[][]>();
      for (let t = 0; t < reversal; t++) {
        KinematicsSolver.determineKinematics(frames[t], free.links[t], speeds[t]);
        expect(KinematicsSolver.jointVelMap.get('c')).toEqual([0, 0]);
        for (const id of ['S', 'W', 'T', 'd']) {
          velocity.set(id, [
            ...(velocity.get(id) ?? []),
            [...KinematicsSolver.jointVelMap.get(id)!],
          ]);
        }
      }
      for (let t = 1; t < reversal - 1; t++) {
        const dt = time[t + 1] - time[t - 1];
        for (const id of ['S', 'W', 'T', 'd']) {
          const v = velocity.get(id)![t];
          const fdx = (at(frames[t + 1], id).x - at(frames[t - 1], id).x) / dt;
          const fdy = (at(frames[t + 1], id).y - at(frames[t - 1], id).y) / dt;
          // Against speeds of several hundred units a second, to a fraction
          // of a percent: the differencing's own error on a rocking drive.
          expect(Math.hypot(v[0] - fdx, v[1] - fdy)).toBeLessThan(2);
        }
      }
    });
  });
});

/**
 * The same drive again, with the valve rod split at a pin `f`.
 *
 * The reader's own answer to the weld at `T`: rather than unweld it, put a
 * joint in the rod. `T`-`f` stays welded to the block and so stays level, and
 * `f`-`S` is free to tilt between it and the lever. That is a real valve gear,
 * and it is also the arrangement neither of the two ways of locating a welded
 * assembly could reach -- no slot is cut into it, and no member of it is
 * placed before it. It is located by the link onto it instead.
 */
const SPLIT_VALVE_ROD =
  '2v.6G,Fe.A,0.1011.4A,A,0pH,PI,0.0B,B,0mS,ef,0.6C,C,3R,PI,0.0D,D,6G,ef,0.GI,I,ks,dj,0.5J,J,ks,dj,0.8K,K,1ky,d4,0.8L,L,r7,dh,0.0O,O,1ky,ku,0.GP,P,1ky,VG,0.8Q,Q,r8,r8,0.0R,R,gK,qy,0.0S,S,o0,17u,0.8T,T,1mW,17u,0.0W,W,ds,ku,0.5Y,Y,r8,r8,0.Ga,a,44,2g,0.Gb,b,0mS,2W,0.Kc,c,mS,xO,0.1d,d,gK,qy,0,SWc,S,W.5e,e,1mW,17u,0.0f,f,14m,17u,0..1RABb,AB,0,0,0nO,Mq,c5cae9,A,B,b,,.1RCDa,CD,0,0,4b,Mt,303e9f,C,D,a,,.ARDB,DB,0,0,0L6,ef,0d125a,D,B,,.YPIJ,IJ,0,0,0,0,,I,J,,.ARDI,DI,0,0,QZ,eB,0d125a,D,I,,.YPQY,QY,0,0,0,0,,Q,Y,,.ARSWc,SW,0,0,k6,xO,c5cae9,S,W,c,,.ARIKLOPQR,IKLOPQR,0,0,16X,iW,B2DFDB,I,K,L,Q,O,P,R,,IKL,QL,KOP,QR.YPRd,Rd,0,0,0,0,,R,d,,.YPTe,Te,0,0,0,0,,T,e,,.ARfS,fS,0,0,xO,17u,303e9f,f,S,,.ARTf,Tf,0,0,1Qe,17u,0d125a,T,f,,.aRIKL,IKL,0,0,16J,dV,B2DFDB,I,K,L,,.aRQL,QL,0,0,r7,kQ,303e9f,Q,L,,.aRKOP,KOP,0,0,1ky,d4,00695C,K,O,P,,.aRQR,QR,0,0,lo,r3,303e9f,Q,R,,...N_.HlDBp*4JxB75';

describe('the drive with its valve rod split at a pin', () => {
  const { mechanism } = buildMechanismFixture(SPLIT_VALVE_ROD);
  const frames = mechanism.joints;
  const at = (frame: Joint[], id: string) => frame.find((one) => one.id === id)!;

  it('runs', () => {
    // Gruebler counts zero -- the crosshead's two slides again -- and the
    // geometry rescues it to one, which the solver then walks.
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(frames.length).toBeGreaterThan(300);
  });

  it('keeps the valve rod level and its pin on the lever', () => {
    const level = at(frames[0], 'T').y;
    const rod = Math.hypot(
      at(frames[0], 'f').x - at(frames[0], 'S').x,
      at(frames[0], 'f').y - at(frames[0], 'S').y
    );
    for (const frame of frames) {
      // The weld holds T, its block e and the rod's own pin f on one line.
      for (const id of ['T', 'e', 'f']) {
        expect(at(frame, id).y).toBeCloseTo(level, 6);
      }
      expect(
        Math.hypot(at(frame, 'f').x - at(frame, 'S').x, at(frame, 'f').y - at(frame, 'S').y)
      ).toBeCloseTo(rod, 3);
    }
  });

  it('solves its rates, and nothing on the valve rod moves across its guide', () => {
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    const speeds = mechanism.inputAngularVelocities;
    const reversal = speeds.findIndex((speed) => Math.sign(speed) !== Math.sign(speeds[0]));
    for (let t = 0; t < reversal; t++) {
      KinematicsSolver.determineKinematics(frames[t], mechanism.links[t], speeds[t]);
      for (const id of ['T', 'e', 'f']) {
        expect(Math.abs(KinematicsSolver.jointVelMap.get(id)![1])).toBeLessThan(1e-6);
      }
      // And the whole assembly travels as one.
      expect(KinematicsSolver.jointVelMap.get('T')![0]).toBeCloseTo(
        KinematicsSolver.jointVelMap.get('f')![0],
        6
      );
    }
  });
});
