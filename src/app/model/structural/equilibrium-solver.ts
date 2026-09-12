import { Matrix, SingularValueDecomposition } from 'ml-matrix';
import type { StructuralBody, StructuralConfiguration } from './configuration';
import { finiteVector, LoadCase, validateLoadCase, Vector2 } from './loads';
import { validateStructuralProperties } from './structural-properties';
import {
  JointReactionResult,
  SolverDiagnostics,
  StaticForceAnalysisResult,
  DynamicBodyEquilibriumResult,
  StructuralFailure,
  structuralFailure,
} from './results';

/** SI geometry floor; dimensionless SVD/rank and load-relative equilibrium limits. */
export const STRUCTURAL_TOLERANCES = Object.freeze({
  lengthM: 1e-12,
  relativeRank: 1e-12,
  maximumCondition: 1e10,
  normalizedResidual: 1e-9,
});

interface Reaction {
  jointId: string;
  positive: number;
  negative?: number;
  column: number;
}

export interface InertialTarget {
  readonly centerOfMassM: Vector2;
  readonly forceN: Vector2;
  readonly momentAboutCoMNm: number;
}

type EquilibriumResult =
  | (Extract<StaticForceAnalysisResult, { status: 'ok' }> & {
      readonly bodyEquilibrium: readonly DynamicBodyEquilibriumResult[];
    })
  | StructuralFailure;

