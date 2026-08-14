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
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';

/**
 * View toggles that apply in every mode, so they sit at the foot of the nav
 * rail rather than inside a mode's own section.
 */
@Component({
  selector: 'app-view-controls',
  templateUrl: './view-controls.component.html',
  styleUrls: ['./view-controls.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatTooltip, MatIcon],
})
export class ViewControlsComponent implements AfterViewInit, OnDestroy {
  svgGrid = inject(SvgGridService);
  mechanismService = inject(MechanismService);
  settingsService = inject(SettingsService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Publish how wide this card is, for the drawer that stands over it.
   *
   * The setup drawer is meant to line up with these controls, and this card's
   * width is the number of buttons it happens to carry -- so it is measured
   * here rather than written down twice and left to drift the next time a
   * button is added.
   */
  ngAfterViewInit(): void {
    const card = this.host.nativeElement.querySelector('.viewControls') as HTMLElement | null;
    if (!card || typeof ResizeObserver === 'undefined') return;
    this.publishWidth(card);
    this.widthWatch = new ResizeObserver(() => this.publishWidth(card));
    this.widthWatch.observe(card);
  }

  private widthWatch?: ResizeObserver;

  private publishWidth(card: HTMLElement): void {
    const width = Math.round(card.getBoundingClientRect().width);
    if (width > 0) {
      document.documentElement.style.setProperty('--view-controls-width', `${width}px`);
    }
  }

  ngOnDestroy(): void {
    this.widthWatch?.disconnect();
    document.documentElement.style.removeProperty('--view-controls-width');
  }

  /**
   * Whether the thing this button switches on is currently on.
   *
   * The icon already swaps between an on and an off glyph; the button also
   * carries the state as a tint now that the words have gone, because an icon
   * alone is a weaker signal than an icon beside the word it stands for.
   */
  isShowingCoM(): boolean {
    return this.settingsService.isShowCOM.value;
  }

  isShowingIDs(): boolean {
    return this.settingsService.isShowID.value;
  }

  noJointExists(): boolean {
    return this.mechanismService.joints.length === 0;
  }

  isShowingTraces(): boolean {
    return this.settingsService.isShowTraces.value;
  }

  /**
   * Nothing traces its path, so there is nothing for this switch to do.
   *
   * Greyed rather than hidden: a control that comes and goes as joints are
   * asked to trace is a control nobody learns the position of.
   */
  noTracedJoint(): boolean {
    return !this.mechanismService.joints.some(
      (joint) => (joint as { showCurve?: boolean }).showCurve
    );
  }

  /** The glyph offers the other state, as the centre-of-mass button does. */
  traceIconName(): string {
    return this.settingsService.isShowTraces.value ? 'hide_path' : 'show_path';
  }

  onShowTracesPressed(): void {
    this.settingsService.isShowTraces.next(!this.settingsService.isShowTraces.value);
  }

  noLinkExists(): boolean {
    return this.mechanismService.links.length === 0;
  }

  showCenterOfMass(): void {
    const on = !this.settingsService.isShowCOM.value;
    this.settingsService.isShowCOM.next(on);
    // A display preference, remembered on this machine rather than in the URL
    // (see SettingsService.isShowCOM).
    writeStoredFlag('showCoM', on);
  }

  comIconName(): string {
    return this.settingsService.isShowCOM.value ? 'com_off' : 'com';
  }

  idLabelIconName(): string {
    return this.settingsService.isShowID.value ? 'abc_off' : 'abc';
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
}
