import { BodyFactory } from '../../app/model/body-system/body-factory';
import { WORLD, newRecordId } from '../../app/model/body-system/body-id';

/** A crank pin in a vertical carriage slot imposes x=radius*cos(angle), without solver-derived coordinates. */
export function nativeCosineCarriage(angle = -0.2, upper = 0.999, radius = 1) {
  const f = new BodyFactory();
  const crank = f.body(
    'crank',
    { x: 0, y: 0, angle },
    [
      { x: 0, y: 0 },
      { x: radius, y: 0 },
    ],
    radius / 10
  );
  const x = radius * Math.cos(angle);
  const carriage = f.body(
    'carriage',
    { x, y: 0, angle: 0 },
    [
      { x: 0, y: -radius },
      { x: 0, y: radius },
    ],
    radius / 10
  );
  const pin = f.joint(
    'revolute',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(crank, { x: 0, y: 0 })
  );
  const guide = f.joint(
    'prismatic',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(carriage, { x: 0, y: 0 })
  );
  f.joint(
    'pin-in-slot',
    f.attachment(carriage, { x: 0, y: 0 }),
    f.attachment(crank, { x: radius, y: 0 }),
    Math.PI / 2
  );
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: pin.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
  const limit = {
    id: newRecordId<'limit'>(),
    coordinate: { jointId: guide.id, coordinate: 'travel' as const },
    lower: -2 * radius - x,
    upper: upper * radius - x,
  };
  return {
    document: { ...f.document, drivers: [driver], limits: [limit] },
    driver,
    pin,
    guide,
    limit,
    crank,
    carriage,
    initialAngle: angle,
    radius,
  };
}
