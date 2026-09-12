import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** What a chip is saying. `neutral` is a count with no verdict attached. */
export type ChipKind = 'neutral' | 'blocker' | 'warning' | 'ok' | 'on';

/**
 * A small stated fact beside a heading: how many fixes a mechanism needs, that
 * it is ready, that a choice is the one in force.
 *
 * A label, not a control. Nothing here is pressable and nothing lights up
 * under the pointer -- where a chip sits inside a button, as it does in the
 * mode tabs, the whole tab is the one target and a chip with a hover of its
 * own would read as a second thing to press.
 *
 * Four hand-rolled copies of this rule existed before it: the analysis setup
 * drawers, the mode tabs, the tutorial card and the synthesis panel. The first
 * three agreed on everything but a `nowrap`; the fourth is a size smaller, and
 * that is the whole of what `size` carries.
 *
 * The three status colors are spelled once here: red stops the analysis, amber
 * lets it run with something worth reading, green has nothing to say.
 *
 * **The host element is the chip.** It replaced a `<span class="chip">`, and
 * wrapping one in a component host puts an inline box around it that the span
 * never had -- which grew the synthesis panel by five pixels and moved the
 * tutorial's chip off its line. So the stylesheet dresses `chip-block` itself
 * and the template is the content and nothing else.
 */
@Component({
  selector: 'chip-block',
  templateUrl: './chip.component.html',
  styleUrls: ['./chip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
})
export class ChipComponent {
  readonly kind = input<ChipKind>('neutral');
  /**
   * `small` is the synthesis panel's chooser, where a chip rides inside a card
   * rather than beside a heading and the heading's size would crowd it.
   */
  readonly size = input<'default' | 'small'>('default');

  protected readonly classes = computed(() => `${this.kind()} ${this.size()}`);
}
