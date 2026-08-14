import { Component, Input, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'button-block',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon],
})
export class ButtonComponent {
  activeSrv = inject(ActiveObjService);

  @Input() icon: string | undefined;
  readonly click = input<(() => void) | undefined>(undefined);
  readonly color = input<string>('primary');

  @Input() customIcon: string | undefined;
  readonly disabled = input<boolean>(false);
}
