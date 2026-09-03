// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';

/**
 * Which pose a link opens on.
 *
 * The format stores the start pose and, separately, an index into the cycle
 * solved from it -- where the playhead stood when the URL was written. Restoring
 * that index was unconditional, and it is only meaningful while the cycle it
 * counts into is the same cycle. Samples are spaced by a fixed amount of input
 * travel, so how many there are follows the range of travel the solver finds:
 * the six-bar below solves to 45 samples here and 53 in the browser, and the 31
 * its URL carries is not a pose its author ever stood at in either.
 *
 * What a reader saw was a mechanism part-way through its motion, which is not
 * the drawing the link encodes, and which cannot be edited -- editing is gated
 * on being at the start pose, and nothing on screen explains the refusal.
 *
 * Undo and redo are the case the index is good for: same mechanism, same cycle,
 * one step of its own history, and coming back to the frame you were watching
 * is the point. They are also the only callers that say so, through
 * `continuingHistory`.
 */
const SIXBAR_AT_STEP_31 =
  '2P.Ay,1E8.5,V.1011.4A,A,0u_,0RS,0.0B,B,0Z8,Cd,0.0C,C,01z,6K,0.8D,D,0kF,07n,0.3E,E,0kF,07n,0,AB,A,B.4F,F,7a,0TF,0..' +
  'ARAB,AB,0,0,0k3,07Q,c5cae9,A,B,,.ARCD,CD,0,0,0O6,0l,0d125a,C,D,,.YPDE,DE,0,0,0,0,,D,E,,.ARCF,CF,0,0,2p,0BT,B2DFDB,C,F,,...N_q';

/** The pose the URL spells, in model units. */
const DRAWN: Record<string, number[]> = {
  A: [-729.2, -351.2],
  B: [-449.6, 161.4],
  C: [-25.0, 80.8],
  D: [-591.8, -99.4],
  F: [96.8, -374.2],
};

function decode(continuingHistory: boolean): MechanismService {
  TestBed.configureTestingModule({});
  TestBed.inject(UrlProcessorService).updateFromURL(
    SIXBAR_AT_STEP_31,
    false,
    true,
    false,
    continuingHistory
  );
  return TestBed.inject(MechanismService);
}

/** How far the drawing stands from the pose the URL encodes. */
function driftFromDrawn(mechanism: MechanismService): number {
  let worst = 0;
  for (const joint of mechanism.joints) {
    const drawn = DRAWN[joint.id];
    if (!drawn) continue;
    worst = Math.max(worst, Math.hypot(joint.x - drawn[0], joint.y - drawn[1]));
  }
  return worst;
}

describe('a mechanism arriving from a URL', () => {
  it('draws the pose the URL encodes, once a frame has been drawn', () => {
    const mechanism = decode(false);
    // The decode leaves the joints on the pose it read and the playhead on a
    // number; it is the next tick that puts one onto the other. Nothing ticks
    // under the harness, so the seek the browser does on arrival is done here
    // -- without it the joints sit on the encoded pose whatever the playhead
    // says, and the test passes while the app is wrong.
    mechanism.animate(mechanism.mechanismTimeStep, false);
    expect(driftFromDrawn(mechanism)).toBeLessThan(0.5);
  });

  it('rests at the start of the cycle, so the reader can edit', () => {
    const mechanism = decode(false);
    expect(mechanism.mechanismTimeStep).toBe(0);
    expect(mechanism.isAtStartPose()).toBe(true);
  });

  it('rests at the start after undo and redo as well', () => {
    // Undo and redo used to be the one caller that restored the stored index,
    // on the grounds that a step of a mechanism's own history is the same
    // cycle. The seek that put the drawing on that sample went when editing
    // away from the start became legal (plan §6.4: pose is not part of
    // history), and a step restored with no seek behind it was a transport
    // reading a third of a turn over a drawing standing at its start -- which
    // the permission model believed, and refused to let the reader edit.
    const mechanism = decode(true);
    expect(mechanism.mechanismTimeStep).toBe(0);
    expect(mechanism.isAtStartPose()).toBe(true);
  });
});
