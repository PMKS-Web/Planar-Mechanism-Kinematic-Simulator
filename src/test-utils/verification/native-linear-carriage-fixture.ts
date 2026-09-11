import { BodyDocument, emptyBodyDocument } from '../../app/model/body-system/body-document';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { BodyUnits, SI_UNITS, unitFactors } from '../../app/model/body-system/body-units';

/** Unbounded oblique translation has an analysis duration, never a periodic return or physical stop. */
export function nativeLinearCarriage(speed = 0.3, units: BodyUnits = SI_UNITS) {
  const factor = unitFactors(units).length,
    angle = 0.4;
  const f = new BodyFactory(emptyBodyDocument(units));
  const origin = { x: 2 / factor, y: -1 / factor, angle };
  const body = f.body('linear carriage', origin, [
    { x: -0.5 / factor, y: 0 },
    { x: 0.5 / factor, y: 0 },
  ]);
  const guide = f.joint(
    'prismatic',
    f.attachment(WORLD, origin),
    f.attachment(body, { x: 0, y: 0 }),
    angle
  );
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: guide.id, coordinate: 'travel' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: speed / factor },
  };
  const document: BodyDocument = { ...f.document, drivers: [driver] };
  return { document, body, guide, driver, angle };
}
