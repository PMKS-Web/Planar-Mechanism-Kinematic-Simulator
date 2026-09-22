import './joint';
import { LinkHold, RealLink } from './link';
import { Cylinder, cylindersIn } from './cylinder';
import {
  cylinderAngleCarrier,
  cylinderHoldsAngle,
  heldBars,
  heldBarsAt,
  holdOf,
  memberHoldReads,
  memberHoldTransition,
} from './link-holds';
import { ram } from '../../test-utils/cylinder-graph';

/**
 * One angle, two padlocks (decision S5).
 *
 * A member holds one thing, like any bar, and the URL's `H` entry is still one
 * per link — so the cylinder's angle is written on *a* member and read from
 * *either*, and a member's own fixed length is a separate row that the hold
 * solver never sees. That makes one member's two rows able to read held at
 * once, which is the thing `holdOf` cannot express and the thing every case
 * below is about.
 *
 * The table is exhaustive on purpose. Each row is a press the panel can make,
 * and the pair of flags it lands on is what a shared URL will carry.
 */

function parts(): { cylinder: Cylinder; barrel: RealLink; rod: RealLink; links: RealLink[] } {
  const built = ram();
  const cylinder = cylindersIn(built.joints)[0];
  return {
    cylinder,
    barrel: cylinder.barrel as RealLink,
    rod: cylinder.rod,
    links: built.links as RealLink[],
  };
}

/** Put the two flags where a case starts, then press one row. */
function press(
  from: { barrel: LinkHold; rod: LinkHold },
  on: 'barrel' | 'rod',
  which: 'length' | 'angle',
  set: boolean
) {
  const { cylinder, barrel, rod } = parts();
  barrel.hold = from.barrel;
  rod.hold = from.rod;
  const next = memberHoldTransition(cylinder, on === 'barrel' ? barrel : rod, which, set);
  return next ?? { barrel: barrel.hold, rod: rod.hold };
}

describe('either member holds the cylinder’s angle', () => {
  it('reads the angle as held whichever member carries the flag', () => {
    for (const carrier of ['barrel', 'rod'] as const) {
      const { cylinder, barrel, rod } = parts();
      (carrier === 'barrel' ? barrel : rod).hold = 'angle';

      expect(cylinderHoldsAngle(cylinder)).toBe(true);
      expect(cylinderAngleCarrier(cylinder)!.id).toBe((carrier === 'barrel' ? barrel : rod).id);
      for (const member of [barrel, rod]) {
        expect(memberHoldReads(cylinder, member, 'angle')).toBe(true);
      }
    }
  });

  it('emits one bar on the two joints, whichever member carries it', () => {
    for (const carrier of ['barrel', 'rod'] as const) {
      const { cylinder, barrel, rod, links } = parts();
      (carrier === 'barrel' ? barrel : rod).hold = 'angle';

      const bars = heldBars(links, [cylinder]);
      expect(bars).toHaveLength(1);
      expect([bars[0].a, bars[0].b]).toEqual([cylinder.mountA.id, cylinder.mountB.id]);
      expect(bars[0].hold).toBe('angle');
      expect(heldBarsAt(cylinder.mountA, links, [cylinder]).map((bar) => bar.id)).toEqual([
        bars[0].id,
      ]);
    }
  });

  it('never hands a member’s fixed length to the solver', () => {
    const { cylinder, barrel, rod, links } = parts();
    barrel.hold = 'length';
    rod.hold = 'length';

    expect(heldBars(links, [cylinder])).toEqual([]);
    expect(holdOf(barrel, cylinder.seal.links[0].joints, [cylinder])).toBeUndefined();
    // The row still reads held on the member that set it, and only there.
    expect(memberHoldReads(cylinder, barrel, 'length')).toBe(true);
    expect(memberHoldReads(cylinder, barrel, 'angle')).toBe(false);
  });

  it('lets a member keep its length while the part keeps its angle', () => {
    const { cylinder, barrel, rod } = parts();
    barrel.hold = 'angle';
    rod.hold = 'length';

    expect(memberHoldReads(cylinder, rod, 'angle')).toBe(true);
    expect(memberHoldReads(cylinder, rod, 'length')).toBe(true);
    expect(memberHoldReads(cylinder, barrel, 'length')).toBe(false);
  });
});

describe('the transition table', () => {
  const NONE = { barrel: undefined, rod: undefined } as const;

  it('fixes the angle on the barrel first, which is where every old drawing has it', () => {
    expect(press(NONE, 'barrel', 'angle', true)).toEqual({ barrel: 'angle', rod: undefined });
    expect(press(NONE, 'rod', 'angle', true)).toEqual({ barrel: 'angle', rod: undefined });
  });

  it('puts it on the free member when the barrel is keeping its length', () => {
    expect(press({ barrel: 'length', rod: undefined }, 'barrel', 'angle', true)).toEqual({
      barrel: 'length',
      rod: 'angle',
    });
  });

  it('replaces the pressed member’s length when both are keeping one', () => {
    const both = { barrel: 'length', rod: 'length' } as const;
    expect(press(both, 'barrel', 'angle', true)).toEqual({ barrel: 'angle', rod: 'length' });
    expect(press(both, 'rod', 'angle', true)).toEqual({ barrel: 'length', rod: 'angle' });
  });

  it('does nothing when the angle is already held', () => {
    const { cylinder, barrel, rod } = parts();
    barrel.hold = 'angle';
    expect(memberHoldTransition(cylinder, rod, 'angle', true)).toBeUndefined();
    expect(memberHoldTransition(cylinder, barrel, 'angle', true)).toBeUndefined();
  });

  it('releases the angle from both, pressed from either row', () => {
    for (const from of [
      { barrel: 'angle', rod: undefined },
      { barrel: undefined, rod: 'angle' },
      { barrel: 'angle', rod: 'length' },
    ] as const) {
      for (const on of ['barrel', 'rod'] as const) {
        const next = press(from, on, 'angle', false);
        expect(next.barrel).not.toBe('angle');
        expect(next.rod).not.toBe('angle');
      }
    }
  });

  it('hands the angle to the other member rather than dropping it', () => {
    expect(press({ barrel: 'angle', rod: undefined }, 'barrel', 'length', true)).toEqual({
      barrel: 'length',
      rod: 'angle',
    });
    expect(press({ barrel: undefined, rod: 'angle' }, 'rod', 'length', true)).toEqual({
      barrel: 'angle',
      rod: 'length',
    });
  });

  it('replaces the angle when the other member has no room for it', () => {
    expect(press({ barrel: 'angle', rod: 'length' }, 'barrel', 'length', true)).toEqual({
      barrel: 'length',
      rod: 'length',
    });
  });

  it('fixes and releases a member’s own length without touching the other', () => {
    expect(press(NONE, 'rod', 'length', true)).toEqual({ barrel: undefined, rod: 'length' });
    expect(press({ barrel: 'angle', rod: 'length' }, 'rod', 'length', false)).toEqual({
      barrel: 'angle',
      rod: undefined,
    });
  });

  it('reports no change rather than an identical pair', () => {
    const { cylinder, barrel, rod } = parts();
    rod.hold = 'length';
    expect(memberHoldTransition(cylinder, rod, 'length', true)).toBeUndefined();
    expect(memberHoldTransition(cylinder, barrel, 'length', false)).toBeUndefined();
  });

  it('answers nothing for a link that is not one of the two members', () => {
    const { cylinder } = parts();
    const stranger = new RealLink('XY', [cylinder.mountA, cylinder.mountB]);
    expect(memberHoldTransition(cylinder, stranger, 'angle', true)).toBeUndefined();
  });
});
