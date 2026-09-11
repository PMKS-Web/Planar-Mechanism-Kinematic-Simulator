import { AdmittedBodySystem } from './body-continuation';
import { BodyCycle } from './body-cycle';
import { BodyMotion, BodyRatesResult, solveBodyRates } from './body-rates';
import { BodyForceInput } from './body-force-frame';
import { freezeResult, snapshotMap } from './sample-results';

/** Every rate solve reads this sample's geometry; neither a reversal nor a refusal inherits a previous map. */
export function bodyCycleInputs(
  admitted: AdmittedBodySystem,
  cycle: Extract<BodyCycle, { ok: true }>,
  revision: number
):
  | { readonly ok: true; readonly inputs: readonly BodyForceInput[] }
  | { readonly ok: false; readonly reason: 'invalid' } {
  if (
    !Number.isInteger(revision) ||
    revision < 0 ||
    cycle.partitionKey !== admitted.frame.partition.key
  )
    return freezeResult({ ok: false, reason: 'invalid' });
  const part = admitted.frame.partition,
    driver = part.drivers[0];
  const still: BodyMotion = {
    velocity: { vx: 0, vy: 0, omega: 0 },
    acceleration: { ax: 0, ay: 0, alpha: 0 },
  };
  const boundary = new Map(part.boundary.map((id) => [id, still]));
  const inputs = cycle.samples.map((point, index) => {
    const command = point.state.command,
      velocity = point.direction * Math.abs(driver.speed);
    const raw: BodyRatesResult = point.stop
      ? { ok: false, reason: 'reversal' }
      : solveBodyRates(
          part,
          point.state.poses,
          new Map([[driver.id, { value: command, velocity, acceleration: 0 }]]),
          boundary
        );
    const rates: BodyRatesResult = raw.ok
      ? {
          ok: true,
          motions: snapshotMap(
            [...raw.motions].map(
              ([id, motion]) =>
                [
                  id,
                  freezeResult({
                    velocity: { ...motion.velocity },
                    acceleration: { ...motion.acceleration },
                  }),
                ] as const
            )
          ),
        }
      : { ...raw };
    return freezeResult({
      sample: {
        revision,
        partitionKey: part.key,
        index,
        time: point.time,
        command,
        direction: point.direction,
      },
      pose: {
        ok: true as const,
        poses: point.state.poses,
        commands: snapshotMap([[driver.id, command]]),
      },
      rates,
      reversal: point.stop !== undefined,
    });
  });
  return freezeResult({ ok: true, inputs });
}
