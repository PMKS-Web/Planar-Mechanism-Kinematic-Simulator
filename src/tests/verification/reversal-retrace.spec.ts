// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';

/**
 * A mechanism that reverses has to come back the way it went.
 *
 * An input that cannot go all the way round runs to one end of its travel and
 * turns around, and the solver learns where that end is by trying a sample and
 * being refused. The walk writes each joint as it solves it, so the refused
 * sample has already moved everything up to the step that said no. The reversed
 * sample then read those half-written positions when choosing between the two
 * circle intersections open to each joint -- and took the far one for whatever
 * had already been moved.
 *
 * The drawing below is a parallel gripper: two jaws on parallelogram hangers,
 * closed by one ram. Its two halves are the same linkage twice, so it shows the
 * fault and its absence side by side -- the upper jaw is solved first and was
 * flipped at each limit, the lower jaw was never reached and retraced
 * perfectly. Played back, one jaw jumped 123 units twice a cycle while its
 * mirror image did not move at all.
 *
 * Kept as the URL it arrived as, rather than rebuilt as a fixture, because
 * rebuilding it is exactly what does not work: a hand-written gripper with two
 * tracer pins added does *not* reproduce this, and neither does the
 * `parallelGripperFixture` the suite already had. Whatever the reader's own
 * drawing does differently -- the order its joints ended up in, where its
 * tracers sit -- is load-bearing, and a tidied-up version of it tests nothing.
 * A URL is the one form of this drawing that is certainly the drawing.
 */
const GRIPPER =
  '2P.Ay,Fe.5,0.1011.0A,A,W2,04,0.4B,B,bW,ee,0.4C,C,11e,ee,0.0D,D,jq,9I,0.0E,E,19y,9I,0.0F,F,1oa,9I,' +
  '0.4G,G,bW,0ee,0.4H,H,11e,0ee,0.0I,I,jw,0AN,0.0J,J,1A2,0AN,0.0K,K,1og,0AN,0.7L,L,W2,04,0,,,,0Fe.' +
  '0M,M,Th,HO,0.0N,N,Tn,0FA,0..MRBD,Hanger,0,0,fg,Oz,303e9f,B,D,,.MRCE,Hanger,0,0,15o,Oz,0d125a,C,E,,.' +
  'MRDEFM,Jaw,0,0,zH,B-,26A69A,D,E,F,M,,.MRAD,AD,0,0,cx,4d,00695C,A,D,,.MRGI,Hanger,0,0,fj,0PV,303e9f,G,I,,.' +
  'MRHJ,Hanger,0,0,15r,0PV,0d125a,H,J,,.MRIJKN,Jaw,0,0,zO,0Bz,26A69A,I,J,K,N,,.MRAI,AI,0,0,c_,05E,00695C,A,I,,.' +
  'YPAL,AL,0,0,0,0,,A,L,,...N_Z';

describe('a gripper whose ram runs to a limit and comes back', () => {
  let mechanism: MechanismService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(UrlProcessorService).updateFromURL(GRIPPER, false, true, false);
    mechanism = TestBed.inject(MechanismService);
  });

  it('decodes and solves', () => {
    expect(mechanism.mechanisms.length).toBe(1);
    expect(mechanism.mechanisms[0].isMechanismValid()).toBe(true);
    expect(mechanism.mechanisms[0].joints.length).toBeGreaterThan(20);
  });

  it('moves every joint by a step, never by a jump', () => {
    const frames = mechanism.mechanisms[0].joints;
    const steps: number[] = [];
    for (let sample = 1; sample < frames.length; sample++) {
      for (let index = 0; index < frames[sample].length; index++) {
        const was = frames[sample - 1][index];
        const now = frames[sample][index];
        expect(Number.isFinite(now.x) && Number.isFinite(now.y)).toBe(true);
        steps.push(Math.hypot(now.x - was.x, now.y - was.y));
      }
    }
    const sorted = [...steps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // Six times the typical step is generous for a mechanism that speeds up
    // and slows down, and nowhere near the six-fold-and-then-some a change of
    // assembly mode costs: this was 123 against a median of 20.
    expect(Math.max(...steps)).toBeLessThan(median * 6);
  });

  it('puts the same pose under the ram going out and coming home', () => {
    const frames = mechanism.mechanisms[0].joints;
    const ramOf = (sample: number) => frames[sample].find((joint) => joint.id === 'A')!.x;
    const poseOf = (sample: number) =>
      frames[sample].map((joint) => [joint.x, joint.y] as [number, number]);

    let worst = 0;
    for (let going = 1; going < frames.length / 2; going++) {
      const home = frames.findIndex(
        (_, sample) => sample > frames.length / 2 && Math.abs(ramOf(sample) - ramOf(going)) < 1
      );
      if (home < 0) continue;
      const there = poseOf(going);
      const back = poseOf(home);
      there.forEach(([x, y], index) => {
        worst = Math.max(worst, Math.hypot(x - back[index][0], y - back[index][1]));
      });
    }
    // Exactly, in model units: the return leg is the outbound leg's samples in
    // reverse, so anything above rounding means it came home a different way.
    expect(worst).toBeLessThan(1);
  });
});
