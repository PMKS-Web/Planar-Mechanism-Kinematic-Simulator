import { GroupAnnotation } from './body-document';
import { BodyId } from './body-id';
import { localToWorld, Pose, scale, subtract } from './body-frame';
import { ResolvedMass } from './body-properties';
import { BodyUnits, unitFactors } from './body-units';

export function applyGroupMassOverride(
  material: ResolvedMass,
  annotation: GroupAnnotation | undefined,
  members: ReadonlyMap<BodyId, Pose>,
  units: BodyUnits
): ResolvedMass {
  const override = annotation?.mass;
  if (!override || !annotation) return material;
  const factor = unitFactors(units);
  const localFrame = members.get(annotation.frameBody)!;
  const mass = override.mass === undefined ? material.mass : override.mass * factor.mass;
  const displayCenter =
    override.center === undefined
      ? material.displayCenter
      : scale(localToWorld(localFrame, override.center.point), factor.length);
  const delta = subtract(displayCenter, material.displayCenter);
  // A center override changes the reference for the member-derived inertia, not the member masses.
  const inertia =
    override.inertia === undefined
      ? material.inertia + material.mass * (delta.x ** 2 + delta.y ** 2)
      : override.inertia * factor.inertia;
  return { mass, displayCenter, center: mass === 0 ? null : displayCenter, inertia };
}
