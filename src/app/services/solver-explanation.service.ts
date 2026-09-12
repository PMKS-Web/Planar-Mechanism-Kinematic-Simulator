import { Injectable } from '@angular/core';
import { Mechanism } from '../model/mechanism/mechanism';
import { ForceAnalysisMode, ForceSolver } from '../model/mechanism/force-solver';
import { KinematicsSolver } from '../model/mechanism/kinematic-solver';
import {
  BodyExplanation,
  LinearSystemExplanation,
  KinematicSnapshot,
} from '../model/mechanism/solver-explanation';
import { Joint, PrisJoint } from '../model/joint';
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
  gearsAt(mechanism: Mechanism, step: number) {
    const plan = mechanism.gearDrive;
    if (!plan) return [];
    const motion = mechanism.gearMotionAtSample(step);
    return plan.bodies.map((body) => {
      const gear = mechanism.transmission.gears.find((g) => g.id === body.gearId)!;
      const current = motion?.angles.get(body.gearId);
      return {
        id: gear.id,
        name: gear.name || gear.id,
        ratio: `${body.ratio.numerator}/${body.ratio.denominator}`,
        multiplier: body.multiplier,
        q: mechanism.gearTravel[step],
        angle: current?.angle,
        rpm: current ? (current.velocity * 30) / Math.PI : undefined,
        alpha: current?.acceleration,
      };
    });
  }
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

  kinematicsAt(mechanism: Mechanism, step: number): KinematicSnapshot {
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
        jointVelocity: new Map(KinematicsSolver.jointVelMap),
        jointAcceleration: new Map(KinematicsSolver.jointAccMap),
        bodyVelocity: new Map(KinematicsSolver.linkVelMap),
        bodyAcceleration: new Map(KinematicsSolver.linkAccMap),
        omega: new Map(KinematicsSolver.linkAngVelMap),
        alpha: new Map(KinematicsSolver.linkAngAccMap),
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

  /** A circle–line construction in parametric form also covers vertical guides. */
  circleLinesAt(mechanism: Mechanism, step: number) {
    if (mechanism.usesCoupledPositionSolve) return [];
    const joints = mechanism.joints[step];
    return mechanism.positionExplanation
      .filter((one) => one.method === 'circleLineIntersectionPoints')
      .flatMap((one) => {
        const point = joints.find((j) => j.id === one.jointId);
        const center = joints.find((j) => j.id === one.knownIds[0]);
        const slider = joints.find(
          (j) =>
            j instanceof PrisJoint &&
            (one.knownIds.includes(j.id) || j.connectedJoints.some((p) => p.id === point?.id))
        ) as PrisJoint | undefined;
        if (!point || !center || !slider) return [];
        const radius = one.radii[0];
        const origin: Joint = slider.isFloating
          ? slider.slotJointA!
          : mechanism.joints[0].find((j) => j.id === slider.id)!;
        const u: [number, number] = [Math.cos(slider.slotAngle), Math.sin(slider.slotAngle)];
        const dx = center.x - origin.x,
          dy = center.y - origin.y;
        const along = dx * u[0] + dy * u[1];
        const normal = dx * -u[1] + dy * u[0];
        const square = radius * radius - normal * normal;
        const roots =
          square < -1e-6
            ? []
            : Math.abs(square) < 1e-6
              ? [along]
              : [along - Math.sqrt(square), along + Math.sqrt(square)];
        const candidates = roots.map((s): [number, number] => [
          origin.x + s * u[0],
          origin.y + s * u[1],
        ]);
        return [
          {
            ...one,
            point,
            center,
            radius,
            origin,
            u,
            candidates,
            residual:
              Math.max(
                Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - radius),
                Math.abs((point.x - origin.x) * -u[1] + (point.y - origin.y) * u[0])
              ) / MODEL_SCALE,
          },
        ];
      });
  }
}
