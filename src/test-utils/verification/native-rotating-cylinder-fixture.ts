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

/** A barrel slides perpendicular to a turning carrier while the rod's far eye stays fixed. */
export function nativeRotatingCylinder(carrierFirst = false): NativeCylinderExample {
  const pivot = { x: 1, y: -1 },
    eye = { x: 5, y: 4 },
    offset = { x: 0.4, y: 0.3 },
    initialAngle = -0.1;
  const state = (command: number, w: number, a: number) => {
    const theta = initialAngle + command,
      ux = Math.cos(theta),
      uy = Math.sin(theta),
      nx = -uy,
      ny = ux;
    const t = 4 * ux + 5 * uy,
      length = 4 * nx + 5 * ny,
      tv = length * w,
      ta = length * a - t * w * w;
    const mount = handPoint(
      pivot.x + t * ux,
      pivot.y + t * uy,
      tv * ux + t * w * nx,
      tv * uy + t * w * ny,
      (ta - t * w * w) * ux + (2 * tv * w + t * a) * nx,
      (ta - t * w * w) * uy + (2 * tv * w + t * a) * ny
    );
    return {
      mount,
      angle: handScalar(theta, w, a),
      barrelAngle: handScalar(theta + Math.PI / 2, w, a),
      length,
      t,
    };
  };
  const start = state(0, 0, 0),
    carrierPose = handOffset(handPoint(pivot.x, pivot.y), start.angle, offset);
  const first = new BodyFactory();
  const makeCarrier = (f: BodyFactory) =>
    f.body(
      'rotating carrier',
      { ...carrierPose.point, angle: start.angle.value },
      [
        { x: -offset.x, y: -offset.y },
        { x: 8 - offset.x, y: -offset.y },
      ],
      0.2
    );
  const early = carrierFirst ? makeCarrier(first) : undefined;
  const cylinder = createBodyCylinder(
    first.document,
    { ...start.mount.point, angle: start.barrelAngle.value },
    { barrelLength: 4, rodLength: 3, bore: 0.4, rodDiameter: 0.2, stroke: 2.5 },
    start.length - 4
  );
  const f = new BodyFactory(cylinder.document),
    assembly = cylinder.assembly,
    carrier = early ?? makeCarrier(f);
  const at = f.attachment(carrier, { x: -offset.x, y: -offset.y });
  const pin = f.joint('revolute', f.attachment(WORLD, pivot), at);
  const block = f.body(
    'carrier block',
    { ...start.mount.point, angle: initialAngle },
    [
      { x: -0.4, y: 0 },
      { x: 0.4, y: 0 },
    ],
    0.5
  );
  const blockAt = f.attachment(block, { x: 0, y: 0 });
  // Distinct carrier anchors keep the numerical origin off the pivot after compilation.
  const guideAt = f.attachment(carrier, { x: 1 - offset.x, y: -offset.y });
  const guide = f.joint('prismatic', guideAt, blockAt, initialAngle);
  f.joint('weld', blockAt, assembly.barrelMount);
  f.joint('revolute', f.attachment(WORLD, eye), assembly.rodMount);
  const witness = f.attachment(assembly.barrel, { x: 0.7, y: 0.6 });
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: pin.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 0.2 },
  };
  const limit = {
    id: newRecordId<'limit'>(),
    coordinate: { jointId: guide.id, coordinate: 'travel' as const },
    lower: 0.5 - start.t,
    upper: 6 - start.t,
  };
  return {
    document: { ...f.document, drivers: [driver], limits: [...f.document.limits, limit] },
    assembly,
    driver,
    witness,
    bodyCount: 5,
    jointCount: 5,
    unknownCount: 3,
    commands: [0, 0.1, -0.2, -0.4, 0.15, 0],
    hand(command, v, a) {
      const result = state(command, v, a);
      return new Map<typeof carrier, HandBody>([
        [carrier, handOffset(handPoint(pivot.x, pivot.y), result.angle, offset)],
        [block, { ...result.mount, angle: result.angle }],
        [assembly.barrel, { ...result.mount, angle: result.barrelAngle }],
        [assembly.rod, handOffset(handPoint(eye.x, eye.y), result.barrelAngle, { x: -3, y: 0 })],
      ]);
    },
  };
}
