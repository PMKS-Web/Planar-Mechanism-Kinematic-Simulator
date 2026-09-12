import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'title-block',
  templateUrl: './title.component.html',
  styleUrls: ['./title.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon, MatIconButton],
})
export class TitleBlock {
  @Input() icon: string | undefined;
  @Input() buttonLabel: string | undefined;
  @Input() description: string | undefined;
}
