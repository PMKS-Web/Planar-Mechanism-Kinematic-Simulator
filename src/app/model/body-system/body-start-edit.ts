import { preparePosedBodyEdit } from './body-posed-edit-source';
import { BodyDocument } from './body-document';
import { BodyEditCommand, BodyEditContext, BodyEditResult } from './body-edit-types';
import { bodyEditRefusal } from './joint-permission';
import { compileBodyDocument } from './constraint-compiler';
import { bodyEditEffects } from './body-edit-effects';
import { validateBodyEditDocument } from './body-edit-validation';
import { withBodyEditFrame } from './body-edit-frame';
import { snapshotCopy } from './sample-results';
import { refusalFor } from '../edit-permission';

/** Promoting a sampled pose changes one machine's anchor, never its neighbors' clocks or material. */
export function planBodyStartEdit(
  document: BodyDocument,
  revision: number,
  command: BodyEditCommand,
  context: BodyEditContext
): BodyEditResult {
  const operation = command.operations[0];
  if (
    command.operations.length !== 1 ||
    operation.kind !== 'set-start' ||
    !command.id ||
    command.id.length > 64
  )
    return bodyEditRefusal('invalid-command');
  const permission = refusalFor('drag', context.state);
  if (permission)
    return { ok: false, code: 'permission', message: permission.long, targets: [], permission };
  const frame = context.display;
  if (!frame || frame.revision !== revision) return bodyEditRefusal('stale-pose');
  const prepared = preparePosedBodyEdit(
    document,
    revision,
    { ...command, operations: [] },
    context,
    frame
  );
  if (!prepared.ok) return prepared;
  document = prepared.source;
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) return bodyEditRefusal('invalid-document');
  const partition = compiled.system.partitions.find((p) =>
    p.materialIds.includes(operation.bodyId)
  );
  if (!partition || partition.drivers.length !== 1) return bodyEditRefusal('missing-target');
  const members = new Set(partition.materialIds),
    driverIds = new Set(partition.drivers.map((d) => d.id));
  const partial = {
    ...frame,
    poses: new Map(
      document.bodies.map((body) => [
        body.id,
        members.has(body.id) ? frame.poses.get(body.id)! : body.pose,
      ])
    ),
    clocks: frame.clocks.map((clock) =>
      driverIds.has(clock.driverId) ? clock : { ...clock, command: clock.anchor }
    ),
  };
  const candidate = withBodyEditFrame(document, partial);
  const invalid = validateBodyEditDocument(candidate);
  if (invalid) return invalid;
  const effects = bodyEditEffects(document, candidate);
  return snapshotCopy({
    ok: true,
    baseRevision: revision,
    command,
    document: candidate,
    changed: effects.changed.length > 0,
    effects,
    selection: context.selection,
    // Other machines stay at their paused samples; only the promoted machine reads time zero.
    display: {
      ...frame,
      clocks: frame.clocks.map((clock) =>
        driverIds.has(clock.driverId) ? { ...clock, anchor: clock.command, time: 0 } : clock
      ),
    },
  });
}
