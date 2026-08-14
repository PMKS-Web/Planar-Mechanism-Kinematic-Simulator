import { Component, Input, ChangeDetectionStrategy, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'dual-button',
  templateUrl: './dual-button.component.html',
  styleUrls: ['./dual-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon],
})
export class DualButtonComponent {
  readonly but1Text = input<string>();
  readonly but1Icon = input<string>();
  readonly but1Action = input.required<() => void>();

  @Input() but2Text: string | undefined;
  readonly but2Icon = input<string>();
  readonly but2Action = input<(() => void) | undefined>(undefined);
  readonly btn2Disabled = input<boolean>(false);
}
