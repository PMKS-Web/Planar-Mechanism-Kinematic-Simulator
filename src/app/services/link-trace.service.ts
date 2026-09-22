import { AnalysisPanelStateService } from './analysis-panel-state.service';
import { Injectable, inject } from '@angular/core';
import { Link, RealLink } from '../model/link';
import type { SettingsService } from './settings.service';
import { selectableLinks } from '../model/selection';
import type { MechanismService } from './mechanism.service';

/** Transient view choices, like vector traces: kept across undo, cleared for a new document. */
@Injectable({ providedIn: 'root' })
export class LinkTraceService {
  private readonly panelState = inject(AnalysisPanelStateService);
  private readonly enabled = new Set<string>();
  private revision = -1;
  private cached: { id: string; d: string }[] = [];

  isOn(link: Link): boolean {
    return this.enabled.has(link.id);
  }

  toggle(link: Link): void {
    if (!this.enabled.delete(link.id)) this.enabled.add(link.id);
    this.revision = -1;
  }

  clear(): void {
    this.enabled.clear();
    this.revision = -1;
  }

  parts(mechanism: MechanismService): RealLink[] {
    return selectableLinks(mechanism.getLinks());
  }

  showsMark(link: Link, mechanism: MechanismService, settings: SettingsService): boolean {
    return (
      settings.previewCoMLinkId === link.id ||
      this.panelState.previewCoM() === link.id ||
      (settings.isShowCOM.value &&
        link instanceof RealLink &&
        link.mass > 0 &&
        mechanism.links.includes(link)) ||
      this.isOn(link) ||
      mechanism.isVectorTraceOn(link, 'velocity') ||
      mechanism.isVectorTraceOn(link, 'acceleration')
    );
  }

  paths(mechanism: MechanismService): { id: string; d: string }[] {
    if (this.revision === mechanism.solveRevision) return this.cached;
    this.revision = mechanism.solveRevision;
    this.cached = [];
    for (const link of this.parts(mechanism)) {
      if (!this.isOn(link)) continue;
      const solved = mechanism.mechanismSolving(link);
      if (!solved?.isMechanismValid()) continue;
      let d = '';
      let connected = false;
      for (const frame of solved.links) {
        const at = selectableLinks(frame).find((one) => one.id === link.id)?.CoM;
        if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) {
          connected = false;
          continue;
        }
        d += `${connected ? 'L' : 'M'} ${at.x} ${at.y} `;
        connected = true;
      }
      if (d) this.cached.push({ id: link.id, d });
    }
    return this.cached;
  }
}
