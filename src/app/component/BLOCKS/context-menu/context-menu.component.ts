import { Component, ChangeDetectionStrategy, DestroyRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { KeyboardShortcutsService } from '../../../services/keyboard-shortcuts.service';
import {
  CdkMenu,
  CdkMenuGroup,
  CdkMenuItem,
  CdkMenuItemRadio,
  MENU_STACK,
} from '@angular/cdk/menu';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  ContextMenuModel,
  MenuChoice,
  MenuChoiceOption,
  MenuCrossing,
  MenuRow,
  lastContextMenuPointer,
  lastContextMenuWasKeyboard,
  menuIsEmpty,
} from './menu-model';

/**
 * The right-click menu.
 *
 * A dumb renderer: every decision about what a row says, whether it can be
 * used and why not is made by `ContextMenuBuilderService`, which reads those
 * answers out of the model that enforces them. This lays them out.
 */
@Component({
  selector: 'app-context-menu',
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuItemRadio, MatIcon, MatTooltip],
})
export class ContextMenuComponent {
  readonly model = input<ContextMenuModel>({ groups: [] });
  /**
   * The stack the CDK opened this card on.
   *
   * A row is a `cdkMenuItem` and closes the card by itself; the crossing icon
   * is a plain button in the header, so it has to say so. A menu left standing
   * over a mode it no longer belongs to is the mode change half-done.
   */
  private readonly stack = inject(MENU_STACK, { optional: true });

  constructor() {
    // A shortcut acts on the selection, not on the card, and the card is a
    // snapshot: pressing K with a joint's menu open locked the joint and left
    // the menu showing the unlocked state, with a Delete row that was grayed
    // for a lock that had just been set, or live for one that had. Delete did
    // it behind the card. So any shortcut closes the card, and the next
    // right-click builds it again from what is now true.
    inject(KeyboardShortcutsService)
      .pressed.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.stack?.closeAll());
  }
  private contextMenu!: HTMLElement;

  /**
   * Whether to draw the focus the CDK moves into this card as it opens it.
   *
   * The focus itself is not optional -- it is what lets the arrow keys reach
   * the Joint Type values at all. Drawing it is a separate question, and
   * `:focus-visible` is the wrong instrument for it: the browser reads a script
   * moving focus as keyboard work unless the reader's last act was a pointer
   * that moved focus itself, so a card opened by right-click came up with a
   * ring around its first value -- on the value that is already chosen, where a
   * ring reads as a second kind of "selected" -- and lost it again on the next
   * card, which reads as a bug in whichever value happened to be first.
   *
   * So the component answers, from the event that opened the card, and turns it
   * on the moment a reader who right-clicked reaches for the keys. Exactly what
   * `TopBarComponent.menuByKeyboard` does for the project menu; `menu-focus.mjs`
   * guards both.
   */
  protected byKeyboard = false;

  /** A key pressed in here is a reader who wants to see where they are. */
  protected onKey(event: KeyboardEvent): void {
    // Escape only closes the card, so it is not a reason to paint a ring on the
    // way out.
    if (event.key !== 'Escape') this.byKeyboard = true;
  }

  ngAfterViewInit() {
    this.byKeyboard = lastContextMenuWasKeyboard();
    this.contextMenu = document.querySelector('#contextMenu') as HTMLElement;
    // Measured in the same tick the card is revealed, not in ngAfterViewInit:
    // the overlay has not been moved to the pointer yet at that point, so the
    // rect read there is the card sitting at the origin.
    setTimeout(() => {
      this.growFromThePointer();
      this.contextMenu.classList.add('show');
    }, 1);
  }

  /**
   * Start the scale-and-fade at the corner the pointer is in.
   *
   * The CDK flips the card at an edge, and a card that flips up and left while
   * growing down and right from its top-left reads as sliding into place from
   * somewhere else. Measured rather than predicted: whichever side of the
   * pointer the card actually landed on is the side it grows from.
   */
  private growFromThePointer(): void {
    const at = lastContextMenuPointer();
    const box = this.contextMenu.getBoundingClientRect();
    const across = box.left + box.width / 2 > at.x ? 'left' : 'right';
    const down = box.top + box.height / 2 > at.y ? 'top' : 'bottom';
    this.contextMenu.style.transformOrigin = `${down} ${across}`;
  }

  /**
   * Nothing to say, so nothing to show.
   *
   * The CDK opens the card on every right-click; a target with no rows and no
   * name would otherwise leave a blank white sliver on the canvas.
   */
  empty(): boolean {
    const model = this.model();
    return !model.header && menuIsEmpty(model);
  }

  /** Grayed is grayed: a row that says why it cannot be used does not act. */
  run(row: MenuRow): void {
    if (row.disabled) return;
    row.action();
  }

  /** The same rule for a value of the choice at the top of the card. */
  choose(option: MenuChoiceOption): void {
    if (option.refusal) return;
    option.action();
  }

  /**
   * What a value says on hover: why it cannot be chosen, or, on the chosen one,
   * what is wrong with it as it stands. Nothing is printed under the grid.
   */
  hoverTextFor(choice: MenuChoice, option: MenuChoiceOption, index: number): string {
    if (option.refusal) return option.refusal.long ?? option.refusal.short;
    return index === choice.chosen ? (choice.fault?.long ?? '') : '';
  }

  cross(crossing: MenuCrossing): void {
    if (crossing.refusal) return;
    crossing.action();
    this.stack?.closeAll();
  }
}
