import { BodyFactory } from '../../app/model/body-system/body-factory';
import { createBodyCylinder } from '../../app/model/body-system/cylinder-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import {
  handPoint,
  handScalar,
  handOffset,
  HandBody,
  NativeCylinderExample,
} from './native-cylinder-example';

/** At the three-body pin only the rod and bracket are welded; the boom still turns relative to them. */
export function nativeWeldedCylinder(bracketFirst = false): NativeCylinderExample {
  const d = 3,
    r = 4,
    initial = 1;
  const state = (s: number, v: number, a: number) => {
    const length = 3 + s,
      x = (length * length + d * d - r * r) / (2 * d),
      y = Math.sqrt(length * length - x * x);
    const dx = length / d,
      ddx = 1 / d,
      dy = (length - x * dx) / y,
      ddy = (1 - dx * dx - x * ddx - dy * dy) / y;
    const cross = x * dy - y * dx,
      dt = cross / (length * length);
    const ddt = (x * ddy - y * ddx) / (length * length) - (2 * cross) / (length * length * length);
    const db = ((x - d) * dy - y * dx) / (r * r),
      ddb = ((x - d) * ddy - y * ddx) / (r * r);
    return {
      point: handPoint(x, y, dx * v, dy * v, ddx * v * v + dx * a, ddy * v * v + dy * a),
      angle: handScalar(Math.atan2(y, x), dt * v, ddt * v * v + dt * a),
      boomAngle: handScalar(Math.atan2(y, x - d), db * v, ddb * v * v + db * a),
    };
  };
  const start = state(initial, 0, 0),
    first = new BodyFactory();
  const makeBracket = (f: BodyFactory) =>
    f.body(
      'selectively welded bracket',
      { ...start.point.point, angle: start.angle.value },
      [
        { x: 0, y: 0 },
        { x: 0.7, y: 0.4 },
      ],
      0.3
    );
  const early = bracketFirst ? makeBracket(first) : undefined;
  const cylinder = createBodyCylinder(
    first.document,
    { x: 0, y: 0, angle: start.angle.value },
    { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
    initial
  );
  const f = new BodyFactory(cylinder.document),
    assembly = cylinder.assembly,
    bracket = early ?? makeBracket(f);
  f.joint('revolute', f.attachment(WORLD, { x: 0, y: 0 }), assembly.barrelMount);
  const at = f.attachment(bracket, { x: 0, y: 0 });
  f.joint('weld', assembly.rodMount, at);
  const boom = f.body(
    'pinned boom',
    { x: d, y: 0, angle: start.boomAngle.value },
    [
      { x: 0, y: 0 },
      { x: r, y: 0 },
    ],
    0.2
  );
  f.joint('revolute', f.attachment(WORLD, { x: d, y: 0 }), f.attachment(boom, { x: 0, y: 0 }));
  f.joint('revolute', at, f.attachment(boom, { x: r, y: 0 }));
  const witness = f.attachment(bracket, { x: 0.7, y: 0.4 });
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: assembly.internalJoint, coordinate: 'travel' as const },
    profile: { kind: 'constant-speed' as const, initial, speed: 0.2 },
  };
  return {
    document: { ...f.document, drivers: [driver] },
    assembly,
    driver,
    witness,
    bodyCount: 5,
    jointCount: 5,
    unknownCount: 3,
    commands: [1, 0, 0.4, 1.5, 0.8, 1],
    hand(s, v, a) {
      const result = state(s, v, a);
      return new Map<typeof boom, HandBody>([
        [assembly.barrel, { ...handPoint(0, 0), angle: result.angle }],
        [assembly.rod, handOffset(result.point, result.angle, { x: -2, y: 0 })],
        [bracket, { ...result.point, angle: result.angle }],
        [boom, { ...handPoint(d, 0), angle: result.boomAngle }],
      ]);
    },
  };
}
