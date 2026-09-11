import { BodyFactory } from '../../app/model/body-system/body-factory';
import { newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { MaterialBody } from '../../app/model/body-system/material-body';

/** A horizontal slot on a vertical carriage reads y=r sin(theta), with a passive upper travel bound. */
export function nativeRotaryCarriage() {
  const f = new BodyFactory(),
    radius = 0.8,
    angle = 0.4;
  const crank = f.body('Crank', { x: 0, y: 0, angle }, [
    { x: 0, y: 0 },
    { x: radius, y: 0 },
  ]);
  const body = f.document.bodies.find((item) => item.id === crank)! as MaterialBody;
  if (body.geometry.kind !== 'bar') throw new Error('Expected crank');
  const origin = f.vertexAttachment(crank, body.geometry.vertices[0].id);
  const tip = f.vertexAttachment(crank, body.geometry.vertices[1].id);
  const pin = f.joint('revolute', f.attachment(WORLD, { x: 0, y: 0 }), origin);
  const y = radius * Math.sin(angle);
  const carriage = f.body('Vertical carriage', { x: 0, y, angle: 0 }, [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ]);
  const mouth = f.attachment(carriage, { x: 0, y: 0 });
  const guide = f.joint('prismatic', f.attachment(WORLD, { x: 0, y: 0 }), mouth, Math.PI / 2);
  f.joint('pin-in-slot', mouth, tip, 0);
  const driver = {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: pin.id, coordinate: 'angle' as const },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
  const limit = {
    id: newRecordId<'limit'>(),
    coordinate: { jointId: guide.id, coordinate: 'travel' as const },
    lower: -1.5 - y,
    upper: 0.95 - y,
  };
  return {
    document: { ...f.document, drivers: [driver], limits: [limit] },
    crank,
    carriage,
    tip,
    driver,
  };
}
