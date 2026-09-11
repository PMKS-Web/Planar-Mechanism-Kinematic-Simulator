import { BodyDocument } from './body-document';
import { BodyEditCommand, BodyEditContext, BodyEditPlan, BodyEditRefusal } from './body-edit-types';
import { BodyEditFrame, withBodyEditFrame } from './body-edit-frame';
import { planBodyDesignEdit } from './body-design-edit-plan';
import { validateBodyEditDocument } from './body-edit-validation';
import { bodyEditRefusal } from './joint-permission';
import { snapshotCopy } from './sample-results';

export function preparePosedBodyEdit(
  document: BodyDocument,
  revision: number,
  command: BodyEditCommand,
  context: BodyEditContext,
  frame: BodyEditFrame
):
  | {
      readonly ok: true;
      readonly source: BodyDocument;
      readonly displayed: BodyDocument;
      readonly changed: BodyEditPlan;
    }
  | BodyEditRefusal {
  if (frame.revision !== revision) return bodyEditRefusal('stale-pose');
  const source = snapshotCopy(document);
  const invalid = validateBodyEditDocument(source);
  if (invalid) return invalid;
  if (
    frame.poses.size !== document.bodies.length ||
    document.bodies.some((body) => !frame.poses.has(body.id)) ||
    frame.clocks.length !== document.drivers.length ||
    new Set(frame.clocks.map((clock) => clock.driverId)).size !== frame.clocks.length ||
    frame.clocks.some(
      (clock) =>
        ![clock.anchor, clock.command, clock.time].every(Number.isFinite) ||
        clock.time < 0 ||
        typeof clock.synced !== 'boolean' ||
        (clock.direction !== undefined && clock.direction !== 1 && clock.direction !== -1)
    ) ||
    document.drivers.some((driver) => !frame.clocks.some((clock) => clock.driverId === driver.id))
  )
    return bodyEditRefusal('stale-pose');
  const displayed = withBodyEditFrame(source, frame);
  const changed = planBodyDesignEdit(displayed, revision, command, context);
  if (!changed.ok) return changed;
  return { ok: true, source, displayed, changed };
}
