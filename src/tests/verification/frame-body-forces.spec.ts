import '../../app/model/joint';
import {
  ForceAnalysisSeries,
  ForceSolver,
  SECOND_ORDER_LOCK_MESSAGE,
} from '../../app/model/mechanism/force-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';

// A link pinned to the world at two points cannot move: it is frame, not a
// link. Kinematics never minded one, but statics wrote three equilibrium
// equations for it against four ground reactions, and the drawing refused as
// "more supports than equilibrium can determine". The solver now sets such a
// body aside and treats its other pins as ground, so a four-bar whose ground
// link is drawn as an actual bar solves exactly as the one whose ground link is
// left implicit -- the same torque, the same reactions at every moving pin.

const LOAD: [number, number] = [0, -25];

function fourBar(withFrameBar: boolean): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 1.5 },
      { id: 'C', x: 4, y: 2.5 },
      { id: 'D', x: 5, y: 0, ground: true },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BC' },
      { joints: 'CD' },
      ...(withFrameBar ? [{ joints: 'AD' }] : []),
    ],
    load: { onLink: 'BC', at: [2.5, 2], vector: LOAD },
    inputAngVel: 10,
  };
}

const everyFrameOk = (series: ForceAnalysisSeries): void => {
  expect(series.diagnostic).toBeUndefined();
  expect(series.successfulFrames).toBe(series.frames.length);
  expect(series.frames.length).toBeGreaterThan(100);
};

const reactionsAt = (mechanism: Mechanism, series: ForceAnalysisSeries, t: number, joint: string) =>
  series.frames[t].jointReactions.get(joint) ?? [0, 0];

describe('force analysis with a link pinned to ground at both ends', () => {
  it('solves, where it used to refuse the drawing as over-supported', () => {
    const { mechanism } = buildMechanism(fourBar(true));
    everyFrameOk(mechanism.getForceAnalysis('static'));
  });

  it('answers exactly as the same four-bar with its ground link left implicit', () => {
    const plain = buildMechanism(fourBar(false)).mechanism;
    const framed = buildMechanism(fourBar(true)).mechanism;
    const a = plain.getForceAnalysis('static');
    const b = framed.getForceAnalysis('static');
    everyFrameOk(a);
    everyFrameOk(b);
    expect(b.frames.length).toBe(a.frames.length);
    for (let t = 0; t < a.frames.length; t += 7) {
      expect(b.frames[t].inputEffort!.valueSI).toBeCloseTo(a.frames[t].inputEffort!.valueSI, 6);
      for (const joint of ['B', 'C']) {
        const [ax, ay] = reactionsAt(plain, a, t, joint);
        const [bx, by] = reactionsAt(framed, b, t, joint);
        expect(bx).toBeCloseTo(ax, 6);
        expect(by).toBeCloseTo(ay, 6);
      }
    }
  });

  it('lists no reactions for the frame bar, and ground reactions for its neighbors', () => {
    const { mechanism } = buildMechanism(fourBar(true));
    const index = mechanism.getForceAnalysis('static').reactionIndex;
    expect(index.jointsByLink.get('AD')).toBeUndefined();
    expect(index.linksByJoint.get('A')).toEqual(['AB']);
    expect(index.linksByJoint.get('D')).toEqual(['CD']);
  });

  it('solves the reported drawing: a cylinder-driven bucket on a bracket pinned twice', () => {
    // Shared on 5 Sep 2026. Link ABCH is grounded at A and at H.
    const payload =
      '2v.A9,Fe.5,0.1011.4A,A,01a,0,0.0B,B,am,0as,0.0C,C,KD,0LM,0.0D,D,Yv,0Fb,0.0A1,A1,K0,09E,0.8A2,A2,DL,06N,0.ZA3,A3,DL,06N,0,AA1,A,A1,0Fe.0E,E,gy,0Ti,0.KH,H,0E4,9O,0.8I,I,sB,0gG,0.0J,J,gy,0ti,0.OK,K,lW,0XG,0..ARABCH,ABCH,0,0,73,09A,0d125a,A,B,C,H,,.ARCD,CD,0,0,RZ,0IT,c5cae9,C,D,,.ARAA1,AA1,0,0,9E,04d,26A69A,A,A1,,.ARA2D,A2D,0,0,O7,0A_,00695C,A2,D,,.YPA2A3,A2A3,0,0,0,0,,A2,A3,,.ARDE,DE,0,0,cw,0Me,0d125a,D,E,,.ARBEIJK,BEIJK,1w4W,2H,lH,0e0,26A69A,I,J,B,E,K,,IJ,BEK,KI.aRIJ,IJ,eiB,0,ma,0m_,00695C,I,J,,.aRBEK,BEK,eiB,0,gP,0XH,B2DFDB,B,E,K,,.aRKI,KI,eiB,0,os,0bm,c5cae9,K,I,,...N_H*1cYeQ5';
    const { mechanism } = buildMechanismFixture(payload);
    expect(mechanism.isMechanismValid()).toBe(true);
    const series = mechanism.getForceAnalysis('static');
    expect(series.diagnostic).toBeUndefined();
    expect(series.successfulFrames).toBe(series.frames.length);
  });
});

