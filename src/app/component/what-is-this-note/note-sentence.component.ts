import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PartRef } from '../../model/prose';
import { isTerm, NoteSentencePiece, TermRef } from '../../model/what-is-this/note-parts';
import { PartLinkComponent } from '../BLOCKS/part-link/part-link.component';

/**
 * A note's paragraph: `prose-block`'s parts, plus the terms the note explains,
 * each showing its meaning under the paragraph while the mouse is over it. A
 * definition is a small extra, so it is offered to a pointer only: a phone
 * gets the paragraph plain rather than words to press that open nothing else.
 */
@Component({
  selector: 'app-note-sentence',
  // Inline, and on one line, for the reason `prose-block` gives: whitespace
  // between the pieces would land in the sentence.
  template:
    '@for (piece of sentence(); track $index) {@if (isPart(piece)) {<part-link [part]="piece.part">{{ piece.label }}</part-link>} @else if (isTerm(piece)) {<span class="noteTerm" [class.shown]="piece === shown()" (mouseenter)="show.emit(piece)" (mouseleave)="show.emit(undefined)">{{ piece.text }}</span>} @else {{{ piece }}}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PartLinkComponent],
})
export class NoteSentenceComponent {
  readonly sentence = input.required<readonly NoteSentencePiece[]>();
  /** The term whose meaning is on show, to mark it. */
  readonly shown = input<TermRef | undefined>();
  readonly show = output<TermRef | undefined>();

  protected isPart(piece: NoteSentencePiece): piece is PartRef {
    return typeof piece !== 'string' && 'part' in piece;
  }
  protected readonly isTerm = isTerm;
}
