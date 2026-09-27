import './joint';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { ram, rewire } from '../../test-utils/cylinder-graph';
import { Cylinder, cylindersIn } from './cylinder';
import { memberSilhouette } from './cylinder-fusion';

/**
 * One body holding **both** members of one cylinder.
 *
 * Weld a ram's barrel mount to a bar, its rod mount to another, and the two
 * bars to each other, and the drawing is a rigid triangle with a ram down one
 * side. It will never move — the maintainer's own example says so — but it has
 * to draw, and drawing it means answering a question nothing else asks: what
 * draws a member when no skin is drawing one. Where such a shape is painted is
 * `cylinder-paint-order.spec.ts`.
 */

const R = 0.15 * 25;

/**
 * The ram's two members welded into one body, with a bar at each mount meeting
 * at an apex — the drawing the maintainer built, in miniature.
 *
 * Mirrors what `mergeLinks` leaves behind: one top-level compound holding all
 * four bars, every joint of it named on the compound (the seal included, which
 * is the joint the whole question turns on), and `rewire` carrying the slot up
 * to that compound exactly as `reconcileSlots` does.
 */
function triangleAroundTheRam() {
  const parts = ram();
  const apex = new RevJoint('F', 5, -6);
  const barrelSide = new RealLink('AF', [parts.mountA, apex]);
  const rodSide = new RealLink('DF', [parts.mountB, apex]);
  const body = new RealLink(
    'ABCDF',
    [parts.mountA, parts.inner, parts.seal, parts.mountB, apex],
    undefined,
    undefined,
    undefined,
    [parts.barrel, barrelSide, parts.rod, rodSide]
  );
  parts.mountA.isWelded = true;
  parts.mountB.isWelded = true;
  apex.isWelded = true;
  parts.joints.push(apex);
  parts.links = [body];
  rewire(parts.joints, parts.links);
  return { parts, body, apex };
}

/** A cylinder record whose two members sit in the same body. */
function bothEndsIn(body: RealLink): Cylinder {
  const parts = ram();
  return { ...cylindersIn(parts.joints)[0], barrelRoot: body, rodRoot: body };
}

/** What `MechanismService.tellEachBarHowItIsDrawn` leaves on the two bars. */
function tellTheBars(cylinder: Cylinder): void {
  for (const role of ['barrel', 'rod'] as const) {
    const bar = (role === 'barrel' ? cylinder.barrel : cylinder.rod) as RealLink;
    bar.drawnByACylinderSkin = true;
    bar.skinSilhouette = memberSilhouette(cylinder, role, R);
  }
}

/**
 * Whether the body's drawn outline covers this point.
 *
 * A ray cast over the union's own edges, counted the way the canvas fills it:
 * an odd number of crossings is inside, so a point in a compound's hole reads
 * as outside exactly as `fill-rule="evenodd"` paints it.
 */
function drawnOutlineCovers(link: RealLink, point: { x: number; y: number }): boolean {
  link.reComputeDPath();
  let crossings = 0;
  for (const line of link.externalLines) {
    const a = line.startPosition;
    const b = line.endPosition;
    if (a.y > point.y === b.y > point.y) continue;
    if (a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x) > point.x) crossings++;
  }
  return crossings % 2 === 1;
}

describe('a body draws every bar it is made of', () => {
  /** The middle of the rod, which is the bar that went missing. */
  const middleOfTheRod = (parts: ReturnType<typeof ram>) => ({
    x: (parts.seal.x + parts.mountB.x) / 2,
    y: (parts.seal.y + parts.mountB.y) / 2,
  });

  it('draws the rod as a bar when nothing resolves a cylinder there', () => {
    // The state this guards is "the body holds a rod and no skin is drawing
    // one", whatever put the drawing there. It used to be this very fixture:
    // the compound swallowed the seal, `isSlotWellFormed` said no and the
    // cylinder vanished — which turned out to be a defect rather than a state
    // (a detached bore cannot be invented back, and the URL it wrote was one
    // the decoder refuses), so a welded triangle resolves as a cylinder now.
    // Unsealing is the reachable way left to hold a rod with no skin over it,
    // and it changes no geometry, so the shape asked about is the same one.
    const { parts, body } = triangleAroundTheRam();
    parts.seal.isSealed = false;
    expect(cylindersIn(parts.joints)).toEqual([]);
    expect(drawnOutlineCovers(body, middleOfTheRod(parts))).toBe(true);
  });

  it('draws it as the skin’s silhouette when one is', () => {
    // The other answer the model could give. The body then carries the shape
    // the skin would have drawn, so the part comes out the same whichever way
    // the question about the slot is settled.
    const { parts, body } = triangleAroundTheRam();
    const fused = bothEndsIn(body);
    fused.barrel = parts.barrel;
    fused.rod = parts.rod;
    tellTheBars(fused);
    expect(drawnOutlineCovers(body, middleOfTheRod(parts))).toBe(true);
    expect(body.d).toContain(' Q ');
  });
});
