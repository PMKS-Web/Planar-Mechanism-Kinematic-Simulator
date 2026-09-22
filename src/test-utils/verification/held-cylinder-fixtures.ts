import { MechanismFixture } from './fixture';
import { cylinderBetween } from './slot-fixtures';

/**
 * Four drawings for "a cylinder nothing drives holds its length" (decision
 * S28), chosen so that between them they say what the rule is *and* what it is
 * not.
 *
 * The maintainer, on the first of them:
 *
 * > *"This one should also simulate no?"*
 *
 * Two of these are held and run because of it; one is a **follower** that must
 * not be held, because the machine around it decides its length and always did;
 * and the last has one of each in one machine, which is the case a rule that
 * simply held every passive cylinder would get wrong.
 *
 * All four are built the way `frozen-cylinder-fixtures.ts` builds its cylinder:
 * `cylinderBetween` inverts the model's own span rule to place the barrel's
 * buried end and the seal, so the part is exactly the one the app would draw
 * between those two mounts.
 */

/** The welded corner's ink, which the ram welded into it has to share. */
const CORNER = '#c5cae9';

/** A link's id: the sorted letters of its joints, as the app builds one. */
const body = (...ids: string[]): string => [...ids].sort().join('');

/** A cylinder's four joints, laid between two mounts at mid-travel. */
function ram(
  mount: { x: number; y: number },
  eye: { x: number; y: number },
  ids: { mountA: string; inner: string; seal: string; mountB: string },
  scale: number
) {
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  const at = (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale });
  return {
    joints: [
      { id: ids.mountA, ...at(mount) },
      { id: ids.inner, ...at(barrelEnd) },
      { id: ids.seal, ...at(pin) },
      { id: ids.mountB, ...at(eye) },
    ],
    links: [{ joints: body(ids.mountA, ids.inner) }, { joints: body(ids.seal, ids.mountB) }],
    slider: {
      at: ids.seal,
      on: { carrier: body(ids.mountA, ids.inner), a: ids.mountA, b: ids.inner },
      sealed: true as const,
    },
  };
}

/**
 * **The maintainer's drawing**, as a fixture: three cylinders in a triangle,
 * with a bar from one corner to a grounded, driven pin.
 *
 * Five bodies and six full joints, so Gruebler counts three freedoms and is
 * right about the drawing. Nobody means that: with nothing driving any of the
 * three rams, the triangle is three struts and it turns about its pin as one
 * rigid body. All three are held, the count that follows is one, and the
 * machine runs.
 *
 * The corner at `A` is a welded body -- the first ram's barrel, the third's rod
 * and the bar to ground -- which is what fixes the angle between two sides of
 * the triangle and makes the whole of it rigid rather than a four-bar.
 */
export function heldCylinderTriangleFixture(scale: number = 1): MechanismFixture {
  const A = { x: 0, y: 0 };
  const C = { x: 6, y: 0 };
  const E = { x: 3, y: 5 };
  const one = ram(A, C, { mountA: 'A', inner: 'N', seal: 'B', mountB: 'C' }, scale);
  const two = ram(C, E, { mountA: 'C', inner: 'P', seal: 'D', mountB: 'E' }, scale);
  const three = ram(E, A, { mountA: 'E', inner: 'Q', seal: 'F', mountB: 'A' }, scale);
  return {
    joints: [
      ...one.joints,
      ...two.joints.slice(1),
      ...three.joints.slice(1, 3),
      { id: 'G', x: -4 * scale, y: -3 * scale, ground: true, input: true },
    ],
    links: [
      // The welded corner: the first ram's barrel, the third's rod, and the bar
      // out to ground, as the compound a weld leaves behind.
      {
        joints: 'AFGN',
        fill: CORNER,
        subset: [{ joints: 'AN' }, { joints: 'AF' }, { joints: 'AG' }],
      },
      { joints: 'BC' },
      { joints: 'CP' },
      { joints: 'DE' },
      // The third ram's rod is welded into the corner, so the skin paints it
      // in the corner's ink; its barrel has to be that ink too, or the part is
      // drawn in two colors and the app repaints one of them (decision S15).
      { joints: 'EQ', fill: CORNER },
    ],
    sliders: [
      { ...one.slider, on: { carrier: 'AFGN', a: 'A', b: 'N' } },
      two.slider,
      { ...three.slider, on: { carrier: 'EQ', a: 'E', b: 'Q' } },
    ],
    // The three seals, and the weld that makes the corner one body.
    welds: ['B', 'D', 'F', 'A'],
    inputAngVel: 1,
  };
}

