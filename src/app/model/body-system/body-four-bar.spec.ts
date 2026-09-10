import { BodyFactory } from './body-factory';
import { BodyDocument } from './body-document';
import { newRecordId, WORLD } from './body-id';
import { compileBodyDocument } from './constraint-compiler';
import { localToWorld, Point } from './body-frame';
import { relaxBodyPosition } from './body-position-solver';

function couplerPin(angle: number): Point {
  const b = { x: Math.cos(angle), y: Math.sin(angle) };
  const dx = 4 - b.x,
    dy = -b.y,
    span = Math.hypot(dx, dy);
  const along = (3 ** 2 - 2 ** 2 + span ** 2) / (2 * span);
  const height = Math.sqrt(3 ** 2 - along ** 2);
  return {
    x: b.x + (along * dx) / span - (height * dy) / span,
    y: b.y + (along * dy) / span + (height * dx) / span,
  };
}

/** Circle intersection is independent of the native residual/Jacobian implementation. */
function fixture() {
  const f = new BodyFactory(),
    angle = 0.7;
  const b = { x: Math.cos(angle), y: Math.sin(angle) },
    c = couplerPin(angle);
  const crank = f.body('crank', { x: 0, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const coupler = f.body('coupler', { ...b, angle: Math.atan2(c.y - b.y, c.x - b.x) }, [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);
  const rocker = f.body('rocker', { x: 4, y: 0, angle: Math.atan2(c.y, c.x - 4) }, [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ]);
  const driveJoint = f.joint(
    'revolute',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(crank, { x: 0, y: 0 })
  );
  const bJoint = f.joint(
    'revolute',
    f.attachment(crank, { x: 1, y: 0 }),
    f.attachment(coupler, { x: 0, y: 0 })
  );
  const witness = f.attachment(coupler, { x: 3, y: 0 });
  f.joint('revolute', witness, f.attachment(rocker, { x: 2, y: 0 }));
  f.joint('revolute', f.attachment(rocker, { x: 0, y: 0 }), f.attachment(WORLD, { x: 4, y: 0 }));
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: driveJoint.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
  const document: BodyDocument = { ...f.document, drivers: [driver] };
  return { document, driver, witness, bJoint };
}

describe('native nonlinear body correction', () => {
  it('matches an independently intersected four-bar with redundant rows and reversed construction arrays', () => {
    const { document, driver, witness, bJoint } = fixture();
    const redundant = {
      ...document,
      joints: [...document.joints, { ...bJoint, id: newRecordId<'joint'>() }],
    };
    for (const candidate of [
      document,
      redundant,
      {
        ...redundant,
        bodies: [...redundant.bodies].reverse(),
        joints: [...redundant.joints].reverse(),
      },
    ]) {
      const compiled = compileBodyDocument(candidate);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
      const system = compiled.system,
        partition = system.partitions[0];
      const seed = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
      for (const angle of [0.3, 0.7, 1.1]) {
        const result = relaxBodyPosition(partition, seed, new Map([[driver.id, angle - 0.7]]));
        if (!result.ok) throw new Error(result.reason);
        const anchor = system.attachments.get(witness)!;
        const actual = localToWorld(result.poses.get(anchor.groupId)!, anchor.point);
        const expected = couplerPin(angle);
        expect(actual.x).toBeCloseTo(expected.x, 8);
        expect(actual.y).toBeCloseTo(expected.y, 8);
      }
    }
  });
});
