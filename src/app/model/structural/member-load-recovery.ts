import type { StructuralConfiguration } from './configuration';
import type { LoadCase, Vector2 } from './loads';
import { finiteVector, validateLoadCase } from './loads';
import { bodyFrame, resolveApplicationPoint, resolvePointForce } from './load-coordinates';
import { memberComponents, resolveStructuralMember, StructuralMember } from './member';
import { BodySectionMotionState, MemberMassDistribution, validateMemberMass } from './member-mass';
import { buildMemberDiagram, MemberLineLoad, MemberPointAction } from './member-diagram';
import { MemberInternalLoadResult, memberFailure } from './member-results';
import type { DynamicForceAnalysisResult, StaticForceAnalysisResult } from './results';

export interface MemberRecoveryOptions {
  /** Explicit whenever gravity is enabled. Uniform gravity requires the validated line distribution. */
  readonly gravityModel?: 'lumped-at-com' | 'uniform-line';
  readonly massDistribution?: MemberMassDistribution;
}
interface DynamicRecovery {
  readonly motion: BodySectionMotionState;
}

export function recoverStaticMemberLoads(
  configuration: StructuralConfiguration,
  member: StructuralMember,
  loadCase: LoadCase,
  equilibrium: StaticForceAnalysisResult,
  options: MemberRecoveryOptions = {}
): MemberInternalLoadResult {
  if ('mode' in equilibrium)
    return memberFailure(
      'invalid-equilibrium-result',
      'Static recovery needs an S1 static result.'
    );
  return recover(configuration, member, loadCase, equilibrium, options);
}
export function recoverDynamicMemberLoads(
  configuration: StructuralConfiguration,
  member: StructuralMember,
  loadCase: LoadCase,
  equilibrium: DynamicForceAnalysisResult,
  motion: BodySectionMotionState,
  options: MemberRecoveryOptions = {}
): MemberInternalLoadResult {
  if (equilibrium.mode !== 'dynamic')
    return memberFailure(
      'invalid-equilibrium-result',
      'Dynamic recovery needs an S2 dynamic result.'
    );
  return recover(configuration, member, loadCase, equilibrium, options, { motion });
}

