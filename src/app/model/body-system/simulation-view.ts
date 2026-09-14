import { SimulationSnapshot } from './simulation-snapshot';
import { BodyForceInput } from './body-force-frame';
import { BodyForceFrame, forceAvailable } from './force-frame-result';
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
  request: {
    readonly revision: number;
    readonly indices: ReadonlyMap<string, number>;
    readonly directions?: ReadonlyMap<string, 1 | -1>;
  }
): SimulationValue<SimulationView> {
  if (request.revision !== snapshot.revision) return simulationUnavailable('stale-snapshot');
  if ([...request.indices.keys()].some((key) => !snapshot.partitions.has(key)))
    return simulationUnavailable('sample-index');
  if (
    [...(request.directions ?? [])].some(
      ([key, direction]) => !snapshot.partitions.has(key) || (direction !== 1 && direction !== -1)
    )
  )
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
      const forward = {
        input: partition.inputs[index],
        forces: partition.forces.ok ? partition.forces.frames[index] : undefined,
      };
      const selected =
        request.directions?.get(key) === -1 ? reverseSimulationSample(forward) : forward;
      samples.set(key, simulationAvailable(selected));
      if (selected.forces) frames.push(selected.forces);
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

/** Time reversal changes velocity and power, but preserves acceleration and equilibrium.
 * Reuse the immutable solve rather than displaying forward rates beside a backward clock.
 */
export function reverseSimulationSample(
  selected: SelectedSimulationSample
): SelectedSimulationSample {
  const { input, forces } = selected;
  const sample = { ...input.sample, direction: -input.sample.direction as 1 | -1 };
  const rates = input.rates?.ok
    ? {
        ok: true as const,
        motions: snapshotMap(
          [...input.rates.motions].map(
            ([id, motion]) =>
              [
                id,
                {
                  acceleration: motion.acceleration,
                  velocity: {
                    vx: -motion.velocity.vx,
                    vy: -motion.velocity.vy,
                    omega: -motion.velocity.omega,
                  },
                },
              ] as const
          )
        ),
      }
    : input.rates;
  const reversedForces: BodyForceFrame | undefined = !forces
    ? undefined
    : !forces.ok
      ? { ...forces, sample }
      : {
          ...forces,
          sample,
          power: forces.power.ok
            ? forceAvailable({
                applied: -forces.power.value.applied,
                driver: -forces.power.value.driver,
                boundary: -forces.power.value.boundary,
                kineticEnergyRate: -forces.power.value.kineticEnergyRate,
                residual: -forces.power.value.residual,
              })
            : forces.power,
        };
  return freezeResult({ input: { ...input, sample, rates }, forces: reversedForces });
}
