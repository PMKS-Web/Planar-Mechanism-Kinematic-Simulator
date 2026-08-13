import { MechanismService } from './mechanism.service';

/**
 * The frame loop behind `easeToStart`, driven by hand.
 *
 * It is a drawing concern -- it seeks already-solved cycles and never runs the
 * solver -- so it is exercised against a stand-in that records where each
 * machine is put, rather than against a built drawing.
 */
interface Stub {
  isPlaying: boolean;
  ownPlaying: boolean[];
  ownSeconds: number[];
  mechanisms: { cyclePeriod: number }[];
  atStartPose(): boolean;
  secondsOf(index: number): number;
  rewindToStart(): void;
  drawOwnClocks(): void;
}

/**
 * @param at where each machine starts, in seconds
 * @param periods each machine's cycle length
 */
function drive(at: number[], periods: number[], interrupt?: (frame: number, stub: Stub) => void) {
  const drawn: number[][] = [];
  const stub: Stub = {
    isPlaying: true,
    ownPlaying: at.map(() => true),
    ownSeconds: at.slice(),
    mechanisms: periods.map((cyclePeriod) => ({ cyclePeriod })),
    atStartPose: () => stub.ownSeconds.every((seconds) => seconds === 0),
    secondsOf: (index) => stub.ownSeconds[index] ?? 0,
    rewindToStart: () => {
      stub.ownSeconds = stub.ownSeconds.map(() => 0);
      drawn.push(stub.ownSeconds.slice());
    },
    drawOwnClocks: () => drawn.push(stub.ownSeconds.slice()),
  };

  const queue: FrameRequestCallback[] = [];
  const original = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queue.push(callback);
    return queue.length;
  }) as typeof globalThis.requestAnimationFrame;

  try {
    (MechanismService.prototype.easeToStart as (this: Stub, ms?: number) => void).call(stub, 200);
    // 16 ms a frame, run well past the 200 ms the ease is given.
    for (let frame = 0; frame < 40 && queue.length; frame++) {
      interrupt?.(frame, stub);
      queue.shift()!(frame * 16);
    }
  } finally {
    globalThis.requestAnimationFrame = original;
  }
  return { drawn, stub, of: (machine: number) => drawn.map((row) => row[machine]) };
}

describe('MechanismService easing every machine back to its own start', () => {
  it('draws the way back instead of cutting to it, and lands exactly on zero', () => {
    const { of, stub } = drive([1.2], [4]);
    const track = of(0);

    expect(track.length, 'more than one pose was drawn').toBeGreaterThan(4);
    expect(track[0]).toBeLessThan(1.2);
    expect(track.at(-1)).toBe(0);
    expect(stub.ownSeconds[0]).toBe(0);
    // Monotonic: a rewind that overshoots and comes back is its own glitch.
    expect(track.every((seconds, i) => i === 0 || seconds <= track[i - 1])).toBe(true);
  });

  it('goes forward to the start when forward is the shorter way round', () => {
    // The cycle is closed, so from near its end the start is just ahead. Going
    // backwards through the whole of it reads as the machine bolting.
    const { of, stub } = drive([3.6], [4]);

    expect(of(0)[0]).toBeGreaterThan(3.6);
    expect(stub.ownSeconds[0]).toBe(0);
  });

  it('eases each machine on its own clock rather than herding them onto one', () => {
    // Three machines at three places in three different cycles. Driving this
    // off the shared sample index put all of them on the master's time on the
    // first frame -- a jump, and one that undid two of the three clocks.
    const { of } = drive([3.9, 1.2, 5.07], [4.4, 3, 5.43]);

    // Nobody teleports: the first frame is a step from where they were.
    expect(Math.abs(of(0)[0] - 3.9)).toBeLessThan(0.6);
    expect(Math.abs(of(1)[0] - 1.2)).toBeLessThan(0.6);
    expect(Math.abs(of(2)[0] - 5.07)).toBeLessThan(0.6);
    // And each takes whichever way round is shorter for its own cycle: the
    // first and third are past half way and go forward, the second is not and
    // goes back.
    expect(of(0)[0]).toBeGreaterThan(3.9);
    expect(of(2)[0]).toBeGreaterThan(5.07);
    expect(of(1)[0]).toBeLessThan(1.2);
    // All three arrive.
    expect([of(0).at(-1), of(1).at(-1), of(2).at(-1)]).toEqual([0, 0, 0]);
  });

  it('stops playback before the first frame, not after the last', () => {
    // The tab has already changed by the time this runs, so anything reading
    // the service during the rewind has to be told playback is over.
    const { stub } = drive([1.2, 0.5], [4, 4]);
    expect(stub.isPlaying).toBe(false);
    expect(stub.ownPlaying.some(Boolean)).toBe(false);
  });

  it('gives way to anything else that moves a machine', () => {
    // A rebuild, a scrub, playback starting again: whatever it was, it is newer
    // than this rewind, and finishing the rewind would undo it.
    const { of, stub } = drive([2, 2], [4, 4], (frame, running) => {
      if (frame === 3) running.ownSeconds[1] = 1.75;
    });

    expect(stub.ownSeconds[1], 'the other caller kept its place').toBe(1.75);
    expect(of(0).at(-1), 'the rewind drew nothing after being overtaken').not.toBe(0);
  });

  it('does nothing at all when every machine is already at its start', () => {
    const { drawn } = drive([0, 0], [4, 4]);
    expect(drawn).toEqual([]);
  });
});
