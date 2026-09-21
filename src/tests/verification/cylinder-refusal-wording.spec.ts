// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { NotificationService } from '../../app/services/notification.service';
import { cylindersIn, Cylinder } from '../../app/model/cylinder';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';

/**
 * What the planner says when it says no.
 *
 * A refusal is the whole of what the reader gets back, so it has to be true
 * about *this* drawing, specific about what is in the way, and say what to do
 * about it. Two the maintainer hit were none of those. One explained a cylinder
 * whose ends are welded into two bodies pinned to each other as a cylinder with
 * both ends in one body — and named that body `CC1F`, after the buried inner
 * end no drawing ever draws (D14, S11), so the sentence offered a joint they
 * could not find and a fix that did not apply.
 */

/**
 * A cylinder whose two end joints are in two bodies that meet again elsewhere:
 * barrel `C-C1` welded into `CC1F`, rod `E-D` welded into `DEF`, and the two
 * bodies sharing the pin `F`. Nothing can move `C` and `D` apart.
 */
const CYLINDER_IN_A_TRIANGLE =
  '2v.2_,1E8.5,0.1011.8C,C,0e3,Y4,0.0C1,C1,0W8,ZA,0.8D,D,0N8,aQ,0.fE,E,0UR,ZP,0,CC1F,C,C1.0F,F,0W8,RF,0..ARCC1F,CC1F,0,0,0a6,We,303e9f,C,C1,F,,CC1,CF.ARDEF,DEF,0,0,0RD,Xt,303e9f,E,D,F,,DE,DF.aRCC1,CC1,0,0,0a6,Yd,303e9f,C,C1,,.aRCF,CF,0,0,0a5,Ug,c5cae9,C,F,,.aRDE,DE,0,0,0Qn,Zw,303e9f,E,D,,.aRDF,DF,0,0,0Re,Vr,303e9f,D,F,,...N_D*3spB6m';

/** The maintainer's two cylinders whose barrels are leaves of one bracket. */
const TWO_RAMS_ONE_BRACKET =
  '2v.4A,Fe.5,0.1011.8T,T,Ec,18D,0.0T1,T1,hw,1I-,0.0U,U,1PA,1Zf,0.fV,V,UW,1E3,0,TT1T2W,T,T1.0W,W,3b,wE,0.0T2,T2,SK,wV,0.0X,X,az,nt,0.fY,Y,NE,-a,0,TT1T2W,T,T2..ARUV,UV,0,0,xr,1Os,26A69A,V,U,,.ARXY,XY,0,0,U5,uj,0d125a,Y,X,,.ARTT1T2W,TT1T2W,0,0,Jx,15O,26A69A,T,T1,W,T2,,TT1,TW,TT2.aRTT1,TT1,0,0,TG,1Dc,26A69A,T,T1,,.aRTW,TW,0,0,95,11D,c5cae9,T,W,,.aRTT2,TT2,0,0,LT,11M,0d125a,T,T2,,...N_9*2JUZvL';

/** A joint the drawing never draws: a letter with a number hung off it. */
const INTERIOR_NAME = /[A-Za-z]\d/;

function build(payload: string) {
  // Several drawings per test, each its own injector: one provocation is not
  // enough to say anything about the *set* of sentences this file can write.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const mechanism = TestBed.inject(MechanismService);
  const grid = TestBed.inject(GridUtilsService);
  const notify = TestBed.inject(NotificationService);
  TestBed.inject(UrlProcessorService).updateFromURL(payload, false, true);
  const joint = (id: string) => mechanism.joints.find((one) => one.id === id)!;
  const span = (from: string, to: string) =>
    Math.hypot(joint(from).x - joint(to).x, joint(from).y - joint(to).y);
  return {
    mechanism,
    grid,
    notify,
    joint,
    span,
    rams: () => cylindersIn(mechanism.joints),
    /** Everything the app said, as `code|sentence`. */
    said: () => notify.live.map((one) => ({ code: one.id, text: one.text })),
  };
}

