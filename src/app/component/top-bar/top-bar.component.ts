import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  inject,
  isDevMode,
  viewChild,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { MatDialog } from '@angular/material/dialog';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismService } from '../../services/mechanism.service';
import { SaveHistoryService } from '../../services/save-history.service';
import { AnalyticsService } from '../../services/analytics.service';
import { UrlGenerationService } from '../../services/url-generation.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { ExportFlowService } from '../../services/export/export-flow.service';
import { LoadingService } from 'src/app/services/loading.service';
import { TemplatesComponent } from '../MODALS/templates/templates.component';
import { NotificationService } from '../../services/notification.service';
import { TutorialService } from '../../services/tutorial.service';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { DrawingExportComponent } from '../MODALS/drawing-export/drawing-export.component';
import { ShortcutTipDirective } from '../../shortcut-tip.directive';

/** A mode's chip: whether that analysis can be entered, and what is missing. */
interface TabStatus {
  text: string;
  ready: boolean;
  /**
   * What the chip is colored by: red where something stops the analysis,
   * amber where it will run but something is worth reading first, green where
   * there is nothing to say. One vocabulary, here and in the setup drawers.
   *
   * `neutral` is the fourth, and it exists for force analysis alone. See
   * `statusOf`.
   */
  kind: 'blocker' | 'warning' | 'ok' | 'neutral';
}

/** The shortcuts the project menu prints on its own rows, and so must honor. */
const MENU_SHORTCUTS: ShortcutId[] = ['app.settings', 'app.help'];

/**
 * The strip across the top: what may be done to the mechanism, and whether it
 * is ready to be analyzed.
 *
 * It replaces a horizontal file toolbar and a vertical mode rail which between
 * them took a whole edge and corner of the window. Opening and saving is not
 * what anyone is doing most of the time, so it folds into one menu and the
 * modes take the space instead.
 *
 * Both analysis tabs stay pressable even when they cannot be entered. A grayed
 * tab provokes exactly the question "why not?" and is the one control unable to
 * answer it; pressing these opens the setup list, which is the answer.
 *
 * One button per mode, carrying its readiness chip as a label rather than as a
 * second control beside it -- see `select` for the three things a press means.
 */
