import { PrisJoint, RevJoint } from '../../../model/joint';
import { RealLink } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { DxfPolyline } from './dxf-model';
import { cylinderParts, groundPlate, slotProfile } from './link-bodies';

/** Model units straight through, so the numbers below read as centimetres. */
const point = (at: { x: number; y: number }) => ({ x: at.x / MODEL_SCALE, y: at.y / MODEL_SCALE });

const loopsIn = (entities: ReturnType<typeof groundPlate>, layer: string) =>
  entities.filter(
    (entity): entity is DxfPolyline => entity.type === 'POLYLINE' && entity.layer === layer
  );

describe('the parts a mechanism is made of', () => {
  describe('a sealed cylinder', () => {
    const at = {
      barrelFar: { x: 0, y: 0 },
      barrelNear: { x: 4, y: 0 },
      pin: { x: 3, y: 0 },
      rodFar: { x: 8, y: 0 },
    };

    it('is a sleeve with a bore and a rod, not a line between two mounts', () => {
      const entities = cylinderParts(at, 0.2, 0.1, 'SLEEVE', 'ROD');
      const sleeve = loopsIn(entities, 'SLEEVE');
      const rod = loopsIn(entities, 'ROD');
      // Two loops on the sleeve layer: an outer and a bore. Extruded between
      // them it is a tube, which is what the rod slides in.
      expect(sleeve).toHaveLength(2);
      expect(sleeve.every((loop) => loop.closed)).toBe(true);
      const width = (loop: (typeof sleeve)[0]) => {
        const ys = loop.points.map((vertex) => vertex.y);
        return Math.max(...ys) - Math.min(...ys);
      };
      expect(width(sleeve[0])).toBeGreaterThan(width(sleeve[1]));
      expect(rod).toHaveLength(1);
      // The rod fits down the bore.
      expect(width(rod[0])).toBeLessThan(width(sleeve[1]));
      // A pin at each mount, which is what the assembly hangs off.
      expect(entities.filter((entity) => entity.type === 'CIRCLE')).toHaveLength(2);
    });

    it('has nothing to draw without a body width to size it from', () => {
      expect(cylinderParts(at, 0, 0.1, 'SLEEVE', 'ROD')).toHaveLength(0);
    });
  });

  describe('a slot', () => {
    function slotted() {
      const joint = new PrisJoint('P', 0, 0);
      joint.groundAt(0);
      return joint;
    }

    it('is a closed capsule the block could really slide in', () => {
      const entities = slotProfile(slotted(), undefined, point, 1, 0.3, 'SLOT', 'BLOCK');
      const [slot] = loopsIn(entities, 'SLOT');
      expect(slot).toBeDefined();
      expect(slot.closed).toBe(true);
      expect(slot.points).toHaveLength(4);
      // Two half circles, bulging outward. Positive turns them inward and the
      // slot comes out as two facing brackets rather than a shape.
      expect(slot.points.filter((vertex) => vertex.bulge === -1)).toHaveLength(2);
    });

    it('is as long as the block actually travels, when that has been measured', () => {
      const joint = slotted();
      const travel = {
        jointId: 'P',
        from: { x: -5 * MODEL_SCALE, y: 0 },
        to: { x: 5 * MODEL_SCALE, y: 0 },
      };
      const measured = loopsIn(slotProfile(joint, travel, point, 1, 0.3, 'SLOT', 'BLOCK'), 'SLOT');
      const xs = measured[0].points.map((vertex) => vertex.x);
      expect(Math.min(...xs)).toBeCloseTo(-5, 6);
      expect(Math.max(...xs)).toBeCloseTo(5, 6);

      // A grounded slot has no length of its own at the start pose, so without
      // a measurement it falls back to a nominal centimetre either way.
      const guessed = loopsIn(
        slotProfile(joint, undefined, point, 1, 0.3, 'SLOT', 'BLOCK'),
        'SLOT'
      );
      const nominal = guessed[0].points.map((vertex) => vertex.x);
      expect(Math.max(...nominal)).toBeCloseTo(1, 6);
    });

    it("keeps a moving carrier's slot in the carrier's own frame", () => {
      // A slot cut into a link that swings: its own axis runs up the carrier,
      // while the block's path through the world is some curve across the
      // drawing. Measuring the world path and calling it the slot is what
      // turned Scotch Yoke's vertical slot through ninety degrees.
      const joint = new PrisJoint('P', 0, 0);
      const low = new RevJoint('L', 0, -2 * MODEL_SCALE);
      const high = new RevJoint('H', 0, 2 * MODEL_SCALE);
      joint.slideOn(new RealLink('LH', [low, high]), low, high);
      const worldPath = {
        jointId: 'P',
        from: { x: -5 * MODEL_SCALE, y: 0 },
        to: { x: 5 * MODEL_SCALE, y: 0 },
      };
      const [slot] = loopsIn(slotProfile(joint, worldPath, point, 1, 0.3, 'SLOT', 'BLOCK'), 'SLOT');
      const ys = slot.points.map((vertex) => vertex.y);
      const xs = slot.points.map((vertex) => vertex.x);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 6);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
    });

    it('leaves material in the part it is cut into', () => {
      // A slot as wide as the bar holding it is a bar cut in two. The carrier's
      // width caps it, the same way the body width caps the pin.
      const [narrow] = loopsIn(
        slotProfile(slotted(), undefined, point, 1, 5, 'SLOT', 'BLOCK', 0.4),
        'SLOT'
      );
      const ys = narrow.points.map((vertex) => vertex.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.2, 6);
    });

    it('comes with a block to put in it, because an empty slot is not a part', () => {
      const entities = slotProfile(slotted(), undefined, point, 1, 0.3, 'SLOT', 'BLOCK');
      const [block] = loopsIn(entities, 'BLOCK');
      const [slot] = loopsIn(entities, 'SLOT');
      expect(block).toBeDefined();
      expect(block.closed).toBe(true);
      expect(block.points).toHaveLength(4);
      // As wide as its slot, so it can actually go in. It used to come out at
      // twice the width -- a part that cannot enter the hole it is for.
      const across = (loop: typeof block) => {
        const ys = loop.points.map((vertex) => vertex.y);
        return Math.max(...ys) - Math.min(...ys);
      };
      expect(across(block)).toBeCloseTo(across(slot), 6);
      // And it carries the pin joining it to the link it drives.
      expect(entities.some((entity) => entity.type === 'CIRCLE' && entity.layer === 'BLOCK')).toBe(
        true
      );
    });
  });

  describe('the ground plate', () => {
    const pins = [
      { x: 0, y: 0 },
      { x: 4 * MODEL_SCALE, y: 0 },
    ];

    it('is a closed rounded plate with a hole on every fixed pin', () => {
      const entities = groundPlate(pins, point, 1, 0.3, 'GROUND');
      const [plate] = loopsIn(entities, 'GROUND');
      expect(plate.closed).toBe(true);
      expect(plate.points).toHaveLength(8);
      // Four straight edges and four quarter turns.
      expect(plate.points.filter((vertex) => vertex.bulge)).toHaveLength(4);
      const holes = entities.filter((entity) => entity.type === 'CIRCLE');
      expect(holes).toHaveLength(2);
    });

    it('reaches round everything it carries, not just the pins it holds', () => {
      // A grounded slot is cut into this plate, so a plate that stopped at the
      // pins would have the slot running off the end of the part holding it.
      const slotEnd = { x: 9 * MODEL_SCALE, y: 0 };
      const entities = groundPlate([...pins, slotEnd], point, 1, 0.3, 'GROUND', pins);
      const [plate] = loopsIn(entities, 'GROUND');
      expect(Math.max(...plate.points.map((vertex) => vertex.x))).toBeGreaterThan(9);
      // And still only two holes: the slot end is not a pin.
      expect(entities.filter((entity) => entity.type === 'CIRCLE')).toHaveLength(2);
    });

    it('has nothing to draw when nothing is grounded', () => {
      expect(groundPlate([], point, 1, 0.3, 'GROUND')).toHaveLength(0);
    });
  });
});
