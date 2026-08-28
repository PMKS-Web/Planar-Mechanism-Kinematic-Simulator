import { TestBed } from '@angular/core/testing';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { MODEL_SCALE } from '../model/render-scale';
import { getDistance } from '../model/utils';
import { wireGraph } from '../../test-utils/mechanism-harness';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { MultiEditService } from './multi-edit.service';

const S = MODEL_SCALE;

function refs(...entries: (`joint:${string}` | `link:${string}`)[]) {
  return entries.map((entry) => {
    const [kind, id] = entry.split(':') as ['joint' | 'link', string];
    return { kind, id };
  });
}

describe('MultiEditService', () => {
  let mechanism: MechanismService;
  let service: MultiEditService;
  let grid: GridUtilsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    service = TestBed.inject(MultiEditService);
    grid = TestBed.inject(GridUtilsService);
  });

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
});
