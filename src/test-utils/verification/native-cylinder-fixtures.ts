import { BodyFactory } from '../../app/model/body-system/body-factory';
import { BodyDocument, emptyBodyDocument } from '../../app/model/body-system/body-document';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { createBodyCylinder } from '../../app/model/body-system/cylinder-factory';
import { localToWorld } from '../../app/model/body-system/body-frame';

/** Both the ram and carriage keep authored geometry; their mounts are ordinary relationships. */
export function nativeAxialCarriage(
  connection: 'revolute' | 'weld' = 'revolute',
  angle = 0.4,
  barrelConnection: 'revolute' | 'weld' = 'weld'
) {
  const origin = { x: 1, y: -2, angle },
    initial = 0.4;
  const { document: cylinder, assembly } = createBodyCylinder(
    emptyBodyDocument(),
    origin,
    { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
    initial
  );
  const f = new BodyFactory(cylinder);
  f.joint(barrelConnection, f.attachment(WORLD, origin), assembly.barrelMount);
  const mount = localToWorld(origin, { x: 3 + initial, y: 0 });
  const carriage = f.body(
    'carriage',
    { ...mount, angle: angle + 0.3 },
    [
      { x: -0.5, y: 0 },
      { x: 0.5, y: 0 },
    ],
    0.6
  );
  const attachment = f.attachment(carriage, { x: 0, y: 0 });
  f.joint(connection, assembly.rodMount, attachment);
  const guide = f.joint('prismatic', f.attachment(WORLD, mount), attachment, angle);
  const witness = f.attachment(carriage, { x: 0.7, y: 0.6 });
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: assembly.internalJoint, coordinate: 'travel' as const },
    profile: { kind: 'constant-speed' as const, initial, speed: 0.2 },
  };
  const document: BodyDocument = { ...f.document, drivers: [driver] };
  return { document, assembly, carriage, guide, witness, origin, driver };
}
