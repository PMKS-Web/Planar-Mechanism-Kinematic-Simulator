import { BodyDocument } from './body-document';
import { BodyEditCommand, BodyEditContext, BodyEditPlan, BodyEditRefusal } from './body-edit-types';
import { BodyEditFrame, withBodyEditFrame } from './body-edit-frame';
import { planBodyDesignEdit } from './body-design-edit-plan';
import { validateBodyEditDocument } from './body-edit-validation';
import { bodyEditRefusal } from './joint-permission';
import { isSnapshot, snapshotCopy } from './sample-results';

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
  const displayed = framedDocument(source, frame);
  const changed = planBodyDesignEdit(displayed, revision, command, context);
  if (!changed.ok) return changed;
  return { ok: true, source, displayed, changed };
}

/**
 * The paused drawing a posed edit is written against depends only on the authored
 * document and the displayed frame, and a drag asks for the same one on every
 * pointer move. Keeping it lets the transaction below recognize it too.
 */
const framed = new WeakMap<BodyDocument, WeakMap<BodyEditFrame, BodyDocument>>();
function framedDocument(document: BodyDocument, frame: BodyEditFrame): BodyDocument {
  if (!isSnapshot(document)) return withBodyEditFrame(document, frame);
  let byFrame = framed.get(document);
  if (!byFrame) framed.set(document, (byFrame = new WeakMap()));
  const kept = byFrame.get(frame);
  if (kept) return kept;
  const built = snapshotCopy(withBodyEditFrame(document, frame));
  byFrame.set(frame, built);
  return built;
}
