// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { JointTypeService } from '../../app/services/joint-type.service';
import { fixturePayload } from '../../test-utils/verification/fixture-payload';
import { cylinderOnASlotFixture } from '../../test-utils/verification/frozen-cylinder-fixtures';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { ColorService } from '../../app/services/color.service';

/**
 * A drawing that ran when it was saved has to run when it is reopened.
 *
 * The maintainer's cylinder-on-a-slot did not. Its barrel end `D` rides a slot
 * cut in a grounded ternary (decision S22), and the URL stores every coordinate
 * on a grain of about a thousandth of a user unit — so `D` came back 7.6e-2
 * model units off its own slot line, under half a grain. The coupled solver's
 * admission gate asks the drawn pose to satisfy its constraints to one part in
 * a million of the mechanism's size, which here is 5.1e-4: four hundred times
 * tighter than the format it was judging. It refused, and the reader got
 * "Nothing moves when the input turns" about a machine that was running an hour
 * earlier.
 *
 * **It is a class, not an instance**, and worse than a reload: undo and redo
 * replay URLs, so every undo on such a drawing landed on the refusal.
 *
 * So each drawing below is put through the codec and has to come back *running*
 * — the same number of samples, and a start pose within the grain of the one it
 * went in with — and then through an undo/redo replay of the same string.
 */

const S = MODEL_SCALE;

/**
 * How far a joint may move across the codec and still be where it was drawn.
 *
 * Half a grain of rounding, plus whatever `settleInitialPose` then takes off to
 * put the pose exactly on its constraints. The second part is not bounded by
 * the first: a rounding at a slider is *levered* by whatever hangs off it, so
 * the free end of scene (b)'s rail — pinned at one end and swinging — moves
 * about twice as far as the joint whose rounding caused it (0.47 model units
 * against a 0.2 grain, measured).
 *
 * Four grains, then, which is 0.004 of a user unit: still twenty-odd times
 * smaller than the radius a joint is drawn at, so a reader could not see any of
 * this. What the cycle does is checked exactly, sample count and all; this is
 * only asking that the drawing came back the drawing it went in as.
 */
const URL_PRECISION = 4 * 1e-3 * S;

interface Solved {
  samples: number;
  valid: boolean;
  failure: string;
  startPose: Map<string, [number, number]>;
}

function readSolved(service: MechanismService): Solved {
  const mechanism = service.mechanisms[0];
  return {
    samples: mechanism?.joints.length ?? 0,
    valid: mechanism?.isMechanismValid() ?? false,
    failure: mechanism?.failure ?? 'none',
    startPose: new Map(service.joints.map((joint) => [joint.id, [joint.x, joint.y]])),
  };
}

function openFresh(payload: string): MechanismService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const service = TestBed.inject(MechanismService);
  TestBed.inject(UrlProcessorService).updateFromURL(payload, false, true);
  return service;
}

/** Every joint of `after` within `URL_PRECISION` of where `before` had it. */
function posesAgree(before: Solved, after: Solved): { worst: number; at: string } {
  let worst = 0;
  let at = '';
  before.startPose.forEach((was, id) => {
    const now = after.startPose.get(id);
    if (!now) {
      worst = Infinity;
      at = `${id} missing`;
      return;
    }
    const moved = Math.hypot(now[0] - was[0], now[1] - was[1]);
    if (moved > worst) {
      worst = moved;
      at = id;
    }
  });
  return { worst, at };
}

/**
 * S22's two driven scenes, built the way the canvas builds them.
 *
 * A cylinder anchored at its barrel end, a rail off to one side, and the rod
 * end dropped onto the rail to ride the slot it cuts there — `cutSlotOn` is the
 * call the drop gesture commits through. `railEnds` grounds one end of the rail
 * instead of both, and `prismatic` takes the end joint through the Joint Type
 * choice, which is scene (b).
 *
 * The rail slants across the ram's axis for the reason `e2e/cylinder-mount-slot.mjs`
 * gives: a rail square to the axis puts the machine on a dead centre.
 */
