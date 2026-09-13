import { BodyDocument } from './body-document';
import { BodyEditCode, BodyEditRefusal, BodySelectionRef } from './body-edit-types';
import { JointId } from './body-id';

const MESSAGES: Record<Exclude<BodyEditCode, 'permission'>, string> = {
  'stale-pose':
    'The displayed pose is out of date. Wait for the drawing to update, then try again.',
  'invalid-document': 'This change would leave an invalid drawing.',
  'missing-target': 'That object is no longer in the drawing.',
  'immutable-world': 'The ground reference cannot be changed or deleted.',
  'assembly-member': 'Use Delete Cylinder to remove this cylinder and its two members.',
  'assembly-interior':
    'This connection belongs to the cylinder. Edit it through the cylinder properties.',
  'coordinate-in-use': 'Remove the drive or travel limit before changing this connection.',
  'aggregate-properties': 'Use member mass properties before changing this welded group.',
  'ambiguous-load-owner':
    'Choose a material owner for this force before splitting its welded group.',
  'unsolved-edit': 'This move could not preserve the connected geometry. Try a smaller move.',
  'held-dimension': 'Release the fixed length or angle before changing that dimension.',
  'locked-position': 'Unlock the selected position before moving it.',
  'empty-name': 'Type a name before saving.',
  'invalid-mass': 'Type a mass of zero or greater.',
  'invalid-command': 'This change is not valid for the selected objects.',
  'indirect-weld':
    'This pair is joined through other welds. Select one of those pairs to release it.',
  'connection-point': 'Choose the connection point first.',
  'drive-in-rigid-group': 'This weld would lock a driven coordinate. Remove its drive first.',
};
export function bodyEditRefusal(
  code: Exclude<BodyEditCode, 'permission'>,
  targets: readonly BodySelectionRef[] = []
): BodyEditRefusal {
  return { ok: false, code, message: MESSAGES[code], targets };
}

/** External connections have ordinary permissions; only the assembly's own P stays protected. */
export function refuseNativeJointChange(
  document: BodyDocument,
  jointId: JointId
): BodyEditRefusal | undefined {
  const target = { kind: 'joint' as const, id: jointId };
  if (!document.joints.some((joint) => joint.id === jointId))
    return bodyEditRefusal('missing-target', [target]);
  if (document.assemblies.some((assembly) => assembly.internalJoint === jointId))
    return bodyEditRefusal('assembly-interior', [target]);
  return undefined;
}

/** Short and long refusals come from the same model for menus and inspector controls. */
export function nativeEditRefusalCopy(refusal: BodyEditRefusal): { short: string; long: string } {
  if (refusal.permission) return refusal.permission;
  const labels: Record<Exclude<BodyEditCode, 'permission'>, string> = {
    'stale-pose': 'drawing is updating',
    'invalid-document': 'invalid connection',
    'missing-target': 'object was deleted',
    'immutable-world': 'ground reference',
    'assembly-member': 'use Delete Cylinder',
    'assembly-interior': 'cylinder connection',
    'coordinate-in-use': 'remove input or limit',
    'aggregate-properties': 'reset group mass first',
    'ambiguous-load-owner': 'choose force owner',
    'unsolved-edit': 'geometry cannot follow',
    'held-dimension': 'release fixed dimension',
    'locked-position': 'unlock first',
    'indirect-weld': 'joined through other welds',
    'empty-name': 'type a name',
    'invalid-mass': 'mass must be nonnegative',
    'invalid-command': 'choose compatible objects',
    'connection-point': 'choose connection point',
    'drive-in-rigid-group': 'remove input first',
  };
  return {
    short: labels[refusal.code as Exclude<BodyEditCode, 'permission'>],
    long: refusal.message,
  };
}
