import { Component, ChangeDetectionStrategy, DoCheck, afterNextRender, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { NewGridComponent } from './component/new-grid/new-grid.component';
import { TopBarComponent } from './component/top-bar/top-bar.component';
import { BottombarComponent } from './component/bottombar/bottombar.component';
import { LeftTabsComponent } from './component/left-tabs/left-tabs.component';
import { PlaybackBarComponent } from './component/playback-bar/playback-bar.component';
import { RightPanelComponent } from './component/right-panel/right-panel.component';
import { NotificationComponent } from './component/notification/notification.component';
import { LoadingOverlayComponent } from './component/loading-overlay/loading-overlay.component';
import { AnalysisCompareService } from './services/analysis-compare.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    // animation triggers go here
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    NewGridComponent,
    TopBarComponent,
    BottombarComponent,
    LeftTabsComponent,
    PlaybackBarComponent,
    RightPanelComponent,
    NotificationComponent,
    LoadingOverlayComponent,
  ],
})
export class AppComponent implements DoCheck {
  private matIconRegistry = inject(MatIconRegistry);
  private domSanitizer = inject(DomSanitizer);
  private comparison = inject(AnalysisCompareService);

  /**
   * The tuning gesture is polled, and polled here first: the status strip, the
   * analysis panel and every open graph read the same record, and a reader
   * checked before the record was brought up to date sees one pass's stale
   * answer -- which Angular reports as NG0100 against whichever it was. The
   * shell is checked before all of them.
   */
  ngDoCheck(): void {
    this.comparison.sync();
  }

  constructor() {
    this.matIconRegistry.addSvgIcon(
      'com',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/com.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'com_off',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/com_off.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'abc',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/abc.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'abc_off',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/abc_off.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'new_link',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/new_link.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_ground',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_ground.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove_ground',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_ground.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_slider',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_slider.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_cylinder',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_cylinder.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove_slider',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_slider.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_input',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_input.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove_input',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_input.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/trash.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_force',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_force.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_tracer',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_tracer.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'show_path',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/show_path.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'hide_path',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/hide_path.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'switch_force_dir',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/switch_force_dir.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'force_global',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/force_global.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'force_local',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/force_local.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'weld_joint',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/weld_joint.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'unweld_joint',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/unweld_joint.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'make_circular',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/make_circular.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'make_bar',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/make_bar.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'github',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/github.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'edit_outline',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/edit.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'background_image',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/background_image.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'synthesis',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/synthesis.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'lock',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/lock.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'unlock',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/unlock.svg')
    );

    // Take down the splash `index.html` painted before any of this existed.
    //
    // `afterNextRender` rather than a lifecycle hook, because the thing it has
    // to wait for is not this component: the canvas is built during the first
    // render and decodes the address while it is, and that is the freeze the
    // splash is covering. Then a frame, so what replaces it is a drawn app
    // rather than a flash of empty grid.
    afterNextRender(() => requestAnimationFrame(() => this.hideBootSplash()));
  }

  /** Fade it out, then let it go. Idempotent: it can only be removed once. */
  private hideBootSplash(): void {
    const splash = document.getElementById('bootSplash');
    if (!splash) return;
    splash.style.transition = 'opacity 180ms ease-out';
    splash.style.opacity = '0';
    // Not `transitionend`: a reader with reduced motion, or a browser that
    // never runs the transition because the tab was in the background for it,
    // would leave a white sheet over the whole app forever. A timer always
    // fires.
    setTimeout(() => splash.remove(), 220);
  }
}
