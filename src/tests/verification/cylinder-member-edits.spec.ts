// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { cylinderBetween } from '../../test-utils/verification/slot-fixtures';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';
import { cylinderSizeOf, cylindersIn } from '../../app/model/cylinder';
import { NotificationService } from '../../app/services/notification.service';

/**
 * The cylinder's own edits, driven through the service and read off the
 * drawing afterwards.
 *
 * Two promises, and they are the ones the arithmetic cannot make on its own:
 * an edit that goes through is **one entry in the history**, so a reader who
 * types a length and presses Undo gets the length back rather than whatever
 * gesture came before it; and an edit that is refused changes **nothing** --
 * not the joints, not the URL, not the history.
 */

const MOUNT = { x: 0, y: 0 };
const EYE = { x: 10, y: 0 };

/** A plain cylinder from (0,0) to (10,0), with both ends free. */
function ramFixture(options: { groundA?: boolean; groundB?: boolean } = {}): MechanismFixture {
  const { barrelEnd, pin } = cylinderBetween(MOUNT, EYE, 0.5);
  return {
    joints: [
      { id: 'A', ...MOUNT, ground: options.groundA },
      { id: 'B', ...barrelEnd },
      { id: 'C', ...pin },
      { id: 'D', ...EYE, ground: options.groundB },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [{ at: 'C', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true }],
    welds: ['C'],
    inputAngVel: 1,
  };
}

function build(fixture: MechanismFixture) {
  // Reset first: several of these walk a table of edits and build a fresh
  // drawing per row, and a second `configureTestingModule` in one test throws.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const mechanism = TestBed.inject(MechanismService);
  const grid = TestBed.inject(GridUtilsService);
  const history = TestBed.inject(SaveHistoryService);
  const urls = TestBed.inject(UrlGenerationService);
  TestBed.inject(UrlProcessorService).updateFromURL(fixturePayload(fixture), false, true);
  // Loading does not write the loaded state, so the drawing has to be saved to
  // be a state an undo can land back on.
  mechanism.save();
  // What the service writes on its own. Every edit here is one `runEdit` and
  // the *caller* saves, so a service that saved as well would put two entries
  // in the history for one typed number and leave Undo taking half of it back.
  const saves = vi.spyOn(history, 'save');
  const at = (id: string) => mechanism.joints.find((joint) => joint.id === id)!;
  const sealed = () => cylindersIn(mechanism.joints)[0];
  const places = () =>
    mechanism.joints.map((joint) => `${joint.id}:${joint.x.toFixed(6)},${joint.y.toFixed(6)}`);
  return { mechanism, grid, history, urls, saves, at, sealed, places };
}

describe('an edit that goes through is one entry', () => {
  it('puts the whole cylinder back on one undo, for every field', () => {
    for (const edit of [
      (grid: GridUtilsService, sealed: ReturnType<typeof cylindersIn>[0]) =>
        grid.setCylinderAngle(sealed, Math.PI / 3),
      (grid, sealed) => grid.setCylinderStart(sealed, 0.9),
      (grid, sealed) => grid.setBarrelLength(sealed, cylinderSizeOf(sealed).barrelLength * 0.9),
      (grid, sealed) => grid.setRodLength(sealed, cylinderSizeOf(sealed).rodLength * 1.4),
      (grid, sealed) =>
        grid.dragCylinderSeal(
          sealed,
          new Coord(sealed.seal.x + cylinderSizeOf(sealed).stroke * 0.2, 0)
        ),
    ] as ((grid: GridUtilsService, sealed: ReturnType<typeof cylindersIn>[0]) => boolean)[]) {
      const { mechanism, grid, history, urls, saves, sealed, places } = build(ramFixture());
      const before = places();
      const url = urls.generateUrlQuery();
      saves.mockClear();

      expect(edit(grid, sealed())).toBe(true);
      expect(saves).not.toHaveBeenCalled();
      mechanism.save();
      expect(saves).toHaveBeenCalledTimes(1);
      expect(places()).not.toEqual(before);

      history.undo();

      expect(places()).toEqual(before);
      expect(urls.generateUrlQuery()).toBe(url);
    }
  });

  it('leaves the part straight and both members the length the edit asked for', () => {
    const { grid, sealed, at } = build(ramFixture());
    const before = cylinderSizeOf(sealed());
    const wanted = before.barrelLength * 0.9;
    const seal = { x: sealed().seal.x, y: sealed().seal.y };
    const eye = { x: at('D').x, y: at('D').y };

    expect(grid.setBarrelLength(sealed(), wanted)).toBe(true);
    const after = cylinderSizeOf(sealed());

    expect(after.barrelLength).toBeCloseTo(wanted, 3);
    // Only the buried end moved: both joints and the seal are where they were,
    // so the travel changed under a cylinder that did not.
    expect(after.rodLength).toBeCloseTo(before.rodLength, 3);
    expect(sealed().seal.x).toBeCloseTo(seal.x, 3);
    expect(at('A').x).toBeCloseTo(0, 6);
    expect(at('D').x).toBeCloseTo(eye.x, 3);
    expect(after.stroke).toBeLessThan(before.stroke);
  });
});

/**
 * Put a Lock on one joint.
 *
 * The rebuild matters: the frozen set is cached against the cylinder revision,
 * so a flag written straight onto a joint is invisible until something bumps
 * it. In the app the lock toggle rebuilds; here it has to be said out loud.
 */
function lock(mechanism: MechanismService, ids: string[]): void {
  for (const id of ids) {
    (mechanism.joints.find((one) => one.id === id) as RevJoint).locked = true;
  }
  mechanism.updateMechanism(false);
}

/** Keep a member at the length it has, the way its padlock does. */
function fixLength(mechanism: MechanismService, id: string): void {
  (mechanism.links.find((link) => link.id === id) as RealLink).hold = 'length';
  mechanism.updateMechanism(false);
}

describe('an edit that is refused changes nothing', () => {
  it('leaves the joints and the URL exactly as they were', () => {
    // Both ends locked and both members keeping their length, which after S19
    // is the whole of what a refusal means: not "that number is too big" — the
    // part goes as far as it can toward one of those — but "none of it can be
    // had at all".
    const cases: ((
      grid: GridUtilsService,
      sealed: ReturnType<typeof cylindersIn>[0]
    ) => boolean)[] = [
      // There is nothing left to turn the part about.
      (grid, sealed) => grid.setCylinderAngle(sealed, 1),
      // No share of the travel but the one it is standing at.
      (grid, sealed) => grid.setCylinderStart(sealed, 0.9),
    ];
    for (const edit of cases) {
      const { mechanism, grid, urls, saves, sealed, places } = build(ramFixture());
      lock(mechanism, ['A', 'D']);
      for (const id of ['AB', 'CD']) fixLength(mechanism, id);
      const before = places();
      const url = urls.generateUrlQuery();
      const said = vi.spyOn(NotificationService.prototype, 'refusal').mockImplementation(() => {});
      saves.mockClear();

      expect(edit(grid, sealed())).toBe(false);

      expect(places()).toEqual(before);
      expect(urls.generateUrlQuery()).toBe(url);
      expect(saves).not.toHaveBeenCalled();
      // One refusal said, and no undo step minted for an edit that did nothing.
      expect(said).toHaveBeenCalledTimes(1);
      said.mockRestore();
    }
  });

  it('says nothing at all when a drag of the seal has nowhere to go', () => {
    // Both ends locked and both members keeping their length: the ladder has
    // no rung left, and a pointermove is not the place to say so.
    const { mechanism, grid, sealed, places } = build(ramFixture());
    lock(mechanism, ['A', 'D']);
    for (const id of ['AB', 'CD']) {
      (mechanism.links.find((link) => link.id === id) as RealLink).hold = 'length';
    }
    mechanism.updateMechanism(false);
    const before = places();

    expect(grid.dragCylinderSeal(sealed(), new Coord(4, 0))).toBe(false);
    expect(places()).toEqual(before);
  });
});

/**
 * A number that could not be fully honored (decision S19).
 *
 * The arithmetic has its own tests; these are the two promises only the service
 * can keep — that going as far as it could is still **one** entry in the
 * history, so Undo takes back the whole of it, and that the reader is told once
 * how far it got, as news rather than as a refusal.
 */
describe('an edit that lands short of the number typed', () => {
  it('is one entry, says so once, and says how far it got and what stopped it', () => {
    const { mechanism, grid, history, urls, saves, sealed, places } = build(ramFixture());
    // The rod keeps its length, so the barrel may only grow until its travel
    // equals the rod — the maintainer's own case, at this ram's size.
    fixLength(mechanism, 'CD');
    // The padlock is itself an edit and rides the URL, so it is the state the
    // undo below has to land back on.
    mechanism.save();
    const before = cylinderSizeOf(sealed());
    const wasHere = places();
    const url = urls.generateUrlQuery();
    const news = vi.spyOn(NotificationService.prototype, 'news').mockImplementation(() => {});
    const refused = vi.spyOn(NotificationService.prototype, 'refusal').mockImplementation(() => {});
    saves.mockClear();

    expect(grid.setBarrelLength(sealed(), before.barrelLength * 4)).toBe(true);

    const after = cylinderSizeOf(sealed());
    expect(after.rodLength).toBeCloseTo(before.rodLength, 3);
    expect(after.barrelLength).toBeGreaterThan(before.barrelLength);
    expect(after.barrelLength).toBeLessThan(before.barrelLength * 4);
    // News, not a refusal: the edit landed. A refusal is the app's word for
    // nothing having changed.
    expect(refused).not.toHaveBeenCalled();
    expect(news).toHaveBeenCalledTimes(1);
    const [code, text] = news.mock.calls[0];
    expect(code).toBe('cylinder.barrel-length-stopped-short');
    expect(text).toContain('stopped at');
    expect(text).toContain('fixed length');
    expect(text).toContain(mechanism.bodyLabel(sealed().rod));

    // One entry: the service saves nothing, the caller does, and one Undo puts
    // the whole thing back.
    expect(saves).not.toHaveBeenCalled();
    mechanism.save();
    history.undo();
    expect(places()).toEqual(wasHere);
    expect(urls.generateUrlQuery()).toBe(url);
    news.mockRestore();
    refused.mockRestore();
  });

  it('asking again for exactly the length it reached is an edit with nothing to stop', () => {
    const { mechanism, grid, sealed } = build(ramFixture());
    fixLength(mechanism, 'CD');
    const before = cylinderSizeOf(sealed());
    const news = vi.spyOn(NotificationService.prototype, 'news').mockImplementation(() => {});
    grid.setBarrelLength(sealed(), before.barrelLength * 4);
    const reached = cylinderSizeOf(sealed()).barrelLength;
    news.mockClear();

    expect(grid.setBarrelLength(sealed(), reached)).toBe(true);

    expect(cylinderSizeOf(sealed()).barrelLength).toBeCloseTo(reached, 6);
    expect(news).not.toHaveBeenCalled();
    news.mockRestore();
  });
});

/**
 * The priority ladder, read off the drawing rather than off the arithmetic
 * (decision S17).
 *
 * The pure functions have the whole table; these are the two promises only the
 * service can keep — that a grounded joint the ladder had to spend really goes
 * somewhere and is still grounded afterwards, and that a locked one never
 * moves however an edit arrives.
 */
describe('what gives, once the edit has been through a transaction', () => {
  it('moves a grounded joint rather than refuse a number nothing else can satisfy', () => {
    const { mechanism, grid, sealed, at } = build(ramFixture({ groundA: true, groundB: true }));
    const before = cylinderSizeOf(sealed());
    const wasA = { x: at('A').x, y: at('A').y };

    // Longer than the whole span, so neither sliding the seal nor changing the
    // barrel can absorb it: the ladder is down to its grounded joints.
    expect(grid.setRodLength(sealed(), before.span * 1.5)).toBe(true);

    const after = cylinderSizeOf(sealed());
    expect(after.rodLength).toBeCloseTo(before.span * 1.5, 3);
    expect(at('A').x).toBeCloseTo(wasA.x, 6);
    expect(at('D').x).toBeGreaterThan(before.span + 1);
    // Spent, not unbolted: it is still a grounded joint, in a new place.
    expect((at('D') as RealJoint).ground).toBe(true);
  });

  it('never moves a locked joint, whichever field or gesture the edit arrives through', () => {
    const edits: ((grid: GridUtilsService, sealed: ReturnType<typeof cylindersIn>[0]) => void)[] = [
      (grid, sealed) => grid.setCylinderAngle(sealed, Math.PI / 3),
      (grid, sealed) => grid.setCylinderStart(sealed, 0.95),
      (grid, sealed) => grid.setBarrelLength(sealed, cylinderSizeOf(sealed).barrelLength * 0.4),
      (grid, sealed) => grid.setRodLength(sealed, cylinderSizeOf(sealed).rodLength * 0.3),
      (grid, sealed) => grid.dragCylinderSeal(sealed, new Coord(sealed.seal.x + 3, 0)),
    ];
    for (const held of ['A', 'D']) {
      for (const edit of edits) {
        const { mechanism, grid, sealed, at } = build(ramFixture());
        lock(mechanism, [held]);
        const was = { x: at(held).x, y: at(held).y };

        edit(grid, sealed());

        expect(at(held).x).toBeCloseTo(was.x, 6);
        expect(at(held).y).toBeCloseTo(was.y, 6);
      }
    }
  });
});

describe('a member keeping its length', () => {
  it('makes the other one take a mount dragged past the stop', () => {
    const { mechanism, grid, sealed, at } = build(ramFixture());
    const barrel = mechanism.links.find((link) => link.id === 'AB') as RealLink;
    barrel.hold = 'length';
    mechanism.updateMechanism(false);

    const before = cylinderSizeOf(sealed());
    const open = before.span + (1 - before.start) * before.stroke;
    const past = before.stroke * 0.5;
    grid.dragJoint(at('D') as RealJoint, new Coord(open + past, 0));

    const after = cylinderSizeOf(sealed());
    expect(after.barrelLength).toBeCloseTo(before.barrelLength, 3);
    expect(after.rodLength).toBeCloseTo(before.rodLength + past, 3);
    expect(after.span).toBeCloseTo(open + past, 3);
  });

  it('stops the mount at the stop when both members keep theirs', () => {
    const { mechanism, grid, sealed, at } = build(ramFixture());
    for (const id of ['AB', 'CD']) {
      (mechanism.links.find((link) => link.id === id) as RealLink).hold = 'length';
    }
    mechanism.updateMechanism(false);

    const before = cylinderSizeOf(sealed());
    const open = before.span + (1 - before.start) * before.stroke;
    grid.dragJoint(at('D') as RealJoint, new Coord(open + before.stroke, 0));

    const after = cylinderSizeOf(sealed());
    expect(after.barrelLength).toBeCloseTo(before.barrelLength, 3);
    expect(after.rodLength).toBeCloseTo(before.rodLength, 3);
    expect(after.span).toBeCloseTo(open, 3);
    expect(after.start).toBeCloseTo(1, 3);
  });
});

/**
 * A member's mass is the reader's; its inertia and its center are the shape's
 * (decision S14).
 *
 * The decode clears both custom flags on every cylinder member, because every
 * URL in circulation carries them frozen and nothing in the format could tell
 * one of those from a value somebody typed. That is only honest while no
 * surface offers either number — so this holds the two halves against each
 * other: the doors stay shut, and what the reader *did* choose survives a
 * round trip and an undo.
 */
describe('a cylinder member takes a mass and nothing else', () => {
  it('says so of both members, and of neither a plain bar nor a body carrying one', () => {
    const { mechanism, sealed } = build({
      ...ramFixture(),
      joints: [...ramFixture().joints, { id: 'E', x: 14, y: 0 }],
      links: [...ramFixture().links, { joints: 'DE' }],
    });
    expect(mechanism.memberInertiaIsDerived(sealed().barrel)).toBe(true);
    expect(mechanism.memberInertiaIsDerived(sealed().rod)).toBe(true);
    const bar = mechanism.links.find((link) => link.id === 'DE')!;
    expect(mechanism.memberInertiaIsDerived(bar)).toBe(false);
    expect(mechanism.memberInertiaIsDerived(undefined)).toBe(false);
  });

  it('keeps the mass through a round trip and hands the other two back to the shape', () => {
    const { mechanism, urls, sealed } = build(ramFixture());
    const rod = sealed().rod;
    rod.mass = 7;
    // What an old URL carries: flags frozen on values nobody picked.
    rod.moiIsCustom = true;
    rod.comIsCustom = true;
    rod.massMoI = 123;

    const url = urls.generateUrlQuery();
    TestBed.inject(UrlProcessorService).updateFromURL(url, false, true);

    const back = cylindersIn(mechanism.joints)[0].rod;
    expect(back.mass).toBeCloseTo(7, 6);
    expect(back.moiIsCustom).toBe(false);
    expect(back.comIsCustom).toBe(false);
  });

  it('and through an undo and a redo, which replay the same URL', () => {
    const { mechanism, grid, history, sealed } = build(ramFixture());
    sealed().rod.mass = 4;
    mechanism.save();
    expect(grid.setRodLength(sealed(), cylinderSizeOf(sealed()).rodLength * 1.3)).toBe(true);
    mechanism.save();

    history.undo();
    const undone = cylindersIn(mechanism.joints)[0].rod;
    expect(undone.mass).toBeCloseTo(4, 6);
    expect(undone.moiIsCustom).toBe(false);
    expect(undone.comIsCustom).toBe(false);

    history.redo();
    const redone = cylindersIn(mechanism.joints)[0].rod;
    expect(redone.mass).toBeCloseTo(4, 6);
    expect(redone.moiIsCustom).toBe(false);
    expect(redone.comIsCustom).toBe(false);
  });
});