/** Shared rigid-body assembly. Targets, when supplied, follow configuration body order. */
export function analyzeEquilibrium(
  configuration: StructuralConfiguration,
  loadCase: LoadCase,
  targets?: readonly InertialTarget[]
): EquilibriumResult {
  const invalid = validateConfiguration(configuration);
  if (invalid) return invalid;
  try {
    validateLoadCase(loadCase);
  } catch (error) {
    return structuralFailure('invalid-load', (error as Error).message);
  }
  const { bodies, joints, drivers } = configuration;
  const jointById = new Map(joints.map((joint) => [joint.id, joint]));
  const bodyById = new Map(bodies.map((body, i) => [body.id, i]));
  const origins = bodies.map((body) => jointById.get(body.frameJointIds[0])!.positionM);
  const axes = bodies.map((body, i) => {
    const end = jointById.get(body.frameJointIds[1])!.positionM;
    const dx = end.x - origins[i].x;
    const dy = end.y - origins[i].y;
    const length = Math.hypot(dx, dy);
    return { x: dx / length, y: dy / length };
  });
  const lengthM = Math.max(
    ...bodies.flatMap((body, i) =>
      body.jointIds.map((id) => {
        const p = jointById.get(id)!.positionM;
        return Math.hypot(p.x - origins[i].x, p.y - origins[i].y);
      })
    )
  );
  const reactions: Reaction[] = [];
  let unknownCount = 0;
  for (const joint of joints) {
    const incident = bodies.flatMap((body, i) => (body.jointIds.includes(joint.id) ? [i] : []));
    if (joint.grounded) {
      for (const positive of incident) {
        reactions.push({ jointId: joint.id, positive, column: unknownCount });
        unknownCount += 2;
      }
    } else if (incident.length === 2) {
      reactions.push({
        jointId: joint.id,
        positive: incident[0],
        negative: incident[1],
        column: unknownCount,
      });
      unknownCount += 2;
    } else if (incident.length > 2) {
      return structuralFailure(
        'unsupported-topology',
        'A free pin joining more than two bodies needs a specified joint model.'
      );
    }
    // A pin on only one free body is a tracer, not a support.
  }
  const driverStart = unknownCount;
  unknownCount += drivers.length;
  const equationCount = bodies.length * 3;
  const A = Array.from({ length: equationCount }, () => Array(unknownCount).fill(0) as number[]);
  const b = Array(equationCount).fill(0) as number[];
  const addForce = (body: number, point: Vector2, force: Vector2, column?: number) => {
    const origin = origins[body];
    const components = [
      force.x,
      force.y,
      ((point.x - origin.x) * force.y - (point.y - origin.y) * force.x) / lengthM,
    ];
    for (let row = 0; row < 3; row++) {
      if (column === undefined) b[3 * body + row] -= components[row];
      else A[3 * body + row][column] += components[row];
    }
  };
  for (const reaction of reactions) {
    const point = jointById.get(reaction.jointId)!.positionM;
    for (let axis = 0; axis < 2; axis++) {
      const force = { x: axis === 0 ? 1 : 0, y: axis === 1 ? 1 : 0 };
      addForce(reaction.positive, point, force, reaction.column + axis);
      if (reaction.negative !== undefined) {
        addForce(reaction.negative, point, { x: -force.x, y: -force.y }, reaction.column + axis);
      }
    }
  }
  drivers.forEach((driver, i) => {
    // The unknown is torque / characteristic length, in N like reaction unknowns.
    A[3 * bodyById.get(driver.linkId)! + 2][driverStart + i] = 1;
  });
  for (const load of loadCase.loads) {
    const body = bodyById.get(load.linkId);
    if (body === undefined) {
      return structuralFailure(
        'invalid-load',
        'A load targets a missing link or a frame body. Select a moving root body.'
      );
    }
    if (load.kind === 'moment') {
      b[3 * body + 2] -= load.momentNm / lengthM;
    } else {
      const rotated = (p: Vector2) => rotate(p, axes[body]);
      const offset = load.at.frame === 'link' ? rotated(load.at.positionM) : load.at.positionM;
      const point =
        load.at.frame === 'link'
          ? { x: origins[body].x + offset.x, y: origins[body].y + offset.y }
          : offset;
      const force = load.directionFrame === 'link' ? rotated(load.forceN) : load.forceN;
      addForce(body, point, force);
    }
  }
  if (loadCase.gravityMPerS2 !== undefined) {
    for (let i = 0; i < bodies.length; i++) {
      const mass = bodies[i].massProperties;
      if (!mass)
        return structuralFailure(
          'invalid-properties',
          'Gravity requires explicit mass and center of mass for every moving body.'
        );
      addForce(i, mass.centerOfMassM, {
        x: mass.massKg * loadCase.gravityMPerS2.x,
        y: mass.massKg * loadCase.gravityMPerS2.y,
      });
    }
  }

  const known = b.map((value) => -value);
  const inertial = b.map(() => 0);
  targets?.forEach((target, i) => {
    const { forceN, centerOfMassM, momentAboutCoMNm } = target;
    inertial[3 * i] = forceN.x;
    inertial[3 * i + 1] = forceN.y;
    inertial[3 * i + 2] =
      (momentAboutCoMNm +
        (centerOfMassM.x - origins[i].x) * forceN.y -
        (centerOfMassM.y - origins[i].y) * forceN.x) /
      lengthM;
  });
  b.forEach((_, i) => {
    b[i] += inertial[i];
  });

  const diagnostics: SolverDiagnostics = {
    equationCount,
    unknownCount,
    characteristicLengthM: lengthM,
  };
  if (![...A.flat(), ...b].every(Number.isFinite)) {
    return structuralFailure('numerical-failure', 'Equilibrium assembly overflowed.', diagnostics);
  }
  try {
    const result = solveEquilibrium(
      A,
      b,
      configuration,
      origins,
      reactions,
      driverStart,
      diagnostics
    );
    if (result.status !== 'ok') return result;
    return {
      ...result,
      bodyEquilibrium: result.linkEquilibrium.map((body, i) => ({
        ...body,
        knownAppliedForceN: { x: known[3 * i], y: known[3 * i + 1] },
        knownAppliedMomentNm: known[3 * i + 2] * lengthM,
        inertialForceN: { x: inertial[3 * i], y: inertial[3 * i + 1] },
        inertialMomentNm: inertial[3 * i + 2] * lengthM,
      })),
    };
  } catch {
    return structuralFailure('numerical-failure', 'The matrix decomposition failed.', diagnostics);
  }
}

