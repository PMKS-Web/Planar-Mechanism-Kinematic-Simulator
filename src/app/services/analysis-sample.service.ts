import { Injectable, inject } from '@angular/core';
import { ForceAnalysisMode } from '../model/mechanism/force-solver';
import { KinematicsSolver } from '../model/mechanism/kinematic-solver';
import { Mechanism } from '../model/mechanism/mechanism';
import { FORCE_TO_N, siUnitFactorsForLength } from '../model/unit-conversions';
import { MODEL_SCALE } from '../model/render-scale';
import { SettingsService } from './settings.service';

/**
 * A solved value below anything a mechanism can mean is float noise, not data.
 *
 * A joint that stands still solves to velocities like 2e-17: the residue of
 * subtracting a position from itself through a chain of rotations. The header
 * printed it in scientific notation and the graph drew its jitter as a
 * mountain range, because a chart scales its axis to whatever range it is
 * given. One part in 1e9 of the units on screen is far below anything the
 * drawing can express -- solved positions are held to four decimals -- and
 * some sixteen orders above nothing, so everything real passes untouched.
 */
const NOISE_FLOOR = 1e-9;

/** What the kinematics solver knows about one sample, once it has run. */
interface KinematicsAt {
  jointVel: Map<string, [number, number]>;
  jointAcc: Map<string, [number, number]>;
  linkCoM: Map<string, [number, number]>;
  linkVel: Map<string, [number, number]>;
  linkAcc: Map<string, [number, number]>;
  linkAngPos: Map<string, number>;
  linkAngVel: Map<string, number>;
  linkAngAcc: Map<string, number>;
}

function snapNoiseToZero(value: number): number {
  return Math.abs(value) < NOISE_FLOOR ? 0 : value;
}

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
   * The solver's answer at each sample, kept per mechanism.
   *
   * Every open graph row rebuilds its curve by asking for a value at every
   * sample, and each ask ran the whole velocity-and-acceleration solve for
   * that sample again -- so three rows on one joint solved the same cycle
   * three times on every pointer move. The solve is the same whatever is
   * being read from it, so it is done once per sample and its maps are kept.
   * Keyed weakly on the mechanism because a drag builds a fresh one on every
   * move, and the old one's answers should leave with it.
   */
  private solved = new WeakMap<Mechanism, Map<number, KinematicsAt>>();

  /**
   * The values a graph plots, for one solved sample.
   *
   * Returned in the order the graph draws them: X, then Y, then the third
   * series where there is one. An empty array means this service has nothing
   * to say about that property — an unknown name, an instant-center graph, or
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
    const values =
      analysis === 'force'
        ? this.forceSample(mechanism, index, analysisType, mechProp, mechPart, reactionLinkId)
        : this.kinematicSample(mechanism, index, mechProp, mechPart);
    return values.map(snapNoiseToZero);
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

    // The solver answers in newtons and newton-meters whatever the drawing is
    // measured in; these take it to the units the reader is reading. A torque
    // is a force times a length, so its conversion is both of theirs -- the
    // chosen force unit, and the length unit the drawing itself is in.
    const display = this.settingsService.forceUnit.value;
    const forceConversion = 1 / FORCE_TO_N[display];
    const torqueConversion =
      forceConversion / siUnitFactorsForLength(this.settingsService.lengthUnit.value).distanceToM;

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

    const at = this.kinematicsAt(mechanism, index);
    switch (mechProp) {
      case 'Linear Joint Vel':
        return this.scaledVector(at.jointVel.get(mechPart), true);
      case 'Linear Joint Acc':
        return this.scaledVector(at.jointAcc.get(mechPart), true);
      case "Linear Link's CoM Pos":
        return this.scaledVector(at.linkCoM.get(mechPart), false);
      case "Linear Link's CoM Vel":
        return this.scaledVector(at.linkVel.get(mechPart), true);
      case "Linear Link's CoM Acc":
        return this.scaledVector(at.linkAcc.get(mechPart), true);
      case 'Angular Link Pos':
        return [at.linkAngPos.get(mechPart) ?? Number.NaN];
      case 'Angular Link Vel':
        return [at.linkAngVel.get(mechPart) ?? Number.NaN];
      case 'Angular Link Acc':
        return [at.linkAngAcc.get(mechPart) ?? Number.NaN];
      default:
        // 'ic' and anything this service does not know plot nothing.
        return [];
    }
  }

  /** Rates and poses for one sample, left in the solver's static maps. */
  /** The solve at one sample, done the first time it is asked for. */
  private kinematicsAt(mechanism: Mechanism, index: number): KinematicsAt {
    let perSample = this.solved.get(mechanism);
    if (!perSample) {
      perSample = new Map();
      this.solved.set(mechanism, perSample);
    }
    const kept = perSample.get(index);
    if (kept) return kept;
    this.solve(mechanism, index);
    // Copies, because the solver writes every answer into the same statics
    // and the force solver shares them.
    const answer: KinematicsAt = {
      jointVel: new Map(KinematicsSolver.jointVelMap),
      jointAcc: new Map(KinematicsSolver.jointAccMap),
      linkCoM: new Map(KinematicsSolver.linkCoMMap),
      linkVel: new Map(KinematicsSolver.linkVelMap),
      linkAcc: new Map(KinematicsSolver.linkAccMap),
      linkAngPos: new Map(KinematicsSolver.linkAngPosMap),
      linkAngVel: new Map(KinematicsSolver.linkAngVelMap),
      linkAngAcc: new Map(KinematicsSolver.linkAngAccMap),
    };
    perSample.set(index, answer);
    return answer;
  }

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
