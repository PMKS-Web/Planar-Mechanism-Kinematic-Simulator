import { areaProperties, resolveMass } from './body-properties';
import { BodyFactory } from './body-factory';
import { newRecordId } from './body-id';
import { BodyUnits, SI_UNITS } from './body-units';
import { compileWeldGroups } from './weld-groups';
import { localToWorld } from './body-frame';
import { validateBodyDocument } from './body-validation';

describe('native material properties', () => {
  it('preserves the slender-bar idealization independently of the visible width', () => {
    const f = new BodyFactory();
    const id = f.body('bar', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);
    const body = f.document.bodies.find((item) => item.id === id)!;
    if (body.kind !== 'material' || body.geometry.kind !== 'bar') throw new Error('Expected bar');
    for (const width of [0.01, 0.1, 10]) {
      const result = resolveMass(
        {
          ...body,
          geometry: { ...body.geometry, width },
          mass: { ...body.mass, mass: { mode: 'explicit', value: 12 } },
        },
        { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' }
      );
      // 12 g at length 5 cm: 0.012 × 0.05² / 12 = 0.0000025 kg·m².
      expect(result.inertia).toBeCloseTo(0.0000025, 14);
      expect(result.center).toEqual({ x: 0.015, y: 0.02 });
    }
  });
  it('keeps material color, shape and load ownership when only a weld is removed', () => {
    const f = new BodyFactory();
    const a = f.body('bracket', { x: 0, y: 0, angle: 0.2 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    const b = f.body('ram', { x: 3, y: 1, angle: 0.7 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    f.joint('weld', f.attachment(a, { x: 0, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
    const force = {
      id: newRecordId<'force'>(),
      bodyId: b,
      label: 'off-axis',
      point: { x: 0.5, y: 1 },
      vector: { x: 3, y: -4 },
      frame: 'body' as const,
      couple: 2,
    };
    const document = {
      ...f.document,
      forces: [force],
      bodies: f.document.bodies.map((body) =>
        body.id !== b || body.kind === 'world'
          ? body
          : { ...body, presentation: { ...body.presentation, fill: '#26a69a' } }
      ),
    };
    const split = { ...document, joints: [] };
    expect(validateBodyDocument(split)).toEqual([]);
    expect(split.bodies).toBe(document.bodies);
    expect(split.forces[0]).toBe(force);
    const body = split.bodies.find((body) => body.id === b)!;
    if (body.kind !== 'material') throw new Error('Expected material');
    expect(body.presentation.fill).toBe('#26a69a');
    expect(body.label).toBe('ram');
    expect(body.geometry.kind).toBe('bar');
    const imported = { ...document, forces: [{ ...force, legacyGroupScope: [a, b] }] };
    expect(validateBodyDocument(imported)).toEqual([]);
    expect(
      validateBodyDocument({ ...imported, joints: [] }).some(
        (issue) => issue.code === 'split-load-scope'
      )
    ).toBe(true);
  });
  it('integrates a rectangle independently of winding or a distant local origin', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ].map((p) => ({ ...p, id: newRecordId<'vertex'>() }));
    for (const offset of [0, 1000000])
      for (const reverse of [false, true]) {
        const points = vertices.map((v) => ({ ...v, x: v.x + offset, y: v.y - offset }));
        const result = areaProperties({
          kind: 'polygon',
          vertices: reverse ? points.reverse() : points,
        });
        expect(result.area).toBe(8);
        expect(result.center).toEqual({ x: offset + 2, y: 1 - offset });
        expect(result.meanSquaredRadius).toBeCloseTo((4 ** 2 + 2 ** 2) / 12, 12);
      }
  });

  it('converts explicit inertia independently of mass in every project unit system', () => {
    const cases: [BodyUnits, number, number][] = [
      [SI_UNITS, 2, 3],
      [{ length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' }, 0.002, 0.0003],
      [
        { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' },
        0.90718474,
        3 * 0.45359237 * 0.0254 ** 2,
      ],
    ];
    for (const [units, expectedMass, expectedInertia] of cases) {
      const resolved = resolveMass(
        {
          geometry: { kind: 'circle', radius: 4, center: { x: 0, y: 0 } },
          mass: {
            mass: { mode: 'explicit', value: 2 },
            inertia: { mode: 'explicit', value: 3 },
            center: { mode: 'automatic' },
          },
        },
        units
      );
      expect(resolved.mass).toBeCloseTo(expectedMass, 12);
      expect(resolved.inertia).toBeCloseTo(expectedInertia, 12);
    }
  });

  it('aggregates with the parallel axis theorem without rewriting the members', () => {
    const f = new BodyFactory();
    const a = f.body('first', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const b = f.body('second', { x: 4, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    f.joint('weld', f.attachment(a, { x: 0, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
    const document = {
      ...f.document,
      bodies: f.document.bodies.map((body) =>
        body.kind === 'world'
          ? body
          : {
              ...body,
              geometry: { kind: 'circle' as const, center: { x: 0, y: 0 }, radius: 1 },
              mass: {
                mass: { mode: 'explicit' as const, value: body.id === a ? 2 : 6 },
                inertia: { mode: 'explicit' as const, value: body.id === a ? 3 : 5 },
                center: { mode: 'automatic' as const },
              },
            }
      ),
    };
    const before = JSON.stringify(document);
    const result = compileWeldGroups(document);
    if (!result.ok) throw new Error(result.code);
    const mass = result.groupOf.get(a)!.materialMass;
    expect(mass.mass).toBe(8);
    const worldCenter = localToWorld(result.groupOf.get(a)!.pose, mass.center!);
    expect(worldCenter.x).toBeCloseTo(3, 12);
    expect(worldCenter.y).toBeCloseTo(0, 12);
    expect(mass.inertia).toBeCloseTo(3 + 5 + 2 * 3 ** 2 + 6 * 1 ** 2, 12);
    expect(JSON.stringify(document)).toBe(before);
    const split = compileWeldGroups({ ...document, joints: [] });
    if (!split.ok) throw new Error(split.code);
    expect(split.groupOf.get(a)!.materialMass.mass).toBe(2);
    expect(split.groupOf.get(b)!.materialMass.mass).toBe(6);
  });

  it('retains explicit aggregate overrides separately from member arithmetic', () => {
    const f = new BodyFactory();
    const a = f.body('first', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const b = f.body('second', { x: 4, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    f.joint('weld', f.attachment(a, { x: 0, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
    const annotation = {
      members: [a, b],
      frameBody: b,
      label: 'Fabrication',
      mass: {
        mass: 12,
        inertia: 17,
        center: { point: { x: -1, y: 2 }, editAnchor: 'grid' as const },
      },
    };
    const document = { ...f.document, groups: [annotation] };
    expect(validateBodyDocument(document)).toEqual([]);
    const result = compileWeldGroups(document);
    if (!result.ok) throw new Error(result.code);
    const group = result.groupOf.get(a)!;
    expect(group.mass.mass).toBe(12);
    expect(group.mass.inertia).toBe(17);
    expect(localToWorld(group.pose, group.mass.center!)).toEqual({ x: 3, y: 2 });
    expect(group.materialMass.mass).toBe(2);
    // An annotation cannot be copied onto an arbitrary surviving piece by a rebuild.
    expect(
      validateBodyDocument({ ...document, joints: [] }).some(
        (issue) => issue.code === 'invalid-group-annotation'
      )
    ).toBe(true);
  });

  it('keeps zero-mass display geometry without fabricating a physical CoM', () => {
    const result = resolveMass(
      {
        geometry: { kind: 'circle', center: { x: 3, y: 4 }, radius: 1 },
        mass: {
          mass: { mode: 'explicit', value: 0 },
          inertia: { mode: 'automatic' },
          center: { mode: 'automatic' },
        },
      },
      SI_UNITS
    );
    expect(result).toEqual({ mass: 0, inertia: 0, center: null, displayCenter: { x: 3, y: 4 } });
  });
});
