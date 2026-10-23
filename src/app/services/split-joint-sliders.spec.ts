import { Injector } from '@angular/core';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { splitJointChoice } from '../model/split-joint';
import { MODEL_SCALE } from '../model/render-scale';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import {
  buildMechanism,
  inModelUnits,
  MechanismFixture,
} from '../../test-utils/verification/fixture';
import { shaperQuickReturnFixture } from '../../test-utils/verification/library-fixtures';
import {
  plainPinFixture,
  splitSliderFixture,
  twoSlotsAtOnePinFixture,
} from '../../test-utils/verification/split-joint-fixtures';
import { ActiveObjService } from './active-obj.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { SplitJointService } from './split-joint.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';

function scene(fixture: MechanismFixture) {
  const harness = createMechanismHarness();
  const built = buildMechanism(inModelUnits(fixture));
  harness.service.joints = built.joints;
  harness.service.links = built.links;
  harness.service.finishStructuralEdit(false);
  const split = Injector.create({
    parent: harness.injector,
    providers: [{ provide: SplitJointService, deps: [] }],
  }).get(SplitJointService);
  const joint = (id: string) => harness.service.joints.find((one) => one.id === id) as RealJoint;
  return { ...harness, split, joint };
}

/** How far a floating slider sits off the line through its slot's two ends. */
function offSlot(block: PrisJoint): number {
  const a = block.slotJointA!;
  const b = block.slotJointB!;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.abs((b.x - a.x) * (a.y - block.y) - (a.x - block.x) * (b.y - a.y)) / length;
}

/** The half-width of a drawn block, the least a rider has to move to leave it. */
function blockHalfAcross(settings: SettingsService): number {
  return 1.525 * 0.15 * settings.objectScale;
}

const cm = (value: number): number => value * MODEL_SCALE;