function rotate(p: Vector2, axis: Vector2): Vector2 {
  return { x: axis.x * p.x - axis.y * p.y, y: axis.y * p.x + axis.x * p.y };
}

function solveEquilibrium(
  A: number[][],
  b: number[],
  configuration: StructuralConfiguration,
  origins: Vector2[],
  reactions: Reaction[],
  driverStart: number,
  counts: SolverDiagnostics
): StaticForceAnalysisResult {
  const { equationCount: m, unknownCount: n, characteristicLengthM: lengthM } = counts;
  // Padding handles empty and rectangular systems without selecting a fictitious solution.
  const size = Math.max(m, n);
  const matrix = Matrix.zeros(size, size);
  A.forEach((row, i) => row.forEach((value, j) => matrix.set(i, j, value)));
  const svd = new SingularValueDecomposition(matrix);
  const singular = svd.diagonal;
  const threshold = (singular[0] || 1) * STRUCTURAL_TOLERANCES.relativeRank;
  const rank = singular.filter((value) => value > threshold).length;
  const values = Array(n).fill(0) as number[];
  const U = svd.leftSingularVectors;
  const V = svd.rightSingularVectors;
  // A truncated projection is used only to diagnose incompatible loads on deficient systems.
  // No minimum-norm reaction set is ever returned as an engineering result.
  for (let k = 0; k < rank; k++) {
    let projection = 0;
    for (let i = 0; i < m; i++) projection += U.get(i, k) * b[i];
    for (let j = 0; j < n; j++) values[j] += (V.get(j, k) * projection) / singular[k];
  }
  const residual = A.map(
    (row, i) => row.reduce((sum, value, j) => sum + value * values[j], 0) - b[i]
  );
  const normalizedResidual = Math.max(...residual.map(Math.abs)) / Math.max(1, ...b.map(Math.abs));
  const conditionNumber =
    rank === Math.min(m, n) && rank > 0 ? singular[0] / singular[rank - 1] : Infinity;
  const diagnostics: SolverDiagnostics = {
    ...counts,
    rank,
    equilibriumDeficiency: m - rank,
    reactionRedundancy: n - rank,
    conditionNumber,
    normalizedResidual,
  };
  if (![...values, ...residual, normalizedResidual].every(Number.isFinite)) {
    return structuralFailure(
      'numerical-failure',
      'The equilibrium calculation overflowed.',
      diagnostics
    );
  }
  if (normalizedResidual > STRUCTURAL_TOLERANCES.normalizedResidual) {
    return structuralFailure(
      'inconsistent',
      'These supports cannot balance the applied loads.',
      diagnostics
    );
  }
  if (rank < m && rank < n) {
    return structuralFailure(
      'singular',
      'This pose has both free motion and undetermined reactions.',
      diagnostics
    );
  }
  if (rank < n) {
    return structuralFailure(
      'statically-indeterminate',
      'Equilibrium cannot uniquely determine how these supports share the load.',
      diagnostics
    );
  }
  if (rank < m) {
    return structuralFailure(
      'underconstrained',
      'The supports and holding drivers leave a body motion unrestrained.',
      diagnostics
    );
  }
  if (conditionNumber > STRUCTURAL_TOLERANCES.maximumCondition) {
    return structuralFailure(
      'singular',
      'This pose is too close to singular for reliable reactions.',
      diagnostics
    );
  }
  const jointReactions: JointReactionResult[] = [];
  for (const reaction of reactions) {
    const forceN = { x: values[reaction.column], y: values[reaction.column + 1] };
    jointReactions.push({
      jointId: reaction.jointId,
      linkId: configuration.bodies[reaction.positive].id,
      forceN,
    });
    if (reaction.negative !== undefined)
      jointReactions.push({
        jointId: reaction.jointId,
        linkId: configuration.bodies[reaction.negative].id,
        forceN: { x: -forceN.x, y: -forceN.y },
      });
  }
  return {
    status: 'ok',
    diagnostics,
    jointReactions,
    driverReactions: configuration.drivers.map((driver, i) => ({
      ...driver,
      momentNm: values[driverStart + i] * lengthM!,
    })),
    linkEquilibrium: configuration.bodies.map((body, i) => ({
      linkId: body.id,
      momentReferenceM: { ...origins[i] },
      forceResidualN: { x: residual[3 * i], y: residual[3 * i + 1] },
      momentResidualNm: residual[3 * i + 2] * lengthM!,
    })),
  };
}

