import { BodyFactory } from '../../app/model/body-system/body-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { emptyBodyDocument } from '../../app/model/body-system/body-document';
import { BodyUnits, SI_UNITS, unitFactors } from '../../app/model/body-system/body-units';

/** Neither bar is grounded alone; the three pins make their two-body foundation rigid. */
export function nativeTriangleFoundation(size = 1, offset = 0, units: BodyUnits = SI_UNITS) {
  const factors = unitFactors(units),
    length = size / factors.length,
    origin = offset / factors.length;
  const f = new BodyFactory(emptyBodyDocument(units));
  const foundations = [0, 4].map((x, i) => {
    const pose = { x: origin + x * length, y: -origin, angle: 0 };
    const end = { x: (1 - x) * length, y: 2 * length };
    const body = f.body(`triangle side ${i + 1}`, pose, [{ x: 0, y: 0 }, end], 0.1 * length);
    const support = f.joint(
      'revolute',
      f.attachment(WORLD, pose),
      f.attachment(body, { x: 0, y: 0 })
    );
    const mount = { x: end.x / 2, y: end.y / 2 },
      angle = i ? 0.7 : 0.4;
    const crank = f.body(
      `independent crank ${i + 1}`,
      {
        x: pose.x + mount.x,
        y: pose.y + mount.y,
        angle,
      },
      [
        { x: 0, y: 0 },
        { x: length, y: 0 },
      ],
      0.1 * length
    );
    const pin = f.joint('revolute', f.attachment(body, mount), f.attachment(crank, { x: 0, y: 0 }));
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: pin.id, coordinate: 'angle' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: i ? -2 : 1 },
    };
    return { body, support, crank, pin, driver, angle, end };
  });
  const apex = f.joint(
    'revolute',
    f.attachment(foundations[0].body, foundations[0].end),
    f.attachment(foundations[1].body, foundations[1].end)
  );
  const document = {
    ...f.document,
    drivers: foundations.map((item) => item.driver),
    forces: foundations.map((item) => ({
      id: newRecordId<'force'>(),
      bodyId: item.crank,
      point: { x: length, y: 0 },
      vector: { x: 0, y: -10 / factors.force },
      couple: 0,
      frame: 'world' as const,
      label: 'tip load',
    })),
  };
  return { document, foundations, apex };
}

/** Three differently directed RR struts constrain a platform's three planar freedoms. */
export function nativeTripodFoundation() {
  const f = new BodyFactory();
  const platform = f.body('fixed platform', { x: 0, y: 0, angle: 0 }, [
    { x: 0, y: 0 },
    { x: 2, y: 2 },
  ]);
  const supports = [
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ],
    [
      { x: 2, y: -1 },
      { x: 2, y: 0 },
    ],
    [
      { x: -1, y: 1 },
      { x: 0, y: 2 },
    ],
  ].map(([ground, mount], i) => {
    const end = { x: mount.x - ground.x, y: mount.y - ground.y };
    const body = f.body(`support strut ${i + 1}`, { ...ground, angle: 0 }, [{ x: 0, y: 0 }, end]);
    f.joint('revolute', f.attachment(WORLD, ground), f.attachment(body, { x: 0, y: 0 }));
    f.joint('revolute', f.attachment(body, end), f.attachment(platform, mount));
    return body;
  });
  const cranks = [0, 1].map((y) => {
    const mount = { x: 1, y };
    const body = f.body(`platform crank ${y + 1}`, { ...mount, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const joint = f.joint(
      'revolute',
      f.attachment(platform, mount),
      f.attachment(body, { x: 0, y: 0 })
    );
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: joint.id, coordinate: 'angle' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: y ? -2 : 1 },
    };
    return { body, driver };
  });
  return {
    document: { ...f.document, drivers: cranks.map((item) => item.driver) },
    platform,
    supports,
    cranks,
  };
}
