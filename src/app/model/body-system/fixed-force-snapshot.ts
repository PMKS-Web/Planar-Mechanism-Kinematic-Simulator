import { BodyDocument } from './body-document';
import { BodyId, JointId } from './body-id';
import { finitePoint, Point } from './body-frame';
import { CompiledBodySystem } from './compiled-body-system';
import { fixedBodyAdmission } from './body-admission';
import {
  BodyForceFrame,
  ForceRefusal,
  ForceValue,
  PairWrench,
  forceUnavailable,
  pairBodyWrench,
} from './force-frame-result';
import { fixedForceComponents, FixedForceComponent } from './fixed-force-components';
import { fixedForceProjection } from './fixed-force-projection';
import { fixedForceInputs } from './fixed-force-inputs';
import { fixedForceBalance } from './fixed-force-balance';
import { FixedBodyForces, FixedForceOptions } from './fixed-force-result';
import { freezeResult, snapshotMap } from './sample-results';
import { Wrench } from './joint-wrenches';

export interface ComponentForceResult {
  readonly component: FixedForceComponent;
  readonly result:
    | FixedBodyForces
    | { readonly ok: false; readonly reason: 'aggregate-properties' | 'load-owner' };
}
export type FixedForceSnapshot =
  | { readonly ok: false; readonly reason: 'invalid' }
  | {
      readonly ok: true;
      readonly revision: number;
      readonly mode: 'static' | 'dynamic';
      readonly gravity: Point;
      readonly components: ReadonlyMap<string, ComponentForceResult>;
      readonly componentOf: ReadonlyMap<BodyId, string>;
      readonly joints: ReadonlyMap<JointId, ForceValue<PairWrench>>;
    };

/** A missing clock cannot erase another foundation's material forces merely because both touch WORLD. */
export function solveFixedForceComponents(
  document: BodyDocument,
  system: CompiledBodySystem,
  revision: number,
  samples: readonly BodyForceFrame[],
  options: FixedForceOptions & {
    readonly supportPolicies?: ReadonlyMap<string, 'unique' | 'evenest'>;
  }
): FixedForceSnapshot {
  if (!Number.isInteger(revision) || revision < 0 || !finitePoint(options.gravity))
    return freezeResult({ ok: false, reason: 'invalid' });
  const results = new Map<string, ComponentForceResult>(),
    componentOf = new Map<BodyId, string>();
  const joints = new Map<JointId, ForceValue<PairWrench>>();
  for (const component of fixedForceComponents(document, system)) {
    const projected = fixedForceProjection(document, system, component, options.gravity);
    let result: ComponentForceResult['result'];
    if (!projected.ok) result = projected;
    else {
      const issue = fixedBodyAdmission(projected.system);
      const inputs = fixedForceInputs(
        document,
        system,
        revision,
        samples,
        options.mode,
        options.gravity,
        new Set(component.bodies)
      );
      result = issue
        ? { ok: false, reason: issue }
        : !inputs.ok
          ? inputs
          : fixedForceBalance(projected.document, projected.system, revision, inputs, {
              ...options,
              supportPolicy: options.supportPolicies?.get(component.key) ?? options.supportPolicy,
            });
    }
    results.set(component.key, freezeResult({ component, result }));
    for (const id of component.bodies) componentOf.set(id, component.key);
    for (const id of component.joints)
      joints.set(
        id,
        result.ok
          ? (result.joints.get(id) ?? forceUnavailable('invalid'))
          : forceUnavailable(jointRefusal(result.reason))
      );
  }
  return freezeResult({
    ok: true,
    revision,
    mode: options.mode,
    gravity: { ...options.gravity },
    components: snapshotMap(results),
    componentOf: snapshotMap(componentOf),
    joints: snapshotMap(joints),
  });
}

export function fixedJointBodyWrench(
  snapshot: FixedForceSnapshot,
  joint: JointId,
  body: BodyId
): ForceValue<Wrench> {
  return snapshot.ok
    ? pairBodyWrench(snapshot.joints.get(joint), body)
    : forceUnavailable('invalid');
}

function jointRefusal(
  reason: Extract<ComponentForceResult['result'], { ok: false }>['reason']
): ForceRefusal {
  return reason === 'aggregate-properties' ||
    reason === 'load-owner' ||
    reason === 'invalid' ||
    reason === 'travel' ||
    reason === 'unbalanced'
    ? reason
    : 'frame-context';
}
