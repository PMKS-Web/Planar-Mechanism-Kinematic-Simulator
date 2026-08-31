// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';

/**
 * Driving a block along a slot cut into a link that moves.
 *
 * A driven slide used to be stepped along one direction, settled at t = 0 and
 * held. That is right for a guide cut into the frame and wrong for a slot cut
 * into a moving link: the command never turned the link the slot was in, so the
 * block traveled up a bar standing still and whatever else held the block
 * absorbed the difference by changing length.
 *
 * Both drawings below are inverted slider-cranks a reader sent in -- a bar
 * pinned to ground with a slot in it, a block on the slot, and a rocker holding
 * the block to a second ground pin. Driven at the block, the first one held its
 * bar at 61.4 degrees for all 53 samples while its rocker went from 599 to 689,
 * and the app called it Ready.
 *
 * What the drive actually prescribes is a distance -- how far the block sits
 * from the slot's end, along a line that is itself being solved -- which is the
 * same shape of command a driven cylinder gives. It is recorded as one, and the
 * constraint set settles the carrier's rotation and the block's travel together.
 *
 * The assertions are the two things that were wrong and one that has to stay
 * right: every rigid pair keeps its distance, the carrier actually turns, and
 * the commanded travel advances by an equal amount every sample.
 */
const SLOT_CRANK =
  '2P.Ay,1E8.5,0.1011.4A,A,0u_,0RS,0.0B,B,0Z8,Cd,0.4C,C,01R,0NG,0.0D,D,0kF,07n,0.3E,E,0kF,07n,0,AB,A,B..' +
  'ARAB,AB,0,0,0k3,07Q,c5cae9,A,B,,.ARCD,CD,0,0,0Nr,0FX,0d125a,C,D,,.YPDE,DE,0,0,0,0,,D,E,,...N_8';

const SLOT_SIXBAR =
  '2P.Ay,1E8.5,V.1011.4A,A,0u_,0RS,0.0B,B,0Z8,Cd,0.0C,C,01z,6K,0.8D,D,0kF,07n,0.3E,E,0kF,07n,0,AB,A,B.4F,F,7a,0TF,0..' +
  'ARAB,AB,0,0,0k3,07Q,c5cae9,A,B,,.ARCD,CD,0,0,0O6,0l,0d125a,C,D,,.YPDE,DE,0,0,0,0,,D,E,,.ARCF,CF,0,0,2p,0BT,B2DFDB,C,F,,...N_q';

function solve(payload: string): MechanismService {
  TestBed.configureTestingModule({});
  TestBed.inject(UrlProcessorService).updateFromURL(payload, false, true, false);
  return TestBed.inject(MechanismService);
}

/** Every pair of joints that share a link, and how much its length varied. */
function rigidDrift(mechanism: MechanismService): number {
  const frames = mechanism.mechanisms[0].joints;
  let worst = 0;
  for (const link of mechanism.links) {
    const ids = link.joints.map((joint) => joint.id);
    for (let i = 0; i < ids.length; i++) {
      for (let k = i + 1; k < ids.length; k++) {
        let low = Infinity;
        let high = -Infinity;
        for (const frame of frames) {
          const a = frame.find((joint) => joint.id === ids[i]);
          const b = frame.find((joint) => joint.id === ids[k]);
          if (!a || !b) continue;
          const span = Math.hypot(a.x - b.x, a.y - b.y);
          low = Math.min(low, span);
          high = Math.max(high, span);
        }
        if (Number.isFinite(low)) worst = Math.max(worst, high - low);
      }
    }
  }
  return worst;
}

