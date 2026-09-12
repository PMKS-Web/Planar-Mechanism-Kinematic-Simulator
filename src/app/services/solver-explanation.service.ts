import { Injectable } from '@angular/core';
import { Mechanism } from '../model/mechanism/mechanism';
import { ForceAnalysisMode, ForceSolver } from '../model/mechanism/force-solver';
import { KinematicsSolver } from '../model/mechanism/kinematic-solver';
import { BodyExplanation, LinearSystemExplanation } from '../model/mechanism/solver-explanation';
import { MODEL_SCALE } from '../model/render-scale';
import { circleCircleIntersection } from '../model/utils';

export function equationText(coefficients: number[], labels: string[]): string {
  const terms = coefficients.flatMap((coefficient, index) =>
    Math.abs(coefficient) < 1e-12
      ? []
      : [
          {
            negative: coefficient < 0,
            text: `${Math.abs(Math.abs(coefficient) - 1) < 1e-12 ? '' : numberText(Math.abs(coefficient)) + '·'}${labels[index]}`,
          },
        ]
  );
  return (
    terms
      .map((term, i) => `${term.negative ? (i ? ' − ' : '−') : i ? ' + ' : ''}${term.text}`)
      .join('') || '0'
  );
}

export function numberText(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1e-10) return '0';
  return Number(value.toPrecision(5)).toString().replace('-', '−');
}

/** Rescale both sides and the unknown vector; the resulting system remains A·x = b. */
export function displayForceSystem(
  system: LinearSystemExplanation,
  bodies: BodyExplanation[]
): LinearSystemExplanation {
  const columnScale = system.unknowns.map((unknown) =>
    unknown.unit === 'moment' ? MODEL_SCALE : 1
  );
  const rowScale = system.rows.map(() => 1);
  bodies
    .filter((body) => body.rowCount === 3)
    .forEach((body) => (rowScale[body.startRow + 2] = MODEL_SCALE));
  return {
    ...system,
    A: system.A.map((row, i) => row.map((value, j) => (value * columnScale[j]) / rowScale[i])),
    b: system.b.map((value, i) => value / rowScale[i]),
    x: system.x.map((value, i) => value / columnScale[i]),
    unknowns: system.unknowns.map((unknown) => ({
      ...unknown,
      unit: unknown.unit === 'moment' ? 'N·m' : 'N',
    })),
  };
}

function displayKinematicSystem(system: LinearSystemExplanation | undefined, length: string) {
  if (!system) return undefined;
  const columnScale = system.unknowns.map((unknown) =>
    unknown.unit.startsWith('model') ? MODEL_SCALE : 1
  );
  return {
    ...system,
    A: system.A.map((row) => row.map((value, j) => (value * columnScale[j]) / MODEL_SCALE)),
    b: system.b.map((value) => value / MODEL_SCALE),
    x: system.x.map((value, i) => value / columnScale[i]),
    unknowns: system.unknowns.map((unknown) => ({
      ...unknown,
      unit: unknown.unit.replace('model', length),
    })),
  };
}

@Injectable({ providedIn: 'root' })
export class SolverExplanationService {
  forceAt(mechanism: Mechanism, step: number, mode: ForceAnalysisMode) {
    const plotted = mechanism.getForceAnalysis(mode).frames[step];
    mechanism.prepareSolvers();
    const frame = ForceSolver.explainAt(mechanism, mode, step, plotted?.sharedSupport ?? false);
    return {
      frame,
      system:
        frame.explanation && displayForceSystem(frame.explanation.system, frame.explanation.bodies),
    };
  }

  kinematicsAt(mechanism: Mechanism, step: number) {
    mechanism.prepareSolvers();
    KinematicsSolver.resetVariables();
    KinematicsSolver.captureExplanation = true;
    try {
      KinematicsSolver.determineKinematics(
        mechanism.joints[step],
        mechanism.links[step],
        mechanism.inputAngularVelocities[step]
      );
      return {
        route: KinematicsSolver.explanationRoute,
        velocity: displayKinematicSystem(KinematicsSolver.velocityExplanation, mechanism.unit),
        acceleration: displayKinematicSystem(
          KinematicsSolver.accelerationExplanation,
          mechanism.unit
        ),
      };
    } finally {
      KinematicsSolver.captureExplanation = false;
    }
  }

  circlesAt(mechanism: Mechanism, step: number) {
    if (mechanism.usesCoupledPositionSolve) return [];
    const joints = mechanism.joints[step];
    return mechanism.positionExplanation
      .filter((one) => one.method === 'twoCircleIntersectionPoints')
      .flatMap((one) => {
        const point = joints.find((joint) => joint.id === one.jointId);
        const a = joints.find((joint) => joint.id === one.knownIds[0]);
        const b = joints.find((joint) => joint.id === one.knownIds[1]);
        if (!point || !a || !b || one.radii.length < 2) return [];
        const [r0, r1] = one.radii;
        const candidates = circleCircleIntersection(a.x, a.y, r0, b.x, b.y, r1);
        return [
          {
            ...one,
            a,
            b,
            point,
            r0,
            r1,
            candidates: candidates || [],
            residual:
              Math.max(
                Math.abs(Math.hypot(point.x - a.x, point.y - a.y) - r0),
                Math.abs(Math.hypot(point.x - b.x, point.y - b.y) - r1)
              ) / MODEL_SCALE,
          },
        ];
      });
  }
}
