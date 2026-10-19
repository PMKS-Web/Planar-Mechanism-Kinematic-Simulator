import '../model/joint';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { Injector } from '@angular/core';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { PrisJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { ActiveObjService } from './active-obj.service';
import { ColorService } from './color.service';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';
import { SvgGridService } from './svg-grid.service';
import { DragStateService } from './drag-state.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { silentNotifications } from '../../test-utils/notification-stub';

function createHarness() {
  const harness = createMechanismHarness();
  return { ...harness, grid: harness.injector.get(GridUtilsService) };
}

function wire(id: string, joints: RevJoint[]): RealLink {
  const link = new RealLink(id, joints);
  joints.forEach((joint) => {
    joint.links.push(link);
    joints.filter((other) => other !== joint).forEach((other) => joint.connectedJoints.push(other));
  });
  return link;
}

/** A grounded four-bar: A and D pinned, B-C the coupler that gets dragged. */
function createFourBar() {
  const harness = createHarness();
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 2);
  const c = new RevJoint('C', 4, 3);
  const d = new RevJoint('D', 5, 0, false, true);
  const ab = wire('AB', [a, b]);
  const bc = wire('BC', [b, c]);
  const cd = wire('CD', [c, d]);
  harness.service.joints = [a, b, c, d];
  harness.service.links = [ab, bc, cd];
  harness.service.updateMechanism();
  return { ...harness, a, b, c, d, ab, bc, cd };
}

describe('GridUtilsService.dragLink', () => {
  it('translates every joint of the dragged link by the same offset', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([scene.b.x, scene.b.y]).toEqual([1.5, 1.5]);
    expect([scene.c.x, scene.c.y]).toEqual([5.5, 2.5]);
  });

  it('leaves the joints of neighboring links where they were', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([scene.a.x, scene.a.y]).toEqual([0, 0]);
    expect([scene.d.x, scene.d.y]).toEqual([5, 0]);
  });

  // A translation is rigid, so the body's own center of mass moves with it. A
  // link whose CoM the user placed by hand must not have it silently re-derived.
  it('carries a hand-placed center of mass along instead of recomputing it', () => {
    const scene = createFourBar();
    scene.bc.CoM = new Coord(1, 2.9);
    // Placing it by hand is exactly what the custom flag records.
    scene.bc.comIsCustom = true;

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([scene.bc.CoM.x, scene.bc.CoM.y]).toEqual([2.5, 2.4]);
  });

  it('recomputes a neighboring link, which was deformed rather than moved', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect(scene.ab.CoM.x).toBeCloseTo((scene.a.x + scene.b.x) / 2, 12);
    expect(scene.ab.CoM.y).toBeCloseTo((scene.a.y + scene.b.y) / 2, 12);
    expect(scene.ab.length).toBeCloseTo(Math.hypot(scene.b.x, scene.b.y), 12);
  });

  it('moves a force on the dragged link with the body', () => {
    const scene = createFourBar();
    const force = new Force('F1', scene.bc, new Coord(2, 2.5), new Coord(2, 3.5), false, true, 10);
    scene.bc.forces.push(force);
    scene.service.forces.push(force);

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([force.startCoord.x, force.startCoord.y]).toEqual([3.5, 2]);
    expect([force.endCoord.x, force.endCoord.y]).toEqual([3.5, 3]);
  });

  // A load is fixed to the body it acts on. Leaving it at its old world
  // position while the link deforms under it would silently move it to a
  // different point of the link, and the drag saves that as the real load.
  it('carries a force on a neighboring link with the link it is attached to', () => {
    const scene = createFourBar();
    // Halfway along AB, which runs from A(0,0) to B(0,2).
    const force = new Force('F1', scene.ab, new Coord(0, 1), new Coord(1, 1), false, true, 10);
    scene.ab.forces.push(force);
    scene.service.forces.push(force);

    scene.grid.dragLink(scene.bc, 0, 2);

    // B moved to (0,4), so the midpoint of AB is now (0,2).
    expect(force.startCoord.x).toBeCloseTo(0, 6);
    expect(force.startCoord.y).toBeCloseTo(2, 6);
  });

  it('leaves a force alone on a link no joint of which moved', () => {
    const scene = createFourBar();
    const e = new RevJoint('E', 20, 20);
    const f = new RevJoint('F', 22, 20);
    const idle = wire('EF', [e, f]);
    scene.service.joints.push(e, f);
    scene.service.links.push(idle);
    const force = new Force('F2', idle, new Coord(21, 20), new Coord(21, 21), false, true, 10);
    idle.forces.push(force);
    scene.service.forces.push(force);

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([force.startCoord.x, force.startCoord.y]).toEqual([21, 20]);
  });

  it('leaves the mechanism solvable after the drag', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 0.3, 0.2);

    expect(scene.service.mechanisms[0].isMechanismValid()).toBe(true);
    expect(scene.service.mechanisms[0].dof).toBe(1);
  });

  it('does nothing at all for a zero-length drag', () => {
    const scene = createFourBar();
    const rebuild = vi.spyOn(scene.service, 'updateMechanism');

    scene.grid.dragLink(scene.bc, 0, 0);

    expect([scene.b.x, scene.b.y]).toEqual([0, 2]);
    expect(rebuild).not.toHaveBeenCalled();
  });

  // Drags are continuous; the undo entry belongs to the release, not to each
  // pointer-move along the way.
  it('rebuilds without saving, once per call', () => {
    const scene = createFourBar();
    const rebuild = vi.spyOn(scene.service, 'updateMechanism');

    scene.grid.dragLink(scene.bc, 0.3, 0.2);
    scene.grid.dragLink(scene.bc, 0.3, 0.2);

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild).toHaveBeenCalledWith(false);
    expect(scene.saveCount()).toBe(0);
  });

  it('carries a slider that is a joint of the dragged link, like any other joint', () => {
    // A slider used to be an invisible prismatic joint beside a pin, joined by
    // a zero-length block, and a drag had to write the block's other joint back
    // onto the same point to keep the pair coincident. A slider is a member
    // joint now (Stage 1 of `docs/joint-type-and-cylinder-plan.md`), so it
    // simply travels with the body it is on.
    const scene = createHarness();
    const slider = new PrisJoint('S', 0, 0, false, true);
    const far = new RevJoint('F', 2, 0);
    const bar = new RealLink('FS', [slider, far]);
    [slider, far].forEach((joint) => joint.links.push(bar));
    scene.service.joints.push(slider, far);
    scene.service.links.push(bar);

    scene.grid.dragLink(bar, 1.5, -0.5);

    expect([slider.x, slider.y]).toEqual([1.5, -0.5]);
    expect([far.x, far.y]).toEqual([3.5, -0.5]);
  });
});

