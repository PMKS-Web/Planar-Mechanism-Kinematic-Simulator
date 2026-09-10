import { nativeFourBar } from './native-body-fixtures';
import { compose, worldToLocal } from '../../app/model/body-system/body-frame';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { BodyDocument, emptyBodyDocument } from '../../app/model/body-system/body-document';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { BodyUnits, SI_UNITS, unitFactors } from '../../app/model/body-system/body-units';

/** Two-meter, two-kilogram slender rod, with a 10 N tip load and a 3 N·m applied couple. */
export function nativeLoadedRod(
  units: BodyUnits = SI_UNITS,
  forceFrame: 'world' | 'body' = 'world'
) {
  const factors = unitFactors(units),
    angle = 0.4;
  const f = new BodyFactory(emptyBodyDocument(units));
  const body = f.body('loaded rod', { x: 0, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: 2 / factors.length, y: 0 },
  ]);
  const pin = f.joint(
    'revolute',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(body, { x: 0, y: 0 })
  );
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: pin.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 3 },
  };
  const document: BodyDocument = {
    ...f.document,
    bodies: f.document.bodies.map((record) =>
      record.kind === 'material'
        ? {
            ...record,
            mass: { ...record.mass, mass: { mode: 'explicit', value: 2 / factors.mass } },
          }
        : record
    ),
    drivers: [driver],
    forces: [
      {
        id: newRecordId<'force'>(),
        bodyId: body,
        point: { x: 2 / factors.length, y: 0 },
        label: 'tip load and couple',
        frame: forceFrame,
        vector: { x: 0, y: -10 / factors.force },
        couple: 3 / (factors.force * factors.length),
      },
    ],
  };
  return { document, body, driver, angle };
}

/** A 3 kg, 1 m slender bracket at (1,1), rotated 0.3 rad in the loaded rod's frame. */
export function nativeWeldedLoadedRod(units: BodyUnits = SI_UNITS) {
  const fixture = nativeLoadedRod(units);
  const factors = unitFactors(units);
  const f = new BodyFactory(fixture.document);
  const relative = { x: 1 / factors.length, y: 1 / factors.length, angle: 0.3 };
  const bracket = f.body(
    'welded bracket',
    compose({ x: 0, y: 0, angle: fixture.angle }, relative),
    [
      { x: 0, y: 0 },
      { x: 1 / factors.length, y: 0 },
    ]
  );
  const weld = f.joint(
    'weld',
    f.attachment(fixture.body, { x: 0, y: 0 }),
    f.attachment(bracket, { x: 0, y: 0 })
  );
  const document: BodyDocument = {
    ...f.document,
    bodies: f.document.bodies.map((body) =>
      body.kind === 'material' && body.id === bracket
        ? { ...body, mass: { ...body.mass, mass: { mode: 'explicit', value: 3 / factors.mass } } }
        : body
    ),
    forces: f.document.forces.map((load) => ({
      ...load,
      bodyId: bracket,
      point: worldToLocal(relative, { x: 2 / factors.length, y: 0 }),
    })),
  };
  return { ...fixture, document, bracket, weld };
}

/** An unloaded welded leaf must not acquire a reaction from the coupler's numerical balance error. */
export function nativeFourBarWithUnloadedWeld() {
  const fixture = nativeFourBar();
  const body = fixture.document.attachments.find((anchor) => anchor.id === fixture.witness)!.bodyId;
  const pose = fixture.document.bodies.find((record) => record.id === body)!.pose;
  const f = new BodyFactory(fixture.document);
  const bracket = f.body('unloaded welded leaf', compose(pose, { x: 0.6, y: 0.8, angle: 0.2 }), [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const weld = f.joint(
    'weld',
    f.attachment(body, { x: 0, y: 0 }),
    f.attachment(bracket, { x: 0, y: 0 })
  );
  const document: BodyDocument = {
    ...f.document,
    forces: [
      {
        id: newRecordId<'force'>(),
        bodyId: body,
        point: { x: 1, y: 0.3 },
        vector: { x: 0.3, y: -0.7 },
        couple: 0.4,
        frame: 'world',
        label: 'coupler load',
      },
    ],
  };
  return { document, body, bracket, weld };
}

/** A rotating carrier guides a tilted carriage whose center pin stays in a horizontal ground slot. */
export function nativeDrivenCarrierCarriage() {
  const f = new BodyFactory(),
    angle = 0.6,
    travel = 1 / Math.sin(angle);
  const carrier = f.body('rotating carrier', { x: 0, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);
  const carriage = f.body(
    'guided carriage',
    { x: travel * Math.cos(angle), y: 1, angle: angle + 0.2 },
    [
      { x: -0.5, y: 0 },
      { x: 0.5, y: 0 },
    ]
  );
  const pivot = f.joint(
    'revolute',
    f.attachment(WORLD, { x: 0, y: 0 }),
    f.attachment(carrier, { x: 0, y: 0 })
  );
  const guide = f.joint(
    'prismatic',
    f.attachment(carrier, { x: 0, y: 0 }),
    f.attachment(carriage, { x: 0, y: 0 }),
    angle
  );
  const slot = f.joint(
    'pin-in-slot',
    f.attachment(WORLD, { x: 0, y: 1 }),
    f.attachment(carriage, { x: 0, y: 0 }),
    0
  );
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: pivot.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 0.8 },
  };
  const document: BodyDocument = {
    ...f.document,
    drivers: [driver],
    bodies: f.document.bodies.map((body) =>
      body.id === carriage && body.kind === 'material'
        ? {
            ...body,
            mass: {
              ...body.mass,
              mass: { mode: 'explicit', value: 2 },
              inertia: { mode: 'explicit', value: 0.3 },
            },
          }
        : body
    ),
  };
  return { document, carrier, carriage, pivot, guide, slot, driver, angle, travel };
}
