import { Component, Input, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
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
  activeSrv = inject(ActiveObjService);

  @Input() icon: string | undefined;
  readonly click = input<(() => void) | undefined>(undefined);
  readonly color = input<string>('primary');

  @Input() customIcon: string | undefined;
  readonly disabled = input<boolean>(false);
  /**
   * Said on hover, the way every other block in the panels says it. On the
   * button itself rather than on a help icon beside it: a button is its own
   * label, so there is nothing for the icon to sit next to, and a button that
   * needs explaining is exactly the one a person is already pointing at.
   */
  readonly tooltip = input<string>();
}
