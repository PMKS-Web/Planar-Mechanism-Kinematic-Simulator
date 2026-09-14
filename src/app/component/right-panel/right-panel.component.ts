import { TabID } from '../../selected-tab.service';
import { CHROME_MOVED } from '../../model/chrome-motion';
import {
  Component,
  inject,
  ChangeDetectionStrategy,
  DestroyRef,
  DoCheck,
  HostListener,
} from '@angular/core';
import { whenModeChanges } from '../../services/mode-change-hooks';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { TutorialService } from '../../services/tutorial.service';
import { AnalysisSetupComponent } from '../analysis-setup/analysis-setup.component';
import { ExportPanelComponent } from '../export-panel/export-panel.component';
import { TutorialPanelComponent } from '../tutorial-panel/tutorial-panel.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';
import { EquationPanelComponent } from '../equation-panel/equation-panel.component';
import { HelpPanelComponent } from '../help-panel/help-panel.component';
import { CloseButtonComponent } from '../BLOCKS/close-button/close-button.component';

@Component({
  selector: 'app-right-panel',
  templateUrl: './right-panel.component.html',
  styleUrls: ['./right-panel.component.scss'],
  animations: [
    trigger('openClose', [
      // ...
      // No width here: the drawer is as wide as the view controls it sits
      // above, which only the stylesheet can know -- see `--view-controls-width`.
      // An animation state is written onto the element and beats a stylesheet,
      // so a width here would be a second, silent opinion about it.
      state(
        'open',
        style({
          transform: 'translateX(0)',
        })
      ),
      state(
        'closed',
        style({
          // Clear of the 12px inset the drawer now floats at, plus a margin.
          // The old 10px was measured against a panel flush to the edge and
          // left a two-pixel sliver of it on screen.
          transform: 'translateX(calc(100% + 24px))',
          // And genuinely gone. Parked off the edge it still occupied the
          // page's width, so a closed drawer could be scrolled back into view.
          visibility: 'hidden',
        })
      ),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
    // The page inside the frame, kept for as long as the frame takes to leave.
    //
    // The frame has always animated both ways, but the page was torn down the
    // instant the drawer closed -- so what slid away was an empty box. The
    // drawer appeared to vanish rather than leave, and the canvas, which frames
    // itself around the cards standing on it by measuring them, saw a drawer of
    // no height in the first frame and re-framed in one jump instead of
    // following the drawer out the way it follows it in.
    trigger('drawerCard', [
      // Nothing for the page itself to do: the frame moves and it goes along,
      // on the frame's own timing.
      transition('sole => void', [animate('0.3s ease-in-out', style({ opacity: 1 }))]),
      // Unless the tutorial's card is holding the frame open, in which case
      // nothing is traveling and the page has to leave on its own.
      transition('held => void', [animate('0.2s ease-in-out', style({ opacity: 0 }))]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    AnalysisSetupComponent,
    ExportPanelComponent,
    TutorialPanelComponent,
    SettingsPanelComponent,
    EquationPanelComponent,
    HelpPanelComponent,
    CloseButtonComponent,
  ],
})
export class RightPanelComponent implements DoCheck {
  /**
   * The tutorial asks to be shown rather than reaching in and setting the tab.
   *
   * A service that imported this component to open it would close the loop
   * this component's own page has already opened -- the tutorial page injects
   * the service -- so the request travels the other way.
   */
  private tutorial = inject(TutorialService);

  /**
   * Whether the tutorial's card is showing above whatever page is open.
   *
   * It is pinned rather than paged: a student following a step has to be able
   * to open Settings or Export without the thing they are following being put
   * away, so it is not one of the numbered pages and does not take the drawer
   * from one.
   */
  tutorialShowing(): boolean {
    return this.tutorial.started && !this.tutorial.exited;
  }

  /** The frame stands open for a page, for the tutorial, or for both. */
  frameOpen(): boolean {
    return RightPanelComponent.isOpen || this.tutorialShowing();
  }

  constructor() {
    // A setup drawer answers a question about one mode, so it goes when that
    // mode does. The tab service announces the change; the drawer reacts here
    // rather than being called from the service, which would make a service
    // import a component (mode-change-hooks.ts).
    const stop = whenModeChanges((tab) => RightPanelComponent.closeSetupUnlessFor(tab));
    inject(DestroyRef).onDestroy(stop);
  }

  static openTab = 0; //Default open tab to "Edit" /
  static isOpen = false; // Is the tab open?
  /**
   * The two setup drawers, one per analysis mode.
   *
   * Separate because they answer different questions with different fixes: a
   * mechanism that will not run and a force analysis that has nothing to react
   * against are not the same problem, and a reader refused by one mode should
   * not have to read past the other mode's list to find out why.
   *
   * Numbered like their neighbors because that is how this panel has always
   * been addressed; named because "5" at a call site says nothing.
   */
  static readonly KINEMATIC_SETUP_TAB = 5;
  static readonly FORCE_SETUP_TAB = 6;
  /**
   * Export Data, which is a drawer rather than a dialog for the same reason the
   * setups are: the canvas stays visible, so ticking a part is done next to the
   * drawing it is a part of.
   */
  static readonly EXPORT_TAB = 7;
  /**
   * Bumped when a drawer is asked for that is already showing.
   *
   * Pressing a mode that is not ready opens the setup that says why. Pressing
   * it again used to close that setup -- so the reader who did not spot it the
   * first time asked twice and got nothing. It draws attention to itself
   * instead, which is what the second press was asking for.
   */
  static attentionCount = 0;

  /** Ask for a drawer without ever closing it. */
  static insistOn(tabID: number): void {
    if (this.isOpen && this.openTab === tabID) {
      this.attentionCount++;
      return;
    }
    this.isOpen = true;
    this.openTab = tabID;
  }

  static tabClicked(tabID: number) {
    if (!this.isOpen) {
      this.isOpen = true;
      this.openTab = tabID;
    } else {
      if (this.openTab === tabID) {
        this.isOpen = false;
      } else {
        this.openTab = tabID;
      }
    }
  }

  /**
   * Whether the drawer is currently being pointed at.
   *
   * A class for one animation's length, taken off again so a second ask plays
   * it a second time rather than doing nothing.
   */
  attention = false;
  private shownAttention = 0;

  // The tutorial can hold the frame open without a numbered page.
  private shownOpen = this.frameOpen();

  ngDoCheck(): void {
    const open = this.frameOpen();
    if (open !== this.shownOpen) {
      this.shownOpen = open;
      CHROME_MOVED.next();
    }
    // The Edit panel's resume line is offered only when the card is not up, and
    // a closed drawer still *renders* the page it was last showing -- it parks
    // off the edge rather than being torn down -- so the card cannot answer
    // this from its own lifecycle.
    this.tutorial.onScreen = this.tutorialShowing();
    if (RightPanelComponent.attentionCount !== this.shownAttention && !this.attention) {
      this.shownAttention = RightPanelComponent.attentionCount;
      this.attention = true;
      setTimeout(() => (this.attention = false), 650);
    }
  }

  /** Shut the drawer, whichever one is open. */
  close(): void {
    RightPanelComponent.dismiss();
  }

  /**
   * Escape shuts it, as Escape shuts everything else that is over the drawing.
   *
   * It closed a dialog, it cleared a selection, it now puts down a half-drawn
   * bar -- and it did nothing at all to the one panel covering a third of the
   * window, which had to be dismissed by its X. Ignored when nothing is open,
   * so a reader pressing Escape at the canvas still reaches whatever else
   * answers it.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (RightPanelComponent.isOpen) RightPanelComponent.dismiss();
  }

  /** Shut the drawer from outside it, the mirror of `insistOn`. */
  static dismiss(): void {
    RightPanelComponent.isOpen = false;
  }

  /**
   * Close a setup drawer that no longer describes the mode being shown.
   *
   * Settings and Help are about the app rather than a mode, so they stay.
   */
  static closeSetupUnlessFor(tab: TabID): void {
    if (!this.isOpen) {
      return;
    }
    // The force drawer holds the mass table, whose own header offers "Switch
    // to Edit mode" — a switch that must not close the thing that offered it.
    // So it survives Edit as well as Force, and only leaves for Synthesis.
    const forceDrawerBelongs = tab === TabID.FORCE || tab === TabID.EDIT;
    const wanted =
      tab === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : tab === TabID.ANALYZE
          ? RightPanelComponent.KINEMATIC_SETUP_TAB
          : -1;
    if (this.openTab === RightPanelComponent.FORCE_SETUP_TAB) {
      if (!forceDrawerBelongs) {
        this.isOpen = false;
      }
      return;
    }
    if (this.openTab === RightPanelComponent.KINEMATIC_SETUP_TAB && this.openTab !== wanted) {
      this.isOpen = false;
    }
    // Export is an analysis-mode command: there is nothing to take away from a
    // mechanism being drawn, and the drawer's own lists come from a solved
    // cycle that Edit is about to change.
    if (this.openTab === RightPanelComponent.EXPORT_TAB && wanted === -1) {
      this.isOpen = false;
    }
  }

  getOpenTab() {
    return RightPanelComponent.openTab;
  }

  getIsOpen() {
    return RightPanelComponent.isOpen;
  }
}
