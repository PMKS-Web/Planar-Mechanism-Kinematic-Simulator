import { BodyDocument } from './body-document';
import { BodyEditCode, BodyEditRefusal, BodySelectionRef } from './body-edit-types';
import { JointId } from './body-id';

const MESSAGES: Record<Exclude<BodyEditCode, 'permission'>, string> = {
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
  'held-dimension': 'Release the fixed length or angle before changing that dimension.',
  'locked-position': 'Unlock the selected position before moving it.',
  'invalid-command': 'This change is not valid for the selected objects.',
  'connection-point': 'Choose the connection point before changing this weld.',
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
