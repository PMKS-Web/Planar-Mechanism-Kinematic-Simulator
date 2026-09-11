import { BodyFactory } from '../../app/model/body-system/body-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';

/** Two nearby extrema of x(theta)=cot(theta)+r*sin(theta), with no coordinate limits. */
export function nativeFoldPair(strength = 0.0001) {
  const center = Math.acos(1 / Math.sqrt(3)),
    theta = center - 0.03,
    r = ((3 * Math.sqrt(3)) / 2) * (1 + strength);
  const x = (angle: number) => 1 / Math.tan(angle) + r * Math.sin(angle);
  const derivative = (angle: number) => -1 / Math.sin(angle) ** 2 + r * Math.cos(angle);
  const f = new BodyFactory();
  const carrier = f.body('rotating fold carrier', { x: 0, y: 0, angle: theta }, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ]);
  const pivot = f.attachment(carrier, { x: 0, y: 0 });
  f.joint('revolute', f.attachment(WORLD, { x: 0, y: 0 }), pivot);
  const block = f.body('offset sliding rider', { x: 1 / Math.tan(theta), y: 1, angle: theta }, [
    { x: 0, y: 0 },
    { x: 0, y: -r },
  ]);
  const at = f.attachment(block, { x: 0, y: 0 });
  f.joint('prismatic', pivot, at, theta);
  f.joint('pin-in-slot', f.attachment(WORLD, { x: 0, y: 1 }), at, 0);
  const carriage = f.body(
    'horizontal output carriage',
    { x: x(theta), y: -2, angle: 0 },
    [
      { x: -0.2, y: 0 },
      { x: 0.2, y: 0 },
    ],
    0.3
  );
  const anchor = f.attachment(carriage, { x: 0, y: 0 });
  const slide = f.joint('prismatic', f.attachment(WORLD, { x: x(theta), y: -2 }), anchor, 0);
  f.joint('pin-in-slot', anchor, f.attachment(block, { x: 0, y: -r }), Math.PI / 2);
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: slide.id, coordinate: 'travel' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: -0.001 },
  };
  // Scalar bisection of the written closed form is independent of native body constraints.
  let lo = theta,
    hi = center;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (derivative(mid) < 0) lo = mid;
    else hi = mid;
  }
  const foldAngle = (lo + hi) / 2;
  return {
    document: { ...f.document, drivers: [driver] },
    driver,
    carrier,
    theta,
    r,
    target: x(center + 0.06) - x(theta),
    foldAngle,
    foldCommand: x(foldAngle) - x(theta),
  };
}
