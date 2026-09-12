import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * The button that closes a card, a drawer or a dialog.
 *
 * There were five of these and they agreed on nothing: 32px round in the
 * tutorial card and the right drawer, 36px with 6px corners in the release
 * notes, and Material's 40px icon button in the library and the CAD export
 * dialog. Even the two round ones differed -- one washed on hover at 4% and
 * the other at 6%.
 *
 * One look now, and it is the 32px round one the drawer and the tutorial
 * already shared, washing on hover at the 4% every other icon button in the
 * app uses. That is a visible change to the other three, made deliberately.
 *
 * **The host is the box**, so a caller places it by its own class the way it
 * placed the button it replaced. It was `display: contents` first, which looks
 * tidier and is worse: such an element has no box, so a class on it cannot be
 * positioned, measured or clicked, and every suite that addressed
 * `.closeDrawer` or `.closeCard` would have needed a two-part selector.
 */
@Component({
  selector: 'close-button',
  templateUrl: './close-button.component.html',
  styleUrls: ['./close-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatTooltip],
})
export class CloseButtonComponent {
  /**
   * What it closes, for a reader who cannot see the card: "Close tutorial"
   * rather than "Close" where more than one thing is closable.
   */
  readonly label = input('Close');
  /** Shown on hover. Off by default: most of these sit beside their own title. */
  readonly tooltip = input('');
  readonly pressed = output<void>();
}
