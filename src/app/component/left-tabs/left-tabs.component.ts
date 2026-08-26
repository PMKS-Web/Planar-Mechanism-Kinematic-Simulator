import { RightPanelComponent } from '../right-panel/right-panel.component';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  Injector,
  afterNextRender,
  effect,
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

/**
 * How long after the sheet stops changing size the canvas is re-framed.
 *
 * Longer than the slide in left-tabs.component.scss, so one open is one reframe
 * rather than a reframe a frame.
 */
const SETTLE_MS = 280;

/** How long the sheet takes to slide up or down. */
const SLIDE_MS = 240;
/** Out fast, in gently: the standard "entering" curve. */
const SLIDE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

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
  // `effect` is created in ngAfterViewInit, which is outside the injection
  // context it wants, so it is handed one.
  private injector = inject(Injector);

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

    // The first run is the sheet arriving shut, and there is nothing to slide
    // from.
    let arriving = true;
    effect(
      () => {
        const open = this.sheetExpanded();
        if (arriving) {
          arriving = false;
          return;
        }
        if (!this.viewport.isPhone()) return;
        // After the render, not in the effect body. `slide` measures where the
        // sheet has landed, and an effect can run before the class binding that
        // puts it there: measured too early, opening read 0 as its destination
        // as well as its origin and skipped itself, while closing happened to
        // work because both of its numbers were right either way. That is the
        // shape of bug that looks like "the animation only goes one way".
        //
        // Before the paint, though, so the sheet is never shown at full height
        // for the frame in between.
        afterNextRender(() => this.slide(panel, open), { injector: this.injector });
      },
      { injector: this.injector }
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.settle);
    this.heightWatch?.disconnect();
    document.documentElement.style.removeProperty('--sheet-height');
  }

  private heightWatch?: ResizeObserver;

  private lastPublished = -1;
  private settle?: ReturnType<typeof setTimeout>;

  private publishHeight(panel: HTMLElement): void {
    this.write(panel);
    // Once the sheet has stopped moving, not on every frame of it. The height
    // is written every frame on purpose -- that is what carries the handle down
    // with the sheet -- but the sheet slides for 240ms now, and re-framing the
    // drawing against sixty different rects on the way is both wasted work and
    // a linkage that crawls while the panel opens. The frame it should settle
    // into is the one for where the sheet ends up.
    clearTimeout(this.settle);
    this.settle = setTimeout(() => {
      // Measured again first. The observer's last callback lands a few pixels
      // short of the end of an eased transition -- the tail moves less than a
      // device pixel a frame -- and the handle hung 3px inside the sheet
      // because of it, which is exactly the kind of gap this layout is supposed
      // not to have.
      this.write(panel);
      // The sheet is a card over the canvas that has just taken a different
      // amount of it, which is what `CHROME_MOVED` is for. Without it the inset
      // is correct and nothing acts on it: opening the sheet left the linkage
      // where it was and the sheet came up over it.
      CHROME_MOVED.next();
    }, SETTLE_MS);
  }

  /**
   * Slide the sheet up or down, between the two heights actually measured.
   *
   * Not a CSS transition on `max-height`, which is what this looked like it
   * wanted: the sheet is capped at 48dvh and its content is usually well under
   * that, so a transition on the cap spends most of its time shrinking a
   * ceiling nothing is touching -- the sheet appeared to snap open and then
   * finish moving three pixels. From height to height there is no slack.
   *
   * The Web Animations API rather than a class and a `transitionend`: it fills
   * nothing, so when it ends the stylesheet is back in charge and the sheet is
   * free to change height with its content. An inline height left behind would
   * pin the Edit panel at whatever size it happened to be when it opened.
   *
   * The handle needs no help. It is placed from the published height, and the
   * ResizeObserver that publishes it fires through the animation.
   */
  private slide(panel: HTMLElement, opening: boolean): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Where it is coming from is the last height published, because by the time
    // this runs the collapsed class is already on or off and the panel is
    // already at its destination.
    const from = opening ? 0 : Math.max(0, this.lastPublished);
    const to = opening ? Math.round(panel.getBoundingClientRect().height) : 0;
    if (from === to) return;
    panel.animate([{ maxHeight: `${from}px` }, { maxHeight: `${to}px` }], {
      duration: SLIDE_MS,
      easing: SLIDE_EASING,
      fill: 'none',
    });
  }

  /** Publish the sheet's height, if it has changed since last time. */
  private write(panel: HTMLElement): void {
    // Zero off the phone layout, where the panel is at the side and the cluster
    // below it has the bottom of the window to itself.
    const height = this.viewport.isPhone() ? Math.round(panel.getBoundingClientRect().height) : 0;
    if (height === this.lastPublished) return;
    this.lastPublished = height;
    document.documentElement.style.setProperty('--sheet-height', `${height}px`);
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