describe.each([
  ['a slotted bar driven at its block', SLOT_CRANK],
  ['the same drive in a six-bar', SLOT_SIXBAR],
])('%s', (_name, payload) => {
  let mechanism: MechanismService;

  beforeEach(() => {
    mechanism = solve(payload);
  });

  it('solves and runs', () => {
    const solved = mechanism.mechanisms[0];
    expect(solved.isMechanismValid()).toBe(true);
    expect(solved.joints.length).toBeGreaterThan(20);
  });

  it('keeps every rigid pair the length it was drawn', () => {
    // In model units, against bars several hundred long. The rocker used to
    // stretch by ninety.
    expect(rigidDrift(mechanism)).toBeLessThan(0.5);
  });

  it('turns the link the slot is cut into', () => {
    const frames = mechanism.mechanisms[0].joints;
    const angles = frames.map((frame) => {
      const a = frame.find((joint) => joint.id === 'A')!;
      const b = frame.find((joint) => joint.id === 'B')!;
      return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    });
    // It held exactly one angle for the whole cycle before, to the decimal.
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(5);
  });

  it('advances the commanded travel by the same amount every sample', () => {
    const frames = mechanism.mechanisms[0].joints;
    // How far the block sits from the slot's end: the quantity the drive names.
    const along = frames.map((frame) => {
      const a = frame.find((joint) => joint.id === 'A')!;
      const e = frame.find((joint) => joint.id === 'E')!;
      return Math.hypot(e.x - a.x, e.y - a.y);
    });
    const steps = along.slice(1).map((now, index) => Math.abs(now - along[index]));
    // One step is reversed at each end of the travel, and every other sample
    // moves the block by exactly the same distance -- which is what says the
    // command is being applied rather than approached.
    const sorted = [...steps].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)];
    const offBy = steps.filter((step) => Math.abs(step - median) > 0.01).length;
    expect(median).toBeGreaterThan(0);
    expect(offBy).toBeLessThanOrEqual(1);
  });
});

/**
 * A rider welded across its slot, rather than along it.
 *
 * The weld is what stops the block spinning inside the slot, and the solver
 * wrote it down as plain parallelism: the rider's arm was made to lie along the
 * slot. That is true of a sealed cylinder, whose rod does run down its bore,
 * and it is not true in general -- this reader's six-bar welds CD onto the
 * block at 43.75 degrees across the slot, and holding it at zero instead
 * described a different machine. Every constraint was satisfied and every bar
 * kept its length, so nothing downstream complained; the linkage that came back
 * simply was not the one drawn, and no pose in its whole cycle was.
 *
 * The angle is now captured from the pose the drawing was made at, the way a
 * distance is. Zero remains available and is what a cylinder gets.
 */
describe('a rider welded at an angle to its slot', () => {
  /** D and C as the six-bar's URL spells them, before anything is solved. */
  const DRAWN_D = [-591.8, -99.4];
  const DRAWN_C = [-25.0, 80.8];

  let mechanism: MechanismService;

  beforeEach(() => {
    mechanism = solve(SLOT_SIXBAR);
  });

  it('holds the arm at the angle it was drawn at, not along the slot', () => {
    const frames = mechanism.mechanisms[0].joints;
    const angles = frames.map((frame) => {
      const at = (id: string) => frame.find((joint) => joint.id === id)!;
      const slot = Math.atan2(at('B').y - at('A').y, at('B').x - at('A').x);
      const arm = Math.atan2(at('C').y - at('D').y, at('C').x - at('D').x);
      return ((((arm - slot) * 180) / Math.PI + 540) % 360) - 180;
    });
    // Parallelism would have pinned every one of these to zero.
    for (const angle of angles) expect(angle).toBeCloseTo(-43.75, 1);
  });

  it('runs through the pose it was drawn at', () => {
    const frames = mechanism.mechanisms[0].joints;
    const gaps = frames.map((frame) => {
      const at = (id: string) => frame.find((joint) => joint.id === id)!;
      return Math.max(
        Math.hypot(at('D').x - DRAWN_D[0], at('D').y - DRAWN_D[1]),
        Math.hypot(at('C').x - DRAWN_C[0], at('C').y - DRAWN_C[1])
      );
    });
    // The nearest pose the parallel form could offer stood 285 units away.
    expect(Math.min(...gaps)).toBeLessThan(0.5);
  });
});
