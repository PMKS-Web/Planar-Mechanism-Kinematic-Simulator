import {
  Component,
  Input,
  ChangeDetectionStrategy,
  booleanAttribute,
  input,
  output,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  selector: 'button-block',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon, MatTooltip],
})
export class ButtonComponent {
  @Input() icon: string | undefined;
  readonly click = input<(() => void) | undefined>(undefined);
  /**
   * Pressed.
   *
   * Prefer this where the action needs an argument: `(pressed)="goTo(part)"`
   * reads better than a `[click]` bound to a helper that returns a closure,
   * and it is evaluated when the press happens rather than during change
   * detection. `click` stays for the many call sites that pass a bound method.
   */
  readonly pressed = output<void>();
  readonly color = input<string>('primary');

  @Input() customIcon: string | undefined;
  readonly disabled = input<boolean>(false);
  readonly dataAction = input<string>();
  /**
   * Said on hover, the way every other block in the panels says it. On the
   * button itself rather than on a help icon beside it: a button is its own
   * label, so there is nothing for the icon to sit next to, and a button that
   * needs explaining is exactly the one a person is already pointing at.
   */
  readonly tooltip = input<string>();

  /**
   * Sized to its own label rather than to the panel.
   *
   * The default is the full-width button a panel section stacks. Two places
   * wanted an inline one and drew their own: the analysis setup drawer's
   * "Go To Joint B" inside a check, and the synthesis panel's pill beside a
   * section heading.
   */
  readonly inline = input<boolean, unknown>(false, { transform: booleanAttribute });
  /**
   * Filled in the brand color instead of stroked, for the one action a panel
   * is steering the reader towards. The synthesis panel's "Add position" is
   * the only one; its own `--armed` state inverts back to stroked, which is
   * `filled` off.
   */
  readonly filled = input<boolean, unknown>(false, { transform: booleanAttribute });
  /**
   * The button's accessible name, for one whose content is an icon alone.
   *
   * An `aria-label` written on the tag names the host, which is a role-less
   * custom element; the `<button>` inside is the thing that needs the name.
   */
  readonly ariaLabel = input<string>();
}
