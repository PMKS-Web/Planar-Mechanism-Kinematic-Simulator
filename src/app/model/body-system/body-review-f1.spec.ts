import { localToWorld } from './body-frame';
import { captureLoadScope } from './load-provenance';
import { BodyFactory } from './body-factory';
import { BodyDocument } from './body-document';
import { newRecordId } from './body-id';
import { compileWeldGroups, groupPoseSI } from './weld-groups';
import { validateBodyDocument } from './body-validation';

describe('F1 native model counterexamples', () => {
  function pair() {
    const f = new BodyFactory();
    const a = f.body('carrier', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const b = f.body('rider', { x: 2, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const aa = f.attachment(a, { x: 0, y: 0 });
    const ab = f.attachment(b, { x: -2, y: 0 });
    return { f, a, b, aa, ab };
  }

  it('does not let a freely rotating rider own the visible slot', () => {
    const { f, b, aa, ab } = pair();
    const slot = f.joint('pin-in-slot', aa, ab);
    const document = {
      ...f.document,
      joints: [{ ...slot, guideDisplay: { bodyId: b, frame: slot.frameB, from: -1, to: 1 } }],
    };
    expect(validateBodyDocument(document).some((issue) => issue.code === 'invalid-guide')).toBe(
      true
    );
  });

  it('retains a zero-mass material display center after group compilation', () => {
    const { f, a } = pair();
    const document: BodyDocument = {
      ...f.document,
      bodies: f.document.bodies.map((body) =>
        body.id !== a || body.kind !== 'material'
          ? body
          : {
              ...body,
              geometry: { kind: 'circle', center: { x: 3, y: 4 }, radius: 1 },
              mass: { ...body.mass, mass: { mode: 'explicit', value: 0 } },
            }
      ),
    };
    const result = compileWeldGroups(document);
    if (!result.ok) throw new Error(result.code);
    expect(result.groupOf.get(a)!.mass.displayCenter).toEqual({ x: 3, y: 4 });
    expect(result.groupOf.get(a)!.mass.center).toBeNull();
  });

  it('refuses a legacy group load when the relative material placement changes', () => {
    const { f, a, b, aa, ab } = pair();
    f.joint('weld', aa, ab);
    const compiled = compileWeldGroups(f.document);
    if (!compiled.ok) throw new Error(compiled.code);
    const force = {
      id: newRecordId<'force'>(),
      bodyId: a,
      point: { x: 3, y: 0 },
      vector: { x: 0, y: -10 },
      frame: 'world' as const,
      label: 'imported',
      couple: 0,
      legacyGroupScope: captureLoadScope(compiled.groupOf.get(a)!, a, [a, b]),
    };
    const document = { ...f.document, forces: [force] };
    expect(validateBodyDocument(document)).toEqual([]);
    const reshaped = {
      ...document,
      joints: document.joints.map((joint) =>
        joint.kind !== 'weld' ? joint : { ...joint, rest: { ...joint.rest, angle: Math.PI / 2 } }
      ),
    };
    expect(
      validateBodyDocument(reshaped).some((issue) => issue.code === 'load-scope-changed')
    ).toBe(true);
    expect(
      validateBodyDocument({
        ...reshaped,
        drivers: [
          {
            id: newRecordId<'driver'>(),
            coordinate: { jointId: newRecordId<'joint'>(), coordinate: 'angle' },
            profile: { kind: 'constant-speed', initial: 0, speed: 1 },
          },
        ],
      }).some((issue) => issue.code === 'load-scope-changed')
    ).toBe(true);
  });

  it('refuses a zero-length authored bar before adding it to the candidate', () => {
    const f = new BodyFactory();
    const before = f.document;
    expect(() =>
      f.body('zero', { x: 0, y: 0, angle: 0 }, [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ])
    ).toThrow();
    expect(f.document).toBe(before);
  });

  it('refuses a new P or slot whose pin is off the guide line', () => {
    for (const kind of ['prismatic', 'pin-in-slot'] as const) {
      const { f, b, aa } = pair();
      const ab = f.attachment(b, { x: 0, y: 1 });
      const before = f.document;
      expect(() => f.joint(kind, aa, ab, 0)).toThrow();
      expect(f.document).toBe(before);
    }
  });

  it('returns a typed refusal for an unsupported material mass distribution', () => {
    const { f, a } = pair();
    const document: BodyDocument = {
      ...f.document,
      bodies: f.document.bodies.map((body) =>
        body.id !== a || body.kind !== 'material'
          ? body
          : { ...body, mass: { ...body.mass, mass: { mode: 'density', value: 1 } } }
      ),
    };
    expect(() => compileWeldGroups(document)).not.toThrow();
    expect(compileWeldGroups(document)).toMatchObject({ ok: false, code: 'invalid-properties' });
  });

  it('returns a typed refusal for a group override in a foreign frame', () => {
    const { f, a, b } = pair();
    const document = {
      ...f.document,
      groups: [
        {
          members: [a],
          frameBody: b,
          mass: { mass: 2, center: { point: { x: 0, y: 0 }, editAnchor: 'body' as const } },
        },
      ],
    };
    expect(() => compileWeldGroups(document)).not.toThrow();
    expect(compileWeldGroups(document)).toMatchObject({
      ok: false,
      code: 'invalid-group-annotation',
    });
  });
  it('transforms a centimeter document mass center to world SI exactly once', () => {
    const { f, a } = pair();
    const document: BodyDocument = {
      ...f.document,
      units: { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' },
      bodies: f.document.bodies.map((body) =>
        body.id !== a || body.kind !== 'material'
          ? body
          : {
              ...body,
              pose: { x: 100, y: -200, angle: Math.PI / 2 },
              geometry: { kind: 'circle', center: { x: 30, y: 40 }, radius: 10 },
              mass: { ...body.mass, mass: { mode: 'explicit', value: 2000 } },
            }
      ),
    };
    const result = compileWeldGroups(document);
    if (!result.ok) throw new Error(result.code);
    const group = result.groupOf.get(a)!;
    expect(group.mass.mass).toBe(2);
    expect(group.mass.center).toEqual({ x: 0.3, y: 0.4 });
    const center = localToWorld(groupPoseSI(group, document.units), group.mass.center!);
    expect(center.x).toBeCloseTo(0.6, 12);
    expect(center.y).toBeCloseTo(-1.7, 12);
    expect(group.mass.inertia).toBeCloseTo(0.01, 12);
  });

  it('does not hide a negative member mass behind a positive group sum', () => {
    const { f, a, aa, ab } = pair();
    f.joint('weld', aa, ab);
    const document: BodyDocument = {
      ...f.document,
      bodies: f.document.bodies.map((body) =>
        body.id !== a || body.kind !== 'material'
          ? body
          : {
              ...body,
              mass: {
                ...body.mass,
                mass: { mode: 'explicit', value: -0.5 },
                inertia: { mode: 'explicit', value: 1 },
              },
            }
      ),
    };
    expect(compileWeldGroups(document)).toMatchObject({ ok: false, code: 'invalid-properties' });
  });
});
