import { BodyFactory } from '../../app/model/body-system/body-factory';
import { BodyDocument } from '../../app/model/body-system/body-document';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { Point } from '../../app/model/body-system/body-frame';

export interface FourBarLengths {
  readonly ground: number;
  readonly crank: number;
  readonly coupler: number;
  readonly rocker: number;
}
const FOUR_BAR: FourBarLengths = { ground: 4, crank: 1, coupler: 3, rocker: 2 };

export function nativeFourBarPoint(
  angle: number,
  lengths: FourBarLengths = FOUR_BAR,
  branch: 1 | -1 = 1
): Point {
  const b = { x: lengths.crank * Math.cos(angle), y: lengths.crank * Math.sin(angle) };
  const dx = lengths.ground - b.x,
    dy = -b.y,
    span = Math.hypot(dx, dy);
  const along = (lengths.coupler ** 2 - lengths.rocker ** 2 + span ** 2) / (2 * span);
  const height = branch * Math.sqrt(lengths.coupler ** 2 - along ** 2);
  return {
    x: b.x + (along * dx) / span - (height * dy) / span,
    y: b.y + (along * dy) / span + (height * dx) / span,
  };
}

/** Circle intersection is independent of the native residual/Jacobian implementation. */
export function nativeFourBar(lengths: FourBarLengths = FOUR_BAR, angle = 0.7, branch: 1 | -1 = 1) {
  const f = new BodyFactory();
  const b = { x: lengths.crank * Math.cos(angle), y: lengths.crank * Math.sin(angle) },
    c = nativeFourBarPoint(angle, lengths, branch);
  const crank = f.body('crank', { x: 0, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: lengths.crank, y: 0 },
  ]);
  const coupler = f.body('coupler', { ...b, angle: Math.atan2(c.y - b.y, c.x - b.x) }, [
    { x: 0, y: 0 },
    { x: lengths.coupler, y: 0 },
  ]);
  const rocker = f.body(
    'rocker',
    { x: lengths.ground, y: 0, angle: Math.atan2(c.y, c.x - lengths.ground) },
    [
      { x: 0, y: 0 },
      { x: lengths.rocker, y: 0 },
    ]
  );
  const driveJoint = f.joint(
    'revolute',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(crank, { x: 0, y: 0 })
  );
  const bJoint = f.joint(
    'revolute',
    f.attachment(crank, { x: lengths.crank, y: 0 }),
    f.attachment(coupler, { x: 0, y: 0 })
  );
  const witness = f.attachment(coupler, { x: lengths.coupler, y: 0 });
  f.joint('revolute', witness, f.attachment(rocker, { x: lengths.rocker, y: 0 }));
  f.joint(
    'revolute',
    f.attachment(rocker, { x: 0, y: 0 }),
    f.attachment(WORLD, { x: lengths.ground, y: 0 })
  );
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: driveJoint.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
  const document: BodyDocument = { ...f.document, drivers: [driver] };
  return { document, driver, witness, bJoint };
}

/** The parallel branch has a horizontal coupler and identical crank/rocker angles. */
export function nativeParallelogram() {
  const f = new BodyFactory(),
    angle = 0.7;
  const point = { x: Math.cos(angle), y: Math.sin(angle) };
  const crank = f.body('crank', { x: 0, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const coupler = f.body('coupler', { ...point, angle: 0 }, [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);
  const rocker = f.body('rocker', { x: 3, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const driveJoint = f.joint(
    'revolute',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(crank, { x: 0, y: 0 })
  );
  f.joint('revolute', f.attachment(crank, { x: 1, y: 0 }), f.attachment(coupler, { x: 0, y: 0 }));
  const witness = f.attachment(coupler, { x: 3, y: 0 });
  f.joint('revolute', witness, f.attachment(rocker, { x: 1, y: 0 }));
  f.joint('revolute', f.attachment(rocker, { x: 0, y: 0 }), f.attachment(WORLD, { x: 3, y: 0 }));
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: driveJoint.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
  return { document: { ...f.document, drivers: [driver] }, driver, witness, coupler, rocker };
}
