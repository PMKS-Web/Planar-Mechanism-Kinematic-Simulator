import '../../app/model/joint';
import { ForceAnalysisSeries } from '../../app/model/mechanism/force-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

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
