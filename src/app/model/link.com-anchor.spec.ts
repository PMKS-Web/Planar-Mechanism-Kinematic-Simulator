import { RealLink } from './link';
import { RevJoint } from './joint';
import { Coord } from './coord';
import { SettingsService } from '../services/settings.service';

/**
 * What a hand-placed centre of mass is held against while the mechanism is
 * being edited.
 *
 * The three answers differ only when the link moves, so every test here places
 * the point, moves something, and asks where the point went. `customCoMFromOffset`
 * is what MechanismService consults on each update, so it stands in for "the
 * user dragged something" throughout.
 */

/** A bar from (0,0) to (10,0), with its centre of mass placed at (4,3). */
function bar(): { link: RealLink; a: RevJoint; b: RevJoint } {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 10, 0);
  const link = new RealLink('AB', [a, b], 1);
  link.placeCustomCoM({ x: 4, y: 3 });
  return { link, a, b };
}

/**
 * What MechanismService does at the end of every update: resolve the point
 * against its anchor and write it back. Without this the link's own CoM is the
 * one from before the move, and `captureComOffset` -- which measures from
 * wherever the CoM currently is -- would capture a stale point. Every move
 * below ends here, because in the app every move does.
 */
function settle(link: RealLink): void {
  const placed = link.customCoMFromOffset();
  if (placed) link.CoM = placed;
}

/** Slide the whole link by (dx, dy), as dragging its body would. */
function shift(link: RealLink, dx: number, dy: number): void {
  link.joints.forEach((joint) => {
    joint.x += dx;
    joint.y += dy;
  });
  settle(link);
}

/** Turn the link about joint A, which leaves A itself where it is. */
function turnAboutA(link: RealLink, degrees: number): void {
  const [pivot] = link.joints;
  const angle = (degrees * Math.PI) / 180;
  const origin = new Coord(pivot.x, pivot.y);
  link.joints.forEach((joint) => {
    const dx = joint.x - origin.x;
    const dy = joint.y - origin.y;
    joint.x = origin.x + dx * Math.cos(angle) - dy * Math.sin(angle);
    joint.y = origin.y + dx * Math.sin(angle) + dy * Math.cos(angle);
  });
  settle(link);
}

describe('what a placed center of mass is held against', () => {
  beforeEach(() => {
    SettingsService._objectScale.next(1);
  });

  it('rides the link when held against the link, which is the standing default', () => {
    const { link } = bar();
    expect(link.comAnchor).toBe('centroid');

    shift(link, 5, 2);
    const moved = link.customCoMFromOffset()!;
    expect(moved.x).toBeCloseTo(9, 6);
    expect(moved.y).toBeCloseTo(5, 6);

    // And turns with it: the point is a mark on the body.
    const { link: second } = bar();
    turnAboutA(second, 90);
    const turned = second.customCoMFromOffset()!;
    expect(turned.x).toBeCloseTo(-3, 6);
    expect(turned.y).toBeCloseTo(4, 6);
  });

  it('stays on the drawing when held against the grid', () => {
    const { link } = bar();
    link.comAnchor = 'grid';
    link.captureComOffset();

    shift(link, 5, 2);
    const afterDrag = link.customCoMFromOffset()!;
    expect(afterDrag.x).toBeCloseTo(4, 6);
    expect(afterDrag.y).toBeCloseTo(3, 6);

    turnAboutA(link, 90);
    const afterTurn = link.customCoMFromOffset()!;
    expect(afterTurn.x).toBeCloseTo(4, 6);
    expect(afterTurn.y).toBeCloseTo(3, 6);
  });

  it('follows one pin, and only that pin, when held against a joint', () => {
    const { link, a, b } = bar();
    link.comAnchor = { joint: 'A' };
    link.captureComOffset();

    // The far pin moving is not that pin moving.
    b.x = 40;
    settle(link);
    const afterFarPin = link.customCoMFromOffset()!;
    expect(afterFarPin.x).toBeCloseTo(4, 6);
    expect(afterFarPin.y).toBeCloseTo(3, 6);

    // Turning about A does not move A, so it does not move the point either.
    turnAboutA(link, 90);
    const afterTurn = link.customCoMFromOffset()!;
    expect(afterTurn.x).toBeCloseTo(4, 6);
    expect(afterTurn.y).toBeCloseTo(3, 6);

    // Moving A carries it, keeping the same offset from the pin.
    a.x += 1;
    a.y -= 2;
    settle(link);
    const afterPin = link.customCoMFromOffset()!;
    expect(afterPin.x).toBeCloseTo(5, 6);
    expect(afterPin.y).toBeCloseTo(1, 6);
  });

  it('re-describes the point where it is rather than moving it, on switching anchor', () => {
    const { link } = bar();
    shift(link, 5, 2);
    const before = link.customCoMFromOffset()!;

    link.comAnchor = 'grid';
    link.captureComOffset();
    const after = link.customCoMFromOffset()!;

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('hands the point back to the link when its pin leaves', () => {
    const { link } = bar();
    link.comAnchor = { joint: 'B' };
    link.captureComOffset();

    // B is deleted or merged away. The point is still where it was put, so it
    // stays there and goes back to riding the link -- not to a pin that is no
    // longer on it, and not to wherever the missing pin last was.
    link.joints = link.joints.filter((joint) => joint.id !== 'B');
    settle(link);
    const rescued = link.customCoMFromOffset()!;
    expect(rescued.x).toBeCloseTo(4, 6);
    expect(rescued.y).toBeCloseTo(3, 6);
    expect(link.comAnchor).toBe('centroid');
  });
});
