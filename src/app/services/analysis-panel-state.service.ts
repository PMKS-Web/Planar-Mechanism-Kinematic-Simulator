import { Injectable, Injector, inject, signal } from '@angular/core';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { ActiveObjService } from './active-obj.service';
import { MechanismService } from './mechanism.service';

/** Session view choices: no document edits, URL changes or undo entries. */
@Injectable({ providedIn: 'root' })
export class AnalysisPanelStateService {
  readonly linkKinematicsTab = signal<'rot' | 'com'>('rot');
  hoveredCoMLinkId: string | null = null;
  private readonly injector = inject(Injector);

  /** Read the held graph subject at draw time. Component destruction happens
   * after the grid can be checked, so it must not change a canvas predicate.
   * Lazy lookup also avoids a mechanism/selection/rendering DI cycle. */
  previewCoM(): string | null {
    if (this.injector.get(SelectedTabService).getCurrentTab() !== TabID.ANALYZE) return null;
    const active = this.injector.get(ActiveObjService);
    if (active.graphType !== 'Link') return null;
    const link = active.graphLink;
    if (this.linkKinematicsTab() !== 'com' && this.hoveredCoMLinkId !== link.id) return null;
    return this.injector.get(MechanismService).isPartSimulatable(link) ? link.id : null;
  }
}
