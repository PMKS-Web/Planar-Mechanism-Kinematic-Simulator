import { BodyDocument } from './body-document';
import { BodyId, WORLD } from './body-id';
import { compose, finitePose, inverse, Pose, worldToLocal } from './body-frame';
import { BodyGeometry, MassSpecification } from './material-body';

/** A coordinate change must carry every local owner, including loads at unconnected points. */
export function rebaseBody(document: BodyDocument, id: BodyId, newFrameInOld: Pose): BodyDocument {
  if (!finitePose(newFrameInOld)) throw new Error('Invalid body frame');
  if (id === WORLD || !document.bodies.some((body) => body.id === id))
    throw new Error('Cannot rebase this body');
  const toNew = inverse(newFrameInOld);
  const mass = (spec: MassSpecification): MassSpecification => ({
    ...spec,
    center:
      spec.center.mode === 'automatic'
        ? spec.center
        : {
            ...spec.center,
            point: worldToLocal(newFrameInOld, spec.center.point),
          },
  });
  return {
    ...document,
    bodies: document.bodies.map((body) =>
      body.id !== id || body.kind === 'world'
        ? body
        : {
            ...body,
            pose: compose(body.pose, newFrameInOld),
            geometry: rebaseGeometry(body.geometry, newFrameInOld),
            mass: mass(body.mass),
          }
    ),
    attachments: document.attachments.map((anchor) =>
      anchor.bodyId !== id
        ? anchor
        : {
            ...anchor,
            point: worldToLocal(newFrameInOld, anchor.point),
          }
    ),
    joints: document.joints.map((joint) => {
      const a = joint.bodyA === id;
      const b = joint.bodyB === id;
      if (!a && !b) return joint;
      const frames = {
        frameA: a
          ? { ...joint.frameA, angle: joint.frameA.angle - newFrameInOld.angle }
          : joint.frameA,
        frameB: b
          ? { ...joint.frameB, angle: joint.frameB.angle - newFrameInOld.angle }
          : joint.frameB,
      };
      const guide =
        joint.kind !== 'weld' && joint.kind !== 'revolute' && joint.guideDisplay?.bodyId === id
          ? {
              guideDisplay: {
                ...joint.guideDisplay,
                frame: {
                  ...joint.guideDisplay.frame,
                  angle: joint.guideDisplay.frame.angle - newFrameInOld.angle,
                },
              },
            }
          : {};
      return joint.kind === 'weld'
        ? {
            ...joint,
            ...frames,
            rest: a ? compose(toNew, joint.rest) : compose(joint.rest, newFrameInOld),
          }
        : {
            ...joint,
            ...frames,
            ...guide,
            angleZero: joint.angleZero + (b ? 1 : -1) * newFrameInOld.angle,
          };
    }),
    forces: document.forces.map((force) =>
      force.bodyId !== id
        ? force
        : {
            ...force,
            point: worldToLocal(newFrameInOld, force.point),
            vector:
              force.frame === 'world'
                ? force.vector
                : worldToLocal({ x: 0, y: 0, angle: newFrameInOld.angle }, force.vector),
          }
    ),
    groups: document.groups.map((group) =>
      group.frameBody !== id || !group.mass?.center
        ? group
        : {
            ...group,
            mass: {
              ...group.mass,
              center: {
                ...group.mass.center,
                point: worldToLocal(newFrameInOld, group.mass.center.point),
              },
            },
          }
    ),
  };
}

function rebaseGeometry(geometry: BodyGeometry, frame: Pose): BodyGeometry {
  if (geometry.kind === 'circle')
    return { ...geometry, center: worldToLocal(frame, geometry.center) };
  const vertices = geometry.vertices.map((point) => ({ ...point, ...worldToLocal(frame, point) }));
  return geometry.kind === 'bar'
    ? { ...geometry, vertices: [vertices[0], vertices[1]] }
    : { ...geometry, vertices };
}
