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
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';
import { cylinderSizeOf, cylindersIn } from '../../app/model/cylinder';

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

describe('an edit that is refused changes nothing', () => {
  it('leaves the joints and the URL exactly as they were', () => {
    const cases: ((
      grid: GridUtilsService,
      sealed: ReturnType<typeof cylindersIn>[0]
    ) => boolean)[] = [
      // Both joints grounded: the frame settles the direction.
      (grid, sealed) => grid.setCylinderAngle(sealed, 1),
      // A barrel with no travel left in it.
      (grid, sealed) => grid.setBarrelLength(sealed, 1e-3),
      // A rod shorter than the travel.
      (grid, sealed) => grid.setRodLength(sealed, 1e-3),
    ];
    for (const edit of cases) {
      const { grid, urls, saves, sealed, places } = build(
        ramFixture({ groundA: true, groundB: true })
      );
      const before = places();
      const url = urls.generateUrlQuery();
      saves.mockClear();

      expect(edit(grid, sealed())).toBe(false);

      expect(places()).toEqual(before);
      expect(urls.generateUrlQuery()).toBe(url);
      expect(saves).not.toHaveBeenCalled();
    }
  });

  it('says nothing at all when a drag of the seal has nowhere to go', () => {
    const { grid, sealed, places } = build(ramFixture({ groundA: true, groundB: true }));
    const before = places();

    expect(grid.dragCylinderSeal(sealed(), new Coord(4, 0))).toBe(false);
    expect(places()).toEqual(before);
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
