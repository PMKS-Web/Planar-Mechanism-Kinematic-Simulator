import { BodyDocument } from './body-document';
import { BodyClockState } from './body-document-authority';
import { BodyEditFrame } from './body-edit-frame';
import { BodyId } from './body-id';
import { Pose } from './body-frame';
import { BodyAnchorChange } from './body-anchor-change';
import { CompiledBodySystem, CompiledBodyPartition } from './compiled-body-system';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { reachBodyAnchor } from './body-reach-anchor';
import { bodyAnchorCoordinateSign } from './body-anchor-coordinate';
import { bodyAnchorMaterialPoses } from './body-anchor-material-poses';
import { bodyAnchorClock } from './body-anchor-clock';

type RestoredAnchor =
  | {
      readonly ok: true;
      readonly poses: ReadonlyMap<BodyId, Pose>;
      readonly shownPoses?: ReadonlyMap<BodyId, Pose>;
      readonly clock: BodyClockState;
      readonly change: BodyAnchorChange;
    }
  | { readonly ok: false; readonly status: BodyAnchorChange['status'] };

/** Reach the original coordinate before selecting the edited pose on the rebuilt motion's leg. */
export function restoreBodyPartitionAnchor(
  source: BodyDocument,
  proposed: BodyDocument,
  frame: BodyEditFrame,
  system: CompiledBodySystem,
  part: CompiledBodyPartition,
  length: number
): RestoredAnchor {
  const admitted = admitBodyPartition(system, part);
  if (!admitted.ok) return { ok: false, status: 'motion-unavailable' };
  const driver = proposed.drivers.find((item) => item.id === part.drivers[0].id)!;
  const oldDriver = source.drivers.find((item) => item.id === driver.id);
  const clock = frame.clocks.find((item) => item.driverId === driver.id);
  const sign = oldDriver && bodyAnchorCoordinateSign(source, proposed, oldDriver, driver);
  if (!clock || !sign) return { ok: false, status: 'coordinate-changed' };
  const factor = driver.coordinate.coordinate === 'angle' ? 1 : length;
  const target = clock.anchor * sign * factor;
  const reached = reachBodyAnchor(admitted, system, source, target, length);
  if (!reached.ok) return reached;
  const restored = bodyAnchorMaterialPoses(system, admitted.frame, reached.poses, length);
  const direction = ((clock.direction ?? (oldDriver!.profile.speed < 0 ? -1 : 1)) * sign) as 1 | -1;
  let shown: ReturnType<typeof bodyAnchorClock>;
  if (clock.time === 0 && driver.profile.initial * factor === target) {
    // Another machine being displaced does not make this machine's unchanged start require a cycle.
    shown = { command: target, time: 0, direction };
  } else {
    const candidate: BodyDocument = {
      ...proposed,
      bodies: proposed.bodies.map((body) => ({
        ...body,
        pose: restored.get(body.id) ?? body.pose,
      })),
      drivers: proposed.drivers.map((item) =>
        item.id === driver.id
          ? { ...item, profile: { ...item.profile, initial: target / factor } }
          : item
      ),
    };
    const rebuilt = compileBodyDocument(candidate);
    const newPart =
      rebuilt.ok &&
      rebuilt.system.partitions.find((item) =>
        item.drivers.some((drive) => drive.id === driver.id)
      );
    const start = rebuilt.ok && newPart && admitBodyPartition(rebuilt.system, newPart);
    if (start && start.ok && rebuilt.ok)
      shown = bodyAnchorClock(
        start,
        rebuilt.system,
        proposed,
        driver.profile.initial * factor,
        direction,
        length,
        frame.paths.get(driver.id) ?? 'cycle'
      );
  }
  if (!shown) return { ok: false, status: 'anchor-unsolved' };
  return {
    ok: true,
    poses: restored,
    shownPoses: shown.poses,
    clock: {
      ...clock,
      anchor: target / factor,
      command: shown.command / factor,
      time: shown.time,
      direction: shown.direction,
    },
    change: {
      driverId: driver.id,
      status: 'retained',
      previous: clock.anchor,
      anchor: target / factor,
    },
  };
}
