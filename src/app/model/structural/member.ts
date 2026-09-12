import type { StructuralConfiguration, StructuralBody } from './configuration';
import { validateConfiguration, STRUCTURAL_TOLERANCES } from './equilibrium-solver';
import type { Vector2 } from './loads';
import type { StructuralProperties } from './structural-properties';
import { memberFailure, MemberFailure } from './member-results';

/** Explicit physical interpretation. V1 is exactly one entire two-pin rigid root. */
export interface StructuralMember {
  readonly kind: 'straight-prismatic';
  readonly id: string;
  readonly bodyId: string;
  readonly startJointId: string;
  readonly endJointId: string;
}
export interface ResolvedStructuralMember extends StructuralMember {
  readonly startM: Vector2;
  readonly endM: Vector2;
  readonly axis: Vector2;
  readonly transverse: Vector2;
  readonly lengthM: number;
  readonly structural?: StructuralProperties;
}
export function resolveStructuralMember(
  configuration: StructuralConfiguration,
  member: StructuralMember
): { status: 'ok'; member: ResolvedStructuralMember; body: StructuralBody } | MemberFailure {
  const invalid = validateConfiguration(configuration);
  if (invalid) return memberFailure(invalid.status, invalid.diagnostics.message!);
  const body = configuration.bodies.find((b) => b.id === member?.bodyId);
  if (!body || !member.id || member.startJointId === member.endJointId)
    return memberFailure(
      'ambiguous-member-mapping',
      'Select one moving root and two distinct end pins.'
    );
  if (body.memberGeometry === 'compound')
    return memberFailure(
      'unsupported-compound',
      'A compound needs an explicit member decomposition and load-transfer model.'
    );
  if (
    member.kind !== 'straight-prismatic' ||
    body.jointIds.length !== 2 ||
    (body.memberGeometry !== undefined && body.memberGeometry !== 'two-pin')
  )
    return memberFailure(
      'unsupported-member-geometry',
      'Declare a straight prismatic member on a simple two-pin root.'
    );
  if (![member.startJointId, member.endJointId].every((id) => body.jointIds.includes(id)))
    return memberFailure(
      'ambiguous-member-mapping',
      'The member must span its root body end to end.'
    );
  const startM = configuration.joints.find((j) => j.id === member.startJointId)!.positionM;
  const endM = configuration.joints.find((j) => j.id === member.endJointId)!.positionM;
  const lengthM = Math.hypot(endM.x - startM.x, endM.y - startM.y);
  if (!Number.isFinite(lengthM) || lengthM <= STRUCTURAL_TOLERANCES.lengthM)
    return memberFailure('unsupported-member-geometry', 'The member needs a finite nonzero span.');
  const axis = { x: (endM.x - startM.x) / lengthM, y: (endM.y - startM.y) / lengthM };
  return {
    status: 'ok',
    body,
    member: {
      ...member,
      startM: { ...startM },
      endM: { ...endM },
      axis,
      transverse: { x: -axis.y, y: axis.x },
      lengthM,
      structural: body.structural ? structuredClone(body.structural) : undefined,
    },
  };
}
export function memberComponents(member: ResolvedStructuralMember, force: Vector2): Vector2 {
  return {
    x: force.x * member.axis.x + force.y * member.axis.y,
    y: force.x * member.transverse.x + force.y * member.transverse.y,
  };
}
