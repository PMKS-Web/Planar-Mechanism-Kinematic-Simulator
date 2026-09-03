import { speedTurning, turnsClockwise } from './drive-direction';

/*
  What this file is for: the app stores a clockwise drive as a *negative*
  speed, and that is an arbitrary fact rather than a derivable one.

  It is easy to talk yourself into either answer. The drawing is y-up and the
  screen is y-down, so a positive angular speed is counter-clockwise in the
  model's own axes and, because the flip mirrors the picture, counter-clockwise
  on screen as well -- and the app happens to store the other direction as
  negative. Every step of that reasoning is a place to drop a sign, which is
  why the convention was settled by playing the four-bar template and watching
  four frames of the crank rather than by argument.

  Before this, eight places each spelled `speed < 0` out for themselves, and
  the transport's row for a machine whose solve is deferred had it backwards
  for a week (fixed in a7b83a8). This is the one place that says it, and this
  spec is what stops it drifting.
*/

describe('turnsClockwise', () => {
  it('reads a negative drive speed as clockwise', () => {
    expect(turnsClockwise(-12)).toBe(true);
  });

  it('reads a positive drive speed as counter-clockwise', () => {
    expect(turnsClockwise(12)).toBe(false);
  });

  it('says the same thing about an angular velocity as about an rpm', () => {
    // `travelingForward` asks this of `inputAngularVelocities`, which is the
    // joint's rpm through pi/30 -- a different quantity, the same sign.
    const rpm = -12;
    expect(turnsClockwise((rpm * Math.PI) / 30)).toBe(turnsClockwise(rpm));
  });

  it('says the same thing about a slider as about a pin', () => {
    // A prismatic drive is length per second rather than rpm, and its two
    // directions are "closing" and "opening" rather than the two turns, but
    // the sign that tells them apart is this one.
    expect(turnsClockwise(-3.5)).toBe(true);
  });

  it('does not call a stopped drive clockwise', () => {
    // Zero on a joint means "follow the document's default"; `driveSpeedOf`
    // resolves it to a real signed speed before anything asks this, so the
    // only thing to pin is that zero is not silently a direction.
    expect(turnsClockwise(0)).toBe(false);
  });
});

describe('speedTurning', () => {
  it('writes a clockwise drive as a negative speed', () => {
    expect(speedTurning(true, 12)).toBe(-12);
  });

  it('writes a counter-clockwise drive as a positive one', () => {
    expect(speedTurning(false, 12)).toBe(12);
  });

  it('takes a magnitude however it is signed', () => {
    // The callers pass whatever `driveSpeedOf` answered, which already carries
    // the old direction -- so the sign on the way in must not survive.
    expect(speedTurning(true, -12)).toBe(-12);
    expect(speedTurning(false, -12)).toBe(12);
  });

  it('round-trips against the reading', () => {
    for (const clockwise of [true, false]) {
      expect(turnsClockwise(speedTurning(clockwise, 12))).toBe(clockwise);
    }
  });
});
