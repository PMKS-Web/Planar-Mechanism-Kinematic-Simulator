import { BodyDocumentAuthority } from './body-document-authority';
import { bodyEditReplay } from './body-edit-replay';
import { BodyEditOperation, BodyEditPlan } from './body-edit-types';
import { planBodyEdit } from './body-edit-plan';
import { NativeBodyGesture } from '../../services/native-body-gesture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';

const state = NATIVE_EDIT_CONTEXT.state;
const context = { state, selection: [] };
function press(moves: number) {
  const f = nativeLinearCarriage(),
    authority = new BodyDocumentAuthority(f.document);
  // An unbounded guide, so every move of the press is accepted whole and none is clamped.
  const gesture = new NativeBodyGesture(
    authority,
    'held',
    { kind: 'move-coordinate', coordinate: f.driver.coordinate },
    state
  );
  const spent: number[] = [];
  let plan: BodyEditPlan | undefined;
  for (let i = 1; i <= moves; i++) {
    const at = performance.now();
    const result = gesture.advance(i * 0.002, state);
    spent.push(performance.now() - at);
    if (!result.ok) throw new Error(JSON.stringify(result));
    if (result.limited) throw new Error('the press was clamped, so it measures nothing');
    plan = result.plan;
  }
  return { authority, gesture, spent, plan: plan! };
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('a held gesture costs the same at its end as at its start', () => {
  it('holds its cost per move flat through two hundred moves of one press', () => {
    const { authority, gesture, spent, plan } = press(200);
    // Replaying the press would put about thirteen times the first move's work in the last.
    expect(median(spent.slice(-30))).toBeLessThanOrEqual(3 * median(spent.slice(0, 30)) + 1);
    expect(plan.command.operations.length).toBeGreaterThanOrEqual(200);
    expect(gesture.finish(authority, state).ok).toBe(true);
    expect(authority.undoDepth).toBe(1);
  });

  it('remembers every step of a press, so the next move continues from its end', () => {
    const { authority, plan } = press(120);
    const operations: BodyEditOperation[] = plan.command.operations.map((operation) => ({
      ...operation,
    }));
    const replayed = planBodyEdit(
      authority.document,
      authority.revision,
      { id: plan.command.id, operations },
      context
    );
    if (!replayed.ok) throw new Error(JSON.stringify(replayed));
    expect(bodyEditReplay(authority.document, operations).index).toBe(operations.length);
  });

  it('plans the same drawing whether it continued a prefix or replayed the whole press', () => {
    const { authority, plan } = press(60);
    // The same command in fresh objects is remembered nowhere, so it replays from the top.
    const replayed = planBodyEdit(
      authority.document,
      authority.revision,
      {
        id: plan.command.id,
        operations: plan.command.operations.map((operation) => ({ ...operation })),
      },
      context
    );
    if (!replayed.ok) throw new Error(JSON.stringify(replayed));
    expect(replayed.document).toEqual(plan.document);
    expect(replayed.effects).toEqual(plan.effects);
    expect(replayed.changed).toBe(plan.changed);
  });
});
