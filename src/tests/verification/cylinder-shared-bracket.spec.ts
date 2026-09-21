// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { NotificationService } from '../../app/services/notification.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { cylindersIn, Cylinder } from '../../app/model/cylinder';
import { RealLink } from '../../app/model/link';

/**
 * Two cylinders whose barrels are welded into one bracket.
 *
 * The maintainer's drawing: an excavator elbow, where two rams hang off the
 * same pin `T` and both of their barrels are leaves of the one welded body
 * `TT1T2W`. Every length, angle and *Starts at* typed at either of them was
 * refused with "Moving this would stretch TU past what it can reach", while the
 * same edit on a single ram welded to a bracket went through.
 *
 * The plan lays the edited ram out from its own pose, which puts that ram's
 * buried end `T1` where the new length wants it. Placing the shared mount `T`
 * then wakes the *other* ram, which settles by carrying its barrel body
 * rigidly -- and that body is the same bracket, which holds `T1`. The carry
 * used to skip only the settling ram's own interior, so it wrote `T1` back
 * where it started, and the consistency check then found the edited ram was not
 * the length that had just been typed.
 *
 * The rule these hold the planner to: a body carried rigidly never writes a
 * joint that some cylinder places for itself.
 */

// The drawing as the maintainer shared it. Rams T-V-U and T-Y-X, barrels TT1
// and TT2, both leaves of the bracket TT1T2W together with the bar TW.
const TWO_RAMS_ONE_BRACKET =
  '2v.4A,Fe.5,0.1011.8T,T,Ec,18D,0.0T1,T1,hw,1I-,0.0U,U,1PA,1Zf,0.fV,V,UW,1E3,0,TT1T2W,T,T1.0W,W,3b,wE,0.0T2,T2,SK,wV,0.0X,X,az,nt,0.fY,Y,NE,-a,0,TT1T2W,T,T2..ARUV,UV,0,0,xr,1Os,26A69A,V,U,,.ARXY,XY,0,0,U5,uj,0d125a,Y,X,,.ARTT1T2W,TT1T2W,0,0,Jx,15O,26A69A,T,T1,W,T2,,TT1,TW,TT2.aRTT1,TT1,0,0,TG,1Dc,26A69A,T,T1,,.aRTW,TW,0,0,95,11D,c5cae9,T,W,,.aRTT2,TT2,0,0,LT,11M,0d125a,T,T2,,...N_9*2JUZvL';

interface Harness {
  mechanism: MechanismService;
  grid: GridUtilsService;
  notify: NotificationService;
  history: SaveHistoryService;
  rams: () => Cylinder[];
  at: (id: string) => { x: number; y: number };
  span: (from: string, to: string) => number;
}

