import { BodyDriver } from '../../app/model/body-system/body-document';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { AttachmentId, BodyId, WORLD, newRecordId } from '../../app/model/body-system/body-id';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { legacyProductionSettings } from '../../app/services/transcoding/legacy-production-settings';
import { LINK_TYPE } from '../../app/services/transcoding/transcoder-data';

/** Explicit counterparts of the two remaining S0 templates; no development decoder is added. */
export function nativeShellMultiple(key: 'Scotch_Yoke' | 'Three_Machines') {
  const reader = new StringTranscoder();
  reader.decodeURL(TEMPLATE_LINKAGES[key]);
  const base = legacyProductionSettings(reader);
  const size = key === 'Scotch_Yoke' ? 0.2345 : 0.7;
  const f = new BodyFactory({ ...base, settings: { ...base.settings, objectScale: size } });
  const pins = reader.getJoints();
  const at = (id: string) => {
    const point = pins.find((pin) => pin.id === id)!;
    return { x: point.x, y: point.y };
  };
  const members = reader.getLinks().filter((link) => link.type === LINK_TYPE.REAL);
  const bodies = new Map<string, BodyId>();
  for (const link of members)
    bodies.set(
      link.id,
      f.body(
        link.name,
        { x: 0, y: 0, angle: 0 },
        [at(link.jointIDs[0]), at(link.jointIDs[1])],
        size * 0.5
      )
    );
  const points = new Map<string, AttachmentId>();
  const point = (body: BodyId, id: string) => {
    const key = `${body}/${id}`;
    if (!points.has(key)) points.set(key, f.attachment(body, at(id), id));
    return points.get(key)!;
  };
  for (const link of members) for (const pin of link.jointIDs) point(bodies.get(link.id)!, pin);
  const drivers: BodyDriver[] = [];
  for (const pin of pins) {
    const incident = members
      .filter((link) => link.jointIDs.includes(pin.id))
      .map((link) => bodies.get(link.id)!);
    if (pin.isGrounded && incident.length) incident.unshift(WORLD);
    for (const body of incident.slice(1)) {
      const joint = f.joint('revolute', point(incident[0], pin.id), point(body, pin.id));
      if (pin.isInput)
        drivers.push({
          id: newRecordId<'driver'>(),
          coordinate: { jointId: joint.id, coordinate: 'angle' as const },
          profile: {
            kind: 'constant-speed' as const,
            initial: 0,
            speed: pin.driveSpeed
              ? (pin.driveSpeed * Math.PI) / 30
              : base.settings.defaultDrive.angular,
          },
        });
    }
  }
  if (key === 'Scotch_Yoke') {
    const yoke = bodies.get('CD')!,
      crank = bodies.get('AB')!;
    const guide = f.joint('prismatic', point(WORLD, 'C'), point(yoke, 'C'));
    const slot = f.joint('pin-in-slot', point(yoke, 'C'), point(crank, 'B'), Math.PI / 2);
    const doc = f.document;
    return finish({
      ...doc,
      joints: doc.joints.map((joint) =>
        joint.id === slot.id && joint.kind === 'pin-in-slot'
          ? {
              ...joint,
              label: 'B',
              guideDisplay: {
                bodyId: yoke,
                frame: joint.frameA,
                from: 0,
                to: at('D').y - at('C').y,
              },
            }
          : joint.id === guide.id
            ? { ...joint, label: 'C' }
            : joint
      ),
    });
  }
  // The public GP is a massless Slide. The pin-in-slot carries the same two-body constraint directly.
  f.joint('pin-in-slot', point(WORLD, 'G'), point(bodies.get('FG')!, 'G'));
  return finish(f.document);

  function finish(document: typeof f.document) {
    return {
      ...document,
      drivers,
      attachments: document.attachments.map((point) => ({
        ...point,
        trace: !!pins.find((pin) => pin.id === point.label)?.showCurve,
      })),
      bodies: document.bodies.map((body) => {
        if (body.kind === 'world') return body;
        const link = members.find((link) => bodies.get(link.id) === body.id)!;
        return {
          ...body,
          mass: { ...body.mass, mass: { mode: 'explicit' as const, value: link.mass } },
          presentation: { ...body.presentation, fill: link.color },
        };
      }),
    };
  }
}
