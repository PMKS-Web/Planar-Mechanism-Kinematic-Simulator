import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'dual-button',
  templateUrl: './dual-button.component.html',
  styleUrls: ['./dual-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class DualButtonComponent {
  @Input() but1Text: string | undefined;
  @Input() but1Icon: string | undefined;
  @Input() but1Action!: () => void;

  @Input() but2Text: string | undefined;
  @Input() but2Icon: string | undefined;
  @Input() but2Action!: () => void;
  @Input() btn2Disabled: boolean = false;
}
