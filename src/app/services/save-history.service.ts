import { Injectable, Injector, inject } from '@angular/core';
import { UrlGenerationService } from './url-generation.service';
import { UrlProcessorService } from './url-processor.service';
import { rememberDrawing } from './last-drawing';
import { MechanismService, PausedPlaybackPose } from './mechanism.service';
import { SelectedTabService } from '../selected-tab.service';

/*
 * This service is responsible for saving the history of the mechanism
 * as an ordered list of URLs representing the full mechanism state.
 * This is useful for undo and redo functionality.
 */

@Injectable({
  providedIn: 'root',
})
export class SaveHistoryService {
  private urlGenerationService = inject(UrlGenerationService);
  private injector = inject(Injector);

  private history: string[] = [];

  // index of the current state in the history
  private index: number = -1;

  /*
   * Add a new state to the history.
   * If the current state is not the last state in the history,
   * delete all states after the current state.
   * If the current state is the last state in the history,
   * add the new state to the end of the history.
   * Update index to point to the new last state.
   */
  save() {
    console.log('SAVE');

    // if the current state is not the last state in the history,
    // delete all states after the current state
    if (this.index < this.history.length - 1) {
      this.history.splice(this.index + 1);
    }

    // add the new state to the end of the history
    let state = this.urlGenerationService.generateUrlQuery();
    this.history.push(state);

    // update index to point to the new last state
    this.index = this.history.length - 1;
    this.remember();

    console.log('save', state);
  }

  /** Keep the state the reader is standing on, for the next page load. */
  private remember(): void {
    rememberDrawing(this.history[this.index]);
  }

  /**
   * Rewrite the entry the drawing is standing on, without adding one.
   *
   * For a change that is part of how the current state *arrived* rather than a
   * step away from it. The canvas sizes a drawing's marks to the drawing on the
   * fit that follows a load, and that happens a frame after the arrival has
   * been recorded -- so the entry held the default size, and the first undo
   * after opening a template resized every joint, ground mark and label by two
   * and a half times. Redo was correct, which is what gave it away: only the
   * arrival entry was wrong.
   *
   * Not a save: an undo the reader has not made yet must not become a step they
   * have to press twice to get past.
   */
  restate(): void {
    if (this.history.length === 0) return;
    this.history[this.index] = this.urlGenerationService.generateUrlQuery();
    this.remember();
  }

  /*
   * Return whether there is history before current state to undo to.
   */
  canUndo(): boolean {
    return this.index > 0;
  }

  /**
   * How many history steps have been taken, ever.
   *
   * Not the index -- undo and redo move that back and forth, and what a reader
   * needs to know is that a step *happened*. The analysis graphs drop their
   * comparison curve on one: the curve a step restores may be the very one the
   * comparison was taken from, and two identical lines is confusion rather than
   * comparison.
   */
  historySteps = 0;

  private setMechanismToState(index: number) {
    const urlProcessorService = this.injector.get(UrlProcessorService);
    const tabs = this.injector.get(SelectedTabService);
    const mechanism = this.injector.get(MechanismService);
    // History stores the design. In an analysis mode, the pose is the reader's
    // current viewpoint on that design and should remain where it was paused.
    const paused: PausedPlaybackPose | undefined = tabs.isAnalysisMode()
      ? mechanism.capturePausedPose()
      : undefined;
    // And the mode itself, for the same reason. Undo restores the design; it
    // does not decide where the reader is standing. Force Analysis steps aside
    // on its own when the last load is removed -- which is right for the edit
    // that removed it, and wrong for an undo that happens to pass through such
    // a state: Undo then Redo would have put the loads back and left the
    // reader in Edit, so a round trip that should change nothing changed the
    // mode.
    const mode = tabs.getCurrentTab();

    this.historySteps++;
    this.index = index;
    // Settings are part of the serialized mechanism state. Restoring only the
    // geometry leaves converted values paired with the wrong unit system and
    // makes unit changes impossible to undo safely.
    urlProcessorService.updateFromURL(this.history[this.index], false, true, false, true);
    if (paused) mechanism.restorePausedPose(paused);
    if (tabs.getCurrentTab() !== mode) tabs.setTab(mode);
    // Undo and redo move where the reader is standing, so they move what a
    // reload would bring back.
    this.remember();
    console.log('update to state ' + this.index + ': ' + this.history[this.index]);
  }

  /*
   * Undo to the previous state in the history.
   * Update index to point to the new current state.
   */
  undo() {
    if (!this.canUndo()) {
      console.log('cannot undo');
      return;
    }

    // Otherwise, update index to point to the new current state
    this.setMechanismToState(this.index - 1);
  }

  /*
   * Return whether there is history after current state to redo to.
   */
  canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  /*
   * Redo to the next state in the history.
   * Update index to point to the new current state.
   */
  redo() {
    if (!this.canRedo()) {
      console.log('cannot redo');
      return;
    }
    this.setMechanismToState(this.index + 1);
  }
}
