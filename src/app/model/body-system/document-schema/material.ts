import { WORLD } from '../body-id';
import { boolean, either, finite, id, list, literal, object, point, pose, text } from './shape';

const vertex = object({ id, x: finite, y: finite });
const geometry = either(
  object({ kind: literal('bar'), vertices: list(vertex, 2), width: finite }),
  object({ kind: literal('polygon'), vertices: list(vertex, 4096) }),
  object({ kind: literal('circle'), center: point, radius: finite })
);
const explicit = object({ mode: literal('explicit'), value: finite });
const automatic = object({ mode: literal('automatic') });
export const centerEditAnchor = either(literal('body', 'grid'), object({ attachmentId: id }));
const center = object({ mode: literal('explicit'), point, editAnchor: centerEditAnchor });
export const presentation = object(
  { fill: text(128), hidden: boolean, showCenter: boolean },
  { outline: literal('geometry', 'circle') }
);
export const material = either(
  object({ kind: literal('world'), id: literal(WORLD), pose }),
  object({
    kind: literal('material'),
    id,
    label: text(),
    pose,
    geometry,
    mass: object({
      mass: either(explicit, object({ mode: literal('density'), value: finite })),
      inertia: either(automatic, explicit),
      center: either(automatic, center),
    }),
    presentation,
  })
);
export const attachment = object(
  { id, bodyId: id, point, label: text(), trace: boolean },
  { vertexId: id, color: text(128) }
);
export const group = object(
  { members: list(id), frameBody: id },
  {
    label: text(),
    presentation,
    mass: object(
      {},
      {
        mass: finite,
        inertia: finite,
        center: object({ point, editAnchor: centerEditAnchor }),
      }
    ),
  }
);
export const load = object(
  {
    id,
    bodyId: id,
    point,
    label: text(),
    frame: literal('world', 'body'),
    vector: point,
    couple: finite,
  },
  {
    locked: boolean,
    presentation: object({}, { color: text(128), length: finite, zeroAngle: finite }),
    legacyGroupScope: object({ members: list(object({ bodyId: id, poseInReference: pose })) }),
  }
);
