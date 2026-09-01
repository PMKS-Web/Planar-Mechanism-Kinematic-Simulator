import { Injectable } from '@angular/core';
import { forceStates, gridStates, jointStates, linkStates } from '../model/utils';

/** What a released gesture asks the caller to do, once. */
export interface GestureOutcome {
  /** A force endpoint moved, so the mechanism has to be rebuilt before saving. */
  rebuild: boolean;
  /** The gesture changed the mechanism, so it earns exactly one undo entry. */
  save: boolean;
  /**
   * The pointer travelled: this was a drag rather than a click.
   *
   * A different question from `save` -- a drag that got refused still
   * travelled, and it must not take the graphs with it either way.
   */
  travelled: boolean;
}

/**
 * The canvas interaction state machine.
 *
 * Four independent enums used to be four fields on NewGridComponent, assigned
 * from roughly a dozen scattered sites; a gesture that forgot one of them left
 * the canvas in a state no single field described. They live here instead,
 * behind named transitions, so the legal moves are enumerable and testable
 * without a DOM.
 *
 * The service also owns *gesture* bookkeeping, which is a different question
 * from "what is in flight": undo is a stack of URL strings, so a drag has to
 * produce exactly one save on release rather than one per pointer-move.
 */
@Injectable({
  providedIn: 'root',
})
export class DragStateService {
  private _grid: gridStates = gridStates.waiting;
  private _joint: jointStates = jointStates.waiting;
  private _link: linkStates = linkStates.waiting;
  private _force: forceStates = forceStates.waiting;

  private pointerIsDown = false;
  private pointerMoved = false;
  private mechanismModified = false;

  get grid(): gridStates {
    return this._grid;
  }

  get joint(): jointStates {
    return this._joint;
  }

  get link(): linkStates {
    return this._link;
  }

  get force(): forceStates {
    return this._force;
  }

  /** True while a rubber band is being stretched towards a new joint. */
  get isCreatingLink(): boolean {
    return (
      this._grid === gridStates.createJointFromGrid ||
      this._grid === gridStates.createJointFromJoint ||
      this._grid === gridStates.createJointFromLink
    );
  }

  /**
   * The tracing underlay is being moved or resized by its handles.
   *
   * Kept apart from the four enums because it is not mechanism state: it makes
   * `isDragging` true, so the canvas does not pan underneath the gesture, but
   * it never reaches `noteMechanismModified` and so earns no undo entry.
   */
  private backgroundImageHeld = false;

  /** True while an existing object is being moved, as opposed to created. */
  get isDragging(): boolean {
    return (
      this._joint === jointStates.dragging ||
      this._link === linkStates.dragging ||
      this._force === forceStates.draggingStart ||
      this._force === forceStates.draggingEnd ||
      this._force === forceStates.draggingBody ||
      this.backgroundImageHeld
    );
  }

  /**
   * Whether this gesture has actually travelled, rather than merely been held.
   *
   * The distinction a click and a drag are told apart by, which more than the
   * save path needs now: an analysis-mode gesture puts the graphs back on what
   * the reader was studying, and only a gesture that moved something should.
   */
  get travelled(): boolean {
    return this.pointerMoved;
  }

  get isPointerDown(): boolean {
    return this.pointerIsDown;
  }

  // --- Creation ---------------------------------------------------------

  beginCreatingLinkFromGrid(): void {
    this._grid = gridStates.createJointFromGrid;
  }

  beginCreatingLinkFromJoint(): void {
    this._grid = gridStates.createJointFromJoint;
    this._joint = jointStates.creating;
  }

  beginCreatingLinkFromLink(): void {
    this._grid = gridStates.createJointFromLink;
    this._link = linkStates.creating;
  }

  beginCreatingForce(): void {
    this._grid = gridStates.createForce;
    this._force = forceStates.creating;
  }

  /** Two-point cylinder creation: start point chosen, ghost tracking cursor. */
  beginCreatingCylinder(): void {
    this._grid = gridStates.createCylinder;
  }

  /** A creation gesture reached its second click and produced its object. */
  finishCreating(): void {
    this._grid = gridStates.waiting;
    this._joint = jointStates.waiting;
    this._link = linkStates.waiting;
    this._force = forceStates.waiting;
  }

  // --- Dragging ---------------------------------------------------------

  beginDraggingJoint(): void {
    this._joint = jointStates.dragging;
  }

  beginDraggingLink(): void {
    this._link = linkStates.dragging;
  }

  beginDraggingForceStart(): void {
    this._force = forceStates.draggingStart;
  }

  beginDraggingForceEnd(): void {
    this._force = forceStates.draggingEnd;
  }

  beginDraggingForceBody(): void {
    this._force = forceStates.draggingBody;
  }

  beginDraggingBackgroundImage(): void {
    this.backgroundImageHeld = true;
  }

  // --- Gesture ----------------------------------------------------------

  /** A pointer went down. Starts a fresh gesture; nothing is owed yet. */
  press(): void {
    this.pointerIsDown = true;
    this.pointerMoved = false;
    this.mechanismModified = false;
  }

  /** The pointer moved at all — not necessarily over anything draggable. */
  notePointerMoved(): void {
    this.pointerMoved = true;
  }

  /** Something in the mechanism actually changed during this gesture. */
  noteMechanismModified(): void {
    this.mechanismModified = true;
  }

  /**
   * The pointer came up: clear everything in flight and report what the gesture
   * earned. A gesture that moved nothing, or moved the pointer without touching
   * the mechanism, earns no undo entry — that is what keeps a click from
   * pushing a duplicate state onto the history stack.
   */
  release(): GestureOutcome {
    const outcome: GestureOutcome = {
      rebuild: this._force !== forceStates.waiting,
      save: this.pointerMoved && this.mechanismModified,
      // Whether the gesture was a drag rather than a click, which is a
      // different question from whether it changed anything: a drag that got
      // refused still travelled, and the graphs it must not steal are the same
      // graphs either way.
      travelled: this.pointerMoved,
    };
    this.cancel();
    this.pointerIsDown = false;
    // The credit itself is cleared by the next press(), not here — a released
    // gesture has nothing left to owe.
    return outcome;
  }

  /**
   * Abandon whatever is in flight without crediting the gesture. Used by the
   * middle- and right-button paths, and by creation gestures that get refused.
   */
  cancel(): void {
    // Everything the gesture had, including what it had *earned*. The credits
    // used to survive a cancel, so a drag abandoned by a delete left them for
    // the next release to spend: the delete minted one entry, the release
    // minted a second, and the first Undo took back only half of what the
    // reader had just seen happen.
    this.pointerMoved = false;
    this.mechanismModified = false;
    this._grid = gridStates.waiting;
    this._joint = jointStates.waiting;
    this._link = linkStates.waiting;
    this._force = forceStates.waiting;
    this.backgroundImageHeld = false;
    // The press is over too. It used to be left latched, so a gesture abandoned
    // rather than released -- which is what a long press and a pinch both are
    // -- left the canvas believing a pointer was still down.
    this.pointerIsDown = false;
  }
}
