import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NativeEditorService } from '../../native-editor.service';
import { NativePlaybackService } from '../../native-playback.service';
import { modeChanged } from '../../mode-change-hooks';
import { TabID } from '../../../selected-tab.service';
import type { ChromeTabs } from '../chrome-contracts';

@Injectable({ providedIn: 'root' })
export class NativeChromeTabsService implements ChromeTabs {
  private readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  private readonly tab = new BehaviorSubject(TabID.EDIT);
  readonly tabChanged = this.tab.asObservable();
  readonly sheetExpanded = signal(false);
  getCurrentTab() {
    return this.tab.value;
  }
  isAnalysisMode(tab = this.tab.value): tab is TabID.ANALYZE | TabID.FORCE {
    return tab === TabID.ANALYZE || tab === TabID.FORCE;
  }
  isWidePanel(tab = this.tab.value): tab is TabID.SYNTHESIZE | TabID.ANALYZE | TabID.FORCE {
    return tab === TabID.SYNTHESIZE || this.isAnalysisMode(tab);
  }
  isTabVisible() {
    return true;
  }
  setTab(tab: TabID) {
    const previous = this.tab.value;
    if (previous === tab) return;
    if (tab === TabID.SYNTHESIZE) this.playback.rewind();
    else if (tab === TabID.EDIT && this.isAnalysisMode(previous)) this.playback.pause();
    this.editor.mode.set(
      tab === TabID.SYNTHESIZE ? 'synthesis' : tab === TabID.EDIT ? 'edit' : 'analysis'
    );
    this.tab.next(tab);
    modeChanged(tab);
  }
}
