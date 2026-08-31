import { RealLink } from './link';
import { PrisJoint, RevJoint } from './joint';
import { SettingsService } from '../services/settings.service';

/**
 * A crank drawn as the disc it sweeps.
 *
 * The rule the drawing rests on is that a disc needs a center, and the only
 * center a link can offer without being asked is the one pin it turns about.
 * Everything here is about that rule holding when the mechanism changes under
 * it -- the flag outlives a ground being removed, so the answer has to come
 * from the joints every time rather than from what was true when it was set.
 */

/** A grounded crank: pin at the origin, throw out to (3, 4) -- a reach of 5. */
function crank(): { link: RealLink; ground: RevJoint; throwPin: RevJoint } {
  const ground = new RevJoint('A', 0, 0, false, true);
  const throwPin = new RevJoint('B', 3, 4);
  return { link: new RealLink('AB', [ground, throwPin]), ground, throwPin };
}

/** Every number in a path string, in the order it is written. */
function numbersIn(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

// The object scale is process-wide static state shared with every other spec
// file in the worker, so pin it for the file and put it back.
let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

describe('a link drawn as a circle', () => {

  it('is offered on a grounded crank and nowhere else', () => {
    expect(crank().link.canBeCircular()).toBe(true);

    // No ground: a coupler has no fixed center, so no disc to draw about.
    const floating = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 3, 4)]);
    expect(floating.canBeCircular()).toBe(false);

    // Two grounds: a frame, which does not turn at all.
    const frame = new RealLink('AB', [
      new RevJoint('A', 0, 0, false, true),
      new RevJoint('B', 3, 4, false, true),
    ]);
    expect(frame.canBeCircular()).toBe(false);

    // A grounded slot anchors a slide, not a pivot.
    const slotted = new RealLink('AB', [
      new PrisJoint('A', 0, 0, false, true),
      new RevJoint('B', 3, 4),
    ]);
    expect(slotted.canBeCircular()).toBe(false);
  });

  it('draws a disc on the ground pin, wide enough to hold every joint', () => {
    const { link, ground } = crank();
    link.isCircle = true;
    link.reComputeDPath();

    expect(link.d).toMatch(/^M /);
    expect(link.d).not.toMatch(/NaN|Infinity/);

    // Two semicircle arcs of one radius: reach plus the half-width every bar's
    // end cap is already drawn with, so the disc covers what the bar covered.
    const radius = 5 + SettingsService.objectScale / 4;
    const numbers = numbersIn(link.d);
    expect(numbers[0]).toBeCloseTo(ground.x - radius, 6);
    expect(numbers[1]).toBeCloseTo(ground.y, 6);
    // Two arcs and no straight edge. The arc count alone proves nothing — an
    // ordinary two-joint bar is also drawn with exactly two, one per end cap —
    // so what separates a disc from a bar is that a disc has no sides.
    expect(link.d.match(/A /g)?.length).toBe(2);
    expect(link.d).not.toMatch(/ L /);

    // A disc has no edges, so there is nothing to attach a joint along.
    expect(link.externalLines).toEqual([]);
    expect(link.initialExternalLines).toEqual([]);
  });

  it('grows to cover a tracer point added past the throw', () => {
    const { link, ground } = crank();
    link.isCircle = true;
    link.joints.push(new RevJoint('C', 0, 9));
    link.reComputeDPath();

    const radius = 9 + SettingsService.objectScale / 4;
    expect(numbersIn(link.d)[0]).toBeCloseTo(ground.x - radius, 6);
  });

  it('comes back as a bar when the ground it was centered on is removed', () => {
    const { link, ground } = crank();
    link.isCircle = true;
    link.reComputeDPath();
    const asDisc = link.d;

    ground.ground = false;
    link.reComputeDPath();
    expect(link.canBeCircular()).toBe(false);
    // A bar, stated as geometry rather than as "not the string it was": it has
    // sides, which a disc never does, and it says so itself.
    expect(link.d).toMatch(/ L /);
    expect(link.drawnAsDisc).toBe(false);
    // The bar has edges again, which is how the rest of the app knows it can
    // hang a joint on one.
    expect(link.externalLines.length).toBeGreaterThan(0);

    // The choice was not thrown away, only ignored: grounding it again is
    // enough to get the disc back, without having to ask for it a second time.
    ground.ground = true;
    link.reComputeDPath();
    expect(link.d).toBe(asDisc);
  });

  it('is inherited by the copy of a link, so every solved frame is a disc too', () => {
    const { link } = crank();
    link.isCircle = true;
    link.reComputeDPath();

    // What Mechanism does per timestep: rebuild the link against moved joints,
    // handing the previous one in as the source of its visual geometry.
    const moved = new RealLink(
      'AB',
      [new RevJoint('A', 0, 0, false, true), new RevJoint('B', -4, 3)],
      undefined,
      undefined,
      undefined,
      undefined,
      link
    );
    expect(moved.isCircle).toBe(true);

    // The same circle, though not the same string: the copy is the original
    // rigidly rotated, so the path now starts at a different point of the same
    // rim. Center and radius are what "the same disc" means.
    const turned = numbersIn(moved.d);
    const radius = 5 + SettingsService.objectScale / 4;
    expect(turned[2]).toBeCloseTo(radius, 6);
    expect(Math.hypot(turned[0], turned[1])).toBeCloseTo(radius, 6);
  });
});
