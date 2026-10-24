import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/** What a card shows: a library row, or a suggestion drawn as one. */
export interface CardFace {
  readonly name: string;
  readonly description: string;
  /** A still under `assets/gifs/`, or a picture made from a drawing. */
  readonly thumbnail: string;
  readonly animation?: string;
  /** Who suggested it, for a mechanism a reader sent in. */
  readonly credit?: string;
}

/**
 * One card of the Mechanism Library.
 *
 * A component of its own because three places draw it now -- the library's
 * grid, the preview beside the Suggest a Mechanism form and the Sent view --
 * and a preview that is a copy of the card is a preview that drifts from it.
 * What goes under the picture (the Open button, or a line saying the
 * suggestion is waiting) is the caller's, projected in.
 *
 * Its rules are in the library's stylesheet, `#templates .templateCard`, with
 * everything else the dialog draws.
 */
@Component({
  selector: 'app-template-card',
  templateUrl: './template-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon],
  host: {
    class: 'templateCard',
    '[class.credited]': '!!card().credit',
  },
})
export class TemplateCardComponent {
  readonly card = input.required<CardFace>();
}
