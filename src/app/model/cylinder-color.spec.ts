import './joint';
import { RealLink } from './link';
import { ram as cylinderGraph } from '../../test-utils/cylinder-graph';
import { cylindersIn } from './cylinder';
import { barrelFillOf, paintCylinderMember, rodFillOf } from './cylinder-skin';

/**
 * The rod's own color (decision S15): what the skin draws, and what pressing a
 * swatch on either member does to the other.
 *
 * The whole difficulty is that a rod has always *stored* a color the skin never
 * drew — creation hands every new link the next one off the palette — so the
 * stored number and the drawn one have never had to agree. `ownColor` is the
 * difference between the two, and these are the rules that keep them apart.
 */

const NAVY = '#303e9f';
const TEAL = '#00695c';
const PALE = '#b2dfdb';

/** A cylinder whose rod carries a color nobody asked for, as every decoded one does. */
function withAStrayRodColor() {
  const parts = cylinderGraph();
  parts.barrel.fill = NAVY;
  parts.rod.fill = TEAL;
  return { parts, cylinder: cylindersIn(parts.joints)[0] };
}

describe('what ink the two members are drawn in', () => {
  it('paints the rod from the barrel while the rod has made no choice', () => {
    const { cylinder } = withAStrayRodColor();
    expect(barrelFillOf(cylinder)).toBe(NAVY);
    expect(rodFillOf(cylinder)).toBe(NAVY);
    // The stored color is untouched and simply not read: nothing repaints a
    // drawing by deciding to believe a number that has always been there.
    expect(cylinder.rod.fill).toBe(TEAL);
  });

  it('paints it from its own record once it has', () => {
    const { cylinder } = withAStrayRodColor();
    cylinder.rod.ownColor = true;
    expect(rodFillOf(cylinder)).toBe(TEAL);
    expect(barrelFillOf(cylinder)).toBe(NAVY);
  });
});

describe('recoloring one member leaves the other alone', () => {
  it('gives the rod a color of its own, and the barrel keeps its', () => {
    const { parts, cylinder } = withAStrayRodColor();
    paintCylinderMember(parts.rod, PALE, cylinder);

    expect(rodFillOf(cylinder)).toBe(PALE);
    expect(cylinder.rod.ownColor).toBe(true);
    expect(barrelFillOf(cylinder)).toBe(NAVY);
  });

  it('hands a rod that has made no choice the barrel color it was standing in', () => {
    const { parts, cylinder } = withAStrayRodColor();
    paintCylinderMember(parts.barrel, PALE, cylinder);

    // The rod looks exactly as it did a moment ago, which is the whole of what
    // "changing one never drags the other along" means while one of them is
    // being drawn in the other's ink.
    expect(rodFillOf(cylinder)).toBe(NAVY);
    expect(cylinder.rod.ownColor).toBe(true);
    expect(barrelFillOf(cylinder)).toBe(PALE);
  });

  it('leaves a rod that has one exactly where it is', () => {
    const { parts, cylinder } = withAStrayRodColor();
    paintCylinderMember(parts.rod, TEAL, cylinder);
    paintCylinderMember(parts.barrel, PALE, cylinder);

    expect(rodFillOf(cylinder)).toBe(TEAL);
    expect(barrelFillOf(cylinder)).toBe(PALE);
  });

  it('answers the same in either order, and for both members in turn', () => {
    const first = withAStrayRodColor();
    paintCylinderMember(first.parts.rod, PALE, first.cylinder);
    paintCylinderMember(first.parts.barrel, TEAL, first.cylinder);

    const second = withAStrayRodColor();
    paintCylinderMember(second.parts.barrel, TEAL, second.cylinder);
    paintCylinderMember(second.parts.rod, PALE, second.cylinder);

    for (const both of [first, second]) {
      expect(barrelFillOf(both.cylinder)).toBe(TEAL);
      expect(rodFillOf(both.cylinder)).toBe(PALE);
    }
  });

  it('is a plain repaint for a link that is not a member', () => {
    const parts = cylinderGraph();
    const bar = new RealLink('XY', [parts.mountB, parts.mountA]);
    paintCylinderMember(bar, PALE, undefined);
    expect(bar.fill).toBe(PALE);
    expect(bar.ownColor).toBe(false);
  });
});

describe('the canvas is told to repaint', () => {
  it('when the flag is the whole of the change', () => {
    // Giving a rod the color it was already storing moves no fill at all, and
    // the canvas caches its skins on `paintRevision`. Without the flag bumping
    // it too, the one case where only the flag moves repainted nothing.
    const { parts, cylinder } = withAStrayRodColor();
    const before = RealLink.paintRevision;
    paintCylinderMember(parts.rod, TEAL, cylinder);
    expect(RealLink.paintRevision).toBeGreaterThan(before);
  });
});
