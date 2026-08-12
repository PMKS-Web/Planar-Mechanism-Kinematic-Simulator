import { MechanismService } from './mechanism.service';

/**
 * The frame loop behind `easeToStart`, driven by hand.
 *
 * The method is a drawing concern -- it seeks an already-solved cycle and never
 * touches the solver -- so it is exercised against a stand-in that records the
 * seeks rather than against a built mechanism.
 */
interface Stub {
  mechanismTimeStep: number;
  isPlaying: boolean;
  atStartPose(): boolean;
  animate(step: number, playing: boolean): void;
}

function drive(from: number, interrupt?: (frame: number, stub: Stub) => void) {
  const drawn: number[] = [];
  const stub: Stub = {
    mechanismTimeStep: from,
    isPlaying: true,
    atStartPose: () => stub.mechanismTimeStep === 0,
    animate: (step) => {
      stub.mechanismTimeStep = step;
      drawn.push(step);
    },
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
  return { drawn, stub };
}

describe('MechanismService easing back to the start of the cycle', () => {
  it('draws the way back instead of cutting to it, and lands exactly on zero', () => {
    const { drawn, stub } = drive(179);

    expect(drawn.length, 'more than one pose was drawn').toBeGreaterThan(4);
    expect(drawn[0]).toBeLessThan(179);
    expect(drawn.at(-1)).toBe(0);
    expect(stub.mechanismTimeStep).toBe(0);
    // Monotonic: a rewind that overshoots and comes back is its own glitch.
    expect(drawn.every((step, i) => i === 0 || step <= drawn[i - 1])).toBe(true);
  });

  it('stops playback before the first frame, not after the last', () => {
    // The tab has already changed by the time this runs, so anything reading
    // the service during the rewind has to be told playback is over.
    const { stub } = drive(120);
    expect(stub.isPlaying).toBe(false);
  });

  it('gives way to anything else that moves the mechanism', () => {
    // A rebuild, a scrub, playback starting again: whatever it was, it is newer
    // than this rewind, and finishing the rewind would undo it.
    const { drawn, stub } = drive(179, (frame, running) => {
      if (frame === 3) running.mechanismTimeStep = 90;
    });

    expect(stub.mechanismTimeStep, 'the other caller kept its pose').toBe(90);
    expect(drawn.at(-1), 'the rewind drew nothing after being overtaken').not.toBe(0);
  });

  it('does nothing at all when the mechanism is already at the start', () => {
    const { drawn } = drive(0);
    expect(drawn).toEqual([]);
  });
});
