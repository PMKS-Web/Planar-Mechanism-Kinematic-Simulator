import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { isPart, opening, Prose } from '../../../model/prose';
import { PartLinkComponent } from '../part-link/part-link.component';

/**
 * A sentence that names parts, with each part drawn as a `part-link`.
 *
 * The sentence arrives in pieces (`model/prose.ts`), so nothing here parses
 * text to find the parts: the text is set as text, and each part as the link
 * to it. It is a whole sentence, so it opens with a capital even when its
 * first word is a part's name.
 */
@Component({
  selector: 'prose-block',
  // Inline, and on one line, on purpose: whitespace between the pieces would
  // land in the sentence, and a formatter reflowing a template file adds it.
  template:
    '@for (piece of shown(); track $index) {@if (isPart(piece)) {<part-link [part]="piece.part">{{ piece.label }}</part-link>}@else {{{ piece }}}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PartLinkComponent],
  host: { class: 'prose' },
})
export class ProseComponent {
  readonly sentence = input.required<Prose>();

  /** Its first word capitalized, a part's name included (`opening`). */
  protected readonly shown = computed(() => opening(this.sentence()));

  protected readonly isPart = isPart;
}
