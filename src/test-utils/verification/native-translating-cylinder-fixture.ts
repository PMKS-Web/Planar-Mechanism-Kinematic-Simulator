import { BodyFactory } from '../../app/model/body-system/body-factory';
import { createBodyCylinder } from '../../app/model/body-system/cylinder-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { handPoint, handScalar, HandBody, NativeCylinderExample } from './native-cylinder-example';

/** Driving the bracket changes a passive cylinder's extension until its own stop is reached. */
export function nativeTranslatingCylinder(
  reverseAxis = false,
  bracketFirst = false
): NativeCylinderExample {
  const heading = 0.7,
    ux = Math.cos(heading),
    uy = Math.sin(heading),
    initial = 0.8,
    length = 3.8,
    origin = { x: 1, y: -2 };
  const makeBracket = (f: BodyFactory) =>
    f.body('translating bracket', { ...origin, angle: heading }, [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
  const first = new BodyFactory(),
    early = bracketFirst ? makeBracket(first) : undefined;
  const cylinder = createBodyCylinder(
    first.document,
    { ...origin, angle: heading },
    { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
    initial
  );
  const f = new BodyFactory(cylinder.document),
    assembly = cylinder.assembly,
    bracket = early ?? makeBracket(f);
  const at = f.attachment(bracket, { x: 0, y: 0 });
  f.joint('weld', at, assembly.barrelMount);
  const guide = f.joint(
    'prismatic',
    f.attachment(WORLD, origin),
    at,
    heading + (reverseAxis ? Math.PI : 0)
  );
  f.joint(
    'revolute',
    f.attachment(WORLD, { x: origin.x + length * ux, y: origin.y + length * uy }),
    assembly.rodMount
  );
  const witness = f.attachment(bracket, { x: 0.4, y: 1 });
  const sign = reverseAxis ? -1 : 1;
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: guide.id, coordinate: 'travel' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: sign * 0.2 },
  };
  return {
    document: { ...f.document, drivers: [driver] },
    assembly,
    driver,
    witness,
    bodyCount: 4,
    jointCount: 4,
    unknownCount: 2,
    commands: [0, 0.3, 0.7, -0.6, 0].map((s) => s * sign),
    hand(command, velocity, acceleration) {
      const s = sign * command,
        v = sign * velocity,
        a = sign * acceleration;
      const moving = {
        ...handPoint(origin.x + s * ux, origin.y + s * uy, v * ux, v * uy, a * ux, a * uy),
        angle: handScalar(heading),
      };
      const rod = {
        ...handPoint(origin.x + (length - 2) * ux, origin.y + (length - 2) * uy),
        angle: handScalar(heading),
      };
      return new Map<typeof bracket, HandBody>([
        [bracket, moving],
        [assembly.barrel, moving],
        [assembly.rod, rod],
      ]);
    },
  };
}
