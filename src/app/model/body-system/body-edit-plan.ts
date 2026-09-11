import { BodyDocument } from './body-document';
import { BodyEditCommand, BodyEditContext, BodyEditResult } from './body-edit-types';
import { bodyOperationPermission } from './body-project-edit';
import { planBodyDesignEdit } from './body-design-edit-plan';
import { directBodyFrameOperation, planPosedBodyProperties } from './body-posed-property-edit';
import { planPosedBodyGeometry } from './body-posed-geometry-edit';

/** Permission and the displayed-frame mapping surround the same canonical transaction for every caller. */
export function planBodyEdit(
  document: BodyDocument,
  revision: number,
  command: BodyEditCommand,
  context: BodyEditContext
): BodyEditResult {
  const direct =
    !!context.display &&
    command.operations.every((operation) => directBodyFrameOperation(document, operation));
  const permission = command.operations
    .map((operation) => bodyOperationPermission(operation, context.state, !!context.display))
    .find(Boolean);
  if (permission)
    return { ok: false, code: 'permission', message: permission.long, targets: [], permission };
  return !context.state.atStart && context.display
    ? (direct ? planPosedBodyProperties : planPosedBodyGeometry)(
        document,
        revision,
        command,
        context,
        context.display
      )
    : planBodyDesignEdit(document, revision, command, context);
}
