import { MechanismFixture } from './fixture';
import { cylinderBetween } from './slot-fixtures';

/**
 * The two drawings the maintainer reported decision S21 against.
 *
 * Both are about the same thing — what moves when something welded to a
 * cylinder is not the thing the reader has hold of — and neither is a linkage
 * anybody would simulate. They are here rather than inside the spec that reads
 * them so that the browser suite opens the same two drawings the unit suite
 * asserts on, through the payloads below.
 *
 * > *"In image 1, dragging joint B shouldn't move the location of joint J.
 * > Similar to how a standard compound link moves when dragged. In image 2,
 * > dragging joint A causes B to stay in place but E to move. It should be
 * > consistent and it should not move E. E should behave exactly like B. Also,
 * > when you drag joint E, joint B shouldn't move in the second image again."*
 *
 * Every letter below is the one that report uses.
 *
 * **Not `FIXTURE_GALLERY` entries**, which is the rule everywhere else. Two
 * more rows take `fixture-gallery.ts` past its `max-lines` cap, and the way to
 * answer that is to split a file rather than to raise a number (code-style.md)
 * — which is not this package's business. The reason for the rule is met
 * another way: the payloads are written out below, so a reviewer opens either
 * drawing by pasting one after the app's `?`, exactly as they would a gallery
 * link.
 */

/** Where the far end of the second cylinder sits, up and to the right of A. */
const SECOND_END = { x: 4, y: 4.5 };

/**
 * **Image 1.** A bar `J–A` welded at `A` to the barrel end of the cylinder
 * `A–C–B`.
 *
 * Dragging `B`, dragging `A`, or typing an Angle used to swing `J` round with
 * the barrel, because the bracket was carried rigidly by whichever side of the
 * part moved. Under S21 only a drag of the *body* carries it.
 */
export function weldedBracketCylinderFixture(): MechanismFixture {
  const mount = { x: 0, y: 0 };
  const eye = { x: 6, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  return {
    joints: [
      { id: 'A', ...mount },
      { id: 'N', ...barrelEnd },
      { id: 'C', ...pin },
      { id: 'B', ...eye },
      { id: 'J', x: -3, y: -2 },
    ],
    // The weld is written as the compound it leaves behind: the barrel and the
    // bar as two leaves of one body, and the slot lifted to that body, which is
    // what a rebuild does to a cylinder's end joint after a weld.
    links: [{ joints: 'AJN', subset: [{ joints: 'AN' }, { joints: 'AJ' }] }, { joints: 'CB' }],
    sliders: [{ at: 'C', on: { carrier: 'AJN', a: 'A', b: 'N' }, sealed: true }],
    // `C` is the seal, which is what makes the part a cylinder; `A` is the weld
    // the report is about.
    welds: ['C', 'A'],
    inputAngVel: 1,
  };
}

/**
 * **Image 2.** Two cylinders, `A–C–B` and `A–D–E`, whose barrels are both
 * welded at the one end joint `A`: one body holding two barrels.
 *
 * The asymmetry the report names — dragging `A` left `B` alone and moved `E`,
 * and dragging `E` moved `B` — came from the same carry: the first part to be
 * posed took the shared bracket with it, and the second rode the bracket.
 * Under S21 each cylinder re-lays between the joints it actually has, so `B`
 * and `E` behave the same way as each other whichever one is dragged.
 */
export function twoCylindersOneBracketFixture(): MechanismFixture {
  const mount = { x: 0, y: 0 };
  const firstEnd = { x: 6, y: 0 };
  const first = cylinderBetween(mount, firstEnd, 0.5);
  const second = cylinderBetween(mount, SECOND_END, 0.5);
  return {
    joints: [
      { id: 'A', ...mount },
      { id: 'N', ...first.barrelEnd },
      { id: 'C', ...first.pin },
      { id: 'B', ...firstEnd },
      { id: 'M', ...second.barrelEnd },
      { id: 'D', ...second.pin },
      { id: 'E', ...SECOND_END },
    ],
    // One body with two barrels in it, which is what welding `A` leaves behind.
    links: [
      { joints: 'AMN', subset: [{ joints: 'AN' }, { joints: 'AM' }] },
      { joints: 'CB' },
      { joints: 'DE' },
    ],
    sliders: [
      { at: 'C', on: { carrier: 'AMN', a: 'A', b: 'N' }, sealed: true },
      { at: 'D', on: { carrier: 'AMN', a: 'A', b: 'M' }, sealed: true },
    ],
    welds: ['C', 'D', 'A'],
    inputAngVel: 1,
  };
}

/**
 * Image 1 as a URL, for the browser suite and for anybody who wants to open it.
 *
 * `fixturePayload` of the fixture above, at the gallery's own scale and speed.
 * Written out rather than computed because `e2e/*.mjs` are plain Node scripts
 * with no TypeScript to call — the same arrangement `SLIDE_FUSION_PAYLOAD`
 * uses, read out of this file by name rather than copied into a second place.
 * `cylinder-welded-neighbors.spec.ts` encodes the fixture and compares, so a
 * drift fails the unit suite instead of silently opening a different drawing.
 */
export const WELDED_BRACKET_PAYLOAD =
  '2v.Ay,1E8.5,0.1011.8A,A,0,0,0.0N,N,tQ,0,0.fC,C,cM,0,0,AJN,A,N.0B,B,1Tm,0,0.0J,J,0ku,0VG,0..YRAJN,AJN,Fe,Fe,2s,0AR,0d125a,A,J,N,,AN,AJ.YRCB,CB,Fe,Fe,123,0,B2DFDB,C,B,,.NRAN,AN,Fe,Fe,Rj,0,c5cae9,A,N,,.NRAJ,AJ,Fe,Fe,0NS,0Fe,303e9f,A,J,,...N_q*3DBVgC';

/** Image 2 as a URL, on the same terms. */
export const TWO_CYLINDERS_PAYLOAD =
  '2v.Ay,1E8.5,0.1011.8A,A,0,0,0.0N,N,tQ,0,0.fC,C,cM,0,0,AMN,A,N.0B,B,1Tm,0,0.0M,M,az,fb,0.fD,D,PZ,Sl,0,AMN,A,M.0E,E,_W,16K,0..YRAMN,AMN,Fe,Fe,Uo,Dt,0d125a,A,M,N,,AN,AM.YRCB,CB,Fe,Fe,123,0,B2DFDB,C,B,,.YRDE,DE,Fe,Fe,i1,nY,26A69A,D,E,,.NRAN,AN,Fe,Fe,Rj,0,c5cae9,A,N,,.NRAM,AM,Fe,Fe,IV,Ko,303e9f,A,M,,...N_r*3f9bEr';