/** Section equilibrium only: never computes or changes the supplied joint reactions. */
function recover(
  configuration: StructuralConfiguration,
  definition: StructuralMember,
  loadCase: LoadCase,
  equilibrium: StaticForceAnalysisResult | DynamicForceAnalysisResult,
  options: MemberRecoveryOptions,
  dynamic?: DynamicRecovery
): MemberInternalLoadResult {
  if (equilibrium.status !== 'ok')
    return memberFailure(
      'upstream-analysis-failed',
      'Member recovery requires a successful strict body-equilibrium result.'
    );
  const resolved = resolveStructuralMember(configuration, definition);
  if (resolved.status !== 'ok') return resolved;
  const { member, body } = resolved;
  try {
    validateLoadCase(loadCase);
  } catch (error) {
    return memberFailure('invalid-load', (error as Error).message);
  }
  if (loadCase.loads.some((load) => !configuration.bodies.some((body) => body.id === load.linkId)))
    return memberFailure('invalid-load', 'A load targets a missing moving root.');
  const gravity = loadCase.gravityMPerS2;
  if (gravity && !['lumped-at-com', 'uniform-line'].includes(options.gravityModel!))
    return memberFailure(
      'missing-gravity-model',
      'Choose lumped-CoM gravity or an explicit uniform line distribution.'
    );
  let density = 0;
  if (dynamic || (gravity && options.gravityModel === 'uniform-line')) {
    const mass = validateMemberMass(member, body, options.massDistribution);
    if (mass.status !== 'ok') return mass;
    density = mass.massPerLengthKgPerM;
  }
  let line: MemberLineLoad = { axial: [0, 0], transverse: [0, 0] };
  if (dynamic) {
    const motion = dynamic.motion;
    if (!motion || !Number.isFinite(motion.angularVelocityRadPerS))
      return memberFailure(
        'missing-angular-velocity',
        'Supply the signed analytical angular velocity in rad/s.'
      );
    if (
      motion.linkId !== body.id ||
      !finiteVector(motion.centerOfMassAccelerationMPerS2) ||
      !Number.isFinite(motion.angularAccelerationRadPerS2)
    )
      return memberFailure(
        'invalid-dynamic-state',
        'Supply finite accelerations for this member root.'
      );
    const a = memberComponents(member, motion.centerOfMassAccelerationMPerS2);
    const omega2 = motion.angularVelocityRadPerS ** 2;
    const alpha = motion.angularAccelerationRadPerS2;
    line = {
      axial: [-density * (a.x + (omega2 * member.lengthM) / 2), density * omega2],
      transverse: [-density * (a.y - (alpha * member.lengthM) / 2), -density * alpha],
    };
  }
  if (gravity && options.gravityModel === 'uniform-line') {
    const g = memberComponents(member, gravity);
    line = {
      axial: [line.axial[0] + density * g.x, line.axial[1]],
      transverse: [line.transverse[0] + density * g.y, line.transverse[1]],
    };
  }
  const points: MemberPointAction[] = [];
  let mappingError = '';
  const transfer = (position: Vector2, force: Vector2, couple: number, source: string) => {
    const offset = memberComponents(member, {
      x: position.x - member.startM.x,
      y: position.y - member.startM.y,
    });
    const local = memberComponents(member, force);
    let xM = offset.x;
    const tolerance = Math.max(1e-12, member.lengthM * 1e-12);
    if (Math.abs(xM) <= tolerance) xM = 0;
    else if (Math.abs(xM - member.lengthM) <= tolerance) xM = member.lengthM;
    if (
      !finiteVector(position) ||
      !finiteVector(force) ||
      !Number.isFinite(couple) ||
      xM < 0 ||
      xM > member.lengthM
    )
      mappingError = source;
    points.push({
      xM,
      axialN: local.x,
      transverseN: local.y,
      coupleNm: couple - offset.y * local.x,
      source,
    });
  };
  const joints = new Map(configuration.joints.map((joint) => [joint.id, joint]));
  const expectedPins = body.jointIds.filter(
    (id) =>
      joints.get(id)!.grounded ||
      configuration.bodies.filter((b) => b.jointIds.includes(id)).length === 2
  );
  const reactions = equilibrium.jointReactions.filter((reaction) => reaction.linkId === body.id);
  if (
    reactions.length !== expectedPins.length ||
    new Set(reactions.map((r) => r.jointId)).size !== reactions.length ||
    reactions.some((r) => !expectedPins.includes(r.jointId))
  )
    return memberFailure(
      'invalid-equilibrium-result',
      'The supplied result has missing or duplicate member pin reactions.'
    );
  for (const reaction of reactions)
    transfer(
      joints.get(reaction.jointId)!.positionM,
      reaction.forceN,
      0,
      'joint:' + reaction.jointId
    );
  const drivers = equilibrium.driverReactions.filter((driver) => driver.linkId === body.id);
  const expectedDrivers = configuration.drivers.filter((driver) => driver.linkId === body.id);
  if (
    drivers.length !== expectedDrivers.length ||
    new Set(drivers.map((d) => d.jointId)).size !== drivers.length ||
    drivers.some((d) => !expectedDrivers.some((expected) => expected.jointId === d.jointId))
  )
    return memberFailure(
      'invalid-equilibrium-result',
      'The supplied result has missing or duplicate member driver torques.'
    );
  for (const driver of drivers)
    transfer(
      joints.get(driver.jointId)!.positionM,
      { x: 0, y: 0 },
      driver.momentNm,
      'driver:' + driver.jointId
    );
  const frame = bodyFrame(body, joints);
  for (let index = 0; index < loadCase.loads.length; index++) {
    const load = loadCase.loads[index];
    if (load.linkId !== body.id) continue;
    if (load.kind === 'point-force') {
      const resolved = resolvePointForce(load, frame);
      transfer(resolved.point, resolved.force, 0, 'load:' + index);
    } else {
      if (!load.at)
        return memberFailure(
          'ambiguous-member-mapping',
          'Locate each applied couple before recovering spatial internal loads.'
        );
      transfer(
        resolveApplicationPoint(load.at, frame),
        { x: 0, y: 0 },
        load.momentNm,
        'couple:' + index
      );
    }
  }
  if (gravity && options.gravityModel === 'lumped-at-com') {
    if (!body.massProperties)
      return memberFailure('invalid-properties', 'Lumped gravity needs the root mass and CoM.');
    const mass = body.massProperties;
    transfer(
      mass.centerOfMassM,
      { x: mass.massKg * gravity.x, y: mass.massKg * gravity.y },
      0,
      'lumped-gravity'
    );
  }
  if (mappingError)
    return memberFailure(
      'load-not-on-supported-member',
      'A load cannot be transferred within this member span: ' + mappingError
    );
  if (
    ![
      ...line.axial,
      ...line.transverse,
      ...points.flatMap((p) => [p.xM, p.axialN, p.transverseN, p.coupleNm]),
    ].every(Number.isFinite)
  )
    return memberFailure('numerical-failure', 'The member load field overflowed.');
  const diagram = buildMemberDiagram(member.lengthM, points, line);
  if (
    !Number.isFinite(diagram.diagnostics.normalizedClosureResidual) ||
    diagram.segments.some(
      (s) => ![...s.axialN, ...s.shearN, ...s.momentNm].every(Number.isFinite)
    ) ||
    Object.values(diagram.extrema).some((component) =>
      [component.minimum, component.maximum, component.absoluteMaximum].some(
        (extremum) =>
          !Number.isFinite(extremum.value) ||
          extremum.at.some((station) => !Number.isFinite(station.xM))
      )
    )
  )
    return memberFailure('numerical-failure', 'Section integration overflowed.');
  if (diagram.diagnostics.normalizedClosureResidual > 1e-8)
    return memberFailure(
      'invalid-equilibrium-result',
      'The supplied reactions, loads, and motion do not balance this member. Select matching inputs from one sample.'
    );
  return {
    status: 'ok',
    mode: dynamic ? 'dynamic' : 'static',
    ...(dynamic ? { motionSource: dynamic.motion.source ?? ('unspecified' as const) } : {}),
    member,
    gravityModel: gravity ? options.gravityModel! : 'none',
    massModel:
      density || dynamic || (gravity && options.gravityModel === 'uniform-line')
        ? 'uniform-line'
        : 'none',
    ...diagram,
  };
}