describe('GridUtilsService.dragJoint on a slider', () => {
  it('rebuilds the rider it carries, which a pin used to do for it', () => {
    // `dragJoint` switched on `RevJoint`, because a slider was dragged by the
    // coincident pin that held the riders. The slider holds them now, so a
    // switch would leave a dragged slider's bar with a stale outline, center of
    // mass and length.
    const scene = createHarness();
    const slider = new PrisJoint('S', 0, 0, false, true);
    const far = new RevJoint('F', 2, 0);
    const bar = new RealLink('FS', [slider, far]);
    [slider, far].forEach((joint) => joint.links.push(bar));
    scene.service.joints.push(slider, far);
    scene.service.links.push(bar);

    scene.grid.dragJoint(slider, new Coord(0, 3));

    expect([slider.x, slider.y]).toEqual([0, 3]);
    expect(bar.length).toBeCloseTo(Math.hypot(2, 3), 9);
    expect(bar.CoM.x).toBeCloseTo(1, 9);
    expect(bar.CoM.y).toBeCloseTo(1.5, 9);
  });
});

/**
 * What a link drag becomes when exactly one of the joints it would carry is
 * locked: the body swings about that joint. The rigid-body promises are the
 * same ones dragLink makes — same shape, same passengers — plus the one the
 * pivot adds: the held joint does not move at all.
 */
describe('GridUtilsService.rotateLink', () => {
  const QUARTER = Math.PI / 2;

  it('holds the pivot exactly still and swings the other joint about it', () => {
    const scene = createFourBar();

    scene.grid.rotateLink(scene.bc, new Coord(scene.b.x, scene.b.y), QUARTER);

    expect([scene.b.x, scene.b.y]).toEqual([0, 2]);
    // C was at (4,3), which is (4,1) from B; a quarter turn puts it at (-1,4) from B.
    expect(scene.c.x).toBeCloseTo(-1, 6);
    expect(scene.c.y).toBeCloseTo(6, 6);
  });

  it('preserves the body: lengths survive the turn', () => {
    const scene = createFourBar();
    const before = Math.hypot(scene.c.x - scene.b.x, scene.c.y - scene.b.y);

    scene.grid.rotateLink(scene.bc, new Coord(scene.b.x, scene.b.y), 0.37);

    expect(Math.hypot(scene.c.x - scene.b.x, scene.c.y - scene.b.y)).toBeCloseTo(before, 6);
  });

  it('turns a force on the body with the body, direction included', () => {
    const scene = createFourBar();
    const force = new Force('F1', scene.bc, new Coord(2, 2.5), new Coord(3, 2.5), false, true, 10);
    scene.bc.forces.push(force);
    scene.service.forces.push(force);

    scene.grid.rotateLink(scene.bc, new Coord(scene.b.x, scene.b.y), QUARTER);

    // (2,2.5) is (2,0.5) from B(0,2); a quarter turn lands it at (-0.5,2) from B.
    expect(force.startCoord.x).toBeCloseTo(-0.5, 6);
    expect(force.startCoord.y).toBeCloseTo(4, 6);
    // The arrow pointed +x along the body; after a quarter turn it points +y.
    expect(force.endCoord.x - force.startCoord.x).toBeCloseTo(0, 6);
    expect(force.endCoord.y - force.startCoord.y).toBeCloseTo(1, 6);
  });

  it('deforms the neighbors rather than carrying them', () => {
    const scene = createFourBar();

    scene.grid.rotateLink(scene.bc, new Coord(scene.b.x, scene.b.y), QUARTER);

    expect([scene.a.x, scene.a.y]).toEqual([0, 0]);
    expect([scene.d.x, scene.d.y]).toEqual([5, 0]);
    expect(scene.cd.length).toBeCloseTo(Math.hypot(scene.c.x - 5, scene.c.y), 6);
  });

  it('does nothing at all for a zero turn', () => {
    const scene = createFourBar();
    const rebuild = vi.spyOn(scene.service, 'updateMechanism');

    scene.grid.rotateLink(scene.bc, new Coord(0, 2), 0);

    expect([scene.c.x, scene.c.y]).toEqual([4, 3]);
    expect(rebuild).not.toHaveBeenCalled();
  });
});
