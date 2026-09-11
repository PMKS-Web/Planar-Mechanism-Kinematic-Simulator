import { BodyDocument } from './body-document';
import { BodyId } from './body-id';
import { finitePoint, Point } from './body-frame';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { buildBodyCycle } from './body-cycle';
import { buildBodyMotionWindow } from './body-motion-window';
import { bodyCycleInputs } from './body-cycle-inputs';
import { solveBodyForceSeries } from './body-force-series';
import { SimulationBuild, SimulationPartition, SimulationPathOptions } from './simulation-snapshot';
import { snapshotCopy } from './sample-results';
import { fixedSupportPolicies } from './fixed-support-policies';

/** One revision owns the compiled frames, motion, loads and design records used by every reader. */
export function buildSimulationSnapshot(
  document: BodyDocument,
  revision: number,
  options: {
    readonly mode: 'static' | 'dynamic';
    readonly gravity: Point;
    readonly path?: SimulationPathOptions;
    readonly paths?: ReadonlyMap<string, SimulationPathOptions>;
    readonly supportPolicies?: ReadonlyMap<string, 'unique' | 'evenest'>;
  }
): SimulationBuild {
  if (
    !Number.isInteger(revision) ||
    revision < 0 ||
    !finitePoint(options.gravity) ||
    !['static', 'dynamic'].includes(options.mode)
  )
    return { ok: false, reason: 'invalid' };
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) return snapshotCopy({ ok: false, reason: 'document', issues: compiled.issues });
  const system = compiled.system,
    partitions = new Map<string, SimulationPartition>(),
    bodyPartition = new Map<BodyId, string>();
  if (
    options.paths &&
    [...options.paths.keys()].some((key) => !system.partitions.some((part) => part.key === key))
  )
    return { ok: false, reason: 'invalid' };
  for (const partition of system.partitions) {
    for (const id of partition.materialIds) bodyPartition.set(id, partition.key);
    const admitted = admitBodyPartition(system, partition);
    if (!admitted.ok) {
      partitions.set(partition.key, {
        ok: false,
        key: partition.key,
        stage: 'admission',
        reason: admitted.reason,
      });
      continue;
    }
    const pathOptions = options.paths?.get(partition.key) ?? options.path ?? {};
    const path =
      pathOptions.duration === undefined
        ? buildBodyCycle(admitted, pathOptions)
        : buildBodyMotionWindow(admitted, { ...pathOptions, duration: pathOptions.duration });
    if (!path.ok) {
      partitions.set(partition.key, {
        ok: false,
        key: partition.key,
        stage: 'trajectory',
        reason: path.reason,
      });
      continue;
    }
    const inputs = bodyCycleInputs(admitted, path, revision);
    if (!inputs.ok) return { ok: false, reason: 'invalid' };
    const forces = solveBodyForceSeries(document, system, admitted.frame, inputs.inputs, options);
    partitions.set(partition.key, {
      ok: true,
      key: partition.key,
      frame: admitted.frame,
      path,
      inputs: inputs.inputs,
      forces,
    });
  }
  const policies = fixedSupportPolicies(document, system, options.gravity, options.supportPolicies);
  if (!policies) return { ok: false, reason: 'invalid' };
  return snapshotCopy({
    ok: true,
    snapshot: {
      revision,
      document,
      system,
      mode: options.mode,
      gravity: options.gravity,
      partitions,
      bodyPartition,
      fixedSupportPolicies: policies,
    },
  });
}