function build(): Harness {
  TestBed.configureTestingModule({});
  const mechanism = TestBed.inject(MechanismService);
  const grid = TestBed.inject(GridUtilsService);
  const notify = TestBed.inject(NotificationService);
  const history = TestBed.inject(SaveHistoryService);
  TestBed.inject(UrlProcessorService).updateFromURL(TWO_RAMS_ONE_BRACKET, false, true);
  const at = (id: string) => {
    const joint = mechanism.joints.find((one) => one.id === id)!;
    return { x: joint.x, y: joint.y };
  };
  const span = (from: string, to: string) => {
    const a = at(from);
    const b = at(to);
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  return {
    mechanism,
    grid,
    notify,
    history,
    rams: () => cylindersIn(mechanism.joints),
    at,
    span,
  };
}

/** The ram whose barrel runs from the shared mount to `inner`. */
function ramWithInner(harness: Harness, inner: string): Cylinder {
  return harness.rams().find((one) => one.inner.id === inner)!;
}

/** Everything about the *other* ram and the bracket's third leaf that must hold. */
function untouchedShape(harness: Harness) {
  return {
    otherBarrel: harness.span('T', 'T2'),
    otherRod: harness.span('Y', 'X'),
    otherSpan: harness.span('T', 'X'),
    thirdLeaf: harness.span('T', 'W'),
  };
}

function expectUnchanged(
  was: ReturnType<typeof untouchedShape>,
  now: ReturnType<typeof untouchedShape>
): void {
  expect(now.otherBarrel).toBeCloseTo(was.otherBarrel, 6);
  expect(now.otherRod).toBeCloseTo(was.otherRod, 6);
  expect(now.otherSpan).toBeCloseTo(was.otherSpan, 6);
  expect(now.thirdLeaf).toBeCloseTo(was.thirdLeaf, 6);
}

describe('the drawing really is two rams sharing one welded bracket', () => {
  it('has both barrels as leaves of one body, and one mount between them', () => {
    const harness = build();
    const rams = harness.rams();
    expect(rams).toHaveLength(2);
    const [first, second] = rams;
    expect(first.mountA.id).toBe('T');
    expect(second.mountA.id).toBe('T');
    expect(first.barrelRoot.id).toBe('TT1T2W');
    expect(second.barrelRoot.id).toBe('TT1T2W');
    // Three leaves: the two barrels and the bar out to W.
    const bracket = harness.mechanism.links.find((link) => link.id === 'TT1T2W') as RealLink;
    expect(bracket.subset.map((leaf) => leaf.id).sort()).toEqual(['TT1', 'TT2', 'TW']);
  });
});

describe('typing a new size at one of two rams in one bracket', () => {
  it('gives the barrel the length that was typed', () => {
    const harness = build();
    const ram = ramWithInner(harness, 'T1');
    const was = untouchedShape(harness);
    const wanted = harness.span('T', 'T1') * 1.2;

    expect(harness.grid.setBarrelLength(ram, wanted)).toBe(true);
    expect(harness.span('T', 'T1')).toBeCloseTo(wanted, 4);
    expectUnchanged(was, untouchedShape(harness));
  });

  it('and the same at the other one, whose barrel is the bracket s other leaf', () => {
    const harness = build();
    const ram = ramWithInner(harness, 'T2');
    const was = {
      otherBarrel: harness.span('T', 'T1'),
      otherRod: harness.span('V', 'U'),
      otherSpan: harness.span('T', 'U'),
      thirdLeaf: harness.span('T', 'W'),
    };
    const wanted = harness.span('T', 'T2') * 0.8;

    expect(harness.grid.setBarrelLength(ram, wanted)).toBe(true);
    expect(harness.span('T', 'T2')).toBeCloseTo(wanted, 4);
    const now = {
      otherBarrel: harness.span('T', 'T1'),
      otherRod: harness.span('V', 'U'),
      otherSpan: harness.span('T', 'U'),
      thirdLeaf: harness.span('T', 'W'),
    };
    expectUnchanged(was, now);
  });

  it('gives the rod the length that was typed', () => {
    const harness = build();
    const ram = ramWithInner(harness, 'T1');
    const was = untouchedShape(harness);
    const wanted = harness.span('V', 'U') * 1.15;

    expect(harness.grid.setRodLength(ram, wanted)).toBe(true);
    expect(harness.span('V', 'U')).toBeCloseTo(wanted, 4);
    expectUnchanged(was, untouchedShape(harness));
  });

  it('moves the head to a new Starts at', () => {
    const harness = build();
    const ram = ramWithInner(harness, 'T1');
    const was = untouchedShape(harness);
    const barrel = harness.span('T', 'T1');
    const rod = harness.span('V', 'U');
    const head = harness.at('V');

    expect(harness.grid.setCylinderStart(ram, 0.65)).toBe(true);
    // The head moved, and neither member changed length doing it.
    expect(Math.hypot(harness.at('V').x - head.x, harness.at('V').y - head.y)).toBeGreaterThan(
      1e-3
    );
    expect(harness.span('T', 'T1')).toBeCloseTo(barrel, 4);
    expect(harness.span('V', 'U')).toBeCloseTo(rod, 4);
    expectUnchanged(was, untouchedShape(harness));
  });

  it('turns the whole ram to a new Angle', () => {
    const harness = build();
    const ram = ramWithInner(harness, 'T1');
    const barrel = harness.span('T', 'T1');
    const rod = harness.span('V', 'U');
    const mount = harness.at('T');
    const wanted = Math.atan2(harness.at('U').y - mount.y, harness.at('U').x - mount.x) + 0.15;

    const otherBarrel = harness.span('T', 'T2');
    const otherRod = harness.span('Y', 'X');
    const otherEnd = harness.at('X');
    const bracketCorner = harness.at('W');

    expect(harness.grid.setCylinderAngle(ram, wanted)).toBe(true);

    const now = harness.at('U');
    expect(Math.atan2(now.y - harness.at('T').y, now.x - harness.at('T').x)).toBeCloseTo(wanted, 4);
    expect(harness.span('T', 'T1')).toBeCloseTo(barrel, 4);
    expect(harness.span('V', 'U')).toBeCloseTo(rod, 4);
    // **The other cylinder does not move at all** (decision S21). A typed Angle
    // is not a body drag: it writes this cylinder's own joints and turns it
    // about the shared end joint `T`, which stays where it is -- so the bracket
    // has nothing to be carried by, and the second cylinder has no end joint
    // that moved to re-lay from. Until September 21, 2026 the bracket was
    // carried round rigidly and took the second cylinder with it.
    expect(harness.at('X').x).toBeCloseTo(otherEnd.x, 6);
    expect(harness.at('X').y).toBeCloseTo(otherEnd.y, 6);
    expect(harness.at('W').x).toBeCloseTo(bracketCorner.x, 6);
    expect(harness.at('W').y).toBeCloseTo(bracketCorner.y, 6);
    expect(harness.span('T', 'T2')).toBeCloseTo(otherBarrel, 4);
    expect(harness.span('Y', 'X')).toBeCloseTo(otherRod, 4);
  });

  it('says nothing, because nothing was refused', () => {
    const harness = build();
    const ram = ramWithInner(harness, 'T1');

    expect(harness.grid.setBarrelLength(ram, harness.span('T', 'T1') * 1.1)).toBe(true);

    expect(harness.notify.live.map((one) => one.text)).toEqual([]);
  });

  it('is one undo entry, and undo puts the whole drawing back', () => {
    const harness = build();
    harness.mechanism.updateMechanism(true);
    const ram = ramWithInner(harness, 'T1');
    const was = new Map(harness.mechanism.joints.map((one) => [one.id, harness.at(one.id)]));

    expect(harness.grid.setBarrelLength(ram, harness.span('T', 'T1') * 1.2)).toBe(true);
    harness.mechanism.updateMechanism(true);
    harness.history.undo();

    for (const [id, point] of was) {
      // What "did not move" means across a URL round trip: the codec rounds to
      // a thousandth of a user unit, and undo replays a URL.
      expect(Math.hypot(harness.at(id).x - point.x, harness.at(id).y - point.y), id).toBeLessThan(
        0.5
      );
    }
  });
});