describe('splitting a slider block', () => {
  it.each([
    { where: 'on a moving slot', grounded: false },
    { where: 'on the ground', grounded: true },
  ])('leaves a one-rider block $where unmoved and empty', ({ grounded }) => {
    const s = scene(splitSliderFixture(1, { grounded }));
    const block = s.joint('B') as PrisJoint;
    const { x, y } = block;
    const carrier = block.carrier;
    const slot = [block.slotJointA, block.slotJointB];

    expect(s.split.choiceFor(block)).toEqual({ count: 1 });
    expect(s.split.split(block)).toBe(true);

    expect(s.joint('B')).toBe(block);
    expect([block.x, block.y]).toEqual([x, y]);
    expect([block.carrier, block.slotJointA, block.slotJointB]).toEqual([carrier, ...slot]);
    expect(block.ground).toBe(grounded);
    expect(s.service.isJointOrphan(block)).toBe(true);
    const rider = s.service.links.find((link) => link.joints.some((one) => one.id === 'D'))!;
    const pin = rider.joints.find((one) => one.id !== 'D') as RealJoint;
    expect(pin).toBeInstanceOf(RevJoint);
    expect(Math.hypot(pin.x - x, pin.y - y)).toBeGreaterThan(blockHalfAcross(s.settings));
    // Along its own link, toward its far end: that reshapes nothing but the rider.
    const end = s.joint('D');
    expect(Math.atan2(pin.y - y, pin.x - x)).toBeCloseTo(Math.atan2(end.y - y, end.x - x));
    expect(s.saveCount()).toBe(1);
  });

  it.each([false, true])('separates two pin-in-slot riders (grounded: %s)', (grounded) => {
    const s = scene(splitSliderFixture(2, { grounded }));
    const block = s.joint('B') as PrisJoint;
    const before = s.service.joints.length;

    expect(s.split.split(block)).toBe(true);

    expect(s.service.joints).toHaveLength(before + 2);
    expect(s.service.isJointOrphan(block)).toBe(true);
    const pins = s.service.joints.slice(before) as RealJoint[];
    expect(pins.every((pin) => pin instanceof RevJoint && pin.links.length === 1)).toBe(true);
    expect(Math.hypot(pins[0].x - pins[1].x, pins[0].y - pins[1].y)).toBeGreaterThanOrEqual(
      0.4 * s.settings.objectScale - 1e-9
    );
    pins.forEach((pin) =>
      expect(Math.hypot(pin.x - block.x, pin.y - block.y)).toBeGreaterThan(
        blockHalfAcross(s.settings)
      )
    );
    expect(s.saveCount()).toBe(1);
  });

  it.each([false, true])(
    'separates the one rider of a Prismatic block (grounded: %s)',
    (grounded) => {
      const s = scene(splitSliderFixture(1, { grounded, prismatic: true }));
      const block = s.joint('B') as PrisJoint;
      expect(block.rotates).toBe(false);

      expect(s.split.split(block)).toBe(true);

      expect(block.rotates).toBe(false);
      expect(s.service.isJointOrphan(block)).toBe(true);
      expect(s.service.links.every((link) => !link.joints.includes(block))).toBe(true);
    }
  );

  it.each([false, true])(
    'splits a Prismatic block with two riders and keeps it Prismatic (grounded: %s)',
    (grounded) => {
      const s = scene(splitSliderFixture(2, { grounded, prismatic: true }));
      const block = s.joint('B') as PrisJoint;
      const before = s.service.joints.length;
      expect(block.isWelded).toBe(true);
      expect(s.split.choiceFor(block)).toEqual({ count: 2 });

      expect(s.split.split(block)).toBe(true);

      expect(s.joint('B')).toBe(block);
      expect([block.rotates, block.ground]).toEqual([false, grounded]);
      expect(s.service.isJointOrphan(block)).toBe(true);
      const pins = s.service.joints.slice(before) as RealJoint[];
      expect(pins).toHaveLength(2);
      expect(pins.every((pin) => pin instanceof RevJoint && pin.links.length === 1)).toBe(true);
      expect(pins[0].links[0]).not.toBe(pins[1].links[0]);
      expect(s.saveCount()).toBe(1);
    }
  );

  it('does not fold a rider shorter than the step back over its own far end', () => {
    const s = scene(splitSliderFixture(1, { shortRider: true }));
    const block = s.joint('B') as PrisJoint;

    expect(s.split.split(block)).toBe(true);

    const end = s.joint('D');
    const pin = end.links[0].joints.find((one) => one !== end)!;
    expect(Math.hypot(pin.x - end.x, pin.y - end.y)).toBeGreaterThanOrEqual(
      0.4 * s.settings.objectScale - 1e-9
    );
    expect(Math.hypot(pin.x - block.x, pin.y - block.y)).toBeGreaterThan(
      blockHalfAcross(s.settings)
    );
  });

  it('removes a slider drive, since the block has nothing left to push', () => {
    const fixture = splitSliderFixture(2, { grounded: true });
    fixture.joints.find((joint) => joint.id === 'B')!.input = true;
    fixture.joints.find((joint) => joint.id === 'B')!.driveSpeed = 3.5;
    const s = scene(fixture);
    const block = s.joint('B') as PrisJoint;

    expect(s.split.split(block)).toBe(true);

    expect(block).toBeInstanceOf(PrisJoint);
    expect(block.input).toBe(false);
    expect(block.driveSpeed).toBe(3.5);
  });

  it('still refuses a block with nowhere to slide', () => {
    const fixture = splitSliderFixture(2, { grounded: true });
    fixture.detach = ['B'];
    const s = scene(fixture);
    expect(s.split.choiceFor(s.joint('B')).refusal).toBe('dangling');
  });

  it('round-trips an empty block on its slot through the URL', () => {
    const s = scene(splitSliderFixture(1));
    s.split.split(s.joint('B'));
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
    const block = restored.joints.find((one) => one.id === 'B') as PrisJoint;
    expect(block).toBeInstanceOf(PrisJoint);
    expect([block.isFloating, block.carrier?.id]).toEqual([true, 'AC']);
    expect(restored.links.some((link) => link.joints.includes(block))).toBe(false);
  });
});