describe('a cylinder whose two ends sit in two bodies pinned to each other', () => {
  it('is refused for the reason that is actually in the way', () => {
    const harness = build(CYLINDER_IN_A_TRIANGLE);
    const ram = harness.rams()[0];
    expect(ram.barrelRoot.id, 'the fixture really is two bodies').not.toBe(ram.rodRoot.id);

    expect(harness.grid.setBarrelLength(ram, harness.span('C', 'C1') * 1.2)).toBe(false);

    const [refusal] = harness.said();
    expect(refusal.code).toBe('cylinder.pose-conflict');
    // What is in the way: both bodies, and the joint that ties them together.
    expect(refusal.text).toContain('Cylinder CD');
    expect(refusal.text).toContain('Link CF');
    expect(refusal.text).toContain('Link DEF');
    expect(refusal.text).toContain('joint F');
    // And what to do about it, in the app's own verb.
    expect(refusal.text).toContain('Unweld joint C or joint D');
    // Never the old sentence, which was true of a different drawing.
    expect(refusal.text).not.toContain('both mounts');
  });

  it('names no joint the drawing does not draw', () => {
    const harness = build(CYLINDER_IN_A_TRIANGLE);
    const ram = harness.rams()[0];
    harness.grid.setBarrelLength(ram, harness.span('C', 'C1') * 1.2);

    // `CC1F` is the body's id and holds C1, the buried inner end.
    expect(harness.said()[0].text).not.toMatch(INTERIOR_NAME);
  });
});

describe('every refusal a cylinder edit can raise, over welded barrels', () => {
  /**
   * The refusals the two fixtures can be made to produce, each provoked
   * through the service the panel uses.
   *
   * The point is not any one sentence but the set: both drawings hide a joint
   * inside a welded body, so anything built from an id rather than from the
   * reader's name for a body shows up here.
   */
  function everySaying(): { code: string; text: string }[] {
    const collected: { code: string; text: string }[] = [];

    // 1 · two bodies tied together at a pin.
    const triangle = build(CYLINDER_IN_A_TRIANGLE);
    triangle.grid.setBarrelLength(triangle.rams()[0], triangle.span('C', 'C1') * 1.2);
    collected.push(...triangle.said());

    // 2 · a Lock on a joint the edit would carry: the bracket turns with the
    //     cylinder welded into it, and the Lock is out on its far corner.
    const locked = build(TWO_RAMS_ONE_BRACKET);
    (locked.joint('W') as RealJoint).locked = true;
    locked.mechanism.updateMechanism(false);
    const turning = locked.rams().find((one) => one.inner.id === 'T1')!;
    const bearing = Math.atan2(
      locked.joint('U').y - locked.joint('T').y,
      locked.joint('U').x - locked.joint('T').x
    );
    locked.grid.setCylinderAngle(turning, bearing + 0.2);
    collected.push(...locked.said());

    // 3 · a cylinder carried past what it can reach, with both of its members
    //     fixed at their lengths so neither can take up the difference.
    const held = build(TWO_RAMS_ONE_BRACKET);
    const carried = held.rams().find((one) => one.inner.id === 'T2')!;
    (carried.barrel as RealLink).hold = 'length';
    carried.rod.hold = 'length';
    held.mechanism.updateMechanism(false);
    const far = held.joint('X') as RealJoint;
    held.grid.dragCylinderMount(carried, far, new Coord(far.x, far.y));
    held.grid.dragJoint(far, new Coord(held.joint('T').x, held.joint('T').y));
    collected.push(...held.said());

    return collected;
  }

  it('says something, and says nothing about a joint nobody can see', () => {
    const sayings = everySaying();
    expect(sayings.length).toBeGreaterThan(0);
    for (const saying of sayings) {
      expect(saying.text, saying.code).not.toMatch(INTERIOR_NAME);
    }
  });

  it('says what to do about it, every time', () => {
    for (const saying of everySaying()) {
      // Every refusal ends on a move the reader can make. The verbs are the
      // ones the menus use (ui-vocabulary.md): Unweld, Unlock, Release, Move.
      expect(saying.text, saying.code).toMatch(/Unweld|Unlock|Release|Move|Shorten|Give/);
    }
  });

  it('calls a cylinder a cylinder, and a joint a joint', () => {
    for (const saying of everySaying()) {
      expect(saying.text, saying.code).not.toMatch(/\bram\b|\bmount\b|\bseal\b/i);
    }
  });
});

describe('a Lock on something a cylinder edit would carry', () => {
  it('names the locked joint and the way out of it', () => {
    const harness = build(TWO_RAMS_ONE_BRACKET);
    (harness.joint('W') as RealJoint).locked = true;
    harness.mechanism.updateMechanism(false);
    const ram: Cylinder = harness.rams().find((one) => one.inner.id === 'T1')!;
    const bearing = Math.atan2(
      harness.joint('U').y - harness.joint('T').y,
      harness.joint('U').x - harness.joint('T').x
    );

    expect(harness.grid.setCylinderAngle(ram, bearing + 0.2)).toBe(false);

    const [refusal] = harness.said();
    expect(refusal.code).toBe('cylinder.pose-locked');
    expect(refusal.text).toContain('joint W');
    expect(refusal.text).toContain('Unlock');
  });
});
