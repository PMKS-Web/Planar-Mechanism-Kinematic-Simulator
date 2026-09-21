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
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 0, 1);
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
    expect(original.x).toBeLessThan(0);
    expect(created.x).toBeGreaterThan(0);
    expect(original.y).toBeCloseTo(0);
    expect(created.y).toBeCloseTo(0);
    expect(original.x + created.x).toBeCloseTo(0);
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

  it('spreads every pin in a three-body split around the former center', () => {
    const s = scene();
    const e = new RevJoint('E', -1, 0);
    s.service.joints.push(e);
    s.service.links.push(new RealLink('AE', [s.a, e]));
    s.service.finishStructuralEdit(false);

    expect(s.split.split(s.a)).toBe(true);

    const pins = s.service.joints.filter(
      (joint) => !['B', 'C', 'E'].includes(joint.id)
    ) as RevJoint[];
    expect(pins).toHaveLength(3);
    expect(pins.every((pin) => Math.hypot(pin.x, pin.y) > 0)).toBe(true);
    expect(new Set(pins.map((pin) => `${pin.x},${pin.y}`)).size).toBe(3);
    expect(pins.reduce((sum, pin) => sum + pin.x, 0)).toBeCloseTo(0);
    expect(pins.reduce((sum, pin) => sum + pin.y, 0)).toBeCloseTo(0);
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

  it('detaches a floating pin-in-slot without creating or replacing a joint', () => {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2, 0);
    const p = new PrisJoint('P', 1, 0);
    const carrier = new RealLink('AB', [a, b]);
    const c = new RevJoint('C', 1, 1);
    const rider = new RealLink('CP', [c, p]);
    p.slideOn(carrier, a, b);
    harness.service.joints = [a, b, c, p];
    harness.service.links = [carrier, rider];
    harness.service.finishStructuralEdit(false);
    const split = Injector.create({
      parent: harness.injector,
      providers: [{ provide: SplitJointService, deps: [] }],
    }).get(SplitJointService);

    expect(split.choiceFor(p)).toEqual({ count: 2 });
    expect(split.split(p)).toBe(true);
    expect(harness.service.joints).toEqual([a, b, c, p]);
    expect(harness.service.joints.find((joint) => joint.id === 'P')).toBe(p);
    expect(p).toBeInstanceOf(PrisJoint);
    expect(p.isDangling).toBe(true);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeGreaterThan(0);
    expect(carrier.joints).toEqual([a, b]);
    expect(rider.joints).toContain(p);
  });

  it.each([true, false])(
    'keeps a %s-rotating slider and every rider together when detaching its carrier',
    (rotates) => {
      const harness = createMechanismHarness();
      const a = new RevJoint('A', 0, 0);
      const b = new RevJoint('B', 2, 0);
      const p = new PrisJoint('P', 1, 0, true);
      p.rotates = rotates;
      p.driveSpeed = 3.5;
      p.name = 'Follower';
      const c = new RevJoint('C', 1, 1);
      const d = new RevJoint('D', 1, -1);
      const carrier = new RealLink('AB', [a, b]);
      const riders = [new RealLink('CP', [c, p]), new RealLink('DP', [d, p])];
      p.slideOn(carrier, a, b);
      harness.service.joints = [a, b, c, d, p];
      harness.service.links = [carrier, ...riders];
      harness.service.finishStructuralEdit(false);
      const split = Injector.create({
        parent: harness.injector,
        providers: [{ provide: SplitJointService, deps: [] }],
      }).get(SplitJointService);

      expect(split.choiceFor(p)).toEqual({ count: 3 });
      expect(split.split(p)).toBe(true);
      expect(harness.service.joints).toHaveLength(5);
      expect(riders.every((link) => link.joints.includes(p))).toBe(true);
      expect([p.rotates, p.input, p.driveSpeed, p.name, p.isDangling]).toEqual([
        rotates,
        true,
        3.5,
        'Follower',
        true,
      ]);
      expect(harness.saveCount()).toBe(1);
    }
  );

  it('does not reinterpret a slider input speed as revolutions per minute', () => {
    const harness = createMechanismHarness();
    const p = new PrisJoint('P', 0, 0, true, true);
    p.driveSpeed = 3.5;
    const a = new RevJoint('A', 1, 0);
    const b = new RevJoint('B', 0, 1);
    harness.service.joints = [p, a, b];
    harness.service.links = [new RealLink('AP', [a, p]), new RealLink('BP', [b, p])];
    harness.service.finishStructuralEdit(false);
    const split = Injector.create({
      parent: harness.injector,
      providers: [{ provide: SplitJointService, deps: [] }],
    }).get(SplitJointService);

    expect(split.split(p)).toBe(true);
    const original = harness.service.joints.find((joint) => joint.id === 'P') as RevJoint;
    expect(original.input).toBe(false);
    expect(original.driveSpeed).toBe(0);
  });

  it('states each structural refusal at the model boundary', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const one = new RealLink('AB', [a, b]);
    expect(splitJointChoice(a, [one], []).short).toBe('needs 2 links');
    expect(splitJointChoice(new RevJoint('Z', 0, 0), [], []).long).toBe(
      'No links are on this joint, so there is nothing to split.'
    );
    a.isWelded = true;
    expect(splitJointChoice(a, [one], []).short).toBe('unweld first');
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
