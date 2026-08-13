import { RightPanelComponent } from '../right-panel/right-panel.component';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';

@Component({
  selector: 'app-left-tabs',
  templateUrl: './left-tabs.component.html',
  styleUrls: ['./left-tabs.component.scss'],
  animations: [
    trigger('openClose', [
      // ...
      // The card's own width plus the 20px the frame keeps around it for its
      // shadow. Set to the card's width alone, the frame was exactly as wide
      // as what it held, so the card overhung its own padding and the
      // right-hand shadow was cut off against the frame's edge.
      state(
        'open',
        style({
          transform: 'translateX(0)',
          width: '290px', //Be careful, there are multiple places to change this value
        })
      ),
      state(
        'closed',
        style({
          transform: 'translateX(calc(-100% - 100px))',
        })
      ),
      state(
        'openWide',
        style({
          width: '440px', //Be careful, there are multiple places to change this value
        })
      ),
      transition('open => openWide', [animate('0.1s ease-in-out')]),
      transition('openWide => open', [animate('0.1s ease-in-out')]),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
/**
 * The panel down the left: whatever the current mode has to say about the
 * selected part.
 *
 * The mode buttons that used to sit beside it have moved to the strip along the
 * top, so this is now only the drawer they open. It keeps its own slide, which
 * is why it is still a component rather than a bare @if in the shell.
 */
export class LeftTabsComponent {
  constructor(public tabs: SelectedTabService) {}

  public get TabID(): typeof TabID {
    return TabID;
  }

  /**
   * Is a right-hand drawer open?
   *
   * On a wide window both can be read at once. On a narrow one they overlap,
   * and two cards interleaving their borders reads as a broken layout rather
   * than as one thing in front of another — so the drawer wins and this hides.
   */
  get drawerOpen(): boolean {
    return RightPanelComponent.isOpen;
  }
}
