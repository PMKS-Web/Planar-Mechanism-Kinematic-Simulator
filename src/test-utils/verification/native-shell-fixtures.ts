import { nativeShellMultiple } from './native-shell-multiple';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { createBodyCylinder } from '../../app/model/body-system/cylinder-factory';
import { cylinderStrokeAlong } from '../../app/model/cylinder';
import { CYLINDER } from '../../app/model/joint-marks';
import { WORLD, newRecordId } from '../../app/model/body-system/body-id';
import { localToWorld } from '../../app/model/body-system/body-frame';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { PRODUCTION_203_PAYLOADS } from './production-203-payloads';
import { readLegacyProduction } from '../../app/services/transcoding/legacy-production-reader';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { legacyProductionSettings } from '../../app/services/transcoding/legacy-production-settings';

/** Explicit S0 boom counterpart. This fixture is not an expansion of the production import boundary. */
export function nativeShellBoom() {
  const reader = new StringTranscoder();
  reader.decodeURL(TEMPLATE_LINKAGES.Cylinder_Boom);
  const decoded = legacyProductionSettings(reader);
  // The unchosen 0.7 size in this old template settles to 0.2661 on staging's first fit.
  // Freeze that visible size alongside the template's existing material lengths and pin pose.
  const size = 0.2661,
    r = size * 0.15;
  const base = { ...decoded, settings: { ...decoded.settings, objectScale: size } };
  const at = (id: string) => {
    const joint = reader.getJoints().find((joint) => joint.id === id)!;
    return { x: joint.x, y: joint.y };
  };
  const ground = at('G'),
    tip = at('C'),
    mouth = at('N'),
    pin = at('P');
  const layout = {
    barrelLength: Math.hypot(mouth.x - ground.x, mouth.y - ground.y),
    rodLength: Math.hypot(tip.x - pin.x, tip.y - pin.y),
    pinFromMount:
      Math.hypot(tip.x - ground.x, tip.y - ground.y) - Math.hypot(tip.x - pin.x, tip.y - pin.y),
    angleRad: Math.atan2(tip.y - ground.y, tip.x - ground.x),
  };
  const bounds = cylinderStrokeAlong(layout.barrelLength, r);
  const pose = { ...ground, angle: layout.angleRad };
  const ram = createBodyCylinder(
    base,
    pose,
    {
      barrelLength: layout.barrelLength,
      rodLength: layout.rodLength,
      bore: 2 * CYLINDER.barrelHalf * r,
      rodDiameter: 2 * CYLINDER.rodHalf * r,
      stroke: bounds.max - bounds.min,
    },
    layout.pinFromMount - bounds.min,
    'GC'
  );
  // The old ram's closed head has a clearance. Keep that datum explicitly in its P frame.
  const internal = ram.document.joints.find((joint) => joint.id === ram.assembly.internalJoint)!;
  const initial = layout.pinFromMount - bounds.min;
  const f = new BodyFactory({
    ...ram.document,
    bodies: ram.document.bodies.map((body) =>
      body.id === ram.assembly.rod
        ? {
            ...body,
            pose: { ...localToWorld(pose, { x: layout.pinFromMount, y: 0 }), angle: pose.angle },
          }
        : body
    ),
    attachments: ram.document.attachments.map((point) =>
      point.id === internal.frameA.attachmentId
        ? { ...point, point: { x: bounds.min, y: 0 } }
        : point
    ),
  });
  const boom = f.body('OC', { x: 0, y: 0, angle: 0 }, [{ x: 0, y: 0 }, tip], size * 0.5);
  const foot = f.attachment(boom, { x: 0, y: 0 }, 'O'),
    end = f.attachment(boom, tip, 'C');
  const joints = [
    [f.joint('revolute', f.attachment(WORLD, { x: 0, y: 0 }), foot).id, 'O'],
    [f.joint('revolute', f.attachment(WORLD, ground), ram.assembly.barrelMount).id, 'G'],
    [f.joint('revolute', end, ram.assembly.rodMount).id, 'C'],
  ];
  const fills = new Map(reader.getLinks().map((link) => [link.id, link.color]));
  const barrelFill = fills.get('GN')!;
  return {
    ...f.document,
    bodies: f.document.bodies.map((body) =>
      body.kind === 'world'
        ? body
        : {
            ...body,
            mass: { ...body.mass, mass: { mode: 'explicit' as const, value: 0 } },
            presentation: {
              ...body.presentation,
              fill: body.id === boom ? fills.get('OC')! : barrelFill,
            },
          }
    ),
    joints: f.document.joints.map((joint) => ({
      ...joint,
      label: joints.find(([id]) => id === joint.id)?.[1] ?? '',
    })),
    drivers: [
      {
        id: newRecordId<'driver'>(),
        coordinate: { jointId: internal.id, coordinate: 'travel' as const },
        profile: { kind: 'constant-speed' as const, initial, speed: -1 },
      },
    ],
  };
}

export const NATIVE_SHELL_FIXTURES = [
  ...(['Scotch_Yoke', 'Three_Machines'] as const).map((key) => ({
    key,
    legacy: TEMPLATE_LINKAGES[key],
    create: () => nativeShellMultiple(key),
  })),
  ...(['4-Bar', 'Slider_Crank'] as const).map((key) => ({
    key,
    legacy: PRODUCTION_203_PAYLOADS[key],
    create: () => {
      const read = readLegacyProduction(PRODUCTION_203_PAYLOADS[key]);
      if (!read.ok) throw new Error(read.message);
      return read.document;
    },
  })),
  { key: 'Cylinder_Boom', legacy: TEMPLATE_LINKAGES.Cylinder_Boom, create: nativeShellBoom },
];
