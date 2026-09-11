import { BodyFactory } from '../../app/model/body-system/body-factory';
import { localToWorld, Pose } from '../../app/model/body-system/body-frame';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { emptyBodyDocument } from '../../app/model/body-system/body-document';
import { BodyUnits, SI_UNITS, unitFactors } from '../../app/model/body-system/body-units';

/** Two independent loaded cranks share a material frame held by two distinct ground pins. */
export function nativeTwinCranksOnPinnedFrame(size = 1, offset = 0, units: BodyUnits = SI_UNITS) {
  const factors = unitFactors(units);
  const length = size / factors.length,
    origin = offset / factors.length;
  const f = new BodyFactory(emptyBodyDocument(units));
  const pose: Pose = { x: origin, y: -origin, angle: 0.4 };
  const frame = f.body(
    'shared frame',
    pose,
    [
      { x: 0, y: 0 },
      { x: 4 * length, y: 0 },
    ],
    0.1 / factors.length
  );
  const supports = [0, 4].map((x) =>
    f.joint(
      'revolute',
      f.attachment(WORLD, localToWorld(pose, { x: x * length, y: 0 })),
      f.attachment(frame, { x: x * length, y: 0 })
    )
  );
  const cranks = [1, 3].map((x, i) => {
    const local = { x: x * length, y: 0 };
    const body = f.body(
      `crank ${i + 1}`,
      { ...localToWorld(pose, local), angle: i ? 1.1 : -0.3 },
      [
        { x: 0, y: 0 },
        { x: length, y: 0 },
      ],
      0.1 / factors.length
    );
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
    bodies: f.document.bodies.map((body) =>
      body.kind === 'material'
        ? {
            ...body,
            mass: { ...body.mass, mass: { mode: 'explicit' as const, value: 1 / factors.mass } },
          }
        : body
    ),
    drivers: cranks.map((crank) => crank.driver),
    forces: cranks.map((crank, i) => ({
      id: newRecordId<'force'>(),
      bodyId: crank.body,
      point: { x: length, y: 0 },
      vector: { x: 0, y: (-(i + 1) * 10) / factors.force },
      couple: 0,
      frame: 'world' as const,
      label: `crank ${i + 1} tip load`,
    })),
  };
  return { document, frame, supports, cranks };
}

/** Independently grounded material must not share force availability through WORLD, even at one visible point. */
export function nativeSeparateFoundations(spacing = 10) {
  const f = new BodyFactory();
  const foundations = [0, 1].map((i) => {
    const pose = { x: i * spacing, y: 0, angle: i * 0.3 };
    const body = f.body(`foundation ${i + 1}`, pose, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const support = f.joint('weld', f.attachment(WORLD, pose), f.attachment(body, { x: 0, y: 0 }));
    const mount = localToWorld(pose, { x: 1, y: 0 }),
      angle = 0.4 + i * 0.3;
    const crank = f.body(`loaded crank ${i + 1}`, { ...mount, angle }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const pin = f.joint(
      'revolute',
      f.attachment(body, { x: 1, y: 0 }),
      f.attachment(crank, { x: 0, y: 0 })
    );
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: pin.id, coordinate: 'angle' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: i ? -2 : 1 },
    };
    return { body, support, crank, pin, driver, pose, angle, mass: i + 1 };
  });
  const document = {
    ...f.document,
    bodies: f.document.bodies.map((body) => {
      const foundation = foundations.find((item) => item.body === body.id);
      return foundation && body.kind === 'material'
        ? {
            ...body,
            mass: { ...body.mass, mass: { mode: 'explicit' as const, value: foundation.mass } },
          }
        : body;
    }),
    drivers: foundations.map((item) => item.driver),
    forces: foundations.map((item) => ({
      id: newRecordId<'force'>(),
      bodyId: item.crank,
      point: { x: 1, y: 0 },
      vector: { x: 0, y: -10 },
      couple: 0,
      frame: 'world' as const,
      label: 'tip load',
    })),
  };
  return { document, foundations };
}
