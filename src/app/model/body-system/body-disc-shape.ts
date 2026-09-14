import { BodyDocument } from './body-document';
import { BodyId, WORLD } from './body-id';
import { compileWeldFrames } from './weld-frames';
import { NativePanelRefusal } from './native-panel-fields';

/**
 * Whether a link may be drawn as the disc it sweeps, and why not when it may
 * not.
 *
 * A disc is centered on the pin the link turns about, so a link needs exactly
 * one fixed pin to have one -- and a welded compound is drawn from the shapes
 * of its parts, so it has no single circle to draw. The public panel decides
 * this from the legacy drawing (`RealLink.canBeCircular`); this decides it from
 * the document, in the same three cases and the same words.
 */
export function bodyDiscRefusal(
  document: BodyDocument,
  bodyId: BodyId
): NativePanelRefusal | undefined {
  const body = document.bodies.find((b) => b.id === bodyId);
  if (body?.kind !== 'material')
    return { short: 'no shape to draw', long: 'A disc is drawn from a link.' };
  // "Drawn as a bar: a ..." while the link is asking to be a disc it cannot be.
  const held = body.presentation.outline === 'circle' ? 'Drawn as a bar: a' : 'A';
  const frames = compileWeldFrames(document);
  const group = frames.ok ? frames.groupOf.get(bodyId) : undefined;
  const welded = group ? [...group.members.keys()].filter((id) => id !== WORLD).length > 1 : false;
  if (welded)
    return {
      short: 'welded compound',
      long: `${held} disc is centered on one fixed pin, and a welded compound is drawn from the shapes of its parts. Unweld it to draw a part of it as a disc.`,
    };
  const grounded = document.joints.filter(
    (joint) =>
      joint.kind === 'revolute' &&
      ((joint.bodyA === bodyId && joint.bodyB === WORLD) ||
        (joint.bodyB === bodyId && joint.bodyA === WORLD))
  ).length;
  if (grounded === 0)
    return {
      short: 'no fixed pin',
      long: `${held} disc is centered on the pin its link turns about, and this link has no fixed pin. Ground one of its joints to draw it as a disc.`,
    };
  if (grounded > 1)
    return {
      short: `fixed at ${grounded} joints`,
      long: `${held} disc is centered on the pin its link turns about, and this link is fixed at ${grounded} joints, so it does not turn about any of them.`,
    };
  return undefined;
}

/**
 * Whether the link is on the canvas as a disc right now.
 *
 * Not the same question as "was it asked to be one": the choice is kept through
 * a ground being removed, so putting the ground back brings the disc back
 * rather than making somebody ask twice.
 */
export function bodyDrawnAsDisc(document: BodyDocument, bodyId: BodyId): boolean {
  const body = document.bodies.find((b) => b.id === bodyId);
  return (
    body?.kind === 'material' &&
    body.presentation.outline === 'circle' &&
    !bodyDiscRefusal(document, bodyId)
  );
}
