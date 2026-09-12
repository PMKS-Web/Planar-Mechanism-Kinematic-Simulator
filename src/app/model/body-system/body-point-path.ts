import { BodyDocument } from './body-document';
import { BodyEditModel } from './body-edit-model';
import { bodyEditCoordinate } from './body-edit-rows';
import { clearBodyEditInterval } from './body-edit-interval';
import { coordinatePathIsClear } from './body-coordinate-path';
import { hasCoordinate } from './joint-record';

/** A rigid pointer endpoint does not license crossing an intervening stop or a physical fold. */
export function bodyPointPathIsClear(
  model: BodyEditModel,
  values: readonly number[],
  candidate: BodyDocument
): boolean {
  const seed = Array(model.width).fill(0);
  const choices = model.document.joints
    .flatMap((joint) => {
      if (!model.reached.has(joint.bodyA) && !model.reached.has(joint.bodyB)) return [];
      return (['travel', 'angle'] as const)
        .filter((kind) => hasCoordinate(joint, kind))
        .map((kind) => {
          const before = bodyEditCoordinate(model, seed, joint, kind).value,
            after = bodyEditCoordinate(model, values, joint, kind).value;
          return { joint, kind, before, after };
        });
    })
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const chosen = choices[0];
  if (!chosen || Math.abs(chosen.after - chosen.before) < 1e-10) return true;
  if (!clearBodyEditInterval(model, chosen.joint, chosen.kind, seed, values)) return false;
  const factor = chosen.kind === 'travel' ? model.length : 1;
  return coordinatePathIsClear(
    model.document,
    candidate,
    {
      kind: 'move-coordinate',
      coordinate: { jointId: chosen.joint.id, coordinate: chosen.kind },
      target: chosen.after * factor,
    },
    chosen.before * factor
  );
}