describe('splitting a welded joint', () => {
  it('lets the weld go and gives each link its own pin, in one undo step', () => {
    const s = scene(plainPinFixture());
    s.service.weldJoint(s.joint('A'));
    const saves = s.saveCount();
    expect(s.service.links).toHaveLength(1);
    expect(s.split.choiceFor(s.joint('A'))).toEqual({ count: 2 });

    expect(s.split.split(s.joint('A'))).toBe(true);

    expect(s.joint('A').isWelded).toBe(false);
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['AB', 'CD']);
    expect(s.saveCount() - saves).toBe(1);
  });

  it('refuses a corner of a triangle welded at every corner, which stays one body', () => {
    const [a, b, c] = [
      new RevJoint('A', 0, 0),
      new RevJoint('B', cm(3), 0),
      new RevJoint('C', 0, cm(3)),
    ];
    [a, b, c].forEach((joint) => (joint.isWelded = true));
    const triangle = new RealLink('ABC', [a, b, c]);
    triangle.subset = [
      new RealLink('AB', [a, b]),
      new RealLink('BC', [b, c]),
      new RealLink('AC', [a, c]),
    ];
    expect(splitJointChoice(a, [triangle], [])).toMatchObject({
      refusal: 'needs-links',
      short: 'needs 2 links',
    });
    // Welded at A and B only, C is still a pin: letting A go frees AC.
    c.isWelded = false;
    expect(splitJointChoice(a, [triangle], [])).toEqual({ count: 2 });
  });
});

describe('what stays put when a pin splits', () => {
  it("keeps a slot's end still so its slider stays on it (Shaper, joint D)", () => {
    const s = scene(shaperQuickReturnFixture());
    const d = s.joint('D');
    const at = { x: d.x, y: d.y };
    const ram = { x: s.joint('R').x, y: s.joint('R').y };

    expect(s.split.split(d)).toBe(true);

    const block = s.joint('B') as PrisJoint;
    const slotEnd = block.slotJointA!.id === 'C' ? block.slotJointB! : block.slotJointA!;
    expect([slotEnd.x, slotEnd.y]).toEqual([at.x, at.y]);
    expect(offSlot(block)).toBeLessThan(1e-6 * MODEL_SCALE);
    const connector = s.service.links.find((link) => link.joints.some((one) => one.id === 'R'))!;
    const moved = connector.joints.find((one) => one.id !== 'R')!;
    expect(Math.hypot(moved.x - at.x, moved.y - at.y)).toBeGreaterThan(0);
    expect([s.joint('R').x, s.joint('R').y]).toEqual([ram.x, ram.y]);
  });

  it('moves both carriers and reseats both sliders when two slots end at one pin', () => {
    const s = scene(twoSlotsAtOnePinFixture());
    const before = s.service.joints.length;

    expect(s.split.split(s.joint('A'))).toBe(true);

    const pins = [s.joint('A'), s.service.joints[before]];
    expect(s.service.joints).toHaveLength(before + 1);
    expect(Math.hypot(pins[0].x - pins[1].x, pins[0].y - pins[1].y)).toBeGreaterThan(0);
    expect(offSlot(s.joint('P') as PrisJoint)).toBeLessThan(1e-6 * MODEL_SCALE);
    expect(offSlot(s.joint('Q') as PrisJoint)).toBeLessThan(1e-6 * MODEL_SCALE);
  });

  it('keeps a cylinder mount still and moves the plain link off it', () => {
    const harness = createMechanismHarness();
    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
    const cylinder = harness.service.sealedStructures()[0];
    const mount = cylinder.mountA as RevJoint;
    const at = { x: mount.x, y: mount.y };
    const tip = new RevJoint('Z', mount.x, mount.y + 3 * MODEL_SCALE);
    harness.service.joints.push(tip);
    harness.service.links.push(new RealLink(mount.id + tip.id, [mount, tip]));
    harness.service.finishStructuralEdit(false);
    const split = Injector.create({
      parent: harness.injector,
      providers: [{ provide: SplitJointService, deps: [] }],
    }).get(SplitJointService);

    expect(split.split(mount)).toBe(true);

    const rebuilt = harness.service.sealedStructures()[0];
    expect([rebuilt.mountA.x, rebuilt.mountA.y]).toEqual([at.x, at.y]);
    const bar = harness.service.links.find((link) => link.joints.some((one) => one.id === 'Z'))!;
    const moved = bar.joints.find((one) => one.id !== 'Z')!;
    expect(moved.y).toBeGreaterThan(at.y);
    expect(moved.x).toBeCloseTo(at.x);
  });

  it('keeps one plain link still and steps the other off along itself', () => {
    const s = scene(plainPinFixture());
    expect(s.split.split(s.joint('A'))).toBe(true);
    const [a, d] = ['A', 'D'].map((id) => s.joint(id));
    expect([a.x, a.y]).toEqual([0, 0]);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeGreaterThan(0);
  });
});
