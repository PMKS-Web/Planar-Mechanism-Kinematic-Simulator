import { CHROME_TABS } from '../../services/chrome/chrome-tokens';
import { TabID } from '../../selected-tab.service';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { CloseButtonComponent } from '../BLOCKS/close-button/close-button.component';
import { CHROME_TUTORIAL } from '../../services/chrome/chrome-tutorial';
import { NATIVE_PREVIEW_FEATURES } from '../../model/body-system/native-preview-features';

/** S6 replaces this content inside the existing panel and drawer, without another shell. */
@Component({
  selector: 'app-native-preview-panel',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [PanelSectionComponent, TitleBlock, CloseButtonComponent],
  template: `<panel-section
    ><title-block>{{ heading() }}</title-block>
    <p>{{ messages[feature()] }}</p>
    @if (feature() === 'tutorial') {
      <close-button label="Close tutorial" (pressed)="tutorial.exit()" />
    }
  </panel-section>`,
})
export class NativePreviewPanelComponent {
  readonly feature = input<keyof typeof NATIVE_PREVIEW_FEATURES>('analysis');
  readonly title = input('Kinematic Analysis');
  readonly mode = input<'kinematic' | 'force'>('kinematic');
  private readonly tabs = inject(CHROME_TABS);
  protected heading() {
    return this.feature() === 'analysis' &&
      (this.mode() === 'force' || this.tabs.getCurrentTab() === TabID.FORCE)
      ? 'Force Analysis'
      : this.title();
  }
  protected readonly messages = NATIVE_PREVIEW_FEATURES;
  protected readonly tutorial = inject(CHROME_TUTORIAL);
}
