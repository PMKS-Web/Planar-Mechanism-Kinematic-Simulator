import { Injectable } from '@angular/core';
import { LoadCase, validateLoadCase } from '../model/structural/loads';
import { analyzePmksFrame, PmksStructuralFrame } from '../model/structural/pmks-configuration';
import { StaticForceAnalysisResult } from '../model/structural/results';
import { analyzePmksDynamicFrame, PmksDynamicSample } from '../model/structural/pmks-dynamic-state';

/** Document load cases. Call updateMechanism(true) once after an undoable edit. */
@Injectable({ providedIn: 'root' })
export class StructuralAnalysisService {
  private cases: readonly LoadCase[] = [];

  get loadCases(): readonly LoadCase[] {
    return structuredClone(this.cases);
  }

  replaceLoadCases(cases: readonly LoadCase[]): void {
    cases.forEach(validateLoadCase);
    this.cases = structuredClone(cases);
  }

  analyze(frame: PmksStructuralFrame, loadCase: LoadCase): StaticForceAnalysisResult {
    return analyzePmksFrame(frame, loadCase);
  }

  analyzeDynamic(sample: PmksDynamicSample, loadCase: LoadCase) {
    return analyzePmksDynamicFrame(sample, loadCase);
  }
}