/**
 * A four-bar whose coupler is a passive cylinder.
 *
 * The simplest drawing the rule is for. Counted, it has two freedoms -- the
 * crank turns and the ram telescopes -- and the reader drew a four-bar. Held,
 * the coupler is a rigid bar and it runs as one.
 */
export function heldCouplerFixture(scale: number = 1): MechanismFixture {
  const B = { x: 0, y: 3 };
  const C = { x: 6, y: 4 };
  const coupler = ram(B, C, { mountA: 'B', inner: 'N', seal: 'S', mountB: 'C' }, scale);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      ...coupler.joints,
      { id: 'D', x: 7 * scale, y: 0, ground: true },
    ],
    links: [{ joints: 'AB' }, ...coupler.links, { joints: 'CD' }],
    sliders: [coupler.slider],
    welds: ['S'],
    inputAngVel: 1,
  };
}

/**
 * **The case that must not be held**: a cylinder the machine itself moves.
 *
 * A crank-rocker with a telescoping strut from the coupler's far point down to
 * ground. Counted, it has one freedom: the four-bar determines where the
 * strut's top end goes, so the strut's length is *forced* to change. It runs
 * today, exactly as it is, and holding it would turn a mechanism into a
 * structure.
 *
 * The rule never even looks at it -- it fires only where the count is above one
 * -- and this fixture is here to keep that true.
 */
export function followerCylinderFixture(scale: number = 1): MechanismFixture {
  const P = { x: 4.5, y: 4.5 };
  const G = { x: 5, y: -2 };
  const strut = ram(P, G, { mountA: 'P', inner: 'N', seal: 'S', mountB: 'G' }, scale);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 0, y: 2 * scale },
      { id: 'C', x: 6 * scale, y: 3 * scale },
      { id: 'D', x: 7 * scale, y: 0, ground: true },
      ...strut.joints.slice(0, 3),
      { id: 'G', x: G.x * scale, y: G.y * scale, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BCP' }, { joints: 'CD' }, ...strut.links],
    sliders: [strut.slider],
    welds: ['S'],
    inputAngVel: 1,
  };
}

/**
 * **The mixed case**: one cylinder the machine moves, one it does not.
 *
 * The follower above, with a second ram hung off the coupler's far point by a
 * short bar and pinned to ground -- a dyad whose only freedom is the second
 * ram's own length. Counted, two freedoms. With the crank held still the
 * strut's length cannot change at all, because the four-bar has already decided
 * where its top end is; the second ram's length can. So the second is held and
 * the strut is left to follow, which is what a rule that held every passive
 * cylinder would get wrong.
 */
export function mixedCylinderFixture(scale: number = 1): MechanismFixture {
  const base = followerCylinderFixture(scale);
  const H = { x: 8, y: 5 };
  const K = { x: 11, y: 1 };
  const second = ram(H, K, { mountA: 'H', inner: 'M', seal: 'T', mountB: 'K' }, scale);
  return {
    ...base,
    joints: [
      ...base.joints,
      { id: 'H', x: H.x * scale, y: H.y * scale },
      ...second.joints.slice(1, 3),
      { id: 'K', x: K.x * scale, y: K.y * scale, ground: true },
    ],
    links: [...base.links, { joints: 'HP' }, ...second.links],
    sliders: [...(base.sliders ?? []), second.slider],
    welds: [...(base.welds ?? []), 'T'],
  };
}
