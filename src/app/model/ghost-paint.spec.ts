import './joint';
import { RealLink } from './link';
import { ram, weldBracketOnto } from '../../test-utils/cylinder-graph';
import { Cylinder, cylindersIn } from './cylinder';
import { drawnOutlineOf } from './cylinder-fusion';
import { cylinderSkinFrame } from './cylinder-skin';
import { barrelPath, rodBodyPath } from './joint-marks';
import { GhostBody } from './mechanism/anchor';
import { ghostInkOf, ghostPathOf } from './ghost-paint';

/**
 * The start-pose ghost paints what the canvas paints (`model/ghost-paint.ts`).
 *
 * The ghost is "the same shapes in the same colors, at 22%", and a cylinder is
 * where reading the record instead of the rule shows: its rod stores a palette
 * color that has never been drawn, and both members store the thin bar their
 * two joints describe rather than the silhouette the skin puts there. So each
 * claim below is the same question asked of the live drawing and of the ghost,
 * and the two answers have to match.
 */

const NAVY = '#303e9f';
const TEAL = '#00695c';
const BRACKET = '#c5cae9';
const R = 0.15 * 25;

/** The ghost of a link, standing exactly where the link is. */
function ghostOf(link: RealLink): GhostBody {
  const [from, to] = link.joints;
  return {
    d: link.d,
    fill: link.fill ?? '',
    transform: '',
    linkId: link.id,
    // The identity move: a ghost at the pose it was built from, so the shape it
    // draws can be compared with the one the canvas is drawing right now.
    move: {
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      there: { x: from.x, y: from.y },
      thereEnd: { x: to.x, y: to.y },
    },
  };
}

/** A ram whose rod carries a color nobody asked for, as every decoded one does. */
function strayRodColor(): { parts: ReturnType<typeof ram>; cylinder: Cylinder } {
  const parts = ram();
  parts.barrel.fill = NAVY;
  parts.rod.fill = TEAL;
  return { parts, cylinder: cylindersIn(parts.joints)[0] };
}

describe('the ink the ghost paints a body in', () => {
  it('draws a rod that has chosen no color in its barrel’s, as the canvas does', () => {
    const { parts, cylinder } = strayRodColor();
    const rod = ghostOf(parts.rod);
    // What the record says, and what is on the canvas. The ghost used to answer
    // with the first of these.
    expect(rod.fill).toBe(TEAL);
    expect(ghostInkOf(rod, parts.rod, [cylinder])).toBe(NAVY);
    expect(ghostInkOf(ghostOf(parts.barrel), parts.barrel, [cylinder])).toBe(NAVY);
  });

  it('draws a rod that has chosen one in its own', () => {
    const { parts, cylinder } = strayRodColor();
    parts.rod.ownColor = true;
    expect(ghostInkOf(ghostOf(parts.rod), parts.rod, [cylinder])).toBe(TEAL);
  });

  it('draws a welded member in the color of the body that swallowed it', () => {
    const parts = ram();
    parts.barrel.fill = NAVY;
    parts.rod.fill = TEAL;
    const { compound } = weldBracketOnto(parts, parts.mountA, parts.barrel, 'BR', { x: -4, y: 3 });
    compound.fill = BRACKET;
    const cylinder = cylindersIn(parts.joints)[0];

    // The body is one color (decision S16), and the rod follows the barrel up
    // into it while it has chosen nothing of its own.
    expect(ghostInkOf(ghostOf(parts.barrel), parts.barrel, [cylinder])).toBe(BRACKET);
    expect(ghostInkOf(ghostOf(parts.rod), parts.rod, [cylinder])).toBe(BRACKET);
    expect(ghostInkOf(ghostOf(compound), compound, [cylinder])).toBe(BRACKET);
  });

  it('keeps the color it was built with for a body that has left the drawing', () => {
    // A ghost the anchor can no longer reach is held, and outlives its link.
    const { parts, cylinder } = strayRodColor();
    expect(ghostInkOf(ghostOf(parts.rod), undefined, [cylinder])).toBe(TEAL);
  });
});

describe('the shape the ghost draws', () => {
  it('is the skin’s silhouette for a member, not the bar its joints describe', () => {
    const { parts, cylinder } = strayRodColor();
    const frame = cylinderSkinFrame(cylinder, R);
    const skin = {
      barrel: barrelPath(R, frame.anchor, frame.mouth),
      rod: rodBodyPath(R, frame.reach, frame.headHalf),
    };
    for (const [role, member] of [
      ['barrel', parts.barrel],
      ['rod', parts.rod],
    ] as const) {
      const body = ghostOf(member);
      const drawn = ghostPathOf(body, member, [cylinder], R, '');
      expect(drawn).not.toBe(body.d);
      // The skin's own builder, command for command, placed where the part is.
      expect(drawn.replace(/[^A-Za-z]/g, '')).toBe(skin[role].replace(/[^A-Za-z]/g, ''));
      // And without the eased corners, which are the one way the silhouette a
      // welded body is handed differs from what the skin draws: they keep a
      // union from filleting the barrel's mouth, and there is no union here.
      expect(drawn).not.toContain('Q');
      expect(drawnOutlineOf([cylinder], member, R)).toContain('Q');
    }
  });

  it('is the body’s own outline for everything else, with its slots cut back in', () => {
    const { parts, cylinder } = strayRodColor();
    const bar = new RealLink('XY', [parts.mountA, parts.mountB]);
    const body = ghostOf(bar);
    expect(ghostPathOf(body, bar, [cylinder], R, '')).toBe(body.d);
    expect(ghostPathOf(body, bar, [cylinder], R, 'M 0 0')).toBe(`${body.d} M 0 0`);
  });
});
