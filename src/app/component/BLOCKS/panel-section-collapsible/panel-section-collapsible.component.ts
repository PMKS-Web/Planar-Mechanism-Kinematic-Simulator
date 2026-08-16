import {
  AfterContentInit,
  Component,
  Input,
  ChangeDetectionStrategy,
  input,
  output,
  contentChildren,
} from '@angular/core';
import { TitleBlock } from '../title/title.component';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { NgClass } from '@angular/common';

@Component({
  selector: 'panel-section-collapsible',
  animations: [
    trigger('openClose', [
      state(
        'open',
        style({
          height: '*',
          opacity: 1,
        })
      ),
      state(
        'closed',
        style({
          height: '0px',
          opacity: 0,
        })
      ),
      transition(':enter', []),
      transition('* => *', [animate('0.2s ease-in-out')]),
    ]),
  ],
  templateUrl: './panel-section-collapsible.component.html',
  styleUrls: ['./panel-section-collapsible.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [NgClass],
})
export class PanelSectionCollapsibleComponent implements AfterContentInit {
  @Input() expanded: boolean = true;
  readonly warning = input<boolean>(false);

  public isLoaded: boolean = false;

  readonly titleBlock = contentChildren(TitleBlock);

  readonly closed = output<boolean>();
  readonly opened = output<boolean>();

  ngAfterContentInit() {
    this.titleBlock()
      ?.at(0)!
      .nestedComponentChange.subscribe(() => this.toggleExpand());
    setTimeout(() => {
      this.isLoaded = true;
    });
  }

  toggleExpand() {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.opened.emit(true);
    } else {
      this.closed.emit(true);
    }
  }
}
