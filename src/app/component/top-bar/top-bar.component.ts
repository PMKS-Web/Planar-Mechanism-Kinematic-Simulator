import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  ViewChild,
  inject,
  isDevMode,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { MatDialog } from '@angular/material/dialog';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismService } from '../../services/mechanism.service';
import { SaveHistoryService } from '../../services/save-history.service';
import { AnalyticsService } from '../../services/analytics.service';
import { UrlGenerationService } from '../../services/url-generation.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { TemplatesComponent } from '../MODALS/templates/templates.component';

/** A mode's chip: whether that analysis can be entered, and what is missing. */
interface TabStatus {
  text: string;
  ready: boolean;
}

/**
 * The strip across the top: what may be done to the mechanism, and whether it
 * is ready to be analysed.
 *
 * It replaces a horizontal file toolbar and a vertical mode rail which between
 * them took a whole edge and corner of the window. Opening and saving is not
 * what anyone is doing most of the time, so it folds into one menu and the
 * modes take the space instead.
 *
 * Both analysis tabs stay pressable even when they cannot be entered. A greyed
 * tab provokes exactly the question "why not?" and is the one control unable to
 * answer it; pressing these opens the setup list, which is the answer.
 */
@Component({
  selector: 'app-top-bar',
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  animations: [
    // The same 200ms and easing the mode highlight slides on, so the menu and
    // everything else in this strip move as one piece of machinery.
    trigger('menuOpen', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-6px)' }),
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        animate(
          '150ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'translateY(-6px)' })
        ),
      ]),
    ]),
  ],
  standalone: false,
})
export class TopBarComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  TabID = TabID;
  menuOpen = false;

  private analytics: AnalyticsService = inject(AnalyticsService);

  @ViewChild('tabStrip') tabStrip?: ElementRef<HTMLElement>;

  constructor(
    public tabs: SelectedTabService,
    public mechanism: MechanismService,
    private history: SaveHistoryService,
    private urlGeneration: UrlGenerationService,
    private urlProcessor: UrlProcessorService,
    private dialog: MatDialog,
    private zone: NgZone,
    private changes: ChangeDetectorRef
  ) {}

  isDevMode(): boolean {
    return isDevMode();
  }

  isActive(tab: TabID): boolean {
    return this.tabs.getCurrentTab() === tab && this.tabs.isTabVisible();
  }

  /**
   * Where the sliding highlight sits, measured off the active button.
   *
   * Measured rather than computed from an index because the tabs are different
   * widths, the divider takes space of its own, and the labels disappear on a
   * narrow window. Held as plain numbers and applied once per tab change: a
   * single CSS transition then eases the highlight across, so nothing runs per
   * frame that could stutter or strand it midway.
   *
   * Measured off a frame rather than read during change detection, because the
   * `active` class this looks for is applied by the same pass that would read
   * it back.
   */
  highlight = { left: 0, width: 0, visible: false };
  private pendingFrame = 0;
  private readonly onResize = () => this.scheduleHighlight();

  ngAfterViewInit(): void {
    this.scheduleHighlight();
    window.addEventListener('resize', this.onResize);
  }

  // After the pass, not during it: the `active` class this measures off is
  // written by the very pass that would read it back, so measuring inside one
  // reports where the highlight used to be and it trails a tab behind.
  ngAfterViewChecked(): void {
    this.scheduleHighlight();
  }

  ngOnDestroy(): void {
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    window.removeEventListener('resize', this.onResize);
  }

  private scheduleHighlight(): void {
    // Coalesce rather than restart. Cancelling the pending frame on every
    // checked pass means a busy app -- playback runs change detection every
    // frame -- cancels the measurement before it can ever run, and the
    // highlight sits on whichever tab was active last time things went quiet.
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      const active = this.tabStrip?.nativeElement.querySelector<HTMLElement>('.tabButton.active');
      const next = active
        ? { left: active.offsetLeft, width: active.offsetWidth, visible: this.tabs.isTabVisible() }
        : { ...this.highlight, visible: false };
      // Only on a real change, so the measure-every-pass above settles instead
      // of asking for another pass forever.
      if (
        next.left === this.highlight.left &&
        next.width === this.highlight.width &&
        next.visible === this.highlight.visible
      ) {
        return;
      }
      // Back inside Angular to assign it. An animation frame runs outside, so
      // the new position would sit in the field unrendered until something else
      // happened to trigger a pass -- which is the next tab change, leaving the
      // highlight permanently one behind.
      this.zone.run(() => {
        this.highlight = next;
        // And re-check this view explicitly. The assignment happens after the
        // pass that would have rendered it, so without this the new position
        // waits for whatever causes the *next* pass -- which is the next tab
        // change, leaving the highlight permanently one behind.
        this.changes.detectChanges();
      });
    });
  }

  select(tab: TabID): void {
    this.menuOpen = false;
    if (this.tabs.isAnalysisMode(tab) && !this.canAnalyse(tab)) {
      RightPanelComponent.tabClicked(RightPanelComponent.SETUP_TAB);
      return;
    }
    this.tabs.setTab(tab);
  }

  /** Kinematics needs one mechanism that runs. Force analysis needs more. */
  canAnalyse(tab: TabID): boolean {
    return tab === TabID.FORCE
      ? this.mechanism.forceAnalysisReady()
      : this.mechanism.oneValidMechanismExists();
  }

  statusOf(tab: TabID): TabStatus {
    if (tab === TabID.FORCE) {
      const missing = this.mechanism.forceAnalysisRequirements().filter((r) => !r.met).length;
      return missing === 0
        ? { text: 'Ready', ready: true }
        : { text: `${missing} to set`, ready: false };
    }
    const blockers = this.mechanism.blockerCount();
    return blockers === 0
      ? { text: 'Ready', ready: true }
      : { text: `${blockers} ${blockers === 1 ? 'fix' : 'fixes'}`, ready: false };
  }

  // Not while the mechanism is running: undo replays a URL, and replacing the
  // drawing underneath a playing animation is not something anyone asked for.
  canUndo(): boolean {
    return !this.mechanism.isAnimating() && this.history.canUndo();
  }

  canRedo(): boolean {
    return !this.mechanism.isAnimating() && this.history.canRedo();
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  newProject(): void {
    this.closeMenu();
    this.analytics.logEvent('new_project');
    window.open(window.location.origin + window.location.pathname, '_blank');
  }

  openTemplates(): void {
    this.closeMenu();
    this.dialog.open(TemplatesComponent, { height: '90%', width: '90%', autoFocus: false });
  }

  openSettings(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(1);
  }

  openHelp(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(3);
  }

  openDebug(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(4);
  }

  openSetup(): void {
    RightPanelComponent.tabClicked(RightPanelComponent.SETUP_TAB);
  }

  upload($event: Event): void {
    this.analytics.logEvent('upload_file');
    this.closeMenu();
    const input = $event.target as HTMLInputElement;
    if (!input.files || input.files.length !== 1) {
      NewGridComponent.sendNotification('No file selected');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      NewGridComponent.sendNotification('Loaded Mechanism from File');
      this.urlProcessor.updateFromURL(reader.result as string);
      // Reset the input so the same file can be opened again.
      input.value = '';
    };
    reader.readAsText(input.files[0]);
  }

  downloadLinkage(): void {
    this.closeMenu();
    this.analytics.logEvent('download_linkage');
    const blob = new Blob([this.urlGeneration.generateUrlQuery()], {
      type: 'text;charset=utf-8;',
    });
    const link = document.createElement('a');
    if (link.download === undefined) return;
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `PMKS+_${new Date().toISOString()}.pmks`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  copyURL(): void {
    this.closeMenu();
    this.analytics.logEvent('copyURL');
    const url = this.urlGeneration.generateFullUrl();
    const scratch = document.createElement('textarea');
    document.body.appendChild(scratch);
    scratch.value = url;
    scratch.textContent = url;
    scratch.select();
    document.execCommand('copy');
    document.body.removeChild(scratch);
    NewGridComponent.sendNotification(
      'Mechanism URL copied. If you make additional changes, copy the URL again.'
    );
  }
}
