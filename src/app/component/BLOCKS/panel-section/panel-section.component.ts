import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ScrollShadowDirective } from '../../../scroll-shadow.directive';

@Component({
  selector: 'panel-section',
  templateUrl: './panel-section.component.html',
  styleUrls: ['./panel-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ScrollShadowDirective],
})
export class PanelSectionComponent {
  /**
   * Whether the card's contents are out of reach.
   *
   * Only the contents: the title still names what is selected, and anything in
   * the attached slot -- the Edit panel's refusal strip -- is how the reader is
   * told why, and how they get out. `inert` takes a whole subtree out of
   * pointer, keyboard and focus reach in one attribute, which is exactly right
   * for the contents and exactly wrong for the sentence explaining them.
   */
  readonly frozen = input(false);
}
