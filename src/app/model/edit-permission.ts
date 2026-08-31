/**
 * One place that answers "may this happen right now, and if not, in what words".
 *
 * Six surfaces used to answer that question for themselves -- the canvas's drag
 * gate, the Edit panel's disappearing act, the analysis geometry lock, the undo
 * buttons, the context menu's graying, and the service's own `isAnimating()` --
 * and they did not all ask the same thing. Three of them read the *shared*
 * clock, so with the machines unsynced and one row scrubbed mid-cycle the
 * canvas and the panel allowed edits against a displaced pose while undo
 * correctly refused. That disagreement is not fixable by patching three call
 * sites into agreement; it is fixable by there being one answer.
 *
 * The model is deliberately pure: it takes a described state and returns a
 * verdict. Nothing here reaches for a service, so the whole matrix in
 * `docs/edit-mode-playback-plan.md` §7 is testable as a table.
 */

/** Which mode the reader is in, in the only three flavors that change an answer. */
export type EditMode = 'synthesis' | 'edit' | 'analysis';

/**
 * The kinds of thing that can be asked for.
 *
 * Split finer than today's answers need, because Phase 2 unlocks them at
 * different times and for different reasons: a drag is pose-relative by
 * definition, a typed coordinate is not, and a delete is addressed by identity
 * and never needs the pose at all. Collapsing them now would mean splitting the
 * plumbing later.
 */
export type EditAction =
  /** Selecting, inspecting, panning, zooming -- never refused anywhere. */
  | 'inspect'
  /** Dragging a joint or link: geometry, by gesture. */
  | 'drag'
  /** Adding a link, welding: geometry that captures the pose it is made at. */
  | 'build'
  /** Delete, ground, set-input: addressed by identity, not by pose. */
  | 'structure'
  /** Joint X/Y and link angle typed as numbers -- pose coordinates. */
  | 'placement'
  /** Mass, CoM, force, cylinder, name, color: the panel's other fields. */
  | 'properties'
  /** Input speed and direction, which move the visible pose. */
  | 'drive'
  /** Play, scrub, stop. */
  | 'transport'
  /** Undo and redo. */
  | 'history';

/** Every action the matrix covers, for the tests and for any "all of them" sweep. */
export const EDIT_ACTIONS: readonly EditAction[] = [
  'inspect',
  'drag',
  'build',
  'structure',
  'placement',
  'properties',
  'drive',
  'transport',
  'history',
];

/**
 * Why an action is refused, in the two lengths the surfaces need.
 *
 * `short` labels a grayed menu row mid-sentence ("animation running"); `long`
 * is a whole sentence for a tooltip, a banner, or a snackbar. Both come from
 * here so the menu, the panel and the canvas cannot word the same rule
 * differently.
 */
export interface EditRefusal {
  short: string;
  long: string;
  /**
   * Whether returning to the start pose is what clears this refusal.
   *
   * The surfaces that can offer a way out -- the panel banner's "Back to
   * start" -- need to know that the button would help, rather than guessing
   * from the wording.
   */
  backToStartHelps?: boolean;
}

/** Everything the answers are decided from. Assembled by the service. */
export interface EditState {
  mode: EditMode;
  /** Any machine actually running. */
  playing: boolean;
  /** Every machine parked at its own start -- the service's `isAtStartPose()`. */
  atStart: boolean;
  /**
   * Whether the *shared* clock reads zero while something is nonetheless
   * displaced. Only the wording depends on it: "not at the start" over a
   * transport that reads 0:00 sends a reader to a scrubber that looks parked.
   */
  sharedStepZero: boolean;
  /** Built, but its motion deliberately not worked out yet (large drawings). */
  solveDeferred: boolean;
  /** Nothing drawn at all. */
  empty: boolean;
  /** At least one machine could run if asked. */
  runnable: boolean;
}

/** Nothing has been drawn, so there is nothing to play. */
const NOTHING_DRAWN: EditRefusal = {
  short: 'nothing drawn',
  long: 'Draw a mechanism to play it.',
};

const IN_SYNTHESIS: EditRefusal = {
  short: 'synthesis mode',
  long: 'Synthesis describes a mechanism that does not exist yet. Switch to Edit to change one.',
};

const IN_ANALYSIS: EditRefusal = {
  short: 'analysis mode',
  long: 'The graphs describe this exact cycle, so the geometry is locked here. Switch to Edit to change it.',
};

const PLAYING: EditRefusal = {
  short: 'animation running',
  long: 'Pause the animation to change the mechanism.',
  // The same button clears it: stopping is pausing plus the walk home, which
  // is what a reader who wants to edit is going to press next anyway.
  backToStartHelps: true,
};

