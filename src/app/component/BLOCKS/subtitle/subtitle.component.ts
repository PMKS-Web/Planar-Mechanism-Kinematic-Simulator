import { Component, Input, ChangeDetectionStrategy, input } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'subtitle-block',
  templateUrl: './subtitle.component.html',
  styleUrls: ['./subtitle.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon, MatIconButton],
})
export class SubtitleComponent {
  @Input() icon: string | undefined;
  @Input() buttonLabel: string | undefined;
  @Input() description: string | undefined;

  readonly click = input<(() => void) | undefined>(undefined);
}
