import { registerAppIcons } from './app-icons';
import { hideBootSplash } from './boot-splash';
import {
  Component,
  ChangeDetectionStrategy,
  DoCheck,
  afterNextRender,
  inject,
} from '@angular/core';
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
    registerAppIcons(this.matIconRegistry, this.domSanitizer);

    // Take down the splash `index.html` painted before any of this existed.
    //
    // `afterNextRender` rather than a lifecycle hook, because the thing it has
    // to wait for is not this component: the canvas is built during the first
    // render and decodes the address while it is, and that is the freeze the
    // splash is covering. Then a frame, so what replaces it is a drawn app
    // rather than a flash of empty grid.
    afterNextRender(() => requestAnimationFrame(() => hideBootSplash()));
  }
}