/** Displaced, and the transport agrees it is displaced. */
const DISPLACED: EditRefusal = {
  short: 'not at the start',
  long: 'The mechanism is parked mid-cycle. Return it to the start to change it.',
  backToStartHelps: true,
};

/** Displaced, but the shared clock reads zero -- so say which clock is not. */
const DISPLACED_UNSYNCED: EditRefusal = {
  short: 'a machine is mid-cycle',
  long: 'One of the machines is parked away from its start. Return every machine to the start to change the drawing.',
  backToStartHelps: true,
};

/**
 * A typed number at a displaced pose.
 *
 * Gestures at a pose are *defined* to mean "put it here, at this pose", and the
 * app can honor that: the drag lands, and the machine is put back on its anchor
 * underneath. Numbers are less forgiving. A joint's X and Y are pose
 * coordinates outright; a link's length reads pose-invariantly but the handler
 * behind it repositions joints along the *displayed* orientation. Each needs a
 * written transform back to t = 0 before it can be offered here, and until one
 * exists the field says so rather than writing the wrong thing quietly.
 */
const DISPLACED_TYPING: EditRefusal = {
  short: 'shown at pose',
  long: 'These are the values at the pose on screen. Drag on the grid to edit here, or return to the start to type them.',
  backToStartHelps: true,
};

/**
 * A large drawing whose motion has not been worked out.
 *
 * Posed editing needs a cycle to anchor against, and re-anchoring costs a solve
 * per commit -- the exact cost the deferral exists to refuse. At the start pose
 * these drawings edit exactly as they always did.
 */
const DEFERRED_DISPLACED: EditRefusal = {
  short: 'motion not worked out',
  long: 'This drawing is large enough that its motion is worked out on request. Press Play, or return to the start to edit it.',
  backToStartHelps: true,
};

/**
 * The verdict for one action.
 *
 * Phase 2 of the plan changes what this function returns; it does not change
 * who calls it. That ordering is the whole reason the model exists before the
 * rules it will eventually relax.
 */
export function refusalFor(action: EditAction, state: EditState): EditRefusal | null {
  if (action === 'inspect') return null;

  if (action === 'transport') return transportRefusal(state);

  // Synthesis owns the grid entirely, and the analyses own a solved cycle that
  // geometry cannot move under. Both refuse before any question about pose.
  if (state.mode === 'synthesis') return IN_SYNTHESIS;
  if (state.mode === 'analysis') {
    // Undo already refused in the analyses before this model existed, for the
    // same reason a drag does: replaying a URL swaps the geometry the graphs
    // are drawn from.
    return IN_ANALYSIS;
  }

  // Playing is read-only whatever the action. A reader reaching for a joint
  // that is moving is a fight nothing here can win.
  if (state.playing) return PLAYING;
  if (state.atStart) return null;

  // Paused, and away from the start. This is where Phase 2 changed the answers
  // and nothing else: the surfaces that ask are the same ones, asking the same
  // way.
  switch (action) {
    case 'drag':
    case 'build':
    case 'structure':
    case 'history':
      return state.solveDeferred ? DEFERRED_DISPLACED : null;
    default:
      // Joint X/Y, link angle, masses, forces, cylinders, input speed. Each
      // waits for its own canonicalization transform (§5.5 of the plan).
      return DISPLACED_TYPING;
  }
}

/**
 * Why the transport is inert, if it is.
 *
 * Its refusals are about the *drawing* rather than about the pose, because the
 * transport is the one thing that stays usable while the mechanism is running:
 * refusing it for being mid-cycle would refuse the control that ends being
 * mid-cycle.
 */
function transportRefusal(state: EditState): EditRefusal | null {
  if (state.mode === 'synthesis') return IN_SYNTHESIS;
  // Deferred drawings are not refused: pressing Play is what asks for the
  // solve, and the button runs it behind the loading cover.
  if (state.solveDeferred) return null;
  if (state.empty) return NOTHING_DRAWN;
  if (!state.runnable) {
    // The readiness list has the specific answer and the caller pastes it in;
    // this is the sentence for a drawing whose parts belong to no machine at
    // all, which readiness has nothing to say about.
    return {
      short: 'nothing to run',
      long: 'Nothing here can run yet. Ground a joint and give one joint a drive.',
    };
  }
  return null;
}

/**
 * Everything refused purely for where in the cycle the mechanism is.
 *
 * Exported because two surfaces decide the *mode* half themselves and need only
 * this half: the context menu already builds a different set of rows per mode,
 * and graying every row of an analysis menu for being in an analysis mode would
 * gray the rows that mode exists to offer.
 */
export function displacementRefusal(state: EditState): EditRefusal | null {
  if (state.playing) return PLAYING;
  if (state.atStart) return null;
  return state.sharedStepZero ? DISPLACED_UNSYNCED : DISPLACED;
}
