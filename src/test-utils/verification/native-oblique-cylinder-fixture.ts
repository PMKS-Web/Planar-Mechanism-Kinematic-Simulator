import { BodyFactory } from '../../app/model/body-system/body-factory';
import { emptyBodyDocument } from '../../app/model/body-system/body-document';
import { createBodyCylinder } from '../../app/model/body-system/cylinder-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import {
  HandBody,
  handPoint,
  handScalar,
  handOffset,
  NativeCylinderExample,
} from './native-cylinder-example';

/** The near/far roots lie on opposite sides of the perpendicular foot on the oblique guide. */
export function nativeObliqueCylinder(
  h = 2,
  branch: 1 | -1 = 1,
  reverseAxis = false,
  carriageFirst = false
): NativeCylinderExample {
  const heading = 0.4,
    c = 4,
    initial = 0.4,
    barrelLength = 3,
    rodLength = 2;
  const ux = Math.cos(heading),
    uy = Math.sin(heading),
    eye = { x: c * ux - h * uy, y: c * uy + h * ux };
  const carriageAt = (s: number, v: number, a: number) => {
    const length = barrelLength + s,
      q = branch * Math.sqrt(length * length - h * h);
    const t = c - q,
      tv = (-length / q) * v,
      ta = ((h * h) / (q * q * q)) * v * v - (length / q) * a;
    const theta = heading + Math.atan2(h, q),
      dtheta = -h / (length * q);
    const ddtheta = (h * (2 * length * length - h * h)) / (length * length * q * q * q);
    return {
      origin: handPoint(t * ux, t * uy, tv * ux, tv * uy, ta * ux, ta * uy),
      angle: handScalar(theta, dtheta * v, ddtheta * v * v + dtheta * a),
    };
  };
  const start = carriageAt(initial, 0, 0),
    pose = { ...start.origin.point, angle: start.angle.value };
  const first = new BodyFactory();
  const makeCarriage = (f: BodyFactory) =>
    f.body(
      'oblique carriage',
      { ...start.origin.point, angle: heading },
      [
        { x: -0.4, y: 0 },
        { x: 0.4, y: 0 },
      ],
      0.5
    );
  const early = carriageFirst ? makeCarriage(first) : undefined;
  const cylinder = createBodyCylinder(
    carriageFirst ? first.document : emptyBodyDocument(),
    pose,
    { barrelLength, rodLength, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
    initial
  );
  const f = new BodyFactory(cylinder.document),
    assembly = cylinder.assembly,
    carriage = early ?? makeCarriage(f);
  const at = f.attachment(carriage, { x: 0, y: 0 });
  f.joint(
    'prismatic',
    f.attachment(WORLD, { x: 0, y: 0 }),
    at,
    heading + (reverseAxis ? Math.PI : 0)
  );
  f.joint('revolute', at, assembly.barrelMount);
  f.joint('revolute', f.attachment(WORLD, eye), assembly.rodMount);
  const witness = f.attachment(assembly.barrel, { x: 0.7, y: 0.6 });
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
    bodyCount: 4,
    jointCount: 4,
    unknownCount: 3,
    commands: h > 3 ? [0.4, 0.3, 0.21, 0.5, 1.3, 0.4] : [0.4, 0, 0.8, 1.5, 0.2, 0.4],
    hand(s, v, a) {
      const state = carriageAt(s, v, a);
      return new Map<typeof carriage, HandBody>([
        [carriage, { ...state.origin, angle: handScalar(heading) }],
        [assembly.barrel, { ...state.origin, angle: state.angle }],
        [assembly.rod, handOffset(handPoint(eye.x, eye.y), state.angle, { x: -rodLength, y: 0 })],
      ]);
    },
  };
}
