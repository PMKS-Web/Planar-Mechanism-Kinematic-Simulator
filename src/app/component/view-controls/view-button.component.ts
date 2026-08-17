import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';

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
  selector: 'view-button',
  templateUrl: './view-button.component.html',
  styleUrls: ['./view-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip],
})
export class ViewButtonComponent {
  private shortcuts = inject(KeyboardShortcutsService);

  /** What a switch puts on the grid: "Center of Mass", "traced paths". */
  readonly noun = input<string>();
  /** The glyph for each state. The `shown` one is the plain, uncrossed glyph. */
  readonly shownIcon = input<string>();
  readonly hiddenIcon = input<string>();
  /** Whether that thing is on the grid right now. */
  readonly shown = input(false);

  /** A plain action instead: a Material ligature and the one name it goes by. */
  readonly icon = input<string>();
  readonly tooltip = input<string>();

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
  readonly label = computed(() => this.tooltip() ?? `Show ${this.noun()}`);

  /** The tooltip names what pressing it would do, which is the other state. */
  readonly tip = computed(() => {
    const name = this.noun()
      ? `${this.shown() ? 'Hide' : 'Show'} ${this.noun()}`
      : (this.tooltip() ?? '');
    const id = this.shortcut();
    return id ? this.shortcuts.tip(name, id) : name;
  });

  /** The glyph draws the grid as it is: the crossed-out one means hidden. */
  readonly glyph = computed(() => (this.shown() ? this.shownIcon() : this.hiddenIcon()) ?? '');
}
