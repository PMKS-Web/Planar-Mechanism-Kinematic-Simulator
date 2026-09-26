import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  inject,
  input,
  OnDestroy,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { capitalized, Prose } from '../../model/prose';
import { MachineFactSheet } from '../../model/what-is-this/machine-sheet';
import {
  NoteSentencePiece,
  noteProse,
  TermRef,
  withTerms,
} from '../../model/what-is-this/note-parts';
import { PanelNote } from '../../model/what-is-this/note-prose';
import { MachineNote, WhatIsThisService } from '../../services/what-is-this/what-is-this.service';
import { ViewportService } from '../../services/viewport.service';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { ProseComponent } from '../BLOCKS/prose/prose.component';
import { NoteSentenceComponent } from './note-sentence.component';

/** A note, with every part it names made a part link and every term it explains marked. */
interface DrawnNote {
  looksLike?: string;
  paragraph: readonly NoteSentencePiece[];
  uses: { use: Prose; why: Prose }[];
}

/**
 * The "What Is This?" section of a machine's panel: a plain-English note on
 * what the machine is and does, written by a model from the facts PMKS+
 * worked out (`WhatIsThisService`).
 *
 * It is written when the section first shows a machine, since that is the
 * reader asking; after an edit the earlier note stays, faded, until the reader
 * asks for a new one.
 */
@Component({
  selector: 'app-what-is-this-note',
  templateUrl: './what-is-this-note.component.html',
  styleUrls: ['./what-is-this-note.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, ProseComponent, ButtonComponent, NoteSentenceComponent],
})
export class WhatIsThisNoteComponent implements DoCheck, OnDestroy {
  private whatIsThis = inject(WhatIsThisService);
  private viewport = inject(ViewportService);

  /** The machine, by its place in `MechanismService.partitions`. */
  readonly index = input.required<number>();

  protected state: MachineNote = { status: 'unwritten', stale: false };
  protected drawn?: DrawnNote;
  /** The term whose meaning shows under the paragraph. */
  protected shownTerm?: TermRef;
  protected readonly capitalized = capitalized;
  private drawnFrom?: { note: PanelNote; sheet: MachineFactSheet };
  /** Wakes the panel when a busy wait is over, so its button comes back. */
  private busyTimer = 0;

  ngDoCheck(): void {
    this.whatIsThis.offer(this.index());
    const state = this.whatIsThis.noteFor(this.index());
    if (state.status === 'busy' && state.retryAt !== this.state.retryAt) this.wakeAt(state.retryAt);
    this.state = state;
    this.drawn = this.draw(state);
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.busyTimer);
  }

  protected get busyOver(): boolean {
    return (this.state.retryAt ?? 0) <= Date.now();
  }

  protected write(): void {
    void this.whatIsThis.write(this.index());
  }

  /** Drawn again only when the note or the drawing it names parts of changes. */
  private draw(state: MachineNote): DrawnNote | undefined {
    const { note, sheet } = state;
    if (!note || !sheet) return undefined;
    if (this.drawnFrom?.note === note && this.drawnFrom.sheet === sheet) return this.drawn;
    this.drawnFrom = { note, sheet };
    this.shownTerm = undefined;
    const parts = sheet.parts;
    return {
      looksLike: note.looksLike,
      // Definitions are for a mouse to hover; on touch the paragraph is plain.
      paragraph: this.viewport.isTouch()
        ? noteProse(note.paragraph, parts)
        : withTerms(noteProse(note.paragraph, parts), note.terms),
      uses: note.uses.map((use) => ({
        use: noteProse(use.use, parts),
        why: noteProse(use.why, parts),
      })),
    };
  }

  private wakeAt(retryAt: number | undefined): void {
    window.clearTimeout(this.busyTimer);
    if (retryAt === undefined) return;
    // A timer is enough to run change detection again once the wait is over.
    this.busyTimer = window.setTimeout(() => undefined, Math.max(0, retryAt - Date.now()) + 50);
  }
}