function slotScene(options: { railEnds?: number; prismatic?: boolean; offGrid?: boolean }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  // `RealLink` reaches for the color cursor as a static singleton, and a spec
  // that builds through the service rather than through a URL is the one path
  // that does not already have one.
  if (!ColorService.instance) new ColorService();
  const service = TestBed.inject(MechanismService);
  const active = TestBed.inject(ActiveObjService);
  const grid = TestBed.inject(GridUtilsService);
  void grid;

  service.createCylinderFrom(new Coord(-700, 300), new Coord(-100, 300));
  const ram = service.sealedStructures()[0];
  active.updateSelectedObj(ram.mountA);
  service.toggleGround();

  const rail = service.addBar(new Coord(100, -100), new Coord(600, 400)) as RealLink;
  rail.joints.slice(0, options.railEnds ?? 2).forEach((joint) => {
    active.updateSelectedObj(joint as RealJoint);
    service.toggleGround();
  });

  // The drop: the rod end onto the middle of the rail.
  const [railA, railB] = rail.joints;
  const middle = { x: (railA.x + railB.x) / 2, y: (railA.y + railB.y) / 2 };
  const mountB = service.sealedStructures()[0].mountB as RealJoint;
  const cut = service.cutSlotOn(mountB, {
    carrier: rail,
    a: railA,
    b: railB,
    // Off the grid the URL stores on, so the codec has to round it — which is
    // the whole point of the exercise. A third of a grain, so the rounding is
    // real and the joint is still on the rail to well under one.
    x: middle.x + (options.offGrid ? 0.067 : 0),
    y: middle.y + (options.offGrid ? -0.067 : 0),
  });
  if (!cut) throw new Error('the rod end would not take a slot');

  if (options.prismatic) {
    TestBed.inject(JointTypeService).set(
      service.joints.find((joint) => joint.id === mountB.id) as RealJoint,
      'prismatic'
    );
  }

  active.updateSelectedObj(service.sealedStructures()[0].seal);
  service.adjustInput();
  service.updateMechanism(true);
  return service;
}

describe('a drawing that ran when it was saved runs when it is reopened', () => {
  it('the maintainer’s cylinder riding a slot, straight from its own URL', () => {
    const payload = fixturePayload(cylinderOnASlotFixture());
    const service = openFresh(payload);
    const solved = readSolved(service);
    expect(solved.failure).toBe('none');
    expect(solved.valid).toBe(true);
    expect(solved.samples).toBeGreaterThan(100);

    // The joint whose rounding caused it, back on its line after the settle.
    const d = service.joints.find((joint) => joint.id === 'D') as PrisJoint;
    const a = d.slotJointA!;
    const b = d.slotJointB!;
    const along = Math.hypot(b.x - a.x, b.y - a.y);
    const off = Math.abs((d.x - a.x) * (b.y - a.y) - (d.y - a.y) * (b.x - a.x)) / along;
    expect(off).toBeLessThan(1e-3);
  });

  const scenes: [string, Parameters<typeof slotScene>[0]][] = [
    ['scene (a): a fixed rail, the end joint riding its slot', { offGrid: true }],
    [
      'scene (b): the rail pinned at one end, the end joint Prismatic',
      { railEnds: 1, prismatic: true, offGrid: true },
    ],
  ];

  scenes.forEach(([name, options]) => {
    it(`${name} — survives the codec`, () => {
      const built = slotScene(options);
      const before = readSolved(built);
      expect(before.valid, `${name} has to run before it can be asked to run again`).toBe(true);
      expect(before.samples).toBeGreaterThan(10);

      const url = TestBed.inject(UrlGenerationService).generateUrlQuery();
      const after = readSolved(openFresh(url));

      expect(after.failure, name).toBe('none');
      expect(after.valid, name).toBe(true);
      expect(after.samples, `${name}: same cycle`).toBe(before.samples);
      const agree = posesAgree(before, after);
      expect(agree.worst, `${name}: joint ${agree.at} moved`).toBeLessThan(URL_PRECISION);
    });

    it(`${name} — survives an undo/redo replay`, () => {
      const built = slotScene(options);
      const before = readSolved(built);
      // What undo and redo actually do: hand the decoder a stored string and
      // rebuild from it. A drawing that will not solve on that path has no
      // cycle, no anchor and no ghost the moment anybody presses undo.
      const url = TestBed.inject(UrlGenerationService).generateUrlQuery();
      const replayed = openFresh(url);
      const second = TestBed.inject(UrlGenerationService).generateUrlQuery();
      const twice = readSolved(openFresh(second));

      expect(twice.valid, `${name}: still runs after two replays`).toBe(true);
      expect(twice.samples).toBe(before.samples);
      // And the second replay is the fixed point: nothing drifts further.
      const drift = posesAgree(readSolved(replayed), twice);
      expect(drift.worst, `${name}: joint ${drift.at} drifted on the second pass`).toBeLessThan(
        URL_PRECISION
      );
    });
  });

  it('the maintainer’s drawing survives an undo/redo replay too', () => {
    const payload = fixturePayload(cylinderOnASlotFixture());
    const once = readSolved(openFresh(payload));
    const replayUrl = TestBed.inject(UrlGenerationService).generateUrlQuery();
    const twice = readSolved(openFresh(replayUrl));
    expect(twice.valid).toBe(true);
    expect(twice.samples).toBe(once.samples);
    const drift = posesAgree(once, twice);
    expect(drift.worst, `joint ${drift.at} drifted`).toBeLessThan(URL_PRECISION);
  });
});
