import { scaleBodyProject } from './body-unit-project';
import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { BodyUnits, unitFactors } from './body-units';
import { Point } from './body-frame';
import { BodyGeometry } from './material-body';
import { bodyEditRefusal } from './joint-permission';

/** Document units are physical storage units; angle/force display choices stay independent. */
export function convertBodyUnits(
  document: BodyDocument,
  units: BodyUnits
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  if (!units || typeof units !== 'object') return bodyEditRefusal('invalid-command');
  const previous = unitFactors(document.units),
    next = unitFactors(units);
  if (Object.values(next).some((value) => !Number.isFinite(value) || value <= 0))
    return bodyEditRefusal('invalid-command');
  const length = previous.length / next.length,
    mass = previous.mass / next.mass,
    inertia = previous.inertia / next.inertia,
    force = previous.force / next.force;
  const point = <T extends Point>(value: T): T => ({
    ...value,
    x: value.x * length,
    y: value.y * length,
  });
  const geometry = (value: BodyGeometry): BodyGeometry => {
    switch (value.kind) {
      case 'bar':
        return {
          ...value,
          vertices: [point(value.vertices[0]), point(value.vertices[1])],
          width: value.width * length,
        };
      case 'polygon':
        return { ...value, vertices: value.vertices.map(point) };
      case 'circle':
        return { ...value, center: point(value.center), radius: value.radius * length };
    }
  };
  return {
    ok: true,
    document: {
      ...document,
      units,
      ...scaleBodyProject(document, length),
      bodies: document.bodies.map((body) =>
        body.kind === 'world'
          ? body
          : {
              ...body,
              pose: point(body.pose),
              geometry: geometry(body.geometry),
              mass: {
                ...body.mass,
                mass: {
                  ...body.mass.mass,
                  value:
                    (body.mass.mass.value * mass) /
                    (body.mass.mass.mode === 'density' ? length ** 2 : 1),
                },
                inertia:
                  body.mass.inertia.mode === 'explicit'
                    ? { ...body.mass.inertia, value: body.mass.inertia.value * inertia }
                    : body.mass.inertia,
                center:
                  body.mass.center.mode === 'explicit'
                    ? { ...body.mass.center, point: point(body.mass.center.point) }
                    : body.mass.center,
              },
            }
      ),
      attachments: document.attachments.map((item) => ({ ...item, point: point(item.point) })),
      joints: document.joints.map((joint) => {
        if (joint.kind === 'weld') return { ...joint, rest: point(joint.rest) };
        if (joint.kind === 'revolute') return joint;
        return {
          ...joint,
          travelZero: joint.travelZero * length,
          ...(joint.guideDisplay
            ? {
                guideDisplay: {
                  ...joint.guideDisplay,
                  from: joint.guideDisplay.from * length,
                  to: joint.guideDisplay.to * length,
                },
              }
            : {}),
        };
      }),
      drivers: document.drivers.map((driver) =>
        driver.coordinate.coordinate === 'angle'
          ? driver
          : {
              ...driver,
              profile: {
                ...driver.profile,
                initial: driver.profile.initial * length,
                speed: driver.profile.speed * length,
              },
            }
      ),
      limits: document.limits.map((limit) =>
        limit.coordinate.coordinate === 'angle'
          ? limit
          : {
              ...limit,
              lower: limit.lower * length,
              upper: limit.upper * length,
            }
      ),
      assemblies: document.assemblies.map((assembly) => ({
        ...assembly,
        dimensions: {
          barrelLength: assembly.dimensions.barrelLength * length,
          rodLength: assembly.dimensions.rodLength * length,
          bore: assembly.dimensions.bore * length,
          rodDiameter: assembly.dimensions.rodDiameter * length,
        },
      })),
      forces: document.forces.map((load) => ({
        ...load,
        point: point(load.point),
        vector: { x: load.vector.x * force, y: load.vector.y * force },
        couple: load.couple * force * length,
        ...(load.presentation?.length !== undefined
          ? { presentation: { ...load.presentation, length: load.presentation.length * length } }
          : {}),
        ...(load.legacyGroupScope
          ? {
              legacyGroupScope: {
                members: load.legacyGroupScope.members.map((member) => ({
                  ...member,
                  poseInReference: point(member.poseInReference),
                })),
              },
            }
          : {}),
      })),
      groups: document.groups.map((group) => ({
        ...group,
        ...(group.mass
          ? {
              mass: {
                ...group.mass,
                ...(group.mass.mass !== undefined ? { mass: group.mass.mass * mass } : {}),
                ...(group.mass.inertia !== undefined
                  ? { inertia: group.mass.inertia * inertia }
                  : {}),
                ...(group.mass.center
                  ? { center: { ...group.mass.center, point: point(group.mass.center.point) } }
                  : {}),
              },
            }
          : {}),
      })),
      holds: document.holds.map((hold) =>
        hold.length === undefined ? hold : { ...hold, length: hold.length * length }
      ),
    },
  };
}
