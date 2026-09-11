import { SimulationSnapshot } from './simulation-snapshot';
import { BodyForceInput } from './body-force-frame';
import { BodyForceFrame } from './force-frame-result';
import { FixedForceSnapshot, solveFixedForceComponents } from './fixed-force-snapshot';
import { SimulationValue, simulationAvailable, simulationUnavailable } from './simulation-values';
import { freezeResult, snapshotMap } from './sample-results';

export interface SelectedSimulationSample {
  readonly input: BodyForceInput;
  readonly forces?: BodyForceFrame;
}
export interface SimulationView {
  readonly snapshot: SimulationSnapshot;
  readonly samples: ReadonlyMap<string, SimulationValue<SelectedSimulationSample>>;
  readonly fixedForces: FixedForceSnapshot;
}

/** Every clock is selected explicitly; a failed or missing selection never borrows index zero. */
export function selectSimulationView(
  snapshot: SimulationSnapshot,
  request: { readonly revision: number; readonly indices: ReadonlyMap<string, number> }
): SimulationValue<SimulationView> {
  if (request.revision !== snapshot.revision) return simulationUnavailable('stale-snapshot');
  if ([...request.indices.keys()].some((key) => !snapshot.partitions.has(key)))
    return simulationUnavailable('sample-index');
  const samples = new Map<string, SimulationValue<SelectedSimulationSample>>(),
    frames: BodyForceFrame[] = [];
  for (const [key, partition] of snapshot.partitions) {
    const index = request.indices.get(key);
    if (!partition.ok) samples.set(key, simulationUnavailable(partition.reason));
    else if (index === undefined) samples.set(key, simulationUnavailable('missing-sample'));
    else if (!Number.isInteger(index) || index < 0 || index >= partition.inputs.length)
      samples.set(key, simulationUnavailable('sample-index'));
    else {
      const forces = partition.forces.ok ? partition.forces.frames[index] : undefined;
      samples.set(key, simulationAvailable({ input: partition.inputs[index], forces }));
      if (forces) frames.push(forces);
    }
  }
  const fixedForces = solveFixedForceComponents(
    snapshot.document,
    snapshot.system,
    snapshot.revision,
    frames,
    {
      mode: snapshot.mode,
      gravity: snapshot.gravity,
      supportPolicies: snapshot.fixedSupportPolicies,
    }
  );
  return simulationAvailable(
    freezeResult({ snapshot, samples: snapshotMap(samples), fixedForces })
  );
}
