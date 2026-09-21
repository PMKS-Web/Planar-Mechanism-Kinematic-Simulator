import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  selector: 'dual-button',
  templateUrl: './dual-button.component.html',
  styleUrls: ['./dual-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatButton, MatIcon, MatTooltip],
})
export class DualButtonComponent {
  readonly but1Text = input<string>();
  readonly but1Icon = input<string>();
  readonly but1Action = input.required<() => void>();
  readonly btn1Disabled = input<boolean>(false);
  readonly btn1Tooltip = input<string | undefined>();
  /** Longest label this half may show, so state changes do not reflow the row. */
  readonly but1WidthText = input<string | undefined>();

  readonly but2Text = input<string | undefined>();
  readonly but2Icon = input<string>();
  readonly but2Action = input<(() => void) | undefined>(undefined);
  readonly btn2Disabled = input<boolean>(false);
  readonly btn2Tooltip = input<string | undefined>();
}
