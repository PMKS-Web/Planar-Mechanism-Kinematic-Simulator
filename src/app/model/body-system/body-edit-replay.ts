import { BodyDocument } from './body-document';
import { BodyEditOperation } from './body-edit-types';
import { isSnapshot } from './sample-results';

/**
 * A held drag grows one command: move *k* of a press asks for the same *k-1*
 * operations it asked for a frame ago, plus one more. Replaying the whole list
 * from the top on every pointer move is what made a long press cost more than a
 * short one, so each accepted prefix is remembered and the next move continues
 * from it.
 *
 * This is a memo, not a shortcut: the answer is the one the loop would have
 * computed, because a remembered step is reused only when the same document
 * object is edited by the same operation objects in the same order, and the
 * operations below replay from values alone — they mint no ids and never read
 * their own position in the command.
 */
const REPLAYABLE = ['move-point', 'move-body', 'move-coordinate'];

/** Whether a command's operations may be continued from a remembered prefix. */
export function replayableBodyEdit(
  document: BodyDocument,
  operations: readonly BodyEditOperation[]
): boolean {
  return (
    operations.length > 1 &&
    isSnapshot(document) &&
    operations.every((operation) => REPLAYABLE.includes(operation.kind))
  );
}

interface ReplayNode {
  candidate?: BodyDocument;
  readonly children: WeakMap<BodyEditOperation, ReplayNode>;
}

/**
 * Remembered prefixes hang off the operations themselves, so a gesture's chain is
 * released with the gesture and a document never accumulates dead branches.
 */
const roots = new WeakMap<BodyDocument, ReplayNode>();

export interface BodyEditReplay {
  /** How many leading operations are already applied in `candidate`. */
  readonly index: number;
  readonly candidate?: BodyDocument;
  record(operation: BodyEditOperation, candidate: BodyDocument): void;
}

export function bodyEditReplay(
  document: BodyDocument,
  operations: readonly BodyEditOperation[]
): BodyEditReplay {
  let root = roots.get(document);
  if (!root) roots.set(document, (root = { children: new WeakMap() }));
  let node = root,
    index = 0;
  while (index < operations.length) {
    const next = node.children.get(operations[index]);
    if (!next?.candidate) break;
    node = next;
    index++;
  }
  let cursor = node;
  return {
    index,
    candidate: node.candidate,
    record(operation, candidate) {
      let child = cursor.children.get(operation);
      if (!child) cursor.children.set(operation, (child = { children: new WeakMap() }));
      child.candidate = candidate;
      cursor = child;
    },
  };
}
