import '../model/joint';
import { Coord } from '../model/coord';
import { sealedCylinderStructures } from '../model/cylinder';
import { Force } from '../model/force';
import { Joint, PrisJoint, RevJoint } from '../model/joint';
import { RealLink, SliderBlock } from '../model/link';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { SelectionBatchService } from './selection-batch.service';

function chain(count = 4) {
  const harness = createMechanismHarness();
  const joints = Array.from(
    { length: count },
    (_, index) => new RevJoint(String.fromCharCode(65 + index), index * 100, 0)
  );
  const links = joints.slice(0, -1).map((joint, index) => {
    const other = joints[index + 1];
    return new RealLink(joint.id + other.id, [joint, other]);
  });
  harness.service.joints = joints;
  harness.service.links = links;
  wireGraph(harness.service);
  return { ...harness, batch: new SelectionBatchService(harness.service), joints, links };
}

describe('SelectionBatchService duplication', () => {
  it('copies shared topology once, excludes outside links, offsets parts, and saves once', () => {
    const h = chain();
    h.joints[0].name = 'Pivot';
    h.links[0].name = 'Crank';
    h.joints[1].locked = true;
    h.joints[2].locked = true;
    const force = new Force('F1', h.links[0], new Coord(25, 0), new Coord(25, 50), true, true, 12);
    force.name = 'Load';
    force.color = '#123456';
    force.locked = true;
    h.links[0].forces.push(force);
    h.service.forces.push(force);

    const originalJoints = new Set<Joint>(h.joints);
    const beforeJoints = h.service.joints.length;
    const beforeLinks = h.service.links.length;
    const result = h.batch.duplicateSelected(
      [
        { kind: 'link', id: 'AB' },
        { kind: 'link', id: 'BC' },
        { kind: 'link', id: 'AB' },
      ],
      { x: 10, y: -20 }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toHaveLength(2);
    expect(new Set(result.selection.map((ref) => `${ref.kind}:${ref.id}`)).size).toBe(2);
    expect(h.service.joints.length - beforeJoints).toBe(3);
    expect(h.service.links.length - beforeLinks).toBe(2);
    expect(h.saveCount()).toBe(1);

    const copies = result.selection.map((ref) =>
      h.service.links.find((link) => link.id === ref.id)!
    );
    const copiedJoints = [...new Set(copies.flatMap((link) => link.joints))];
    expect(copiedJoints).toHaveLength(3);
    expect(copiedJoints.every((joint) => !originalJoints.has(joint))).toBe(true);
    expect(copiedJoints.every((joint) => !(joint as RevJoint).locked)).toBe(true);
    expect(copiedJoints.map((joint) => joint.id)).not.toEqual(
      expect.arrayContaining(h.joints.map((joint) => joint.id))
    );
    const copiedA = copiedJoints.find((joint) => joint.name === 'Pivot Copy')!;
    expect(copiedA.x).toBe(h.joints[0].x + 10);
    expect(copiedA.y).toBe(h.joints[0].y - 20);
    expect(copies.map((link) => link.name)).toContain('Crank Copy');
    expect(copies.some((link) => link.joints.some((joint) => joint.x === h.joints[3].x + 10))).toBe(
      false
    );

    expect(h.service.forces).toHaveLength(2);
    const copiedForce = h.service.forces.find((candidate) => candidate !== force)!;
    expect(copiedForce.link).toBe(copies.find((link) => link.name === 'Crank Copy'));
    expect(copiedForce.startCoord).toEqual(new Coord(35, -20));
    expect(copiedForce.name).toBe('Load Copy');
    expect(copiedForce.color).toBe('#123456');
    expect(copiedForce.locked).toBe(false);
  });

  it('uses typed references when a joint and link have the same id', () => {
    const h = createMechanismHarness();
    const same = new RevJoint('AB', 5, 7);
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 10, 0);
    const link = new RealLink('AB', [a, b]);
    h.service.joints = [same, a, b];
    h.service.links = [link];
    wireGraph(h.service);
    const batch = new SelectionBatchService(h.service);

    const result = batch.duplicateSelected([{ kind: 'joint', id: 'AB' }], { x: 3, y: 4 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toHaveLength(1);
    expect(result.selection[0].kind).toBe('joint');
    expect(h.service.links).toEqual([link]);
    expect(h.service.joints).toHaveLength(4);
    expect(h.service.joints.at(-1)).toEqual(expect.objectContaining({ x: 8, y: 11 }));
  });

  it('preserves a floating slider and its carrier without copying unrelated topology', () => {
    const h = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 100, 0);
    const c = new RevJoint('C', 0, 200);
    const d = new RevJoint('D', 200, 200);
    const outsider = new RevJoint('E', 300, 0);
    const rider = new RealLink('AB', [a, b]);
    const carrier = new RealLink('CD', [c, d]);
    const outside = new RealLink('BE', [b, outsider]);
    const slot = new PrisJoint('P', b.x, b.y);
    slot.slideOn(carrier, c, d);
    const block = new SliderBlock('BP', [b, slot]);
    h.service.joints = [a, b, c, d, outsider, slot];
    h.service.links = [rider, carrier, outside, block];
    wireGraph(h.service);
    const batch = new SelectionBatchService(h.service);

    const result = batch.duplicateSelected([{ kind: 'link', id: rider.id }], { x: 20, y: 30 });

    expect(result.ok).toBe(true);
    const copiedSlots = h.service.joints.filter(
      (joint): joint is PrisJoint => joint instanceof PrisJoint && joint !== slot
    );
    expect(copiedSlots).toHaveLength(1);
    expect(copiedSlots[0].isFloating).toBe(true);
    expect(copiedSlots[0].isSlotWellFormed).toBe(true);
    expect(copiedSlots[0].carrier).not.toBe(carrier);
    expect(h.service.links.length).toBe(7);
    expect(h.service.joints.filter((joint) => joint.x === outsider.x + 20)).toHaveLength(0);
    expect(h.saveCount()).toBe(1);
  });

  it('preserves body properties and a grid-anchored custom center of mass at the offset', () => {
    const h = chain(2);
    const source = h.links[0];
    source.mass = 7;
    source.massMoI = 123.5;
    source.moiIsCustom = true;
    source.comIsCustom = true;
    source.placeCustomCoM({ x: 30, y: 40 });
    source.comAnchor = 'grid';
    source.captureComOffset();
    source.fill = '#abcdef';

    const result = h.batch.duplicateSelected([{ kind: 'link', id: source.id }], { x: 10, y: 20 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copy = h.service.links.find((link) => link.id === result.selection[0].id) as RealLink;
    expect(copy.mass).toBe(7);
    expect(copy.massMoI).toBe(123.5);
    expect(copy.moiIsCustom).toBe(true);
    expect(copy.comIsCustom).toBe(true);
    expect(copy.comAnchor).toBe('grid');
    expect(copy.CoM.x).toBeCloseTo(40, 9);
    expect(copy.CoM.y).toBeCloseTo(60, 9);
    expect(copy.fill).toBe('#abcdef');
  });

  it('preserves a welded compound and deduplicates its shared joint', () => {
    const h = chain(3);
    h.active.updateSelectedObj(h.joints[1]);
    h.service.weldJoint();
    const compound = h.service.links[0] as RealLink;
    const savesBefore = h.saveCount();

    const result = h.batch.duplicateSelected(
      [
        { kind: 'link', id: compound.id },
        { kind: 'link', id: compound.subset[0].id },
      ],
      { x: 5, y: 5 }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toHaveLength(1);
    const copy = h.service.links.find((link) => link.id === result.selection[0].id) as RealLink;
    expect(copy).toBeDefined();
    expect(copy.subset).toHaveLength(2);
    expect(copy.joints).toHaveLength(3);
    expect(new Set(copy.subset.flatMap((link) => link.joints)).size).toBe(3);
    const shared = copy.subset[0].joints.filter((joint) => copy.subset[1].joints.includes(joint));
    expect(shared).toHaveLength(1);
    expect((shared[0] as RevJoint).isWelded).toBe(true);
    expect(h.saveCount() - savesBefore).toBe(1);
  });

  it('duplicates a sealed cylinder as one complete unlocked part', () => {
    const h = createMechanismHarness();
    h.service.createCylinderFrom(new Coord(0, 0), new Coord(600, 0));
    const original = sealedCylinderStructures(h.service.joints)[0];
    original.slider.locked = true;
    const beforeSaves = h.saveCount();
    const batch = new SelectionBatchService(h.service);

    const result = batch.duplicateSelected(
      [
        { kind: 'link', id: original.barrel.id },
        { kind: 'link', id: original.rod.id },
      ],
      { x: 0, y: 100 }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toHaveLength(1);
    const cylinders = sealedCylinderStructures(h.service.joints);
    expect(cylinders).toHaveLength(2);
    const copy = cylinders.find((candidate) => candidate.slider !== original.slider)!;
    expect(copy.slider.isSealed).toBe(true);
    expect(copy.pin.isWelded).toBe(true);
    expect(copy.slider.locked).toBe(false);
    expect(copy.barrelFar.y).toBeCloseTo(original.barrelFar.y + 100, 6);
    expect(copy.rodFar.y).toBeCloseTo(original.rodFar.y + 100, 6);
    expect(h.service.joints).toHaveLength(10);
    expect(h.service.links).toHaveLength(6);
    expect(h.saveCount() - beforeSaves).toBe(1);
  });
});

describe('SelectionBatchService deletion', () => {
  it('refuses atomically when the combined cascade would orphan a locked shared joint', () => {
    const h = chain();
    h.joints[1].locked = true;
    const jointsBefore = [...h.service.joints];
    const linksBefore = [...h.service.links];

    const refusal = h.batch.deleteRefusal([
      { kind: 'link', id: 'AB' },
      { kind: 'link', id: 'BC' },
    ]);
    const result = h.batch.deleteSelected([
      { kind: 'link', id: 'AB' },
      { kind: 'link', id: 'BC' },
    ]);

    expect(refusal?.code).toBe('delete-locked-cascade');
    expect(refusal?.short).toBe('unlock first');
    expect(result.ok).toBe(false);
    expect(h.service.joints).toEqual(jointsBefore);
    expect(h.service.links).toEqual(linksBefore);
    expect(h.saveCount()).toBe(0);
  });

  it('deletes deduplicated links and their orphans with one structural save', () => {
    const h = chain();

    const result = h.batch.deleteSelected([
      { kind: 'link', id: 'AB' },
      { kind: 'link', id: 'BC' },
      { kind: 'link', id: 'AB' },
    ]);

    expect(result).toEqual({ ok: true, selection: [] });
    expect(h.service.links.map((link) => link.id)).toEqual(['CD']);
    expect(h.service.joints.map((joint) => joint.id)).toEqual(['C', 'D']);
    expect(h.saveCount()).toBe(1);
  });

  it('deletes a selected joint and its incident bars without sweeping unrelated orphans', () => {
    const h = chain(3);

    const result = h.batch.deleteSelected([{ kind: 'joint', id: 'B' }]);

    expect(result.ok).toBe(true);
    expect(h.service.links).toHaveLength(0);
    expect(h.service.joints.map((joint) => joint.id)).toEqual(['A', 'C']);
    expect(h.saveCount()).toBe(1);
  });

  it('reconciles a floating slot after its selected carrier is deleted', () => {
    const h = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 100, 0);
    const c = new RevJoint('C', 0, 200);
    const d = new RevJoint('D', 200, 200);
    const rider = new RealLink('AB', [a, b]);
    const carrier = new RealLink('CD', [c, d]);
    const slot = new PrisJoint('P', b.x, b.y);
    slot.slideOn(carrier, c, d);
    const block = new SliderBlock('BP', [b, slot]);
    h.service.joints = [a, b, c, d, slot];
    h.service.links = [rider, carrier, block];
    wireGraph(h.service);
    const batch = new SelectionBatchService(h.service);

    const result = batch.deleteSelected([{ kind: 'link', id: carrier.id }]);

    expect(result.ok).toBe(true);
    expect(slot.isFloating).toBe(false);
    expect(slot.isDangling).toBe(true);
    expect(slot.carrier).toBeUndefined();
    expect(h.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BP']);
    expect(h.saveCount()).toBe(1);
  });

  it('deletes a compound as one canonical body with one save', () => {
    const h = chain(3);
    h.active.updateSelectedObj(h.joints[1]);
    h.service.weldJoint();
    const compound = h.service.links[0];
    const savesBefore = h.saveCount();

    const result = h.batch.deleteSelected([
      { kind: 'link', id: compound.id },
      { kind: 'link', id: (compound as RealLink).subset[0].id },
    ]);

    expect(result.ok).toBe(true);
    expect(h.service.links).toHaveLength(0);
    expect(h.service.joints).toHaveLength(0);
    expect(h.saveCount() - savesBefore).toBe(1);
  });

  it('deletes a sealed cylinder without leaving its hidden implementation parts', () => {
    const h = createMechanismHarness();
    h.service.createCylinderFrom(new Coord(0, 0), new Coord(600, 0));
    const cylinder = sealedCylinderStructures(h.service.joints)[0];
    const beforeSaves = h.saveCount();
    const batch = new SelectionBatchService(h.service);

    const result = batch.deleteSelected([{ kind: 'link', id: cylinder.rod.id }]);

    expect(result.ok).toBe(true);
    expect(sealedCylinderStructures(h.service.joints)).toHaveLength(0);
    expect(h.service.joints).toHaveLength(0);
    expect(h.service.links).toHaveLength(0);
    expect(h.saveCount() - beforeSaves).toBe(1);
  });

  it('refuses a locked cylinder without mutating any of its closure', () => {
    const h = createMechanismHarness();
    h.service.createCylinderFrom(new Coord(0, 0), new Coord(600, 0));
    const cylinder = sealedCylinderStructures(h.service.joints)[0];
    cylinder.slider.locked = true;
    const beforeJoints = [...h.service.joints];
    const beforeLinks = [...h.service.links];
    const beforeSaves = h.saveCount();
    const batch = new SelectionBatchService(h.service);

    const result = batch.deleteSelected([{ kind: 'link', id: cylinder.rod.id }]);

    expect(result.ok).toBe(false);
    expect(h.service.joints).toEqual(beforeJoints);
    expect(h.service.links).toEqual(beforeLinks);
    expect(h.saveCount()).toBe(beforeSaves);
  });
});
