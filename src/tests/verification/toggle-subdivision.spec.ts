// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { Mechanism } from '../../app/model/mechanism/mechanism';

/**
 * Cutting the step finer where the motion is fast.
 *
 * The six-bar below passes through a toggle. Its C-E dyad reaches tangency --
 * the two circles that place E become tangent -- and there the DEF body turns
 * 43 degrees for one degree of crank, so the tracer point out on that body
 * crossed most of the drawing between one sample and the next. Nothing was
 * wrong with any single sample: every bar keeps its length and every pose is a
 * real assembly. The cycle was simply being read at a spacing far too coarse
 * for what the linkage does there, and it looked like a jump.
 *
 * A toggle has no bottom -- the velocity through it is genuinely unbounded --
 * so sampling the whole cycle finer cannot answer it. Walked at 699 samples
 * instead of 251 the worst jump only fell from 11462 to 4064, and asking for
 * more than that made the refinement fail outright. What answers it is looking
 * ahead: solve the next sample, and if it has moved too far, put it back and
 * ask again at half the step.
 *
 * The two things that have to stay true are that a healthy linkage is sampled
 * exactly as it was before, and that the original spacing survives inside the
 * finer one -- the samples marked `addedSamples` are precisely those between
 * the old ones, which is what lets the export offer uniform rows.
 */
const TOGGLE_SIX_BAR =
  '2P.1jO,1E8.8,2n.1011.6O,O,0,0,0.0A,A,3gO,0,0.4G,G,040G,01L6,0.0B,B,040G,2bR,0.0C,C,0F0c,0kK,0.' +
  '0D,D,0A33,08Zy,0.0E,E,0ETW,06sL,0.GF,F,0AYO,0MPj,0..MROA,OA,0,0,1rC,0,303e9f,O,A,,.MRAB,AB,0,0,' +
  '0Ay,1Ij,26A69A,A,B,,.MRGBC,GBC,0,0,07h2,BL,0d125a,G,B,C,,.MRAD,AD,0,0,03CM,04H-,00695C,A,D,,.' +
  'MRGD,GD,0,0,071g,04yX,303e9f,G,D,,.MRCE,CE,0,0,0El3,03oK,B2DFDB,C,E,,.MRDEF,DEF,0,0,0Bhf,0Ccg,' +
  '26A69A,D,E,F,,...N_N';

/** A plain crank, which has no fold and must not be touched. */
const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,' +
  'c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

function solve(payload: string): MechanismService {
  TestBed.configureTestingModule({});
  TestBed.inject(UrlProcessorService).updateFromURL(payload, false, true, false);
  return TestBed.inject(MechanismService);
}

/** The drawing's span at rest, which the jump limit is a fraction of. */
function startingSpan(mechanism: Mechanism): number {
  const start = mechanism.joints[0];
  const xs = start.map((joint) => joint.x);
  const ys = start.map((joint) => joint.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** The furthest any joint moves between two neighbouring samples. */
function worstJump(mechanism: Mechanism): number {
  const frames = mechanism.joints;
  let worst = 0;
  for (let i = 1; i < frames.length; i++) {
    for (let k = 0; k < frames[i].length; k++) {
      const a = frames[i - 1][k];
      const b = frames[i][k];
      worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
    }
  }
  return worst;
}

describe('a cycle that passes through a toggle', () => {
  let mechanism: Mechanism;

  beforeEach(() => {
    mechanism = solve(TOGGLE_SIX_BAR).mechanisms[0];
  });

  it('solves, and keeps every bar the length it was drawn', () => {
    expect(mechanism.isMechanismValid()).toBe(true);
    const frames = mechanism.joints;
    const spans = frames.map((frame) => {
      const d = frame.find((joint) => joint.id === 'D')!;
      const e = frame.find((joint) => joint.id === 'E')!;
      return Math.hypot(d.x - e.x, d.y - e.y);
    });
    expect(Math.max(...spans) - Math.min(...spans)).toBeLessThan(0.01);
  });

  it('never moves a joint more than a twentieth of the drawing in one sample', () => {
    // It was a third of the drawing -- 31% of the span in a single frame.
    expect(worstJump(mechanism) / startingSpan(mechanism)).toBeLessThan(0.05);
  });

  it('cuts the step finer only where it has to', () => {
    const added = mechanism.addedSamples;
    expect(mechanism.hasAddedSamples).toBe(true);
    // A minority of the cycle: the fold is a small part of it.
    expect(added.filter(Boolean).length).toBeLessThan(added.length / 2);
  });

  it('leaves the original spacing inside the finer one', () => {
    // Drop what was added and the uniform cycle is what remains -- which is
    // what the export leans on to offer rows at an even spacing.
    const kept = mechanism.addedSamples.filter((extra) => !extra).length;
    expect(kept).toBeGreaterThan(0);
    expect(kept + mechanism.addedSamples.filter(Boolean).length).toBe(mechanism.joints.length);
  });
});

describe('a cycle with no fold in it', () => {
  it('is sampled exactly as it was before', () => {
    const mechanism = solve(FOUR_BAR).mechanisms[0];
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.hasAddedSamples).toBe(false);
    // A degree of crank apiece, all the way round, as the verification tables
    // and every graph drawn from them assume.
    expect(mechanism.joints.length).toBe(361);
  });
});
