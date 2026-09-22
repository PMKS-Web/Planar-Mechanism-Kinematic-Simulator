// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { NotificationService } from '../../app/services/notification.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { cylindersIn } from '../../app/model/cylinder';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';

/**
 * Welding a cylinder's two end joints into one body.
 *
 * The maintainer: *"If you try welding joint F, it breaks it visually. I know
 * it's kind of a nonsensical example, but it should still be allowed in the
 * sense that it shouldn't visually break the app, even though it will never
 * simulate."*
 *
 * It did more than break visually. The weld fuses the two brackets into one
 * body whose joints now include the seal, `PrisJoint.isSlotWellFormed` refused
 * a carrier that holds the slider itself, and `reconcileSlots` answered by
 * calling `detach()` -- which cannot be undone, because unwelding rebuilds the
 * two bodies and cannot invent a bore. What was left was a joint that is
 * `isSealed` and not floating, which the transcoder's own validator refuses, so
 * a reload, a share or an undo opened an empty grid.
 *
 * The rule the fix rests on: a sealed seal's slot is cut in the **barrel
 * leaf**, and that leaf never holds the seal. Only the fused root does, because
 * the rod has become another leaf of the same body. So it stays a cylinder, and
 * unwelding gives back exactly what was there before.
 *
 * *(September 21, 2026: it used to be refused an extension as well, with the
 * sentence `cylinder.both-ends-fused`. **S21** took that away — a welded body
 * changes shape under an edit like any compound, so the length goes through and
 * the body follows. "It will never simulate" was left standing as readiness's
 * to say; **S25**, later the same day, found that readiness's answer is that it
 * **does**. A cylinder with one body at both ends is a fixed part of that body
 * rather than a sliding pair, so a drawing built on one runs like any other
 * rigid link — see `cylinder-frozen-body.spec.ts`. What it cannot do is stroke.
 * This drawing is not one of those: its two ends are in two bodies meeting at a
 * pin, which is a sliding pair still — and one a pin and a Slide together hold
 * rigid, so the span cannot change either.)*
 */

/**
 * The maintainer's triangle: cylinder `C-E-D`, the barrel end `C` welded into
 * `CC1F` with the bar `CF`, the rod end `D` welded into `DEF` with `DF`, and
 * the two bodies pinned together at `F`.
 */
const CYLINDER_IN_A_TRIANGLE =
  '2v.2_,1E8.5,0.1011.8C,C,0e3,Y4,0.0C1,C1,0W8,ZA,0.8D,D,0N8,aQ,0.fE,E,0UR,ZP,0,CC1F,C,C1.0F,F,0W8,RF,0..ARCC1F,CC1F,0,0,0a6,We,303e9f,C,C1,F,,CC1,CF.ARDEF,DEF,0,0,0RD,Xt,303e9f,E,D,F,,DE,DF.aRCC1,CC1,0,0,0a6,Yd,303e9f,C,C1,,.aRCF,CF,0,0,0a5,Ug,c5cae9,C,F,,.aRDE,DE,0,0,0Qn,Zw,303e9f,E,D,,.aRDF,DF,0,0,0Re,Vr,303e9f,D,F,,...N_D*3spB6m';

function build() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const mechanism = TestBed.inject(MechanismService);
  const grid = TestBed.inject(GridUtilsService);
  const active = TestBed.inject(ActiveObjService);
  const history = TestBed.inject(SaveHistoryService);
  const notify = TestBed.inject(NotificationService);
  const urls = TestBed.inject(UrlGenerationService);
  TestBed.inject(UrlProcessorService).updateFromURL(CYLINDER_IN_A_TRIANGLE, false, true);
  const joint = (id: string) => mechanism.joints.find((one) => one.id === id) as RealJoint;
  return {
    mechanism,
    grid,
    active,
    history,
    notify,
    urls,
    joint,
    rams: () => cylindersIn(mechanism.joints),
    roots: () => mechanism.links.map((one) => one.id).sort(),
    span: (from: string, to: string) =>
      Math.hypot(joint(from).x - joint(to).x, joint(from).y - joint(to).y),
    said: () => notify.live.map((one) => `${one.id}|${one.text}`),
  };
}

/** Weld the joint the two brackets meet at, the way the menu row does. */
function weldTheirPin(harness: ReturnType<typeof build>): void {
  harness.mechanism.weldJoint(harness.joint('F'));
}

