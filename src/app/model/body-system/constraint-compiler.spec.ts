import { BodyFactory } from './body-factory';
import { BodyDocument, emptyBodyDocument } from './body-document';
import { BodyId, newRecordId, WORLD } from './body-id';
import { compileBodyDocument } from './constraint-compiler';
import { bodyRowValue } from './body-constraint-rows';
import { createBodyCylinder } from './cylinder-factory';
import { BodyUnits } from './body-units';
import { rebaseBody } from './rebase-body';

function compiled(document: BodyDocument) {
  const result = compileBodyDocument(document);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.system;
}
function bar(f: BodyFactory, x: number) {
  return f.body('bar', { x, y: 0, angle: 0 }, [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ]);
}

describe('native constraint compilation', () => {
  it('keeps two grounded cranks as distinct partitions and retains an unconnected material body', () => {
    const f = new BodyFactory();
    const ids = [bar(f, 0), bar(f, 4)];
    for (const [i, id] of ids.entries())
      f.joint(
        'revolute',
        f.attachment(WORLD, { x: i * 4, y: 0 }),
        f.attachment(id, { x: 0, y: 0 })
      );
    const loose = bar(f, 9);
    const system = compiled(f.document);
    expect(system.partitions.length).toBe(3);
    for (const id of ids) {
      const partition = system.partitions.find((part) => part.materialIds.includes(id))!;
      expect(partition.unknowns).toEqual([id]);
      expect(partition.boundary).toEqual([WORLD]);
      expect(partition.rows.length).toBe(2);
    }
    expect(system.partitions.find((part) => part.materialIds.includes(loose))!.rows).toEqual([]);
    expect(f.document.bodies.length).toBe(4);
  });

  it('converts cylinder travel, passive bounds and commands to SI once in each document unit', () => {
    for (const [unit, length] of [
      ['m', 1],
      ['cm', 0.01],
      ['in', 0.0254],
    ] as const) {
      const units: BodyUnits = { length: unit, mass: 'kg', inertia: 'kg*m2', force: 'N' };
      const { document, assembly } = createBodyCylinder(
        emptyBodyDocument(units),
        { x: 3, y: -2, angle: 0.7 },
        { barrelLength: 3, rodLength: 2, stroke: 1.5, bore: 0.4, rodDiameter: 0.2 },
        0.7
      );
      const driven: BodyDocument = {
        ...document,
        drivers: [
          {
            id: newRecordId<'driver'>(),
            coordinate: { jointId: assembly.internalJoint, coordinate: 'travel' },
            profile: { kind: 'constant-speed', initial: 0.7, speed: -0.2 },
          },
        ],
      };
      const system = compiled(driven),
        partition = system.partitions[0];
      const poses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
      expect(partition.unknowns.length).toBe(2);
      expect(partition.limits.length).toBe(1);
      expect(partition.limits[0].upper).toBeCloseTo(1.5 * length, 12);
      expect(bodyRowValue(partition.limits[0].row, poses)).toBeCloseTo(0.7 * length, 12);
      expect(partition.drivers[0].speed).toBeCloseTo(-0.2 * length, 12);
      const commands = new Map(partition.drivers.map((driver) => [driver.id, driver.initial]));
      for (const row of partition.rows)
        expect(bodyRowValue(row, poses, commands)).toBeCloseTo(0, 12);
    }
  });

  it('keeps internal fixed joint rows, drives and passive limits after welding both members to WORLD', () => {
    const f = new BodyFactory();
    const a = bar(f, 0),
      b = bar(f, 2);
    const aa = f.attachment(a, { x: 0, y: 0 }),
      ab = f.attachment(b, { x: -2, y: 0 });
    const p = f.joint('prismatic', aa, ab);
    f.joint('weld', aa, ab);
    f.joint('weld', f.attachment(WORLD, { x: 0, y: 0 }), aa);
    const document: BodyDocument = {
      ...f.document,
      drivers: [
        {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: p.id, coordinate: 'travel' },
          profile: { kind: 'constant-speed', initial: 0, speed: 1 },
        },
      ],
      limits: [
        {
          id: newRecordId<'limit'>(),
          coordinate: { jointId: p.id, coordinate: 'travel' },
          lower: 2,
          upper: 3,
        },
      ],
    };
    const system = compiled(document);
    expect(system.partitions).toEqual([]);
    expect(system.fixedRows.length).toBe(3);
    expect(system.fixedDrivers.length).toBe(1);
    expect(system.fixedLimits.length).toBe(1);
    expect(system.fixedDrivers[0].speed).toBe(1);
    expect(
      bodyRowValue(system.fixedLimits[0].row, new Map([[WORLD, system.groups.get(WORLD)!.pose]]))
    ).toBe(0);
    // Admission must still refuse these frozen, conflicting coordinates; compilation retains the evidence.
    expect(system.fixedLimits[0].lower).toBe(2);
  });

  it('does not silently repair a member pose that disagrees with its weld rest', () => {
    const f = new BodyFactory();
    const a = bar(f, 0),
      b = bar(f, 2);
    f.joint('weld', f.attachment(a, { x: 0, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
    const document = {
      ...f.document,
      bodies: f.document.bodies.map((body) =>
        body.id === b
          ? {
              ...body,
              pose: { ...body.pose, y: 1 },
            }
          : body
      ),
    };
    expect(compileBodyDocument(document)).toMatchObject({
      ok: false,
      issues: [{ code: 'inconsistent-weld-pose' }],
    });
  });

  it('keeps condensed coordinates through material rebasing and enumeration permutations', () => {
    const { document, assembly } = createBodyCylinder(
      emptyBodyDocument(),
      { x: 1, y: 2, angle: -0.6 },
      { barrelLength: 3, rodLength: 2, stroke: 1.5, bore: 0.4, rodDiameter: 0.2 },
      0.8
    );
    const changed = rebaseBody(
      rebaseBody(document, assembly.barrel, { x: 4, y: -2, angle: 0.9 }),
      assembly.rod,
      { x: -3, y: 5, angle: -0.3 }
    );
    for (const source of [
      document,
      changed,
      { ...changed, bodies: [...changed.bodies].reverse(), joints: [...changed.joints].reverse() },
    ]) {
      const system = compiled(source),
        poses = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
      expect(bodyRowValue(system.coordinates[0].row, poses)).toBeCloseTo(0.8, 11);
      for (const row of system.partitions[0].rows)
        expect(bodyRowValue(row, poses)).toBeCloseTo(0, 11);
    }
  });
});