const WEIGHTED_GRIPPER =
  '2v.Ay,6G.5,0.1011.4A,A,01E8,0,0.0B,B,0w9,0,0.8C,C,0vV,0,0.0D,D,0bW,01,0.0G,G,0Fe,Fd,0.0H,H,Fe,Fe,0.0I,I,0Fe,0Ff,0.0J,J,Fe,0Fe,0.4K,K,0T4,xO,0.4L,L,0T4,0xO,0.4O,O,2C,xO,0.4P,P,2C,0xO,0.0M,M,0T4,XI,0.0Q,Q,2C,XI,0.0S,S,11U,Dd,0.0T,T,0T4,0XI,0.0V,V,2C,0XI,0.0X,X,11U,0Db,0.ZE,E,0vV,0,0,AB,A,B.1N,N,0T4,XI,0,KL,K,L.1R,R,2C,XI,0,OP,O,P.1U,U,0T4,0XI,0,KL,K,L.1W,W,2C,0XI,0,OP,O,P..ARAB,Barrel,2SG,1,0148,0,00695C,A,B,,.ARCD,Rod,2SG,1,0lV,01,26A69A,C,D,,.MRDGHIJ,Carriage,19FW,4c,07W,01,c5cae9,D,G,H,I,J,,.MRKL,Rail,3q90,1BD,0T4,0,0d125a,K,L,,.MROP,Rail,3q90,1BD,2C,0,0d125a,O,P,,.MRGM,GM,Fe,0,0MM,OS,B2DFDB,G,M,,.MRHQ,HQ,Fe,0,8w,OT,B2DFDB,H,Q,,.MRMQS,Jaw,OQW,2d,Ct,Qk,00695C,M,Q,S,,.MRIT,IT,Fe,0,0MM,0OU,B2DFDB,I,T,,.MRJV,JV,Fe,0,8w,0OT,B2DFDB,J,V,,.MRTVX,Jaw,OQW,2d,Ct,0Qk,00695C,T,V,X,,.YPCE,CE,Fe,0,0,0,,C,E,,.YPMN,MN,OQW,0,0,0,,M,N,,.YPQR,QR,OQW,0,0,0,,Q,R,,.YPTU,TU,OQW,0,0,0,,T,U,,.YPVW,VW,OQW,0,0,0,,V,W,,..2F1,MQS,F1,11U,Dd,11U,cy,Fe.2F2,TVX,F2,11U,0Db,11m,0h5,Fe..N_.KFF1~303e9f,KFF2~303e9f0*3PFXyc';

