import { BodyDocument } from './body-document';
import { Point } from './body-frame';
import { WORLD } from './body-id';
import { pastedGroundProperties } from './body-paste-ground';
import { BodyCopyResult, planBodyCopy } from './body-copy-edit';
import { convertBodyUnits } from './body-unit-edit';
import { validateBodyEditDocument } from './body-edit-validation';
import { compileWeldFrames } from './weld-frames';
import { bodyEditRefusal } from './joint-permission';

export interface BodyPasteOperation {
  readonly kind: 'paste-bodies';
  /** A frozen clipboard drawing, not a live reference to another editor's authority. */
  readonly source: BodyDocument;
  readonly offset: Point;
}

/** Clipboard storage units belong to its source; pointer placement belongs to the destination. */
export function planBodyPaste(
  destination: BodyDocument,
  operation: BodyPasteOperation,
  commandId: string
): BodyCopyResult {
  const invalid = validateBodyEditDocument(operation.source);
  if (invalid) return invalid;
  const converted = convertBodyUnits(operation.source, destination.units);
  if (!converted.ok) return converted;
  const copied = planBodyCopy(
    converted.document,
    {
      kind: 'copy-bodies',
      bodyIds: converted.document.bodies.filter((body) => body.id !== WORLD).map((body) => body.id),
      includeGround: true,
      offset: operation.offset,
    },
    commandId,
    true
  );
  if (!copied.ok) return copied;
  const frames = compileWeldFrames(destination);
  if (!frames.ok) return bodyEditRefusal('invalid-document');
  if (frames.groupOf.get(WORLD)!.members.size === 1) return copied;
  const ground = copied.records.groups?.find((group) => group.members.includes(WORLD));
  const properties = pastedGroundProperties(
    destination,
    frames.groupOf.get(WORLD)!,
    copied.records,
    ground
  );
  if (!properties.ok) return properties;
  // A real merge into an existing fixed fabrication uses its existing presentation lineage.
  return {
    ...copied,
    properties: properties.properties,
    records: {
      ...copied.records,
      groups: copied.records.groups?.filter((group) => !group.members.includes(WORLD)),
    },
  };
}
