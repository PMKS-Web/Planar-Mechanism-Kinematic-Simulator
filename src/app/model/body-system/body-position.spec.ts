import { BodyFactory } from './body-factory';
import { BodyDocument } from './body-document';
import { newRecordId, WORLD } from './body-id';
import { compose, localToWorld, rotate } from './body-frame';
import { compileBodyDocument } from './constraint-compiler';
import { relaxBodyPosition } from './body-position-solver';
import { rebaseBody } from './rebase-body';

function compile(document: BodyDocument) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system,
    partition = system.partitions[0];
  const poses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
  return { system, partition, poses };
}

describe('native body position correction', () => {
  it('rotates an offset one-pin rod without deforming its geometry or writing the seed', () => {
    const f = new BodyFactory();
    const id = f.body('crank', { x: 2, y: -1, angle: 0.3 }, [
      { x: -1, y: 0 },
      { x: 3, y: 1 },
    ]);
    const anchor = { x: 0.4, y: -0.7 },
      pivot = localToWorld(f.document.bodies[1].pose, anchor);
    const joint = f.joint('revolute', f.attachment(WORLD, pivot), f.attachment(id, anchor));
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: joint.id, coordinate: 'angle' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
    };
    const document = { ...f.document, drivers: [driver] };
    const { system, partition, poses } = compile(document),
      before = JSON.stringify([...poses]);
    for (const command of [-0.8, 0.2, 1.1, 2 * Math.PI]) {
      const result = relaxBodyPosition(partition, poses, new Map([[driver.id, command]]));
      if (!result.ok) throw new Error(result.reason);
      const group = system.groups.get(system.groupOf.get(id)!)!;
      const pose = compose(result.poses.get(group.id)!, group.members.get(id)!);
      const witness = localToWorld(pose, { x: 3, y: 1 });
      const offset = rotate({ x: 3 - anchor.x, y: 1 - anchor.y }, 0.3 + command);
      expect(pose.angle).toBeCloseTo(0.3 + command, 10);
      expect(witness.x).toBeCloseTo(pivot.x + offset.x, 10);
      expect(witness.y).toBeCloseTo(pivot.y + offset.y, 10);
    }
    expect(JSON.stringify([...poses])).toBe(before);
    expect(f.document.bodies).toBe(document.bodies);
  });

  it('solves a guided carriage at oblique headings, all length scales and arbitrary material origins', () => {
    for (const size of [1e-12, 1e-5, 1, 1e5]) {
      const f = new BodyFactory();
      const heading = 0.7,
        origin = { x: 3 * size, y: -2 * size };
      const id = f.body('carriage', { ...origin, angle: -0.4 }, [
        { x: 0, y: 0 },
        { x: size, y: 0 },
      ]);
      const joint = f.joint(
        'prismatic',
        f.attachment(WORLD, origin),
        f.attachment(id, { x: 0, y: 0 }),
        heading
      );
      const driver = {
        id: newRecordId<'driver'>(),
        coordinate: { jointId: joint.id, coordinate: 'travel' as const },
        profile: { kind: 'constant-speed' as const, initial: 0, speed: size },
      };
      const document = { ...f.document, drivers: [driver] };
      for (const input of [
        document,
        rebaseBody(document, id, { x: 1e4 * size, y: -2e4 * size, angle: 0.9 }),
      ]) {
        const { system, partition, poses } = compile(input);
        const result = relaxBodyPosition(partition, poses, new Map([[driver.id, 2 * size]]), {
          maxIterations: 100,
        });
        if (!result.ok) throw new Error(`${size}: ${result.reason}`);
        const anchor = system.attachments.get(joint.frameB.attachmentId)!;
        const point = localToWorld(result.poses.get(anchor.groupId)!, anchor.point);
        expect((point.x - origin.x) / size).toBeCloseTo(2 * Math.cos(heading), 6);
        expect((point.y - origin.y) / size).toBeCloseTo(2 * Math.sin(heading), 6);
      }
    }
  });

  it('refuses an iteration cap and leaves a failed seed untouched', () => {
    const f = new BodyFactory();
    const id = f.body('body', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const joint = f.joint(
      'prismatic',
      f.attachment(WORLD, { x: 0, y: 0 }),
      f.attachment(id, { x: 0, y: 0 })
    );
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: joint.id, coordinate: 'travel' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
    };
    const { partition, poses } = compile({ ...f.document, drivers: [driver] });
    const before = JSON.stringify([...poses]);
    expect(
      relaxBodyPosition(partition, poses, new Map([[driver.id, 1]]), { maxIterations: 0 })
    ).toMatchObject({ ok: false, reason: 'unsolved' });
    expect(JSON.stringify([...poses])).toBe(before);
  });
});
