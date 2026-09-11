import { either, finite, id, list, literal, object, pose, text } from './shape';

const frame = object({ attachmentId: id, angle: finite });
const pair = { id, label: text(), bodyA: id, bodyB: id, frameA: frame, frameB: frame };
export const joint = either(
  object({ ...pair, kind: literal('revolute'), angleZero: finite }),
  object({ ...pair, kind: literal('weld'), rest: pose }),
  object(
    { ...pair, kind: literal('prismatic', 'pin-in-slot'), angleZero: finite, travelZero: finite },
    {
      guideDisplay: object({ bodyId: id, frame, from: finite, to: finite }),
    }
  )
);
export const coordinate = object({ jointId: id, coordinate: literal('angle', 'travel') });
export const junction = object({ id, hub: id, attachments: list(id), joints: list(id) });
export const driver = object({
  id,
  coordinate,
  profile: object({ kind: literal('constant-speed'), initial: finite, speed: finite }),
});
export const limit = object({ id, coordinate, lower: finite, upper: finite });
export const hold = object({ bodyId: id, from: id, to: id }, { length: finite, angle: finite });
export const assembly = object({
  id,
  kind: literal('cylinder'),
  label: text(),
  barrel: id,
  rod: id,
  internalJoint: id,
  barrelMount: id,
  rodMount: id,
  strokeLimit: id,
  dimensions: object({
    barrelLength: finite,
    rodLength: finite,
    bore: finite,
    rodDiameter: finite,
  }),
});
