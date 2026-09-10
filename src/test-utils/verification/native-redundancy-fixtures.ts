import { BodyFactory } from '../../app/model/body-system/body-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { Point } from '../../app/model/body-system/body-frame';

/** The third crank repeats the parallel motion geometrically, not by duplicating a row. */
export function nativeParallelCranks() {
  const f = new BodyFactory(),
    angle = 0.6;
  const tip = { x: Math.cos(angle), y: Math.sin(angle) };
  const coupler = f.body('coupler', { ...tip, angle: 0 }, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ]);
  const cranks = [0, 2, 4].map((x) => {
    const id = f.body('crank', { x, y: 0, angle }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const pin = f.joint(
      'revolute',
      f.attachment(WORLD, { x, y: 0 }),
      f.attachment(id, { x: 0, y: 0 })
    );
    f.joint('revolute', f.attachment(id, { x: 1, y: 0 }), f.attachment(coupler, { x, y: 0 }));
    return { id, pin };
  });
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: cranks[0].pin.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
  const witness = f.attachment(coupler, { x: 2, y: 0.6 });
  return { document: { ...f.document, drivers: [driver] }, witness, coupler, cranks, angle };
}

export const TWO_SLOT_PIVOT = { x: 0.2, y: -0.1 };

/** Positive intersection of a ray and a circle about the cranks' shared pivot. */
export function nativeTwoSlotTip(angle: number, radius: number): Point {
  const u = { x: Math.cos(angle), y: Math.sin(angle) },
    c = TWO_SLOT_PIVOT;
  const along = c.x * u.x + c.y * u.y,
    across = c.y * u.x - c.x * u.y;
  const travel = along + Math.sqrt(radius * radius - across * across);
  return { x: travel * u.x, y: travel * u.y };
}

/** Two distinct slots on the same rotating carrier, each meeting a separately pinned crank. */
export function nativeTwoSlots() {
  const f = new BodyFactory(),
    angle = 0.6;
  const carrier = f.body('carrier', { x: 0, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ]);
  const input = f.joint(
    'revolute',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(carrier, { x: 0, y: 0 })
  );
  const riders = [1, 2].map((radius) => {
    const tip = nativeTwoSlotTip(angle, radius),
      c = TWO_SLOT_PIVOT;
    const heading = Math.atan2(tip.y - c.y, tip.x - c.x);
    const body = f.body('rider', { ...c, angle: heading }, [
      { x: 0, y: 0 },
      { x: radius, y: 0 },
    ]);
    f.joint('revolute', f.attachment(WORLD, c), f.attachment(body, { x: 0, y: 0 }));
    const at = f.attachment(body, { x: radius, y: 0 });
    const guidePoint = { x: 0.1 * radius, y: 0 };
    const slot = f.joint('pin-in-slot', f.attachment(carrier, guidePoint), at, angle);
    const witness = f.attachment(body, { x: radius / 2, y: 0.3 });
    return { body, at, witness, slot, radius };
  });
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: input.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
  return { document: { ...f.document, drivers: [driver] }, carrier, riders, angle };
}
