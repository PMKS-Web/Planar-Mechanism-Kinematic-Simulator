import '../../app/model/joint';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * Three wheels on a parallelogram coupler, driven by a slider on a ground
 * rail through a connecting rod: a piston engine. The slider reverses at the
 * crank's dead centers, and the crank -- a wheel with momentum -- carries
 * through them rather than swinging back. Two things went wrong here before:
 * the grounded slider was stepped a tenth of a length unit a sample, which
 * cut this small drawing's stroke into six frames, and the solver dropped the
 * joints' motion history at every reversal, so the crank retraced its arc
 * instead of turning on.
 */
const PISTON_WHEELS =
  '2v.1a,1a.A,0.1011.KA,A,0cI,8c,0.GC,C,0Zy,8c,0.0D,D,0Lu,8c,0.GJ,J,0o0,8c,0.4K,K,0qM,8c,0.4M,M,0OE,8c,0.GN,N,0d4,Es,0.GO,O,0r8,Es,0.GP,P,0P0,Es,0.0Q,Q,0AM,8r,0.7R,R,0AM,8r,0,,,,01a..1RACN,ABC,0,0,0bn,Ah,c5cae9,A,C,N,,.ARCDJ,CDJ,0,0,0Zy,8c,0d125a,C,D,J,,.1RJKO,JKL,0,0,0pr,Ah,c5cae9,K,J,O,,.1RDMP,DMN,0,0,0Nj,Ah,c5cae9,M,D,P,,.YPQR,QR,0,0,0,0,,Q,R,,.ARQC,QC,0,0,0N9,8k,00695C,Q,C,,...N_B*2nfFbv';

describe('wheels driven by a piston through a connecting rod', () => {
  const { mechanism } = buildMechanismFixture(PISTON_WHEELS);
  const frames = mechanism.joints;
  const crankAngle = (frame: (typeof frames)[number]) => {
    const a = frame.find((one) => one.id === 'A')!;
    const c = frame.find((one) => one.id === 'C')!;
    return Math.atan2(c.y - a.y, c.x - a.x);
  };

  it('is sampled finely enough to watch', () => {
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(frames.length).toBeGreaterThan(200);
  });

  it('carries the wheels through the dead centers for a whole turn', () => {
    // Unwrapped, the crank's angle should run monotonically through a full
    // turn and come home, never doubling back on itself.
    let unwrapped = 0;
    let previous = crankAngle(frames[0]);
    let forward = 0;
    let backward = 0;
    for (const frame of frames.slice(1)) {
      const angle = crankAngle(frame);
      let delta = angle - previous;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      if (delta > 1e-9) forward += delta;
      if (delta < -1e-9) backward -= delta;
      unwrapped += delta;
      previous = angle;
    }
    const turns = Math.abs(unwrapped) / (2 * Math.PI);
    expect(turns).toBeGreaterThan(0.95);
    expect(Math.min(forward, backward)).toBeLessThan(0.05 * Math.max(forward, backward));
  });
});
