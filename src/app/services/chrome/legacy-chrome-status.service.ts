import { Injectable, inject } from '@angular/core';
import { SynthesisBuilderService } from '../synthesis/synthesis-builder.service';
import { SynthesisSolutionService } from '../synthesis/synthesis-solution.service';
import { AnalysisCompareService } from '../analysis-compare.service';
import type { ChromeStatus } from './chrome-status';

@Injectable({ providedIn: 'root' })
export class LegacyChromeStatusService implements ChromeStatus {
  private design = inject(SynthesisBuilderService);
  private solution = inject(SynthesisSolutionService);
  private comparison = inject(AnalysisCompareService);
  get record() {
    return this.comparison.record;
  }
  get live() {
    return this.comparison.live;
  }
  sync(): void {
    this.comparison.sync();
  }
  synthesisStatus(): string {
    if (this.design.stage === 'chooser') return 'Pick a synthesis type to begin';
    if (this.design.regionDraw) {
      return 'Drag on the grid to draw the region the ground pins must sit in';
    }
    const placed = this.design.getAllPoses().length;
    const next = this.design.getFirstUndefinedPose();
    if (this.design.armed && next !== undefined) {
      return `Click the grid to place position ${next} of 3 · scroll to turn it`;
    }
    if (placed < 3) return `${placed} of 3 positions placed`;
    if (this.solution.generating) {
      return 'Searching for four-bars through these three positions…';
    }
    if (!this.solution.generated) {
      return 'Three positions placed · ready to generate solutions';
    }
    const kind = this.solution.dyad() ? 'six-bar' : 'four-bar';
    if (this.solution.inserted && !this.solution.needsReinsert()) {
      return `Inserted as a ${kind} · positions kept for reference`;
    }
    // As driven from the chosen pin, which is the linkage on the grid.
    const chosen = this.solution.driven();
    if (!chosen) return 'No solution meets the current requirements';
    const missed = 3 - chosen.onBranchCount;
    const reached =
      missed === 0
        ? 'all 3 positions reached on one assembly'
        : `${missed} position${missed === 1 ? ' needs' : 's need'} reassembly`;
    const how = chosen.binds
      ? `${reached} · small transmission angle (${chosen.minTransmission}°)`
      : reached;
    const count = this.solution.candidates().length;
    const preview = this.solution.inserted ? 'Preview · ' : '';
    return `${preview}Solution ${chosen.name} of ${count} · ${how}`;
  }
}
