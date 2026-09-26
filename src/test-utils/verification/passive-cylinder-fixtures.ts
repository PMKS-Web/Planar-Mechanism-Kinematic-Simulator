import { MechanismFixture } from './fixture';
import type { GalleryEntry } from './fixture-gallery';
import { cylinderBetween } from './slot-fixtures';

/**
 * Drawings with a cylinder nothing drives, which is a sliding joint like any
 * other and adds its freedom to the count.
 *
 * Most of these once ran because a passive ram was taken to hold its length
 * (decision S28, withdrawn by S30); they now count the freedom and say where
 * it is. One is a **follower**, whose length the linkage decides, and it runs
 * as it always did.
 *
 * All of them are built the way `frozen-cylinder-fixtures.ts` builds its
 * cylinder: `cylinderBetween` inverts the model's own span rule to place the
 * barrel's buried end and the seal, so the part is exactly the one the app
 * would draw between those two mounts.
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
 * Three cylinders in a triangle, with a bar from one corner to a grounded,
 * driven pin.
 *
 * Five bodies and six full joints, so Gruebler counts three freedoms, and the
 * count is right: each ram nothing drives can change length.
 *
 * The corner at `A` is a welded body -- the first ram's barrel, the third's rod
 * and the bar to ground -- which is what fixes the angle between two sides of
 * the triangle and makes the whole of it rigid rather than a four-bar.
 */
export function cylinderTriangleFixture(scale: number = 1): MechanismFixture {
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
 * A four-bar whose coupler is a passive cylinder: two freedoms, the crank's
 * and the ram's length. Welding either end of the ram to the bar it meets
 * leaves one.
 */
export function cylinderCouplerFixture(scale: number = 1): MechanismFixture {
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
 * A cylinder the machine itself moves: a crank-rocker with a telescoping strut
 * from the coupler's far point down to ground. Counted, it has one freedom: the
 * four-bar decides where the strut's top end goes, so its length is *forced*
 * to change, and it runs.
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
 * One cylinder the machine moves, one it does not: the follower above, with a
 * second ram hung off the coupler's far point by a short bar and pinned to
 * ground -- a dyad whose only freedom is the second ram's own length. Two
 * freedoms, and the drawer names the second ram as the one that is loose.
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

/**
 * A ram hanging from a linkage by its barrel, its far end loose: a
 * maintainer's drawing, with the input on the pin between the coupler and the
 * arm the barrel is welded to.
 *
 * Four moving bodies, three pins and the ram's slide: four freedoms. No single
 * edit leaves one, so the drawer lists steps, grounding F among them.
 */
export function ramWithAFreeEndFixture(scale: number = 1): MechanismFixture {
  const A = { x: -2, y: 1 };
  const F = { x: -3.5, y: -2.5 };
  const arm = ram(A, F, { mountA: 'A', inner: 'N', seal: 'E', mountB: 'F' }, scale);
  return {
    joints: [
      { id: 'B', x: 0, y: 0, input: true },
      { id: 'C', x: 4 * scale, y: -1 * scale },
      { id: 'D', x: 4 * scale, y: 3 * scale, ground: true },
      ...arm.joints,
    ],
    links: [
      { joints: 'CD' },
      { joints: 'BC' },
      { joints: 'ABN', subset: [{ joints: 'AB' }, { joints: 'AN' }] },
      { joints: 'EF' },
    ],
    sliders: [{ ...arm.slider, on: { carrier: 'ABN', a: 'A', b: 'N' } }],
    welds: ['E', 'A'],
    inputAngVel: 1,
  };
}

/**
 * The same drawing with F grounded. Four moving bodies and five one-freedom
 * joints, so two freedoms: the loop's and the ram's length, which nothing
 * drives.
 */
export function ramGroundedAtItsFreeEndFixture(scale: number = 1): MechanismFixture {
  const fixture = ramWithAFreeEndFixture(scale);
  fixture.joints = fixture.joints.map((joint) =>
    joint.id === 'F' ? { ...joint, ground: true } : joint
  );
  return fixture;
}

/** The pace the library's templates run at, which these share. */
const LIBRARY_RPM = 10;

/** These drawings in the fixture gallery, each with what it is for. */
export const PASSIVE_CYLINDER_GALLERY: GalleryEntry[] = [
  {
    name: 'Three cylinders in a triangle',
    purpose:
      'Does not run on purpose: nothing drives the three rams, so each adds a freedom and the count is three',
    spec: 'cylinder-passive.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: cylinderTriangleFixture(),
  },
  {
    name: 'Four-bar on a passive cylinder',
    purpose:
      'Does not run on purpose: a coupler nothing drives changes length, so the count is two',
    spec: 'cylinder-passive.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: cylinderCouplerFixture(),
  },
  {
    name: 'Telescoping strut',
    purpose: 'The cylinder a four-bar moves: its length follows the linkage, and it runs',
    spec: 'cylinder-passive.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: followerCylinderFixture(),
  },
  {
    name: 'One follower and one surplus',
    purpose:
      'Does not run on purpose: two passive cylinders, one the linkage moves and one nothing decides',
    spec: 'cylinder-passive.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: mixedCylinderFixture(),
  },
  {
    name: 'Ram with a free end',
    purpose:
      'Does not run on purpose: four freedoms, one of them the ram’s length, and the drawer lists steps',
    spec: 'cylinder-passive.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: ramWithAFreeEndFixture(),
  },
  {
    name: 'Ram grounded at its free end',
    purpose:
      'Does not run on purpose: two freedoms, the four-bar’s and the ram’s length nothing drives',
    spec: 'cylinder-passive.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: ramGroundedAtItsFreeEndFixture(),
  },
];