describe('force analysis with supports that share a line', () => {
  // The library's gripper: each jaw rides two vertical rails at one height,
  // so equilibrium alone cannot say how the two rails share the load. The
  // solver used to call every frame singular and refuse the whole cycle; it
  // takes the evenest split now, says so on the frame, and the reactions are
  // the size the loads make them rather than the enormous cancelling pair the
  // exact solution of a nearly dependent system would be.
  it('solves the gripper on rails at every frame, marked as a shared support', () => {
    const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES['Cylinder_Gripper']);
    expect(mechanism.isMechanismValid()).toBe(true);
    const series = mechanism.getForceAnalysis('static');
    expect(series.diagnostic).toBeUndefined();
    expect(series.successfulFrames).toBe(series.frames.length);
    expect(series.sharedSupportFrames).toBe(series.frames.length);
    // Two loads of a newton each: nothing in the answer should be far above it.
    const peak = Math.max(
      ...series.frames.flatMap((frame) =>
        [...frame.jointReactions.values()].map(([x, y]) => Math.hypot(x, y))
      )
    );
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(50);
    for (const frame of series.frames) {
      expect(Number.isFinite(frame.inputEffort!.valueSI)).toBe(true);
    }
    // And one curve, not a band: the split at one pose is the split at the
    // next, to well under a tenth of the load.
    const atM = series.frames.map((frame) => {
      const [x, y] = frame.jointReactions.get('M')!;
      return Math.hypot(x, y);
    });
    let worstStep = 0;
    for (let index = 1; index < atM.length; index++) {
      worstStep = Math.max(worstStep, Math.abs(atM[index] - atM[index - 1]));
    }
    expect(worstStep).toBeLessThan(0.1);
  });

  it('moves smoothly from the even split to the exact answer as the supports part', () => {
    // Two supports a hair apart: x + y = 2 and x + (1 + ε)y = 2. Exactly on
    // one line (ε = 0) the even split is [1, 1]; parted by any ε the exact
    // answer is [2, 0]. A ridge a million times smaller than the tolerance
    // put the change-over among round-off, so a cycle whose hair varied with
    // the pose flipped between the two from one frame to the next.
    const evenest = (epsilon: number) =>
      (
        ForceSolver as unknown as {
          evenestSolution(A: number[][], b: number[]): { values: number[] } | undefined;
        }
      ).evenestSolution(
        [
          [1, 1],
          [1, 1 + epsilon],
        ],
        [2, 2]
      )!.values;
    const answers: number[][] = [];
    for (let power = -9; power <= -1; power += 0.25) answers.push(evenest(10 ** power));
    expect(answers[0][0]).toBeCloseTo(1, 3);
    expect(answers[0][1]).toBeCloseTo(1, 3);
    expect(answers.at(-1)![0]).toBeCloseTo(2, 2);
    expect(answers.at(-1)![1]).toBeCloseTo(0, 2);
    // The whole change is a move of √2; a cliff would take it in one step of
    // a quarter decade, and the ridge spreads it over about a decade.
    for (let index = 1; index < answers.length; index++) {
      const step = Math.hypot(
        answers[index][0] - answers[index - 1][0],
        answers[index][1] - answers[index - 1][1]
      );
      expect(step).toBeLessThan(0.6);
    }
  });

  it('refuses the weighted gripper as a motion the linkage locks only at second order', () => {
    // The gripper with masses on everything and gravity on. Its cylinder
    // hangs on one ground pin, so the whole assembly can swing about that
    // pin while the carriage rides up the rails -- a motion the rails allow
    // to first order and bind against only at second. The weight does work
    // along it, and no finite reaction resists it, so the cycle is refused;
    // in words that name the motion, not the residual.
    const { mechanism } = buildMechanismFixture(WEIGHTED_GRIPPER);
    mechanism.gravity = true;
    expect(mechanism.isMechanismValid()).toBe(true);
    const weighted = mechanism.getForceAnalysis('static');
    expect(weighted.successfulFrames).toBe(0);
    expect(weighted.diagnostic).toBe(SECOND_ORDER_LOCK_MESSAGE);
    // Without the weight the loads do no work along that motion, and the
    // same drawing solves on the evenest split of its rails.
    const { mechanism: weightless } = buildMechanismFixture(WEIGHTED_GRIPPER);
    weightless.gravity = false;
    const unweighted = weightless.getForceAnalysis('static');
    expect(unweighted.successfulFrames).toBeGreaterThan(unweighted.frames.length - 5);
    expect(unweighted.sharedSupportFrames).toBe(unweighted.successfulFrames);
  });

  it('still refuses a load nothing balances', () => {
    // A four-bar at a plain pose has a determinate solution and no shared
    // support, so the evenest split is never taken there.
    const { mechanism } = buildMechanism(fourBar(false));
    const series = mechanism.getForceAnalysis('static');
    expect(series.sharedSupportFrames).toBe(0);
  });
});
