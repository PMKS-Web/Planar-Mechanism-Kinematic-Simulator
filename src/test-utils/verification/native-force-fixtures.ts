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
