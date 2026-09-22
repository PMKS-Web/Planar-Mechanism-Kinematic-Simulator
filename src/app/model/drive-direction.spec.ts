import {
  driveDirectionIcon,
  driveDirectionLabel,
  driveDirectionPair,
  driveDirectionWord,
  driveKindOf,
  driveTurnsClockwiseWhileRising,
  speedTurning,
  turnsClockwise,
} from './drive-direction';

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

/*
  The words, which used to be spelled in three places and agreed in two.

  The transport said "Opening" and "Closing" of any linear drive, so a bare
  block sliding along a rail -- which has nothing to open -- was reported as
  opening it. The maintainer put it plainly: *"for a driven slider, closing and
  opening doesn't seem right since there is no concept of open or close. Maybe
  backwards, and forwards?"* The Edit panel already knew, and this is the table
  both of them read now.
*/

describe('driveKindOf', () => {
  it('calls anything that does not translate a pin', () => {
    expect(driveKindOf(false, false)).toBe('pin');
    // Sealed and rotary together cannot happen -- a cylinder's drive is its
    // seal, which is prismatic -- but the table must not be decided by the
    // second argument alone.
    expect(driveKindOf(false, true)).toBe('pin');
  });

  it('tells a cylinder from a bare block by the seal, not by the motion', () => {
    expect(driveKindOf(true, true)).toBe('cylinder');
    expect(driveKindOf(true, false)).toBe('slider');
  });
});

describe('driveDirectionWord', () => {
  it('turns a pin the two ways a turn goes', () => {
    expect(driveDirectionWord('pin', true)).toBe('Clockwise');
    expect(driveDirectionWord('pin', false)).toBe('Counter-clockwise');
  });

  it('opens and closes a cylinder, which is the pair it has', () => {
    expect(driveDirectionWord('cylinder', true)).toBe('Closing');
    expect(driveDirectionWord('cylinder', false)).toBe('Opening');
  });

  it('runs a bare slider forward and backward, never open or shut', () => {
    expect(driveDirectionWord('slider', true)).toBe('Backward');
    expect(driveDirectionWord('slider', false)).toBe('Forward');
  });

  it('gives every kind two different words', () => {
    for (const kind of ['pin', 'cylinder', 'slider'] as const) {
      expect(driveDirectionWord(kind, true)).not.toBe(driveDirectionWord(kind, false));
    }
  });

  it('keeps every word short enough for the transport to print in full', () => {
    // The bar abbreviates "Counter-clockwise" to CCW because it does not fit on
    // a phone's reading line. Nothing else needs a short form, and this is what
    // says so: the longest of the rest is "Clockwise", which does fit.
    const others = (['cylinder', 'slider'] as const).flatMap((kind) => [
      driveDirectionWord(kind, true),
      driveDirectionWord(kind, false),
    ]);
    for (const word of others) {
      expect(word.length).toBeLessThanOrEqual('Clockwise'.length);
    }
  });
});

describe('driveDirectionLabel', () => {
  it('names the slot, because "forward" means nothing without it', () => {
    expect(driveDirectionLabel('slider', false)).toBe('Forward along slot');
    expect(driveDirectionLabel('slider', true)).toBe('Backward along slot');
  });

  it('adds nothing to a turn or to a stroke, which explain themselves', () => {
    expect(driveDirectionLabel('pin', true)).toBe('Clockwise');
    expect(driveDirectionLabel('cylinder', false)).toBe('Opening');
  });
});

describe('driveDirectionPair', () => {
  it('reads as the middle of a sentence', () => {
    expect(driveDirectionPair('cylinder')).toBe('opening or closing');
    expect(driveDirectionPair('slider')).toBe('forward or backward along its slot');
  });
});

describe('driveTurnsClockwiseWhileRising', () => {
  it('reads a rising crank coordinate as clockwise', () => {
    // The handle's coordinate for a crank is negated so that a clockwise drive
    // runs it left to right (`drive-profile.ts`).
    expect(driveTurnsClockwiseWhileRising('pin', true)).toBe(true);
  });

  it('reads a rising linear coordinate as the positive direction', () => {
    // A ram's coordinate is its own extension, so rising is opening -- which is
    // a *positive* speed, and therefore not clockwise.
    expect(driveTurnsClockwiseWhileRising('cylinder', true)).toBe(false);
    expect(driveTurnsClockwiseWhileRising('slider', true)).toBe(false);
  });

  it('agrees with the transport that a rising ram is opening', () => {
    const kind = 'cylinder' as const;
    expect(driveDirectionWord(kind, driveTurnsClockwiseWhileRising(kind, true))).toBe('Opening');
    expect(driveDirectionWord(kind, driveTurnsClockwiseWhileRising(kind, false))).toBe('Closing');
  });

  it('agrees with the panel: a rising pin coordinate is the panel’s Clockwise', () => {
    const kind = 'pin' as const;
    expect(driveDirectionWord(kind, driveTurnsClockwiseWhileRising(kind, true))).toBe(
      driveDirectionWord(kind, turnsClockwise(-12))
    );
  });
});

describe('driveDirectionIcon', () => {
  it('draws a turn for a pin and a straight arrow for anything that translates', () => {
    expect(driveDirectionIcon('pin', true)).toBe('rotate_right');
    expect(driveDirectionIcon('pin', false)).toBe('rotate_left');
    expect(driveDirectionIcon('cylinder', true)).toBe('arrow_back');
    expect(driveDirectionIcon('cylinder', false)).toBe('arrow_forward');
    expect(driveDirectionIcon('slider', true)).toBe('arrow_back');
    expect(driveDirectionIcon('slider', false)).toBe('arrow_forward');
  });

  it('says the same thing as the word it sits beside', () => {
    // The transport drew a rotate glyph for every drive, so a cylinder read
    // "Opening" beside an icon of something spinning. The pair comes from one
    // table now: whenever the word is the turning pair, the glyph turns.
    for (const kind of ['pin', 'cylinder', 'slider'] as const) {
      for (const clockwise of [true, false]) {
        const turning = driveDirectionIcon(kind, clockwise).startsWith('rotate');
        const turns = driveDirectionWord(kind, clockwise).endsWith('lockwise');
        expect(turning).toBe(turns);
      }
    }
  });

  it('gives each kind two different glyphs', () => {
    for (const kind of ['pin', 'cylinder', 'slider'] as const) {
      expect(driveDirectionIcon(kind, true)).not.toBe(driveDirectionIcon(kind, false));
    }
  });
});
