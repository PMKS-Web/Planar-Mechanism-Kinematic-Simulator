import { Component, Input, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';

@Component({
  selector: 'button-block',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ButtonComponent {
  activeSrv = inject(ActiveObjService);

  @Input() icon: string | undefined;
  @Input() click!: () => void;
  @Input() color: string = 'primary';

  @Input() customIcon: string | undefined;
  @Input() disabled: boolean = false;
}
