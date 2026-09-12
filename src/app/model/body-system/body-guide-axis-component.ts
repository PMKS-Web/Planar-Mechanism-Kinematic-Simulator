import { BodyDocument } from './body-document';
import { BodyEditRefusal } from './body-edit-types';
import { GuidedJoint } from './joint-record';
import { WORLD } from './body-id';
import { compileWeldFrames } from './weld-frames';
import { createBodyEditModel } from './body-edit-model';
import { bodyEditCoordinate, bodyEditRows } from './body-edit-rows';
import { editSubtract } from './body-edit-scalar';
import { relaxBodyEdit } from './body-edit-relaxation';
import { editBodyGeometry } from './body-geometry-edit';
import { bodyEditRefusal } from './joint-permission';

export interface PreparedGuideAxis {
  readonly joint: GuidedJoint;
  readonly guide: NonNullable<GuidedJoint['guideDisplay']>;
  readonly delta: number;
  readonly travel: number;
  readonly driven: boolean;
}

/** Coupled guides must change together; an intermediate mixture of old and new axes can be inconsistent. */
export function editGuideAxisComponent(
  document: BodyDocument,
  changes: readonly PreparedGuideAxis[]
): { readonly ok: true; readonly document: BodyDocument } | BodyEditRefusal {
  const frames = compileWeldFrames(document);
  if (!frames.ok) return bodyEditRefusal('invalid-document');
  const first = changes[0].joint;
  const target = first.bodyB === WORLD ? first.frameA.attachmentId : first.frameB.attachmentId;
  const modelAt = (fraction: number) => {
    const replacements = new Map(
      changes.map(({ joint, guide, delta }) => {
        const onA = guide.bodyId === joint.bodyA,
          angle = delta * fraction;
        const changed: GuidedJoint = {
          ...joint,
          frameA: onA ? { ...joint.frameA, angle: joint.frameA.angle + angle } : joint.frameA,
          frameB: !onA ? { ...joint.frameB, angle: joint.frameB.angle + angle } : joint.frameB,
          angleZero:
            joint.kind === 'prismatic' ? joint.angleZero + (onA ? angle : -angle) : joint.angleZero,
          guideDisplay: { ...guide, frame: { ...guide.frame, angle: guide.frame.angle + angle } },
        };
        return [joint.id, changed] as const;
      })
    );
    const source = {
      ...document,
      joints: document.joints.map((joint) => replacements.get(joint.id) ?? joint),
    };
    return {
      replacements,
      model: createBodyEditModel(source, target, frames.groups, frames.groupOf, {
        rigid: true,
        fixedBodies: new Set(changes.map((change) => change.guide.bodyId)),
      }),
    };
  };
  let current = modelAt(0),
    values: readonly number[] = Array(current.model.width).fill(0),
    progress = 0;
  let step = Math.min(1, 0.1 / Math.max(...changes.map((change) => Math.abs(change.delta))));
  for (let round = 0; progress < 1 && round < 4096; round++) {
    const next = Math.min(1, progress + step),
      candidate = modelAt(next);
    const solved = relaxBodyEdit(
      values,
      (v) => [
        ...bodyEditRows(candidate.model, v),
        ...changes
          .filter((change) => !change.driven)
          .map((change) =>
            editSubtract(
              bodyEditCoordinate(
                candidate.model,
                v,
                candidate.replacements.get(change.joint.id)!,
                'travel'
              ),
              candidate.model.at(v).constant(change.travel / candidate.model.length)
            )
          ),
      ],
      candidate.model.angularColumns
    );
    if (!solved || solved.some((value, i) => Math.abs(value - values[i]) > 0.2)) {
      step /= 2;
      if (step < 2 ** -24 || next === progress) return bodyEditRefusal('unsolved-edit');
      continue;
    }
    current = candidate;
    values = solved;
    progress = next;
  }
  if (progress !== 1) return bodyEditRefusal('unsolved-edit');
  let candidate = current.model.document;
  for (const op of current.model.operations(values)) {
    const result = editBodyGeometry(candidate, op);
    if (!result.ok) return result;
    candidate = result.document;
  }
  return { ok: true, document: candidate };
}
