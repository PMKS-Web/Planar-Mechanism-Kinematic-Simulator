import { ValidationContext } from './validation-context';
import { isShippedBackdropAsset } from './body-project';
import { WORLD } from './body-id';

export function validateProject({
  document,
  issue,
  bodies,
  joints,
  anchors,
}: ValidationContext): void {
  const settings = document.settings;
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const point = (value: { readonly x: number; readonly y: number }) =>
    Number.isFinite(value.x) && Number.isFinite(value.y);
  if (
    !settings ||
    !['deg', 'rad'].includes(settings.angleUnit) ||
    !['N', 'kgf', 'lbf'].includes(settings.forceUnit) ||
    !['static', 'dynamic'].includes(settings.forceAnalysis) ||
    ![settings.gravity, settings.showMajorGrid, settings.showMinorGrid, settings.showIds].every(
      (value) => typeof value === 'boolean'
    ) ||
    !positive(settings.objectScale) ||
    !settings.defaultDrive ||
    ![settings.defaultDrive.angular, settings.defaultDrive.linear].every(
      (value) => Number.isFinite(value) && value !== 0
    )
  )
    issue('invalid-settings', 'settings');
  const view = document.view;
  if (view?.camera && (!point(view.camera.center) || !positive(view.camera.span)))
    issue('invalid-camera', 'view.camera');
  const backdrop = view?.backdrop;
  if (
    backdrop &&
    (!isShippedBackdropAsset(backdrop.asset) ||
      !point(backdrop.center) ||
      !positive(backdrop.width) ||
      !Number.isFinite(backdrop.angle) ||
      !Number.isFinite(backdrop.opacity) ||
      backdrop.opacity < 0 ||
      backdrop.opacity > 1)
  )
    issue('invalid-backdrop', 'view.backdrop');
  const design = document.synthesis;
  if (!design) return;
  if (
    !positive(design.length) ||
    !['back', 'center', 'front'].includes(design.reference) ||
    !['chooser', 'working'].includes(design.stage) ||
    design.poses.length > 3 ||
    !design.poses.every((pose) => point(pose) && Number.isFinite(pose.angle)) ||
    ![design.endsOnly, design.allowDefect, design.constrain, design.generated.partial].every(
      (value) => typeof value === 'boolean'
    ) ||
    !point(design.region) ||
    !positive(design.region.width) ||
    !positive(design.region.height)
  )
    issue('invalid-synthesis', 'synthesis');
  const generated = design.generated;
  for (const [name, ids, live] of [
    ['bodies', generated.bodies, bodies],
    ['joints', generated.joints, joints],
    ['attachments', generated.attachments.map((item) => item.id), anchors],
  ] as const) {
    if (
      new Set<string>(ids).size !== ids.length ||
      ids.some((id) => id === WORLD || !(live as ReadonlyMap<string, unknown>).has(id))
    )
      issue('invalid-synthesis-owner', `synthesis.generated.${name}`);
  }
  if (
    generated.joints.some((id) => {
      const joint = joints.get(id);
      return (
        joint && !generated.bodies.includes(joint.bodyA) && !generated.bodies.includes(joint.bodyB)
      );
    })
  )
    issue('invalid-synthesis-owner', 'synthesis.generated.joints');
  if (
    generated.attachments.some((item) => {
      const anchor = anchors.get(item.id);
      return !point(item.at) || !anchor || !generated.bodies.includes(anchor.bodyId);
    })
  )
    issue('invalid-synthesis-owner', 'synthesis.generated.attachments');
}