describe('welding the joint a cylinder’s two brackets share', () => {
  it('leaves it a cylinder, with one body at both of its ends', () => {
    const harness = build();
    const before = harness.rams()[0];
    expect(before.barrelRoot.id).not.toBe(before.rodRoot.id);

    weldTheirPin(harness);

    const after = harness.rams();
    expect(after, 'the cylinder survived the weld').toHaveLength(1);
    expect(after[0].seal.id).toBe('E');
    expect(after[0].mountA.id).toBe('C');
    expect(after[0].mountB.id).toBe('D');
    // One body at both ends, which is the state the planner refuses to extend
    // rather than a drawing with nothing in it.
    expect(after[0].barrelRoot.id).toBe(after[0].rodRoot.id);
    expect(after[0].seal.isFloating).toBe(true);
    expect(after[0].seal.isSlotWellFormed).toBe(true);
  });

  it('writes a URL that opens again as the same drawing', () => {
    const harness = build();
    weldTheirPin(harness);
    const url = harness.urls.generateUrlQuery();
    expect(url.length).toBeGreaterThan(0);

    const reopened = build();
    TestBed.inject(UrlProcessorService).updateFromURL(url, false, true);
    const reloaded = TestBed.inject(MechanismService);
    const rams = cylindersIn(reloaded.joints);
    expect(rams, 'the shared link opens as a cylinder').toHaveLength(1);
    expect(rams[0].barrelRoot.id).toBe(rams[0].rodRoot.id);
    expect(reopened.said().filter((text) => /could not be opened/.test(text))).toEqual([]);
  });

  it('is one undo entry, and redo welds it again', () => {
    const harness = build();
    harness.mechanism.updateMechanism(true);
    const apart = harness.roots();

    weldTheirPin(harness);
    const fused = harness.roots();
    expect(fused).not.toEqual(apart);

    harness.history.undo();
    expect(harness.roots()).toEqual(apart);
    expect(cylindersIn(harness.mechanism.joints)).toHaveLength(1);

    harness.history.redo();
    expect(harness.roots()).toEqual(fused);
    expect(cylindersIn(harness.mechanism.joints)).toHaveLength(1);
  });

  it('gives the two bodies back when the weld is taken apart', () => {
    const harness = build();
    const barrelWas = harness.span('C', 'C1');
    const rodWas = harness.span('E', 'D');
    const apart = harness.roots();

    weldTheirPin(harness);
    harness.mechanism.unWeldJoint(harness.joint('F'));

    const ram = harness.rams()[0];
    expect(ram, 'the cylinder is still there').toBeDefined();
    expect(harness.roots()).toEqual(apart);
    expect(ram.barrelRoot.id).not.toBe(ram.rodRoot.id);
    // The bore was never taken away, so there is nothing to invent back --
    // which is the whole reason the weld had to stop detaching it.
    expect(ram.seal.isSlotWellFormed).toBe(true);
    expect(harness.span('C', 'C1')).toBeCloseTo(barrelWas, 6);
    expect(harness.span('E', 'D')).toBeCloseTo(rodWas, 6);

    // And it moves again as a whole, which is what this drawing allows: its
    // two ends are still in two bodies pinned at F, so it can go anywhere and
    // change no length, the same before the weld as after it.
    harness.grid.dragCylinder(ram, 10, 10);
    expect(harness.span('C', 'C1')).toBeCloseTo(barrelWas, 6);
    expect(harness.span('E', 'D')).toBeCloseTo(rodWas, 6);
  });

  it('takes a new barrel length, and the body changes shape to let it', () => {
    // It used to be refused in so many words (`cylinder.both-ends-fused`), on
    // the reading that the distance between two points of a rigid body is not a
    // number an edit gets to choose. **S21 reversed that on September 21,
    // 2026**: nothing else in the editor treats a welded body as rigid, and
    // dragging a corner of a welded triangle changes the triangle. The drawing
    // still never simulates -- which is readiness's job to say, not the
    // editor's to forbid.
    const harness = build();
    weldTheirPin(harness);
    const ram = harness.rams()[0];
    const wanted = harness.span('C', 'C1') * 1.3;

    expect(harness.grid.setBarrelLength(ram, wanted)).toBe(true);

    expect(harness.span('C', 'C1')).toBeCloseTo(wanted, 3);
    expect(harness.said()).toEqual([]);
    // And it is still one cylinder afterwards, with one body at both ends.
    const after = harness.rams();
    expect(after).toHaveLength(1);
    expect(after[0].barrelRoot.id).toBe(after[0].rodRoot.id);
  });

  it('still moves as one body, which is all a rigid part can do', () => {
    const harness = build();
    weldTheirPin(harness);
    const ram = harness.rams()[0];
    const was = harness.joint('F');
    const where = { x: was.x, y: was.y };

    harness.grid.dragCylinder(ram, 40, -25);

    expect(harness.joint('F').x).toBeCloseTo(where.x + 40, 4);
    expect(harness.joint('F').y).toBeCloseTo(where.y - 25, 4);
    expect(harness.rams()).toHaveLength(1);
  });
});

/**
 * The scope of the exception, stated on the predicate itself.
 *
 * One body holding both the slot and the thing riding in it is meaningless for
 * an ordinary slider and meaningful for a cylinder, and the difference is where
 * the slot is cut: a seal's is cut in the barrel leaf, which never holds it.
 * Read off the root, the two look identical, which is why this asks the leaf.
 */
describe('a slot whose carrier holds the slider itself', () => {
  /** A slider riding a bar, with both welded into one compound. */
  function fused(sealed: boolean) {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 100, 0);
    const slider = new PrisJoint('S', 50, 0);
    slider.isSealed = sealed;
    slider.rotates = !sealed;
    const rider = new RevJoint('R', 50, 40);
    // The slot is cut in `AB`, which holds neither S nor R.
    const cut = new RealLink('AB', [a, b]);
    const riding = new RealLink('RS', [rider, slider]);
    const both = new RealLink('ABRS', [a, b, rider, slider], undefined, undefined, undefined, [
      cut,
      riding,
    ]);
    slider.slideOn(both, a, b);
    return slider;
  }

  it('is malformed for an ordinary slider, exactly as it always was', () => {
    // Its rider welded into its carrier really does leave nothing to slide.
    expect(fused(false).isSlotWellFormed).toBe(false);
  });

  it('is a cylinder with both ends welded into one body, and stands', () => {
    expect(fused(true).isSlotWellFormed).toBe(true);
  });

  it('is malformed either way when the bar the slot is cut in holds it', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 100, 0);
    const slider = new PrisJoint('S', 50, 0);
    slider.isSealed = true;
    const cut = new RealLink('ABS', [a, b, slider]);
    slider.slideOn(cut, a, b);
    expect(slider.isSlotWellFormed).toBe(false);
  });
});
