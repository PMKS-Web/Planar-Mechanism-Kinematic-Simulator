import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { ActiveObjService } from './active-obj.service';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { Force } from '../model/force';
import { Coord } from '../model/coord';

describe('ActiveObjService part selection', () => {
  function scene() {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const sameId = new RealLink('A', [a, b]);
    return { active: new ActiveObjService(), a, b, sameId };
  }

  it('replaces the selection while preserving singular compatibility', () => {
    const { active, a } = scene();

    active.replacePartSelection(a);

    expect(active.objType).toBe('Joint');
    expect(active.selectedJoint).toBe(a);
    expect(active.getSelectedObj()).toBe(a);
    expect(active.selectedPartRefs).toEqual([{ kind: 'joint', id: 'A' }]);
    expect(active.primaryPart).toBe(a);
  });

  it('orders toggled parts and makes the last added part primary', () => {
    const { active, a, b, sameId } = scene();

    active.togglePartSelection(a);
    active.togglePartSelection(sameId);
    active.togglePartSelection(b);

    expect(active.objType).toBe('MultiSelection');
    expect(active.selectedPartRefs).toEqual([
      { kind: 'joint', id: 'A' },
      { kind: 'link', id: 'A' },
      { kind: 'joint', id: 'B' },
    ]);
    expect(active.primaryPartRef).toEqual({ kind: 'joint', id: 'B' });
    expect(active.selectedJoint).toBe(b);
  });

  it('toggles an existing member out and promotes the last survivor', () => {
    const { active, a, b, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(sameId);
    active.togglePartSelection(b);

    active.togglePartSelection(b);

    expect(active.selectedPartRefs).toEqual([
      { kind: 'joint', id: 'A' },
      { kind: 'link', id: 'A' },
    ]);
    expect(active.primaryPart).toBe(sameId);
    expect(active.selectedLink).toBe(sameId);
  });

  it('clears part state on a blank-grid selection', () => {
    const { active, a, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(sameId);

    active.updateSelectedObj(undefined);

    expect(active.objType).toBe('Grid');
    expect(active.selectedParts).toEqual([]);
    expect(active.primaryPart).toBeUndefined();
  });

  it('reconciles references to rebuilt objects and drops deleted members', () => {
    const { active, a, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(sameId);
    const rebuiltA = new RevJoint('A', 3, 4);
    const rebuiltB = new RevJoint('B', 5, 4);
    const rebuiltLink = new RealLink('A', [rebuiltA, rebuiltB]);

    active.reconcilePartSelection([rebuiltA, rebuiltB], [rebuiltLink]);

    expect(active.selectedParts).toEqual([rebuiltA, rebuiltLink]);
    expect(active.selectedJoint).toBe(rebuiltA);
    expect(active.selectedLink).toBe(rebuiltLink);

    active.reconcilePartSelection([rebuiltA, rebuiltB], []);
    expect(active.selectedParts).toEqual([rebuiltA]);
    expect(active.objType).toBe('Joint');
    expect(active.primaryPart).toBe(rebuiltA);
  });

  it('restores an ordered snapshot without serializing object references', () => {
    const { active, a, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(sameId);
    const snapshot = active.snapshotPartSelection();
    const rebuiltA = new RevJoint('A', 3, 4);
    const rebuiltB = new RevJoint('B', 5, 4);
    const rebuiltLink = new RealLink('A', [rebuiltA, rebuiltB]);

    active.clearPartSelection();
    active.restorePartSelection(snapshot, [rebuiltA, rebuiltB], [rebuiltLink]);

    expect(active.selectedParts).toEqual([rebuiltA, rebuiltLink]);
    expect(active.primaryPart).toBe(rebuiltLink);
  });

  it('keeps updateSelectedObj backward-compatible as a replacing selection', () => {
    const { active, a, sameId } = scene();
    active.togglePartSelection(a);
    active.togglePartSelection(sameId);

    active.updateSelectedObj(a);

    expect(active.selectedParts).toEqual([a]);
    expect(active.objType).toBe('Joint');
  });

  it('leaves a singular force selection alone during part reconciliation', () => {
    const { active, a, b, sameId } = scene();
    const force = new Force('F1', sameId, new Coord(a.x, a.y), new Coord(b.x, b.y));
    active.updateSelectedObj(force);

    active.reconcilePartSelection([a, b], [sameId]);

    expect(active.objType).toBe('Force');
    expect(active.selectedForce).toBe(force);
  });
});

describe('structural selection reconciliation', () => {
  it('drops deleted parts and keeps surviving selections through the structural seam', () => {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const link = new RealLink('AB', [a, b]);
    harness.service.joints = [a, b];
    harness.service.links = [link];
    wireGraph(harness.service);
    harness.active.togglePartSelection(a);
    harness.active.togglePartSelection(link);

    harness.service.links = [];
    harness.service.finishStructuralEdit(false);

    expect(harness.active.selectedParts).toEqual([a]);
    expect(harness.active.primaryPart).toBe(a);
    expect(harness.active.objType).toBe('Joint');
  });
});
