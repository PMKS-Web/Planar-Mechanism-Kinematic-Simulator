import { BodyFactory } from '../../app/model/body-system/body-factory';
import { localToWorld, Pose } from '../../app/model/body-system/body-frame';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';

/** Two independent loaded cranks share a material frame held by two distinct ground pins. */
export function nativeTwinCranksOnPinnedFrame(size = 1, offset = 0) {
  const f = new BodyFactory();
  const pose: Pose = { x: offset, y: -offset, angle: 0.4 };
  const frame = f.body('shared frame', pose, [
    { x: 0, y: 0 },
    { x: 4 * size, y: 0 },
  ]);
  const supports = [0, 4].map((x) =>
    f.joint(
      'revolute',
      f.attachment(WORLD, localToWorld(pose, { x: x * size, y: 0 })),
      f.attachment(frame, { x: x * size, y: 0 })
    )
  );
  const cranks = [1, 3].map((x, i) => {
    const local = { x: x * size, y: 0 };
    const body = f.body(`crank ${i + 1}`, { ...localToWorld(pose, local), angle: i ? 1.1 : -0.3 }, [
      { x: 0, y: 0 },
      { x: size, y: 0 },
    ]);
    const pin = f.joint('revolute', f.attachment(frame, local), f.attachment(body, { x: 0, y: 0 }));
    return {
      body,
      pin,
      driver: {
        id: newRecordId<'driver'>(),
        coordinate: { jointId: pin.id, coordinate: 'angle' as const },
        profile: { kind: 'constant-speed' as const, initial: 0, speed: i ? -2 : 1 },
      },
    };
  });
  const document = {
    ...f.document,
    drivers: cranks.map((crank) => crank.driver),
    forces: cranks.map((crank, i) => ({
      id: newRecordId<'force'>(),
      bodyId: crank.body,
      point: { x: size, y: 0 },
      vector: { x: 0, y: -(i + 1) * 10 },
      couple: 0,
      frame: 'world' as const,
      label: `crank ${i + 1} tip load`,
    })),
  };
  return { document, frame, supports, cranks };
}
