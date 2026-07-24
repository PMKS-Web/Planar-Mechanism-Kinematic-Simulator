import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { animate, AUTO_STYLE, state, style, transition, trigger } from '@angular/animations';

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
  standalone: false,
})
export class CollapsibleSubsecitonComponent {
  @Input() hideHeader: boolean = false; //If this is true the content cannot be expanded

  @Input() expanded: boolean = false;
  @Input() titleLabel: string = '';

  @Output() closed: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() opened: EventEmitter<boolean> = new EventEmitter<boolean>();

  toggleExpand() {
    this.expanded = !this.expanded;

    if (this.expanded) {
      this.opened.emit(true);
    } else {
      this.closed.emit(true);
    }
  }
}
