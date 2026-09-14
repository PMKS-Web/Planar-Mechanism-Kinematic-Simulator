import { nativeEditableFourBar } from '../../../test-utils/verification/native-geometry-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { bodyConnectionCommand, bodyConnectionPairs } from './body-connection-controls';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { BodyDocumentAuthority } from './body-document-authority';
import { nativeGroundCommand } from './body-menu-commands';
import { selectionBodies } from './body-joint-interaction';
import { nativeMotionRefusal } from './native-motion-refusal';
import { validateBodyEditDocument } from './body-edit-validation';
import { BodyDocument } from './body-document';
import { BodySelectionRef } from './body-edit-types';

const state = NATIVE_EDIT_CONTEXT.state;

/** Why the machine will not run, said the way the transport says it. */
function refusalOf(document: BodyDocument) {
  const built = buildSimulationSnapshot(document, 0, { mode: 'static', gravity: { x: 0, y: 0 } });
  return nativeMotionRefusal(built.ok ? built.snapshot : undefined);
}

describe('a drawing that cannot move is still a drawing', () => {
  /**
   * The public editor grounds or welds the pin and shows an unanalyzable
   * mechanism: readiness reports the blocker and the transport says why it will
   * not run. So "this mechanism cannot move" is not "this document is
   * malformed", and the two are answered in different places.
   */
  it.each([
    ['grounding', 'ground'],
    ['welding', 'weld'],
  ] as const)('accepts %s the pin that stops a driven four-bar', (_said, how) => {
    const fixture = nativeEditableFourBar();
    const authority = new BodyDocumentAuthority(fixture.document);
    const target: BodySelectionRef = { kind: 'joint', id: fixture.bJoint.id };
    const document = authority.document;
    const command =
      how === 'ground'
        ? nativeGroundCommand(document, target, selectionBodies(document, [target])[0], {
            x: 1,
            y: 1,
          })
        : bodyConnectionCommand(document, target, bodyConnectionPairs(document, target)[0], 'weld');
    expect(authority.commit(command!, state)).toMatchObject({ ok: true });
    // Admitted as a document...
    expect(validateBodyEditDocument(authority.document)).toBeUndefined();
    // ...and refused as a mechanism, in readiness's own words.
    expect(refusalOf(authority.document)).toEqual({
      short: 'input is fixed',
      long: 'This input is held still, so nothing can move. Unweld or unground a joint to give it freedom.',
    });
  });

  /** Everything else that was malformed still is. */
  it('still refuses a drawing whose ground connections contradict each other', () => {
    const fixture = nativeEditableFourBar();
    const moved = {
      ...fixture.document,
      // One ground anchor dragged off its pin leaves two fixed rows that cannot
      // both hold, which is a drawing that does not describe a mechanism.
      attachments: fixture.document.attachments.map((point, index) =>
        index === 0 ? { ...point, point: { x: point.point.x + 3, y: point.point.y } } : point
      ),
    };
    expect(validateBodyEditDocument(moved)).toMatchObject({ code: 'invalid-document' });
  });
});
