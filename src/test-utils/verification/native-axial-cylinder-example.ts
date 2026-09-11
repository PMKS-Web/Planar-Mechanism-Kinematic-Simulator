import { nativeAxialCarriage } from './native-cylinder-fixtures';
import { NativeCylinderExample, HandBody, handPoint, handScalar } from './native-cylinder-example';

/** A pinned barrel leaves the guide's transverse reaction determinate under an off-axis load. */
export function nativeAxialCylinderExample(
  connection: 'revolute' | 'weld' = 'revolute',
  heading = 0.4
): NativeCylinderExample {
  const fixture = nativeAxialCarriage(connection, heading, 'revolute'),
    u = { x: Math.cos(heading), y: Math.sin(heading) };
  const { assembly, carriage, origin } = fixture;
  return {
    ...fixture,
    bodyCount: 4,
    jointCount: 4,
    unknownCount: connection === 'weld' ? 2 : 3,
    commands: [0.4, 0, 0.8, 1.5, 0.2, 0.4],
    hand(s, v, a) {
      const point = (length: number) =>
        handPoint(
          origin.x + length * u.x,
          origin.y + length * u.y,
          v * u.x,
          v * u.y,
          a * u.x,
          a * u.y
        );
      return new Map<typeof carriage, HandBody>([
        [assembly.barrel, { ...handPoint(origin.x, origin.y), angle: handScalar(heading) }],
        [assembly.rod, { ...point(1 + s), angle: handScalar(heading) }],
        [carriage, { ...point(3 + s), angle: handScalar(heading + 0.3) }],
      ]);
    },
  };
}
