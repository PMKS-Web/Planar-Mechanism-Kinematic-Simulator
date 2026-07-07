import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'subtitle-block',
  templateUrl: './subtitle.component.html',
  styleUrls: ['./subtitle.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SubtitleComponent {
  @Input() icon: string | undefined;
  @Input() buttonLabel: string | undefined;
  @Input() description: string | undefined;

  @Input() click!: () => void;
}
