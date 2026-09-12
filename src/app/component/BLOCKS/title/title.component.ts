import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  inject,
  input,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

/**
 * A heading inside a card, with an optional description and an optional button
 * on its line.
 *
 * Two blocks used to do this. They had the same three inputs, the same
 * imports, the same template down to the `id`s inside it, and differed in type
 * size: `title-block` at headline-6 with its own padding, `subtitle-block` at
 * subtitle-2 with none. So it is one block at two levels.
 *
 * **Both tags still select it**, rather than the subtitle becoming
 * `<title-block level="subtitle">`. That is not nostalgia: `panel-section`
 * slots its sticky heading with `<ng-content select="title-block,
 * editable-title-block">`, so a subtitle renamed to `title-block` would stop
 * landing in the body and start landing in the sticky title row. The level is
 * read from the tag the caller wrote.
 */
@Component({
  selector: 'title-block, subtitle-block',
  templateUrl: './title.component.html',
  styleUrls: ['./title.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon, MatIconButton],
})
export class TitleBlock {
  @Input() icon: string | undefined;
  @Input() buttonLabel: string | undefined;
  @Input() description: string | undefined;

  /** What the flat button does. Only the subtitle ever passed one. */
  readonly click = input<(() => void) | undefined>(undefined);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * The id the stylesheet dresses, and the two levels it knows. Kept as the
   * ids the two blocks already had, so every rule that reached one of them --
   * `panel-section`'s sticky heading among them -- still does.
   */
  protected get blockId(): 'title-block' | 'subtitle-block' {
    return this.host.nativeElement.tagName === 'SUBTITLE-BLOCK' ? 'subtitle-block' : 'title-block';
  }
}