@Component({
  selector: 'app-top-bar',
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  animations: [
    // Undo/Redo giving the corner over to Export Data, and back. The one on its
    // way out leaves the flow, so the card takes the width of the one arriving
    // instead of holding both.
    // Export arrives from the right-hand edge it lives on, and leaves the same
    // way. It is joining a card that is already there rather than replacing
    // what is in it, so nothing already on the card may move: the two buttons
    // beside it keep their place and this slides in past them.
    trigger('slideInFromRight', [
      transition(':enter', [
        // Width as well as the slide, so the card grows *with* it. The card is
        // pinned to the window's right edge, so gaining a control widens it
        // leftwards -- and with only the button animating, that widening
        // happened in one frame and moved Undo and Redo before anything slid.
        // `margin-left` goes with it, or the card's own 6px gap is still there
        // at zero width and the growth starts with a jump of its own.
        style({ width: 0, marginLeft: '-6px', opacity: 0, transform: 'translateX(10px)' }),
        animate(
          '220ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ width: '*', marginLeft: '*', opacity: 1, transform: 'none' })
        ),
      ]),
      transition(':leave', [
        animate(
          '170ms cubic-bezier(0.4, 0, 1, 1)',
          style({ width: 0, marginLeft: '-6px', opacity: 0, transform: 'translateX(10px)' })
        ),
      ]),
    ]),
    trigger('swapFace', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(7px)' }),
        animate('180ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        style({ position: 'absolute', top: 0, right: '6px', bottom: 0 }),
        animate(
          '140ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'translateY(-7px)' })
        ),
      ]),
    ]),
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
  imports: [ShortcutTipDirective, MatTooltip, MatIcon],
})
export class TopBarComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  tabs = inject(SelectedTabService);
  mechanism = inject(MechanismService);
  private history = inject(SaveHistoryService);
  private urlGeneration = inject(UrlGenerationService);
  private urlProcessor = inject(UrlProcessorService);
  private loading = inject(LoadingService);
  private dialog = inject(MatDialog);
  private zone = inject(NgZone);
  private changes = inject(ChangeDetectorRef);
  private exportFlow = inject(ExportFlowService);
  private notify = inject(NotificationService);
  private tutorial = inject(TutorialService);

  TabID = TabID;
  menuOpen = false;

  private analytics: AnalyticsService = inject(AnalyticsService);
  shortcuts = inject(KeyboardShortcutsService);
  private gridUtils = inject(GridUtilsService);

  readonly tabStrip = viewChild<ElementRef<HTMLElement>>('tabStrip');
  readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  /**
   * How much of each label the strip has room for: 2 full, 1 short, 0 icons.
   *
   * Measured rather than guessed at a width. Fixed breakpoints have to be set
   * for the widest the strip ever gets -- four modes, two status chips, both
   * spelled out -- so they throw words away long before the window has run out
   * of room for them. This asks the strip.
   */
  labelLevel = 3;
  /**
   * The room and the labels the current level was chosen for.
   *
   * Nothing else is remembered between fits. The natural widths depend on the
   * chips, the font and the layout being finished, and a set measured before
   * any of that settled says the strip is small enough for anything -- which
   * is how a phone came to show four full labels in a card a fifth of the
   * width they need.
   */
  private lastFit = '';

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
    document.fonts?.ready.then(() => {
      this.lastFit = '';
      this.zone.run(() => this.fitLabels());
    });
  }

  // After the pass, not during it: the `active` class this measures off is
  // written by the very pass that would read it back, so measuring inside one
  // reports where the highlight used to be and it trails a tab behind.
  ngAfterViewChecked(): void {
    this.watchCard();
    this.fitLabels();
    this.scheduleHighlight();
  }

  /**
   * Drop a level of label only once the level above will not fit.
   *
   * The three natural widths are measured once, by laying the strip out at each
   * level and reading what it wanted. After that it is arithmetic against the
   * space available, which is cheap enough to do on every checked pass.
   */
  private fitLabels(): void {
    const strip = this.strip()?.nativeElement;
    if (!strip || strip.clientWidth === 0) return;

    // Re-fit when the question changes, not on every pass: four class toggles
    // and four layout reads is cheap once and dear sixty times a second. The
    // chips are part of the question -- "Ready" is half of "3 to set".
    const question = [
      strip.clientWidth,
      this.statusOf(TabID.ANALYZE).text,
      this.statusOf(TabID.FORCE).text,
      this.tabs.getCurrentTab(),
    ].join('|');
    if (question === this.lastFit) return;
    this.lastFit = question;

    // What the strip wants at each level: its cards at their natural widths,
    // plus the gaps between them. Their laid-out widths would only tell us how
    // far they have already been squeezed.
    const gaps = 12 * Math.max(strip.children.length - 1, 0);
    const restore = strip.className;
    const wants = [0, 1, 2, 3].map((level) => {
      strip.classList.remove('fit0', 'fit1', 'fit2', 'fit3');
      strip.classList.add(`fit${level}`);
      return [...strip.children].reduce((total, card) => total + card.scrollWidth, 0) + gaps;
    });
    strip.className = restore;
    if (!(wants[3] > 0)) {
      // Nothing has been laid out yet. Ask again rather than remembering that.
      this.lastFit = '';
      return;
    }

    const level = wants.reduce(
      (best, want, at) => (want <= strip.clientWidth ? Math.max(best, at) : best),
      0
    );
    if (level !== this.labelLevel) {
      this.labelLevel = level;
      this.changes.detectChanges();
    }
  }

  /**
   * The keys that pick a mode go through `select`, exactly as the buttons do,
   * so a mode that is not ready opens its setup drawer rather than half
   * switching -- the gate is the mode's, not the button's.
   */
  private readonly keyed: Partial<Record<ShortcutId, () => void>> = {
    'mode.synthesis': () => this.select(TabID.SYNTHESIZE),
    'mode.edit': () => this.select(TabID.EDIT),
    'mode.kinematic': () => this.select(TabID.ANALYZE),
    'mode.force': () => this.select(TabID.FORCE),
    'app.settings': () => this.openSettings(),
    'app.help': () => this.openHelp(),
  };

  private keySub = this.shortcuts.pressed.subscribe((id) => this.keyed[id]?.());

  ngOnDestroy(): void {
    this.keySub.unsubscribe();
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    window.removeEventListener('resize', this.onResize);
    this.cardWatch?.disconnect();
  }

  private cardWatch?: ResizeObserver;

  /**
   * Watch the card, not just the window.
   *
   * The card can be squeezed without the window changing -- a chip growing, a
   * drawer opening beside it -- and a squeeze nothing asks a question about is
   * one the reader sees as clipped text.
   */
  private watchCard(): void {
    const card = this.strip()?.nativeElement;
    if (!card || this.cardWatch || typeof ResizeObserver === 'undefined') return;
    this.cardWatch = new ResizeObserver(() =>
      this.zone.run(() => {
        this.lastFit = '';
        this.fitLabels();
      })
    );
    this.cardWatch.observe(card);
  }

  private scheduleHighlight(): void {
    // Coalesce rather than restart. Canceling the pending frame on every
    // checked pass means a busy app -- playback runs change detection every
    // frame -- cancels the measurement before it can ever run, and the
    // highlight sits on whichever tab was active last time things went quiet.
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      const pill = this.tabStrip()?.nativeElement.querySelector<HTMLElement>('.tabButton.active');
      const next = pill
        ? { left: pill.offsetLeft, width: pill.offsetWidth, visible: this.tabs.isTabVisible() }
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

  /**
   * One press, three things -- because there is one button per mode.
   *
   * Refused: the setup that says why, and no mode change. Ready and elsewhere:
   * the mode, and nothing else opens over it. Ready and already here: the setup
   * toggles, so the mode a reader is standing in is also the way back to what
   * it needs.
   *
   * The refusal deliberately stays an insist rather than a toggle. A reader
   * pressing a mode that will not open is asking why, and taking the answer
   * away is not one -- pressing twice used to leave them with nothing, which is
   * what `attentionCount` exists to stop.
   */
  select(tab: TabID): void {
    this.closeMenu();
    const setup = this.setupTabFor(tab);
    if (setup === null) {
      this.tabs.setTab(tab);
      return;
    }
    // A large drawing is not solved while it is being edited, so the readiness
    // below would refuse the mode for the want of an answer nobody had asked
    // for yet. Asking for it *is* pressing this button, so it happens first.
    //
    // Behind the cover, because that solve holds the main thread for seconds on
    // a drawing this size -- the render stress test's forty-five joints take
    // about three -- and a window that neither repaints nor answers a click
    // reads as a crash rather than as a wait. Saying so at the top of a
    // synchronous block would not paint, which is the whole reason `during`
    // exists: it puts the cover up, waits for it to reach the glass, and only
    // then takes the thread. Nothing here is faster; it is visible.
    if (this.mechanism.solvingIsDeferred) {
      void this.loading
        .during('Working out the motion…', () => this.mechanism.solveNow())
        .then(() => this.openOrRefuse(tab, setup));
      return;
    }
    this.openOrRefuse(tab, setup);
  }

  /** What pressing a mode does once its answer is known to exist. */
  private openOrRefuse(tab: TabID, setup: number): void {
    if (!this.canAnalyze(tab)) {
      RightPanelComponent.insistOn(setup);
    } else if (this.isActive(tab)) {
      RightPanelComponent.tabClicked(setup);
    } else {
      this.tabs.setTab(tab);
    }
  }

  /** The setup drawer that answers for a mode, or null for a mode with none. */
  private setupTabFor(tab: TabID): number | null {
    if (tab === TabID.FORCE) return RightPanelComponent.FORCE_SETUP_TAB;
    if (tab === TabID.ANALYZE) return RightPanelComponent.KINEMATIC_SETUP_TAB;
    return null;
  }

  /** Kinematics needs one mechanism that runs. Force analysis needs more. */
  canAnalyze(tab: TabID): boolean {
    return tab === TabID.FORCE
      ? this.mechanism.forceAnalysisReady()
      : this.mechanism.oneValidMechanismExists();
  }

  /**
   * An empty grid has nothing to be ready for.
   *
   * "Ready" over an empty grid is a promise about a mechanism that has not
   * been drawn: nothing is stopping analysis because there is nothing to
   * analyze.
   */
  hasStatus(): boolean {
    return this.mechanism.joints.length > 0 || this.mechanism.links.length > 0;
  }

  statusOf(tab: TabID): TabStatus {
    if (tab === TabID.FORCE) {
      // Split rather than filtered away: what is unmet and not a warning stops
      // the analysis, and what is only a warning still has to reach the chip or
      // a mechanism with something odd about it reads as clear.
      const outstanding = this.mechanism.forceAnalysisRequirements().filter((r) => !r.met);
      const missing = outstanding.filter((r) => !r.warning).length;
      // Gray, where kinematics would be red. Forces are the one analysis a
      // reader can legitimately never want: a mechanism with no masses and no
      // loads is not a broken mechanism, it is one nobody has asked this
      // question about. Red on the strip from the first bar drawn until the
      // last mass typed reads as a fault the whole time, and the reader who is
      // only ever going to look at motion can never make it go away. So the
      // count is stated and left gray until the reader engages with forces at
      // all; from then on -- once something has a mass or a load -- amber and
      // green mean what they mean everywhere else.
      if (missing > 0) return { text: `${missing} to set`, ready: false, kind: 'neutral' };
      return outstanding.length > 0
        ? { text: `${outstanding.length} to check`, ready: true, kind: 'warning' }
        : { text: 'Ready', ready: true, kind: 'ok' };
    }
    const blockers = this.mechanism.blockerCount();
    if (blockers > 0) {
      return {
        text: `${blockers} ${blockers === 1 ? 'fix' : 'fixes'}`,
        ready: false,
        kind: 'blocker',
      };
    }
    const warnings = this.mechanism.warningCount();
    return warnings > 0
      ? { text: `${warnings} to check`, ready: true, kind: 'warning' }
      : { text: 'Ready', ready: true, kind: 'ok' };
  }

  /**
   * The mode's name with its chip read into it.
   *
   * The chip is a label rather than a control, and a button carrying an
   * `aria-label` of its own does not read its contents -- so the count is said
   * here or it is not said at all.
   */
  nameOf(tab: TabID, name: string): string {
    return this.hasStatus() ? `${name}: ${this.statusOf(tab).text}` : name;
  }

  /**
   * What the press will do, for the two presses that are not a mode change.
   *
   * One button now means three things, and which one it means depends on state
   * the reader cannot see -- so the tooltip says it rather than leaving them to
   * find out by pressing.
   */
  tipFor(tab: TabID, name: string): string {
    if (this.canAnalyze(tab) && !this.isActive(tab)) return name;
    const shown =
      this.canAnalyze(tab) &&
      RightPanelComponent.isOpen &&
      RightPanelComponent.openTab === this.setupTabFor(tab);
    return `${name}. ${shown ? 'Hides' : 'Shows'} what this mode needs.`;
  }

  // Not while the mechanism is running: undo replays a URL, and replacing the
  // drawing underneath a playing animation is not something anyone asked for.
  // The keyboard shortcut quotes the same predicate, so the buttons and Ctrl+Z
  // cannot answer differently in the window where the ease home is still running.
  canUndo(): boolean {
    return this.gridUtils.canRestoreHistory() && this.history.canUndo();
  }

  canRedo(): boolean {
    return this.gridUtils.canRestoreHistory() && this.history.canRedo();
  }

  /**
   * Whether there is anything to take away.
   *
   * A solved mechanism, rather than a selected part: the drawer offers every
   * part of every machine, so a reader who has selected nothing still has an
   * export to make -- which is exactly the case the old one-click command could
   * not serve.
   */
  canExport(): boolean {
    return this.mechanism.oneValidMechanismExists();
  }

  exportTooltip(): string {
    return this.canExport()
      ? 'Choose parts, columns and a file format.'
      : 'Nothing has been solved yet, so there are no numbers to export.';
  }

  exportData(): void {
    this.exportFlow.reset();
    RightPanelComponent.insistOn(RightPanelComponent.EXPORT_TAB);
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  toggleMenu(event: MouseEvent): void {
    // A button activated from the keyboard reports a click with no pointer
    // behind it: `pointerType` is empty and `detail` is 0, where a real press
    // of any kind names its device and counts itself. That is the only place
    // the modality is knowable, so it is read here and remembered.
    const pointer = (event as PointerEvent).pointerType;
    this.menuOpen ? this.closeMenu() : this.openMenu(!pointer && event.detail === 0);
  }

  /**
   * Open it, and take focus with it.
   *
   * A popover that leaves focus on its trigger is one the keyboard cannot
   * reach: Tab walked the modes behind the scrim before it ever arrived at New
   * Project, and every key the drawing answers went on answering it out of
   * sight -- Delete removing a joint nobody could see, Escape deselecting
   * instead of closing this. The menu holds the keys while it is up
   * (`onMenuKey`) and gives focus back to the trigger when it goes.
   *
   * Whether that focus is *drawn* is a separate question, and `menuByKeyboard`
   * is this component's answer to it.
   */
  private openMenu(fromKeyboard: boolean): void {
    this.menuReturn = document.activeElement as HTMLElement | null;
    this.menuByKeyboard = fromKeyboard;
    this.menuOpen = true;
    // After the pass that renders it. There is nothing to focus until then.
    setTimeout(() => this.menuItems()[0]?.focus());
  }

  /**
   * Whether to draw the ring around the row that has focus.
   *
   * This used to be left to `:focus-visible`, on the reasoning that the browser
   * knows better than we do which of a click and a keypress just happened. It
   * does, except immediately after a page load: with no interaction recorded
   * yet, a script moving focus is treated as keyboard work, so the first menu
   * opened after a refresh drew a ring around New Project and every menu opened
   * after that did not. A highlight that appears only on the first try reads as
   * a bug in whatever it is highlighting.
   *
   * The component does not have to guess. It knows how the menu was opened,
   * because it handled the event that opened it, and it knows when a reader who
   * opened it with the mouse reaches for the arrow keys -- at which point the
   * ring is exactly what they need and it comes back.
   */
  menuByKeyboard = false;

  /** Where focus was when the menu took it, so closing can hand it back. */
  private menuReturn: HTMLElement | null = null;
  private readonly projectMenu = viewChild<ElementRef<HTMLElement>>('projectMenu');

  closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menuReturn?.focus();
    this.menuReturn = null;
  }

  private menuItems(): HTMLElement[] {
    const menu = this.projectMenu()?.nativeElement;
    return menu ? [...menu.querySelectorAll<HTMLElement>('.menuItem')] : [];
  }

  /**
   * While the menu is up, the keys are the menu's.
   *
   * `KeyboardShortcutsService` listens on `window`, and stopping the event
   * here is the only way a popover can say the canvas is covered -- the
   * service's own "something is over" test knows about dialogs and nothing
   * else. Arrows and Tab walk the items, and neither leaves the card: behind
   * a scrim, the controls a Tab would reach cannot be pressed anyway.
   */
  onMenuKey(event: KeyboardEvent): void {
    event.stopPropagation();
    // Except the menu's own two. Their keys are printed on the rows, and a
    // shortcut a reader is looking straight at should work where they are
    // looking -- the rest stay blocked because the card is over the canvas and
    // most of them edit what is underneath it.
    const own = MENU_SHORTCUTS.find((id) => this.shortcuts.matches(id, event));
    if (own) {
      event.preventDefault();
      this.keyed[own]?.();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu();
      return;
    }
    const step = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey) ? 1 : -1;
    if (!['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key)) return;
    const items = this.menuItems();
    if (items.length === 0) return;
    event.preventDefault();
    // Opened with the mouse or not, this reader is steering with the keyboard
    // now, and needs to see where they are.
    this.menuByKeyboard = true;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = at === -1 ? (step === 1 ? 0 : items.length - 1) : at + step;
    items[(next + items.length) % items.length].focus();
  }

  newProject(): void {
    this.closeMenu();
    this.analytics.logEvent('new_project');
    window.open(window.location.origin + window.location.pathname, '_blank');
  }

  openTemplates(): void {
    this.closeMenu();
    TemplatesComponent.openIn(this.dialog);
  }

  exportDrawing(): void {
    this.closeMenu();
    DrawingExportComponent.openIn(this.dialog);
  }

  openSettings(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(1);
  }

  openHelp(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(3);
  }

  /**
   * The way back to the tutorial once its offer has been dismissed for good.
   *
   * It opens at whichever step the drawing has not satisfied, so this works on
   * a mechanism already on the grid as well as on a bare one.
   */
  openTutorial(): void {
    this.closeMenu();
    this.tutorial.start();
  }

  openDebug(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(4);
  }

  /** The current mode's setup, for anything outside the strip that wants it. */
  openSetup(): void {
    RightPanelComponent.tabClicked(
      this.setupTabFor(this.tabs.getCurrentTab()) ?? RightPanelComponent.KINEMATIC_SETUP_TAB
    );
  }

  upload($event: Event): void {
    this.analytics.logEvent('upload_file');
    this.closeMenu();
    const input = $event.target as HTMLInputElement;
    // Silently. This fires when the picker is dismissed, and canceling a
    // dialog is not a thing that went wrong -- the reader closed it knowing
    // full well that they had chosen nothing.
    if (!input.files || input.files.length !== 1) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Behind the cover, and everything below waits on it: solving the
      // incoming mechanism takes the thread, so an opened file used to be a few
      // seconds of a window that had stopped answering.
      this.loading
        .during('Opening mechanism…', () =>
          this.urlProcessor.updateFromURL(reader.result as string)
        )
        .then(() => this.afterUpload(input))
        // The cover comes down in `during`'s own `finally`; this is only so a
        // failed open is a console error rather than an unhandled rejection.
        .catch((error) => console.error('Unable to open the file', error));
    };
    reader.readAsText(input.files[0]);
  }

  /** What a finished upload says and tidies, once the drawing is actually in. */
  private afterUpload(input: HTMLInputElement): void {
    // After the decode, and only if it worked. Said first, a corrupt or
    // old-format file got a green "Mechanism loaded." followed by the
    // decoder's own sticky failure, over a drawing that had not changed.
    //
    // The decoder raises that failure a tick late -- it can run inside its
    // own constructor, before there is an overlay to open into -- so this
    // waits the same tick and then asks whether it is on screen.
    setTimeout(() => {
      if (this.notify.live.some((one) => one.id === 'url.undecodable')) return;
      this.notify.success('file.loaded', 'Mechanism loaded.');
    });
    // Reset the input so the same file can be opened again.
    input.value = '';
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
    this.urlGeneration.copyFullUrl();
    this.notify.success('share.copied', 'Link copied. Copy again after your next change.');
  }
}
