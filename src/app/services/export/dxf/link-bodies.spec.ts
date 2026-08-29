import { PrisJoint } from '../../../model/joint';
import { MODEL_SCALE } from '../../../model/render-scale';
import { DxfPolyline } from './dxf-model';
import { groundPlate, slotProfile } from './link-bodies';

/** Model units straight through, so the numbers below read as centimetres. */
const point = (at: { x: number; y: number }) => ({ x: at.x / MODEL_SCALE, y: at.y / MODEL_SCALE });

const loopsIn = (entities: ReturnType<typeof groundPlate>, layer: string) =>
  entities.filter(
    (entity): entity is DxfPolyline => entity.type === 'POLYLINE' && entity.layer === layer
  );

describe('the parts a mechanism is made of', () => {
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

    it('comes with a block to put in it, because an empty slot is not a part', () => {
      const entities = slotProfile(slotted(), undefined, point, 1, 0.3, 'SLOT', 'BLOCK');
      const [block] = loopsIn(entities, 'BLOCK');
      expect(block).toBeDefined();
      expect(block.closed).toBe(true);
      expect(block.points).toHaveLength(4);
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
