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
  /** The whole sentence, for a tooltip, a snackbar, or a grayed row's title. */
  long: string;
  /**
   * Whether returning to the start pose is what clears this refusal.
   *
   * The surfaces that can offer a way out need to know that the button would
   * help, rather than guessing from the wording.
   */
  backToStartHelps?: boolean;
  /** The glyph the Edit panel's strip draws beside it. */
  glyph: string;
  /**
   * The same sentence in three pieces, so the way out can be a link *inside*
   * it rather than a button beside it.
   *
   * The panel is 250px wide. A sentence and a button sharing that line left the
   * sentence four words deep with the button hard against it, and a button
   * stacked under it made the strip a different height in every state. Written
   * as prose with one word underlined, every message is the same two lines.
   */
  lead: string;
  action?: string;
  tail?: string;
  /** What pressing that word does. */
  actionKind?: 'backToStart' | 'toEdit';
}

/**
 * One refusal, written once.
 *
 * `long` is built from the pieces rather than written twice: the two used to be
 * separate strings, which is how a surface comes to quote a sentence the panel
 * no longer says.
 */
function refusal(parts: Omit<EditRefusal, 'long'>): EditRefusal {
  return {
    ...parts,
    long: [parts.lead, parts.action, parts.tail].filter(Boolean).join(' ').replace(/\s+/g, ' '),
  };
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
  /**
   * The machine parked away from its own start, by name, where the shared clock
   * does not show it.
   *
   * Carried rather than derived: the model is pure, and what a machine is called
   * is the service's to know.
   */
  awayMachine?: string;
  /** Built, but its motion deliberately not worked out yet (large drawings). */
  solveDeferred: boolean;
  /** Nothing drawn at all. */
  empty: boolean;
  /** At least one machine could run if asked. */
  runnable: boolean;
}

/** Nothing has been drawn, so there is nothing to play. */
const NOTHING_DRAWN: EditRefusal = refusal({
  short: 'nothing drawn',
  glyph: 'draw',
  lead: 'Nothing to play yet \u2014 draw a mechanism.',
});

const IN_SYNTHESIS: EditRefusal = refusal({
  short: 'synthesis mode',
  glyph: 'polyline',
  lead: 'Synthesis describes a mechanism that does not exist yet.',
  action: 'Switch to Edit',
  tail: 'to change one.',
  actionKind: 'toEdit',
});

const PLAYING: EditRefusal = refusal({
  short: 'animation running',
  glyph: 'play_circle',
  lead: 'Pause the animation to change the mechanism.',
  // The same button clears it: stopping is pausing plus the walk home, which
  // is what a reader who wants to edit is going to press next anyway.
  backToStartHelps: true,
});

/** Displaced, and the transport agrees it is displaced. */
const DISPLACED: EditRefusal = refusal({
  short: 'not at the start',
  glyph: 'motion_photos_paused',
  lead: 'The mechanism is parked mid-cycle.',
  action: 'Return it to the start',
  tail: 'to change it.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

/**
 * Why the document-wide settings cannot be changed right now.
 *
 * Units and the like belong to the whole drawing, and changing one rescales
 * every stored coordinate -- so they are typed at the start pose, standing
 * still. Which of the two reasons applies is not worth a sentence of its own:
 * the reader is being told what to do about it, and the same press fixes
 * either. So the condition is stated once, with the "or" in it, and the way
 * out is one word whatever stopped them.
 *
 * The panel used to say "Pause the animation to change." or "Return to the
 * start pose to change." depending on which it was, which made the strip
 * rewrite itself under the reader's eyes as the animation ran on and stopped.
 */
export const SETTINGS_AT_START_ONLY: EditRefusal = refusal({
  short: 'playing or mid-cycle',
  glyph: 'motion_photos_paused',
  lead: 'Playing or away from the start.',
  action: 'Reset to the starting pose',
  tail: 'to change.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

/**
 * Displaced, but the shared clock reads zero -- so say which machine is not.
 *
 * Named, not counted. "One of the machines" is a sentence written by something
 * that does not know what the machine is called; the app does know, so it says
 * it.
 */
function displacedUnsynced(name: string | undefined): EditRefusal {
  return refusal({
    short: 'a mechanism is mid-cycle',
    glyph: 'pause_circle',
    lead: `${name ?? 'One of the mechanisms'} is parked away from its start.`,
    action: 'Return every mechanism',
    tail: 'to edit.',
    actionKind: 'backToStart',
    backToStartHelps: true,
  });
}

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
const DISPLACED_TYPING: EditRefusal = refusal({
  short: 'shown at pose',
  glyph: 'motion_photos_paused',
  lead: 'Values at this pose. Drag to edit, or',
  action: 'return to the start',
  tail: 'to type.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

/**
 * A large drawing whose motion has not been worked out.
 *
 * Posed editing needs a cycle to anchor against, and re-anchoring costs a solve
 * per commit -- the exact cost the deferral exists to refuse. At the start pose
 * these drawings edit exactly as they always did.
 */
const DEFERRED_DISPLACED: EditRefusal = refusal({
  short: 'motion not worked out',
  glyph: 'hourglass_empty',
  lead: 'Motion is solved on request. Press Play, or',
  action: 'return to the start',
  tail: '.',
  actionKind: 'backToStart',
  backToStartHelps: true,
});

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

  // Synthesis owns the grid entirely: it describes a mechanism that does not
  // exist yet, so there is nothing here to refuse *about*.
  if (state.mode === 'synthesis') return IN_SYNTHESIS;
  // Playing is read-only whatever the action. A reader reaching for a joint
  // that is moving is a fight nothing here can win.
  if (state.playing) return PLAYING;
  if (state.atStart) return null;

  // Analysis can change the drawing at its start. Posed drags and undo have
  // an anchor-preserving path; restructuring from a graph's pose does not.
  if (state.mode === 'analysis' && (action === 'build' || action === 'structure')) {
    return displacementRefusal(state);
  }

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
      //
      // Which sentence depends on whether the transport agrees it is displaced.
      // "Not at the start" over a scrubber reading 0:00 sends a reader to a
      // control that looks parked; unsynced, the machine that is actually away
      // is named instead.
      return state.sharedStepZero ? displacedUnsynced(state.awayMachine) : DISPLACED_TYPING;
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
    return refusal({
      short: 'nothing to run',
      glyph: 'link_off',
      lead: 'Nothing here can run yet. Ground a joint and give one joint a drive.',
    });
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
  return state.sharedStepZero ? displacedUnsynced(state.awayMachine) : DISPLACED;
}

/** What an action needs in order to preserve the authored start. */
export type MenuPosePolicy = 'start' | 'preserve' | 'attachment' | 'view';

/** A paused pose allows edits with a defined mapping back to the authored drawing. */
export function menuRefusal(
  state: EditState,
  policy: MenuPosePolicy = 'start'
): EditRefusal | null {
  if (state.playing) return PLAYING;
  if (policy === 'view') return null;
  if (state.mode === 'synthesis') return IN_SYNTHESIS;
  if (state.atStart || policy === 'preserve') return null;
  if (policy === 'attachment') return state.solveDeferred ? DEFERRED_DISPLACED : null;
  return displacementRefusal(state);
}