export function validateConfiguration(c: StructuralConfiguration): StructuralFailure | undefined {
  const invalid = (message: string) => structuralFailure('invalid-geometry', message);
  if (
    !c ||
    !Array.isArray(c.bodies) ||
    !Array.isArray(c.joints) ||
    !Array.isArray(c.drivers) ||
    c.bodies.length === 0
  ) {
    return invalid('Supply a solved configuration with at least one moving body.');
  }
  const ids = new Set<string>();
  for (const joint of c.joints) {
    if (
      !joint ||
      !joint.id ||
      ids.has(joint.id) ||
      !finiteVector(joint.positionM) ||
      typeof joint.grounded !== 'boolean'
    )
      return invalid('Invalid or duplicate joint geometry.');
    if (joint.kind !== 'revolute') {
      return structuralFailure('unsupported-joint-type', 'S1 supports revolute joints only.');
    }
    ids.add(joint.id);
  }
  const bodies = new Map<string, StructuralBody>();
  for (const body of c.bodies) {
    if (
      !body ||
      !body.id ||
      bodies.has(body.id) ||
      !Array.isArray(body.jointIds) ||
      body.jointIds.length < 2 ||
      new Set(body.jointIds).size !== body.jointIds.length ||
      body.jointIds.some((id: string) => !ids.has(id)) ||
      !Array.isArray(body.frameJointIds) ||
      body.frameJointIds.length !== 2 ||
      body.frameJointIds.some((id: string) => !body.jointIds.includes(id))
    ) {
      return invalid('A body needs unique joints and a valid two-pin coordinate frame.');
    }
    const [a, b] = body.frameJointIds.map(
      (id: string) => c.joints.find((j) => j.id === id)!.positionM
    );
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    if (!Number.isFinite(length) || length <= STRUCTURAL_TOLERANCES.lengthM) {
      return invalid('A body coordinate frame has coincident or invalid pins.');
    }
    const mass = body.massProperties;
    if (
      mass !== undefined &&
      (!mass ||
        !Number.isFinite(mass.massKg) ||
        mass.massKg < 0 ||
        !Number.isFinite(mass.inertiaKgM2) ||
        mass.inertiaKgM2 < 0 ||
        !finiteVector(mass.centerOfMassM))
    ) {
      return structuralFailure(
        'invalid-properties',
        'Mass, inertia, and center of mass must be finite and physical.'
      );
    }
    try {
      if (body.structural !== undefined) validateStructuralProperties(body.structural);
    } catch (error) {
      return structuralFailure('invalid-properties', (error as Error).message);
    }
    bodies.set(body.id, body);
  }
  const driverJoints = new Set<string>();
  for (const driver of c.drivers) {
    const joint = c.joints.find((j) => j.id === driver?.jointId);
    const body = bodies.get(driver?.linkId);
    if (!joint?.grounded || !body?.jointIds.includes(joint.id) || driverJoints.has(joint.id)) {
      return structuralFailure(
        'unsupported-topology',
        'A holding driver must name one grounded pin and its moving body.'
      );
    }
    driverJoints.add(joint.id);
  }
  return undefined;
}
