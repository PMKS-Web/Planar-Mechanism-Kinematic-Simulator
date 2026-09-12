import { jointStates } from '../model/utils';

/**
 * Whether a joint is being dragged right now, asked from outside the canvas.
 *
 * `MechanismService` paints a joint differently mid-drag, and used to ask
 * `NewGridComponent`'s static for it. That import ran the hub into the canvas,
 * the canvas into the panels, and the panels back into the blocks the hub was
 * imported by -- a cycle esbuild tolerates and an unbundled ES module graph
 * (Vite, which serves the component gallery) does not: `ColorPickerComponent`
 * was read before it was initialized. So the canvas publishes a reader here and
 * the hub asks this module, which imports nothing but an enum.
 */
let read: (() => jointStates) | undefined;

/** The canvas registers how to read its drag state, and unregisters with `undefined`. */
export function publishJointDragState(reader: (() => jointStates) | undefined): void {
  read = reader;
}

/** Waiting whenever no canvas is on screen, so nothing paints as dragging. */
export function currentJointState(): jointStates {
  return read ? read() : jointStates.waiting;
}
