import { Injectable, inject } from '@angular/core';
import { ForceAnalysisMode } from '../model/mechanism/force-solver';
import { KinematicsSolver } from '../model/mechanism/kinematic-solver';
import { Mechanism } from '../model/mechanism/mechanism';
import { LBF_IN_PER_NEWTON_METER, LBF_PER_NEWTON } from '../model/unit-conversions';
import { MODEL_SCALE } from '../model/render-scale';
import { ForceUnit } from '../model/unit-enums';
import { SettingsService } from './settings.service';

/**
 * What a graph plots, one solved sample at a time.
 *
 * This used to be a switch inside the graph component's plotting loop, which
 * meant the only way to ask "what does joint B read right now" was to build the
 * whole cycle and take one point out of it. A panel header wants exactly one
 * sample, so the arithmetic lives here and both callers share it — the graph by
 * walking every index, the header by asking for the pose on screen.
 *
 * Values leave at the precision they were solved at. They used to be rounded to
 * three decimals, which is a tenth of a millinewton: fine against a load of tens
 * of newtons and ruinous against a small one. On the four-bar template the
 * solver produces 360 distinct reactions across the cycle and that rounding left
 * 49 of them, each step two per cent of the whole curve — so the graph climbed a
 * visible staircase. Nothing needed it: every place that shows one of these
 * numbers formats it, the header to two decimals and the CSV at its own edge.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisSampleService {
  private settingsService = inject(SettingsService);

  /**
   * The mechanism the solver's static state was last prepared for.
   *
   * KinematicsSolver keeps its answers in statics, including a cached input
   * joint index, so a sample of a second mechanism taken without a reset would
   * be solved against the first one's indices. Resetting per sample instead
   * would throw away the maps this fills 360 times per graph, so it is done
   * once per mechanism — the same granularity the plotting loop always used.
   */
  private preparedFor: Mechanism | undefined;

  /**
   * The values a graph plots, for one solved sample.
   *
   * Returned in the order the graph draws them: X, then Y, then the third
   * series where there is one. An empty array means this service has nothing
   * to say about that property — an unknown name, an instant-centre graph, or
   * a sample index the mechanism does not have.
   */
  sampleAt(
    mechanism: Mechanism,
    index: number,
    analysis: string,
    analysisType: string,
    mechProp: string,
    mechPart: string,
    reactionLinkId: string = ''
  ): number[] {
    if (analysis === 'force') {
      return this.forceSample(mechanism, index, analysisType, mechProp, mechPart, reactionLinkId);
    }
    return this.kinematicSample(mechanism, index, mechProp, mechPart);
  }

  private forceSample(
    mechanism: Mechanism,
    index: number,
    analysisType: string,
    mechProp: string,
    mechPart: string,
    reactionLinkId: string
  ): number[] {
    const mode: ForceAnalysisMode = analysisType === 'dynamic' ? 'dynamic' : 'static';
    const frame = mechanism.getForceAnalysis(mode).frames[index];
    if (!frame) return [];

    const forceConversion =
      this.settingsService.forceUnit.value === ForceUnit.LBF ? LBF_PER_NEWTON : 1;
    const torqueConversion =
      this.settingsService.forceUnit.value === ForceUnit.LBF ? LBF_IN_PER_NEWTON_METER : 1;

    if (frame.status !== 'ok') {
      return mechProp === 'Joint Forces' ? [Number.NaN, Number.NaN, Number.NaN] : [Number.NaN];
    }

    if (mechProp === 'Input Torque' || mechProp === 'Input Effort') {
      // A torque's moment arms are internal model lengths (MODEL_SCALE times
      // the user's unit), so the solved value divides back down for display. An
      // input *force* has no length in it and is invariant.
      if (!frame.inputEffort) return [Number.NaN];
      const isForce = frame.inputEffort.kind === 'force';
      return [
        (frame.inputEffort.valueSI * (isForce ? forceConversion : torqueConversion)) /
          (isForce ? 1 : MODEL_SCALE),
      ];
    }

    const byLink = frame.jointReactionsByLink.get(mechPart);
    const reaction = reactionLinkId
      ? byLink?.get(reactionLinkId)
      : frame.jointReactions.get(mechPart);
    if (!reaction) return [Number.NaN, Number.NaN, Number.NaN];

    const x = reaction[0] * forceConversion;
    const y = reaction[1] * forceConversion;
    return [x, y, Math.hypot(x, y)];
  }

  private kinematicSample(
    mechanism: Mechanism,
    index: number,
    mechProp: string,
    mechPart: string
  ): number[] {
    const joints = mechanism.joints[index];
    const links = mechanism.links[index];
    if (!joints || !links) return [];

    // Positions, velocities and accelerations are linear in length, so each
    // internal model value divides by MODEL_SCALE for display in the user's
    // unit. Angular series carry no length and pass through.
    if (mechProp === 'Linear Joint Pos') {
      const joint = joints.find((candidate) => candidate.id === mechPart);
      return [(joint?.x ?? Number.NaN) / MODEL_SCALE, (joint?.y ?? Number.NaN) / MODEL_SCALE];
    }

    switch (mechProp) {
      case 'Linear Joint Vel':
        this.solve(mechanism, index);
        return this.scaledVector(KinematicsSolver.jointVelMap.get(mechPart), true);
      case 'Linear Joint Acc':
        this.solve(mechanism, index);
        return this.scaledVector(KinematicsSolver.jointAccMap.get(mechPart), true);
      case "Linear Link's CoM Pos":
        this.solve(mechanism, index);
        return this.scaledVector(KinematicsSolver.linkCoMMap.get(mechPart), false);
      case "Linear Link's CoM Vel":
        this.solve(mechanism, index);
        return this.scaledVector(KinematicsSolver.linkVelMap.get(mechPart), true);
      case "Linear Link's CoM Acc":
        this.solve(mechanism, index);
        return this.scaledVector(KinematicsSolver.linkAccMap.get(mechPart), true);
      case 'Angular Link Pos':
        this.solve(mechanism, index);
        return [KinematicsSolver.linkAngPosMap.get(mechPart) ?? Number.NaN];
      case 'Angular Link Vel':
        this.solve(mechanism, index);
        return [KinematicsSolver.linkAngVelMap.get(mechPart) ?? Number.NaN];
      case 'Angular Link Acc':
        this.solve(mechanism, index);
        return [KinematicsSolver.linkAngAccMap.get(mechPart) ?? Number.NaN];
      default:
        // 'ic' and anything this service does not know plot nothing.
        return [];
    }
  }

  /** Rates and poses for one sample, left in the solver's static maps. */
  private solve(mechanism: Mechanism, index: number): void {
    if (this.preparedFor !== mechanism) {
      KinematicsSolver.resetVariables();
      this.preparedFor = mechanism;
    }
    // Every time, not only on a change of mechanism: the solvers hold their
    // state in statics, and a drawing with three machines in it has solved the
    // other two over the top of this one since the graphs were last drawn.
    mechanism.prepareSolvers();
    KinematicsSolver.determineKinematics(
      mechanism.joints[index],
      mechanism.links[index],
      mechanism.inputAngularVelocities[index]
    );
  }

  /**
   * A solved vector in display units, with its magnitude where one is plotted.
   *
   * A missing entry is two NaNs rather than nothing: the graph draws a gap at
   * that timestep, and dropping the point would shift every later one.
   */
  private scaledVector(value: [number, number] | undefined, withMagnitude: boolean): number[] {
    const [rawX, rawY] = value ?? [Number.NaN, Number.NaN];
    const x = rawX / MODEL_SCALE;
    const y = rawY / MODEL_SCALE;
    const series = [x, y];
    if (withMagnitude) {
      series.push(Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
    }
    return series;
  }
}
