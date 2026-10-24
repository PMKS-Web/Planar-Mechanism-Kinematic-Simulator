import { Injector } from '@angular/core';
import { PrisJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { splitJoint, splitJointChoice } from '../model/split-joint';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { MODEL_SCALE } from '../model/render-scale';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { ActiveObjService } from './active-obj.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { SplitJointService } from './split-joint.service';

describe('SplitJointService', () => {
  function scene() {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 3 * MODEL_SCALE, 0);
    const c = new RevJoint('C', 0, 3 * MODEL_SCALE);
    const ab = new RealLink('AB', [a, b]);
    const ac = new RealLink('AC', [a, c]);
    harness.service.joints = [a, b, c];
    harness.service.links = [ab, ac];
    harness.service.finishStructuralEdit(false);
    const injector = Injector.create({
      parent: harness.injector,
      providers: [{ provide: SplitJointService, deps: [] }],
    });
    return { ...harness, split: injector.get(SplitJointService), a, b, c, ab, ac };
  }

  it('makes one separated ordinary pin per link and one undo entry', () => {
    const s = scene();
    s.a.name = 'Pivot';
    s.a.colorFamily = 'violet';
    s.a.showCurve = true;
    s.active.selectedJoint = s.a;

    expect(s.split.split(s.a)).toBe(true);

    const original = s.service.joints.find((joint) => joint.id === 'A') as RevJoint;
    const created = s.service.joints.find((joint) => joint.id === 'D') as RevJoint;
    // The grounded pin keeps its place; the other link steps off along itself.
    expect([original.x, original.y]).toEqual([0, 0]);
    expect(created.x).toBeCloseTo(0);
    expect(created.y).toBeGreaterThan(0);
    expect(s.ab.joints.map((joint) => joint.id)).toContain('A');
    expect(s.ac.joints.map((joint) => joint.id)).toContain('D');
    expect([original.name, original.input, original.ground, original.showCurve]).toEqual([
      'Pivot',
      true,
      true,
      true,
    ]);
    expect([original.locked, created.locked]).toEqual([false, false]);
    expect(created.ground).toBe(false);
    expect(created.input).toBe(false);
    expect(s.active.selectedJoint).toBe(original);
    expect(s.saveCount()).toBe(1);
  });

  it('keeps every resulting pin at the authored point when the source is position-locked', () => {
    const s = scene();
    s.a.locked = true;

    expect(s.split.split(s.a)).toBe(true);

    const original = s.service.joints.find((joint) => joint.id === 'A') as RevJoint;
    const created = s.service.joints.find((joint) => joint.id === 'D') as RevJoint;
    expect([original.x, original.y, created.x, created.y]).toEqual([0, 0, 0, 0]);
    expect([original.locked, created.locked]).toEqual([true, true]);
    expect(s.saveCount()).toBe(1);
  });

  it('keeps the first pin and moves each other one along its own link', () => {
    const s = scene();
    const e = new RevJoint('E', -3 * MODEL_SCALE, 0);
    s.service.joints.push(e);
    s.service.links.push(new RealLink('AE', [s.a, e]));
    s.service.finishStructuralEdit(false);

    expect(s.split.split(s.a)).toBe(true);

    const pinOf = (end: string) =>
      s.service.links
        .find((link) => link.joints.some((joint) => joint.id === end))!
        .joints.find((joint) => joint.id !== end)!;
    expect([pinOf('B').x, pinOf('B').y]).toEqual([0, 0]);
    expect(pinOf('C').x).toBeCloseTo(0);
    expect(pinOf('C').y).toBeGreaterThan(0);
    expect(pinOf('E').x).toBeLessThan(0);
    expect(pinOf('E').y).toBeCloseTo(0);
  });

  it('keeps the pins of a four-body split at least as far apart as a two-body pair', () => {
    const pair = scene();
    pair.split.split(pair.a);
    const [p, q] = pair.service.joints.filter((joint) => ['A', 'D'].includes(joint.id));
    const pairGap = Math.hypot(p.x - q.x, p.y - q.y);

    const s = scene();
    const ends = [new RevJoint('E', -3 * MODEL_SCALE, 0), new RevJoint('F', 0, -3 * MODEL_SCALE)];
    ends.forEach((end) => {
      s.service.joints.push(end);
      s.service.links.push(new RealLink('A' + end.id, [s.a, end]));
    });
    s.service.finishStructuralEdit(false);

    expect(s.split.split(s.a)).toBe(true);

    const pins = s.service.joints.filter((joint) => !['B', 'C', 'E', 'F'].includes(joint.id));
    expect(pins).toHaveLength(4);
    const gaps = pins.flatMap((one, index) =>
      pins.slice(index + 1).map((other) => Math.hypot(one.x - other.x, one.y - other.y))
    );
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(pairGap);
  });

  it('keeps a held link held while the constrained drag path separates its pin', () => {
    const s = scene();
    s.ab.hold = 'length';
    const before = Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y);

    expect(s.split.split(s.a)).toBe(true);

    const original = s.service.joints.find((joint) => joint.id === 'A') as RevJoint;
    expect(s.ab.hold).toBe('length');
    expect(Math.hypot(original.x - s.b.x, original.y - s.b.y)).toBeCloseTo(before);
  });

  it('remaps link ids, default names, fixed references and center-of-mass references', () => {
    const s = scene();
    s.ac.fixedLocation.fixedPoint = 'A';
    s.ac.comOffset = { along: 0, across: 0, frame: ['A', 'C'] };
    s.ac.comAnchor = { joint: 'A' };

    s.split.split(s.a);

    expect(s.ac.id).toBe('CD');
    expect(s.ac.name).toBe('CD');
    expect(s.ac.fixedLocations).toContainEqual({ id: 'D', label: 'D' });
    expect(s.ac.fixedLocation.fixedPoint).toBe('D');
    expect(s.ac.comOffset.frame).toEqual(['D', 'C']);
    expect(s.ac.comAnchor).toEqual({ joint: 'D' });
  });

  it('states each structural refusal at the model boundary', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const one = new RealLink('AB', [a, b]);
    expect(splitJointChoice(a, [one], []).short).toBe('needs 2 links');
    expect(splitJointChoice(new RevJoint('Z', 0, 0), [], []).long).toBe(
      'No links are on this joint, so there is nothing to split.'
    );
    // A weld is no reason to refuse; it is counted by what releasing it leaves.
    a.isWelded = true;
    expect(splitJointChoice(a, [one], []).refusal).toBe('needs-links');
    const dangling = new PrisJoint('P', 0, 0);
    expect(splitJointChoice(dangling, [], []).refusal).toBe('dangling');
  });

  it.each(['mountA', 'mountB'] as const)(
    'keeps a cylinder intact when splitting its %s end and renaming that member',
    (role) => {
      const harness = createMechanismHarness();
      harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
      const cylinder = harness.service.sealedStructures()[0];
      const mount = cylinder[role] as RevJoint;
      const tip = new RevJoint('Z', mount.x, mount.y + MODEL_SCALE);
      harness.service.joints.push(tip);
      // Put the neighbor first: the cylinder member then receives the new
      // letter, covering the branch where its identity actually changes.
      harness.service.links.unshift(new RealLink(mount.id + tip.id, [mount, tip]));
      harness.service.finishStructuralEdit(false);
      const split = Injector.create({
        parent: harness.injector,
        providers: [{ provide: SplitJointService, deps: [] }],
      }).get(SplitJointService);

      expect(split.split(mount)).toBe(true);
      expect(harness.service.sealedStructures()).toHaveLength(1);
      const rebuilt = harness.service.sealedStructures()[0];
      expect(rebuilt.seal.isSealed).toBe(true);
      expect(
        Math.hypot(rebuilt.mountA.x - rebuilt.mountB.x, rebuilt.mountA.y - rebuilt.mountB.y)
      ).toBeGreaterThan(0);
    }
  );

  it('refuses the visible seal and hidden interior without saving', () => {
    const harness = createMechanismHarness();
    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
    const cylinder = harness.service.sealedStructures()[0];
    const split = Injector.create({
      parent: harness.injector,
      providers: [{ provide: SplitJointService, deps: [] }],
    }).get(SplitJointService);
    const before = harness.saveCount();

    expect(split.choiceFor(cylinder.seal).short).toBe('inside a cylinder');
    expect(split.choiceFor(cylinder.inner as RevJoint).short).toBe('inside a cylinder');
    expect(split.split(cylinder.seal)).toBe(false);
    expect(split.split(cylinder.inner as RevJoint)).toBe(false);
    expect(harness.saveCount()).toBe(before);
  });

  it('rebinds another floating slot when its carrier endpoint receives the new pin', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2, 0);
    const x = new RevJoint('X', 0, 2);
    const p = new PrisJoint('P', 1, 0);
    const c = new RevJoint('C', 1, 1);
    const neighbor = new RealLink('AX', [a, x]);
    const carrier = new RealLink('AB', [a, b]);
    const rider = new RealLink('CP', [c, p]);
    p.slideOn(carrier, a, b);
    const joints = [a, b, x, p, c];
    const links = [neighbor, carrier, rider];

    splitJoint(a, joints, links, [], []);

    expect(p.slotJointA).not.toBe(a);
    expect(carrier.joints).toContain(p.slotJointA!);
    expect(neighbor.joints.map((joint) => joint.id)).toContain('A');
  });

  it('renames nested members and force anchors without changing custom body state', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 0);
    const d = new RevJoint('D', 0, 1);
    const leaf = new RealLink('AB', [a, b]);
    leaf.name = 'Handle';
    leaf.hold = 'length';
    const otherLeaf = new RealLink('BC', [b, c]);
    const compound = new RealLink('ABC', [a, b, c], 0, 0, undefined, [leaf, otherLeaf]);
    const neighbor = new RealLink('AD', [a, d]);
    const force = new Force('F1', compound, new Coord(0.2, 0), new Coord(0.2, 1));
    force.anchoredTo = 'AB';

    splitJoint(a, [a, b, c, d], [neighbor, compound], [force], []);

    expect(leaf.name).toBe('Handle');
    expect(leaf.hold).toBe('length');
    expect(leaf.id).toBe('BE');
    expect(compound.id).toBe('BCE');
    expect(force.anchoredTo).toBe('BE');
  });

  it('round-trips the separated pins and their separate link memberships through the URL', () => {
    const s = scene();
    s.split.split(s.a);
    const decoder = new StringTranscoder();
    decoder.decodeURL(encodeUrlOf(s.service, s.settings));
    const restored = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(restored, decoder, new SettingsService(), new ActiveObjService()).build(
      false
    );

    const a = restored.joints.find((joint) => joint.id === 'A')!;
    const d = restored.joints.find((joint) => joint.id === 'D')!;
    expect(Math.hypot(a.x - d.x, a.y - d.y)).toBeGreaterThan(0);
    expect(restored.links.map((link) => link.id).sort()).toEqual(['AB', 'CD']);
  });
});
