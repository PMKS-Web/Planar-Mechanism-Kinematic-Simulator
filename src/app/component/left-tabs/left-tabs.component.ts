import { RightPanelComponent } from '../right-panel/right-panel.component';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';
import { SynthesisPanelComponent } from '../synthesis-panel/synthesis-panel.component';
import { EditPanelComponent } from '../edit-panel/edit-panel.component';
import { AnalysisPanelComponent } from '../analysis-panel/analysis-panel.component';
import { TutorialService } from '../../services/tutorial.service';
import { ViewportService } from '../../services/viewport.service';
import { CHROME_MOVED } from '../../model/chrome-motion';

@Component({
  selector: 'app-left-tabs',
  templateUrl: './left-tabs.component.html',
  styleUrls: ['./left-tabs.component.scss'],
  animations: [
    trigger('openClose', [
      // ...
      // The card's own width, plus the gap it keeps from the window on one side
      // and the room its shadow needs on the other -- `$card-inset` and
      // `$shadow-room` in left-tabs.vars.scss. An animation state is a style
      // written onto the element, so it beats the stylesheet and these two have
      // to be kept in step by hand: 250 + 12 + 16, and 400 + 12 + 16.
      state(
        'open',
        style({
          transform: 'translateX(0)',
          width: '278px', //Be careful, there are multiple places to change this value
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
          width: '428px', //Be careful, there are multiple places to change this value
        })
      ),
      transition('open => openWide', [animate('0.1s ease-in-out')]),
      transition('openWide => open', [animate('0.1s ease-in-out')]),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SynthesisPanelComponent, EditPanelComponent, AnalysisPanelComponent],
})
/**
 * The panel down the left: whatever the current mode has to say about the
 * selected part.
 *
 * The mode buttons that used to sit beside it have moved to the strip along the
 * top, so this is now only the drawer they open. It keeps its own slide, which
 * is why it is still a component rather than a bare @if in the shell.
 */
export class LeftTabsComponent implements AfterViewInit, OnDestroy {
  tabs = inject(SelectedTabService);
  viewport = inject(ViewportService);
  private tutorial = inject(TutorialService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The sheet's state lives on the tab service: the canvas opens it too. */
  readonly sheetExpanded = this.tabs.sheetExpanded;

  toggleSheet(): void {
    this.sheetExpanded.update((open) => !open);
  }

  /**
   * How tall the sheet is, for the bottom cluster to stand on.
   *
   * The mirror of `publishHeight` in the playback bar, and needed for the same
   * reason: on a phone the panel is docked to the bottom and the transport and
   * view controls are docked to the bottom too, so one of them has to be told
   * how much room the other is taking. Measured rather than assumed, because
   * the sheet is capped at a fraction of the window and is often shorter than
   * the cap -- an Edit panel with nothing selected is a few lines.
   *
   * There is no loop here even though the panel reads `--playback-clearance`
   * going the other way: on a phone the sheet's height is its content against a
   * cap, and it stops asking what the cluster is doing.
   */
  ngAfterViewInit(): void {
    const panel = this.host.nativeElement.querySelector('.panel') as HTMLElement | null;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    this.publishHeight(panel);
    this.heightWatch = new ResizeObserver(() => this.publishHeight(panel));
    this.heightWatch.observe(panel);
  }

  ngOnDestroy(): void {
    this.heightWatch?.disconnect();
    document.documentElement.style.removeProperty('--sheet-height');
  }

  private heightWatch?: ResizeObserver;

  private lastPublished = -1;

  private publishHeight(panel: HTMLElement): void {
    // Zero off the phone layout, where the panel is at the side and the cluster
    // below it has the bottom of the window to itself.
    const height = this.viewport.isPhone() ? Math.round(panel.getBoundingClientRect().height) : 0;
    if (height === this.lastPublished) return;
    this.lastPublished = height;
    document.documentElement.style.setProperty('--sheet-height', `${height}px`);
    // The sheet is a card over the canvas that has just started taking a
    // different amount of it, which is exactly what `CHROME_MOVED` is for.
    // Without this the inset is correct and nothing acts on it: opening the
    // sheet left the linkage where it was and the sheet came up over it.
    CHROME_MOVED.next();
  }

  public get TabID(): typeof TabID {
    return TabID;
  }

  /**
   * Is a right-hand drawer open?
   *
   * On a wide window both can be read at once. On a narrow one they overlap,
   * and two cards interleaving their borders reads as a broken layout rather
   * than as one thing in front of another — so the drawer wins and this hides.
   *
   * The tutorial card is pinned in that drawer without being one of its pages,
   * so it holds the frame open on its own — and a tutorial started with no
   * page open used to leave both cards showing on a narrow window.
   */
  get drawerOpen(): boolean {
    return RightPanelComponent.isOpen || (this.tutorial.started && !this.tutorial.exited);
  }
}
