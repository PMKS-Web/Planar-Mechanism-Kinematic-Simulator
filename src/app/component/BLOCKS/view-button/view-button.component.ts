import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { KeyboardShortcutsService, ShortcutId } from '../../../services/keyboard-shortcuts.service';
import { ShortcutTipDirective } from '../shortcut-tip/shortcut-tip.directive';

/**
 * One button in the view controls, in both kinds it comes in: a switch that
 * says whether something is on the grid, and a plain action like zooming.
 *
 * One component for all six because the six were written out six times, and
 * they drifted: the switches disagreed about whether the glyph showed the
 * state or offered the other one, about whether the tint or the ink carried
 * it, and about what "nothing to do" meant. Every one of those rules is here
 * now, once. A caller says what its switch is about; it does not get to say
 * how a switch looks.
 */
@Component({
  selector: 'app-view-button',
  templateUrl: './view-button.component.html',
  styleUrls: ['./view-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ShortcutTipDirective, MatIcon],
})
export class ViewButtonComponent {
  private shortcuts = inject(KeyboardShortcutsService);

  /** What a switch puts on the grid: "Center of Mass", "Traced Paths". */
  readonly noun = input<string>();
  /** The glyph for each state. The `shown` one is the plain, uncrossed glyph. */
  readonly shownIcon = input<string>();
  readonly hiddenIcon = input<string>();
  /** Whether that thing is on the grid right now. */
  readonly shown = input(false);

  /** A plain action instead: a Material ligature and the one name it goes by. */
  readonly icon = input<string>();
  /** Or a plain action drawn from the app's own SVG registry rather than Material's. */
  readonly svg = input<string>();
  readonly tooltip = input<string>();

  /**
   * A word drawn beside the glyph, for a switch that sits in a panel rather
   * than in the floating view controls. Not the accessible name -- that is
   * `label` below, which falls back to this.
   *
   * The analysis panel's row of drawing switches is the one of these: four
   * toggles that say what is drawn on the grid, which is exactly what this
   * component is for, but which need naming because they sit under a graph
   * rather than in a cluster a reader already knows.
   */
  readonly caption = input<string>();
  /**
   * Share the row rather than taking only the glyph's width. A labelled row of
   * these should end on the panel's own edge; a cluster of square ones should
   * not stretch.
   */
  readonly grow = input<boolean, unknown>(false, { transform: booleanAttribute });
  /**
   * The glyph's own ink, where the thing being switched has a color of its
   * own -- a velocity arrow is drawn in the color its trace uses, and the
   * switch teaches that color before the reader meets it on the drawing.
   */
  readonly ink = input<string>();

  /** The shortcut this button doubles, if it has one: its keys go in the tip. */
  readonly shortcut = input<ShortcutId>();

  /** True when pressing this would change nothing on the grid. */
  readonly disabled = input(false);
  readonly pressed = output<void>();

  /**
   * The control's own name, which does not change with its state -- a reader
   * looking for the traced-paths switch is looking for the same button whether
   * or not paths are showing, and so is a test.
   *
   * A switch also carries `aria-pressed`, so the state a sighted reader gets
   * from the tint reaches everyone else: the label alone always says "Show",
   * which left a screen reader with no way to tell an on switch from an off
   * one. The plain actions have no state and no such attribute.
   */
  protected readonly label = computed(
    () => this.caption() ?? this.tooltip() ?? `Show ${this.noun()}`
  );

  /**
   * The tooltip names what pressing it would do, which is the other state.
   *
   * Prose only: the shortcut is drawn as a key cap by `appShortcutTip`, at the
   * end, rather than written into this sentence in brackets.
   */
  protected readonly tip = computed(() =>
    this.noun() ? `${this.shown() ? 'Hide' : 'Show'} ${this.noun()}` : (this.tooltip() ?? '')
  );

  /** The glyph draws the grid as it is: the crossed-out one means hidden. */
  protected readonly glyph = computed(
    () => (this.shown() ? this.shownIcon() : this.hiddenIcon()) ?? ''
  );
}
