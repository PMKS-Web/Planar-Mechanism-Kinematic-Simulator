import { Component, Input, ChangeDetectionStrategy, OnChanges, input, output } from '@angular/core';
import { animate, AUTO_STYLE, state, style, transition, trigger } from '@angular/animations';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'collapsible-subseciton',
  animations: [
    trigger('openClose', [
      state(
        'open',
        style({
          visibility: AUTO_STYLE,
          height: AUTO_STYLE,
          opacity: '1',
        })
      ),
      // `display` is not animatable — Angular warns and drops it, so the
      // collapse relies on the box shrinking to nothing instead. `.panel-content`
      // clips its overflow so the content is hidden once the height reaches 0.
      state(
        'closed',
        style({
          opacity: '0',
          height: '0px',
          padding: '0px',
        })
      ),
      transition(':enter', []),
      transition('* => *', [animate('0.15s ease-in-out')]),
    ]),
  ],
  templateUrl: './collapsible-subseciton.component.html',
  styleUrls: ['./collapsible-subseciton.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
})
export class CollapsibleSubsecitonComponent implements OnChanges {
  readonly hideHeader = input<boolean>(false); //If this is true the content cannot be expanded

  @Input() expanded: boolean = false;
  /**
   * Whether the open/close animation is at rest, which is when the box may
   * stop clipping. Timed rather than read from the animation's own events: a
   * synthetic listener needs the animation providers, and a spec that mounts
   * a panel without them then throws on the listener alone.
   */
  settled = true;
  private settling?: ReturnType<typeof setTimeout>;

  private unsettle(): void {
    this.settled = false;
    clearTimeout(this.settling);
    this.settling = setTimeout(() => (this.settled = true), 200);
  }

  ngOnChanges(): void {
    this.unsettle();
  }
  readonly titleLabel = input<string>('');

  readonly closed = output<boolean>();
  readonly opened = output<boolean>();

  toggleExpand() {
    this.expanded = !this.expanded;
    this.unsettle();

    if (this.expanded) {
      this.opened.emit(true);
    } else {
      this.closed.emit(true);
    }
  }
}
