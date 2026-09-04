import { TestBed } from '@angular/core/testing';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { MODEL_SCALE } from '../model/render-scale';
import { getDistance } from '../model/utils';
import { wireGraph } from '../../test-utils/mechanism-harness';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { MultiEditService } from './multi-edit.service';
import { SaveHistoryService } from './save-history.service';

const S = MODEL_SCALE;

function refs(...entries: (`joint:${string}` | `link:${string}` | `force:${string}`)[]) {
  return entries.map((entry) => {
    const [kind, id] = entry.split(':') as ['joint' | 'link' | 'force', string];
    return { kind, id };
  });
}

describe('MultiEditService', () => {
  let mechanism: MechanismService;
  let service: MultiEditService;
  let grid: GridUtilsService;
  let history: SaveHistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    service = TestBed.inject(MultiEditService);
    grid = TestBed.inject(GridUtilsService);
    history = TestBed.inject(SaveHistoryService);
  });

  /**
   * How many entries the history really gained.
   *
   * Not a spy on `MechanismService.save`: that method is the one holding the
   * saves back during a batch, so replacing it counts the calls it exists to
   * swallow. What a reader feels is presses of Undo, which is this.
   */
  function historyWrites() {
    return vi.spyOn(history, 'save').mockImplementation(() => {});
  }

  function twoBars() {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2 * S, 0);
    const c = new RevJoint('C', 4 * S, S);
    const d = new RevJoint('D', 7 * S, S);
    const ab = new RealLink('AB', [a, b]);
    const cd = new RealLink('CD', [c, d]);
    mechanism.joints = [a, b, c, d];
    mechanism.links = [ab, cd];
    wireGraph(mechanism);
    return { a, b, c, d, ab, cd };
  }

  it('assigns the same absolute X or Y to every selected joint with one rebuild and save', () => {
    const { a, c } = twoBars();
    const update = vi.spyOn(mechanism, 'updateMechanism');
    const save = vi.spyOn(mechanism, 'save').mockImplementation(() => {});

    expect(service.assignJointCoordinate(refs('joint:A', 'joint:C'), 'x', 9 * S).ok).toBe(true);

    expect(a.x).toBe(9 * S);
    expect(c.x).toBe(9 * S);
    expect(update).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('uses each link own established anchor rule for bulk length and angle', () => {
    const { a, b, c, d, ab, cd } = twoBars();
    d.ground = true;
    const originalA = { x: a.x, y: a.y };
    const originalD = { x: d.x, y: d.y };

    expect(service.assignLinkGeometry(refs('link:AB', 'link:CD'), 'length', 5 * S).ok).toBe(true);

    expect({ x: a.x, y: a.y }).toEqual(originalA);
    expect({ x: d.x, y: d.y }).toEqual(originalD);
    expect(getDistance(a, b)).toBeCloseTo(5 * S);
    expect(getDistance(c, d)).toBeCloseTo(5 * S);
    expect(ab.length).toBeCloseTo(5 * S);
    expect(cd.length).toBeCloseTo(5 * S);

    expect(service.assignLinkGeometry(refs('link:AB', 'link:CD'), 'angle', Math.PI / 2).ok).toBe(
      true
    );
    expect(Math.atan2(b.y - a.y, b.x - a.x)).toBeCloseTo(Math.PI / 2);
    expect(Math.atan2(d.y - c.y, d.x - c.x)).toBeCloseTo(Math.PI / 2);
  });

  it('preflights all targets and refuses atomically when a moved joint is frozen', () => {
    const { a, b, c } = twoBars();
    b.locked = true;
    mechanism.updateMechanism(false);
    const before = mechanism.joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }));
    const drag = vi.spyOn(grid, 'dragJoint');

    const result = service.assignJointCoordinate(refs('joint:A', 'joint:B', 'joint:C'), 'y', 8 * S);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.refusal.code).toBe('selection.locked');
    expect(mechanism.joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }))).toEqual(
      before
    );
    expect(drag).not.toHaveBeenCalled();
  });

  it('refuses incompatible shared-endpoint placements before changing either link', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2 * S, 0);
    const c = new RevJoint('C', 2 * S, 2 * S);
    const ab = new RealLink('AB', [a, b]);
    const cb = new RealLink('CB', [c, b]);
    mechanism.joints = [a, b, c];
    mechanism.links = [ab, cb];
    wireGraph(mechanism);
    const before = { x: b.x, y: b.y };

    const result = service.assignLinkGeometry(refs('link:AB', 'link:CB'), 'angle', Math.PI / 4);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.refusal.code).toBe('selection.conflicting-geometry');
    expect({ x: b.x, y: b.y }).toEqual(before);
  });

  it('applies a common safe mass and lock state atomically without renaming', () => {
    const { ab, cd } = twoBars();
    const update = vi.spyOn(mechanism, 'updateMechanism');

    expect(service.assignLinkMass(refs('link:AB', 'link:CD'), 3.5).ok).toBe(true);
    expect(ab.mass).toBe(3.5);
    expect(cd.mass).toBe(3.5);
    expect(update).toHaveBeenCalledTimes(1);

    update.mockClear();
    expect(service.setLocked(refs('link:AB', 'link:CD'), true).ok).toBe(true);
    expect(ab.joints.every((joint) => (joint as RevJoint).locked)).toBe(true);
    expect(cd.joints.every((joint) => (joint as RevJoint).locked)).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('grounds a whole selection in one edit, and saves once for it', () => {
    const { a, c } = twoBars();
    const save = historyWrites();

    expect(service.setGrounded(refs('joint:A', 'joint:C'), true).ok).toBe(true);

    expect(a.ground).toBe(true);
    expect(c.ground).toBe(true);
    // One press of the switch, one entry in the history. Grounding eight joints
    // used to cost eight presses of Undo to take back.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('and un-grounds one, leaving a joint that was already where it was asked alone', () => {
    const { a, c } = twoBars();
    a.ground = true;

    expect(service.setGrounded(refs('joint:A', 'joint:C'), false).ok).toBe(true);
    expect(a.ground).toBe(false);
    expect(c.ground).toBe(false);

    // Assigned, not toggled: asking again for what they already are is not the
    // other state, and a mixed group has no one state to flip to.
    const save = historyWrites();
    expect(service.setGrounded(refs('joint:A', 'joint:C'), false).ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('drops an input from a joint it grounds, as the one-joint switch does', () => {
    const { a } = twoBars();
    a.input = true;

    expect(service.setGrounded(refs('joint:A'), true).ok).toBe(true);
    expect(a.ground).toBe(true);
    expect(a.input).toBe(false);
  });

  it('refuses the whole weld when one joint of the selection cannot take it', () => {
    const { a, b, c } = twoBars();
    const before = mechanism.links.map((link) => link.id);

    // A is on one link, so there is nothing at it to fuse -- and a group weld
    // that did the rest anyway would leave the reader unpicking it.
    const result = service.setWelded(refs('joint:A', 'joint:B', 'joint:C'), true);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.refusal.code).toBe('selection.weld');
    expect(result.ok ? '' : result.refusal.message).toContain('A');
    expect(mechanism.links.map((link) => link.id)).toEqual(before);
    expect([a, b, c].some((joint) => joint.isWelded)).toBe(false);
  });

  it('holds one value on every selected bar, and lets go of the other', () => {
    const { ab, cd } = twoBars();
    const save = historyWrites();

    expect(service.setHold(refs('link:AB', 'link:CD'), 'length').ok).toBe(true);
    expect([ab.hold, cd.hold]).toEqual(['length', 'length']);
    expect(save).toHaveBeenCalledTimes(1);

    // A bar holds its length or its angle, never both.
    expect(service.setHold(refs('link:AB', 'link:CD'), 'angle').ok).toBe(true);
    expect([ab.hold, cd.hold]).toEqual(['angle', 'angle']);

    expect(service.setHold(refs('link:AB', 'link:CD'), undefined).ok).toBe(true);
    expect([ab.hold, cd.hold]).toEqual([undefined, undefined]);
  });

  it('refuses a held value on anything but an ordinary two-joint bar', () => {
    const { a, b, c } = twoBars();
    const triangle = new RealLink('ABC', [a, b, c]);
    mechanism.links = [triangle];
    wireGraph(mechanism);

    const result = service.setHold(refs('link:ABC'), 'length');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.refusal.code).toBe('selection.binary-links-only');
    expect(triangle.hold).toBeUndefined();
  });

  /** Two forces, one on each bar, as `createForce` would leave them. */
  function twoForces() {
    const bars = twoBars();
    const make = (id: string, link: typeof bars.ab, at: Coord) => {
      const force = new Force(id, link, at, new Coord(at.x + S, at.y + 3 * S));
      link.forces.push(force);
      return force;
    };
    const first = make('F1', bars.ab, new Coord(S, 0));
    const second = make('F2', bars.cd, new Coord(5 * S, S));
    mechanism.forces = [first, second];
    return { ...bars, first, second };
  }

  it('gives every selected force one magnitude, in one entry', () => {
    const { first, second } = twoForces();
    const save = historyWrites();

    expect(service.setForceValue(refs('force:F1', 'force:F2'), 'magnitude', 4).ok).toBe(true);
    expect([first.mag, second.mag]).toEqual([4, 4]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('and one direction, without moving where either one acts', () => {
    const { first, second } = twoForces();
    const anchors = [first, second].map((force) => ({ ...force.startCoord }));

    expect(service.setForceValue(refs('force:F1', 'force:F2'), 'angle', Math.PI / 6).ok).toBe(true);
    expect(first.angleRad).toBeCloseTo(Math.PI / 6, 6);
    expect(second.angleRad).toBeCloseTo(Math.PI / 6, 6);
    // A force is anchored to the body it acts on, and pointing it somewhere
    // else does not move it along that body.
    expect([first, second].map((force) => ({ ...force.startCoord }))).toEqual(anchors);
  });

  it('switches the frame every selected force is read in', () => {
    const { first, second } = twoForces();
    first.setLocal(true);

    // Assigned, not toggled: a set half in each frame has no state to flip to.
    expect(service.setForceFrame(refs('force:F1', 'force:F2'), true).ok).toBe(true);
    expect([first.local, second.local]).toEqual([true, true]);

    const save = historyWrites();
    expect(service.setForceFrame(refs('force:F1', 'force:F2'), true).ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a force value on a selection that is not all forces', () => {
    const { ab } = twoForces();
    const result = service.setForceValue(refs('force:F1', 'link:AB'), 'magnitude', 2);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.refusal.code).toBe('selection.forces-only');
    void ab;
  });

  it('refuses a negative magnitude rather than storing its absolute value', () => {
    const { first } = twoForces();
    const was = first.mag;

    const result = service.setForceValue(refs('force:F1', 'force:F2'), 'magnitude', -3);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.refusal.short).toBe('not a magnitude');
    expect(first.mag).toBe(was);
  });
});
