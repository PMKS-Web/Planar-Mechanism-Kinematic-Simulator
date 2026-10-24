import './joint';
import { RevJoint } from './joint';
import { Link, RealLink } from './link';
import { ram } from '../../test-utils/cylinder-graph';
import { cylindersIn } from './cylinder';
import { cylinderPaintOrder, FusingSkin, memberIsFused } from './cylinder-paint-order';

/**
 * Where every cylinder in a drawing is painted, and in what order (S24).
 *
 * The rule is one line per cylinder -- whatever paints its barrel, then its
 * head, then whatever paints its rod -- and everything here is that line
 * holding for every cylinder at once while bodies are shared between them. The
 * case the maintainer reported is `two rods welded into one bar`: painted per
 * cylinder, the shared body landed inside the first cylinder's stack and
 * outside the second's, so the second head came out bare black.
 */

/** A body standing in for a member: a bar somewhere else in the drawing. */
function bodyNamed(id: string): Link {
  return new RealLink(id, [new RevJoint(`${id}a`, 0, 0), new RevJoint(`${id}b`, 1, 1)]);
}

/** One drawn cylinder, with either member optionally swallowed by a body. */
function markFor(suffix: string, roots: { barrel?: Link; rod?: Link } = {}): FusingSkin {
  const parts = ram(suffix);
  const cylinder = {
    ...cylindersIn(parts.joints)[0],
    barrelRoot: roots.barrel ?? parts.barrel,
    rodRoot: (roots.rod ?? parts.rod) as RealLink,
  };
  return { id: cylinder.seal.id, cylinder };
}

const keysOf = (marks: FusingSkin[], plates: { id: string; links: Link[] }[] = []) =>
  cylinderPaintOrder(marks, plates).map((step) => step.key);

describe('the paint order of a drawing’s cylinders', () => {
  it('paints one unwelded cylinder as a single step', () => {
    // Its own three pieces are one unit: barrel, head and rod in that order
    // inside the group, where the constraint holds by construction.
    const only = markFor('');
    expect(keysOf([only])).toEqual(['cylinder:C']);
    expect(memberIsFused(cylinderPaintOrder([only]), only, 'barrel')).toBe(false);
    expect(memberIsFused(cylinderPaintOrder([only]), only, 'rod')).toBe(false);
  });

  it('puts a welded barrel’s body under the head and a welded rod’s over it', () => {
    const barrelWelded = markFor('', { barrel: bodyNamed('X') });
    expect(keysOf([barrelWelded])).toEqual(['body:X', 'cylinder:C']);

    const rodWelded = markFor('', { rod: bodyNamed('X') });
    expect(keysOf([rodWelded])).toEqual(['cylinder:C', 'body:X']);
  });

  it('paints a body holding both members of one cylinder in the rod’s place', () => {
    // The constraints contradict each other -- the body is both under and over
    // the same head -- and the barrel's is the one that gives: a barrel painted
    // over its head is a cue dimmed, a rod painted under one is a cue deleted.
    const both = bodyNamed('X');
    const mark = markFor('', { barrel: both, rod: both });
    expect(keysOf([mark])).toEqual(['cylinder:C', 'body:X']);
    // And neither member paints itself beside it.
    const steps = cylinderPaintOrder([mark]);
    expect(memberIsFused(steps, mark, 'barrel')).toBe(true);
    expect(memberIsFused(steps, mark, 'rod')).toBe(true);
    expect(steps[1].fused!.members.map((held) => held.role).sort()).toEqual(['barrel', 'rod']);
  });

  it('paints two rods welded into one bar after both heads', () => {
    // The reported scene. Both heads are painted before the body their rods are
    // in, so both read as the same darker band -- which is what said, before,
    // that one of the two was bare black.
    const bar = bodyNamed('X');
    const first = markFor('1', { rod: bar });
    const second = markFor('2', { rod: bar });
    expect(keysOf([first, second])).toEqual(['cylinder:C1', 'cylinder:C2', 'body:X']);
  });

  it('paints two barrels welded into one bracket before both heads', () => {
    const bracket = bodyNamed('X');
    const first = markFor('1', { barrel: bracket });
    const second = markFor('2', { barrel: bracket });
    expect(keysOf([first, second])).toEqual(['body:X', 'cylinder:C1', 'cylinder:C2']);
  });

  it('paints a chain as head, shared body, head', () => {
    // One cylinder's rod mount welded to the next one's barrel mount. The body
    // holds a rod and a barrel and there is exactly one place for it.
    const shared = bodyNamed('X');
    const boom = markFor('1', { rod: shared });
    const stick = markFor('2', { barrel: shared });
    expect(keysOf([boom, stick])).toEqual(['cylinder:C1', 'body:X', 'cylinder:C2']);
  });

  it('breaks a cycle at a barrel and never at a rod', () => {
    // Body X holds cylinder 1's rod and cylinder 2's barrel; body Y holds the
    // other two. Nothing satisfies all four constraints, so one barrel is
    // given up -- and both rods are still painted over their own heads.
    const x = bodyNamed('X');
    const y = bodyNamed('Y');
    const first = markFor('1', { barrel: y, rod: x });
    const second = markFor('2', { barrel: x, rod: y });
    const order = keysOf([first, second]);
    expect(order).toEqual(['cylinder:C2', 'body:Y', 'cylinder:C1', 'body:X']);
    // Both rods over their heads: C1 before X, C2 before Y.
    expect(order.indexOf('cylinder:C1')).toBeLessThan(order.indexOf('body:X'));
    expect(order.indexOf('cylinder:C2')).toBeLessThan(order.indexOf('body:Y'));
  });

  it('paints a plate holding a rod above that rod’s head', () => {
    // A Slide at a rod's end joint fuses the rod into the slider's weld plate,
    // and the plate stands where the rod stands (decision S18).
    const mark = markFor('');
    const rod = mark.cylinder.rod;
    const plate = { id: 'P', links: [rod as Link] };
    expect(keysOf([mark], [plate])).toEqual(['cylinder:C', 'plate:P']);
    expect(memberIsFused(cylinderPaintOrder([mark], [plate]), mark, 'rod')).toBe(true);
  });

  it('gives the same order whatever order the marks arrive in', () => {
    // DOM order is what `@for` tracks and what a hit test reads, so it has to
    // be a function of the drawing rather than of the list the canvas built.
    const bar = bodyNamed('X');
    const bracket = bodyNamed('W');
    const marks = [
      markFor('1', { rod: bar }),
      markFor('2', { rod: bar }),
      markFor('3', { barrel: bracket }),
    ];
    const forwards = keysOf(marks);
    expect(forwards).toEqual(keysOf([...marks].reverse()));
    expect(forwards).toEqual(keysOf([marks[1], marks[2], marks[0]]));
  });
});
