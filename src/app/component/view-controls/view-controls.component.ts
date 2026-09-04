import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
} from '@angular/core';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService, writeStoredFlag } from '../../services/settings.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { ViewButtonComponent } from './view-button.component';
import { RealLink } from '../../model/link';
import { MatIcon } from '@angular/material/icon';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ViewportService } from '../../services/viewport.service';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';

/** The one gap a card keeps from its neighbor (left-tabs.vars.scss). */
const CARD_GAP = 12;

/**
 * View toggles that apply in every mode, so they sit at the foot of the nav
 * rail rather than inside a mode's own section.
 */
@Component({
  selector: 'app-view-controls',
  templateUrl: './view-controls.component.html',
  styleUrls: ['./view-controls.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ViewButtonComponent, MatIcon, CdkOverlayOrigin, CdkConnectedOverlay],
})
export class ViewControlsComponent implements AfterViewInit, OnDestroy {
  svgGrid = inject(SvgGridService);
  readonly viewport = inject(ViewportService);

  /** Whether the phone's drawer of view switches is up. */
  sheetOpen = false;

  /**
   * Above the *card*, never below it and never over it.
   *
   * The button is on the transport line, which is the last thing before the
   * home indicator, so there is no downward room. Anchoring to the button alone
   * put the drawer's bottom edge ten pixels above the button -- which is inside
   * the card, so it landed across the reading line. The lift is measured from
   * the card the button is sitting in.
   */
  sheetPosition: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -10 },
  ];

  toggleSheet(button: HTMLElement): void {
    if (!this.sheetOpen)
      this.sheetPosition = [{ ...this.sheetPosition[0], offsetY: -this.liftOver(button) }];
    this.sheetOpen = !this.sheetOpen;
  }

  /** How far above the button the card's own top edge is, plus the usual gap. */
  private liftOver(button: HTMLElement): number {
    const card = button.closest('.scrubCard');
    if (!card) return 10;
    return Math.max(10, button.getBoundingClientRect().top - card.getBoundingClientRect().top + 10);
  }

  mechanismService = inject(MechanismService);
  settingsService = inject(SettingsService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private shortcuts = inject(KeyboardShortcutsService);

  /**
   * The keys reach the same methods the buttons do, grayed state and all: a
   * switch that would change nothing on the grid is one the key must not
   * change either, or the shortcut and the button would disagree about what
   * the drawing can show.
   */
  private readonly keyed: Partial<Record<ShortcutId, () => void>> = {
    'view.zoomIn': () => this.onZoomInPressed(),
    'view.zoomOut': () => this.onZoomOutPressed(),
    'view.reset': () => this.onReframePressed(),
    'view.centerOfMass': () => !this.noMassiveLink() && this.showCenterOfMass(),
    'view.jointIds': () => !this.noJointExists() && this.onShowIDPressed(),
    'view.paths': () => !this.noTracedJoint() && this.onShowTracesPressed(),
  };

  private keySub = this.shortcuts.pressed.subscribe((id) => this.keyed[id]?.());

  /**
   * Publish where this card is, for the drawer that stands over it.
   *
   * The setup drawer is meant to line up with these controls and stop one gap
   * above them, and both numbers are this card's own -- its width is however
   * many buttons it ends up carrying, and its top edge is where the drawer has
   * to stop. Measured here rather than written down twice and left to drift.
   *
   * The drawer used to measure the whole transport row instead, which grows a
   * row per machine while unsynced: three machines pushed the drawer 92px up
   * the window, away from controls that had not moved.
   */
  ngAfterViewInit(): void {
    const card = this.host.nativeElement.querySelector('.viewControls') as HTMLElement | null;
    if (!card || typeof ResizeObserver === 'undefined') return;
    this.publishGeometry(card);
    this.geometryWatch = new ResizeObserver(() => this.publishGeometry(card));
    this.geometryWatch.observe(card);
    // The card is anchored to the bottom of the window, so a resize moves it
    // without changing its size -- which a ResizeObserver alone would miss.
    this.onWindowResize = () => this.publishGeometry(card);
    window.addEventListener('resize', this.onWindowResize);
  }

  private geometryWatch?: ResizeObserver;
  private onWindowResize?: () => void;

  private publishGeometry(card: HTMLElement): void {
    const box = card.getBoundingClientRect();
    const style = document.documentElement.style;
    if (box.width > 0) {
      style.setProperty('--view-controls-width', `${Math.round(box.width)}px`);
    }
    if (box.height > 0) {
      // From the bottom of the window to the top of this card, plus the gap a
      // card keeps from its neighbor.
      const clearance = Math.round(window.innerHeight - box.top) + CARD_GAP;
      style.setProperty('--view-controls-clearance', `${clearance}px`);
    }
  }

  ngOnDestroy(): void {
    this.keySub.unsubscribe();
    this.geometryWatch?.disconnect();
    if (this.onWindowResize) window.removeEventListener('resize', this.onWindowResize);
    document.documentElement.style.removeProperty('--view-controls-width');
    document.documentElement.style.removeProperty('--view-controls-clearance');
  }

  /**
   * Whether the thing this button switches on is on screen right now.
   *
   * The three switches say it the same way: a tint behind the button for on,
   * and a glyph that draws what is on the grid — crossed out only when the
   * thing is not there. The glyph used to offer the *other* state, so a switch
   * that was on wore the icon for off and the tint for on at the same time.
   */
  isShowingCoM(): boolean {
    return this.settingsService.isShowCOM.value;
  }

  isShowingIDs(): boolean {
    return this.settingsService.isShowID.value;
  }

  isShowingTraces(): boolean {
    return this.settingsService.isShowTraces.value;
  }

  /**
   * Nothing on the grid would change, so the switch is grayed.
   *
   * Grayed rather than hidden: a control that comes and goes as the drawing
   * does is a control nobody learns the position of. Each button asks about
   * exactly what its own toggle draws — labels want a joint to name, the
   * center-of-mass mark wants a link with a mass to have a center of, and a
   * path wants a joint that has been asked to trace one.
   */
  noJointExists(): boolean {
    return this.mechanismService.joints.length === 0;
  }

  noMassiveLink(): boolean {
    // The same test the canvas applies (NewGridComponent.showsCoM): a body with
    // a mass, which a slider block is not -- it has a mass and no mark, so a
    // drawing whose only weight sat on one offered a switch that did nothing.
    return !this.mechanismService.links.some((link) => link instanceof RealLink && link.mass > 0);
  }

  noTracedJoint(): boolean {
    return !this.mechanismService.joints.some(
      (joint) => (joint as { showCurve?: boolean }).showCurve
    );
  }

  onShowTracesPressed(): void {
    this.settingsService.isShowTraces.next(!this.settingsService.isShowTraces.value);
  }

  showCenterOfMass(): void {
    const on = !this.settingsService.isShowCOM.value;
    this.settingsService.isShowCOM.next(on);
    // A display preference, remembered on this machine rather than in the URL
    // (see SettingsService.isShowCOM).
    writeStoredFlag('showCoM', on);
  }

  onShowIDPressed(): void {
    this.settingsService.isShowID.next(!this.settingsService.isShowID.value);
  }

  onZoomInPressed(): void {
    this.svgGrid.zoomIn();
  }

  onZoomOutPressed(): void {
    this.svgGrid.zoomOut();
  }

  onReframePressed(): void {
    this.svgGrid.scaleToFitLinkage();
  }

  onFitFullMotionPressed(): void {
    this.svgGrid.scaleToFitFullMotion();
  }
}
