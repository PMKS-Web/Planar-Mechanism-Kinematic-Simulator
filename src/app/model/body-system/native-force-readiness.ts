import { SimulationSnapshot } from './simulation-snapshot';

/** A series can be valid while every equilibrium frame is refused. Readiness needs an answer and a load. */
export function nativeForceRequirements(snapshot: SimulationSnapshot | undefined) {
  const runnable = [...(snapshot?.partitions.values() ?? [])].filter((part) => part.ok);
  if (!snapshot || !runnable.length) return [{ met: false }];
  const groups = new Set(
    runnable.flatMap((part) => [...part.frame.partition.unknowns, ...part.frame.partition.boundary])
  );
  const owns = (id: string) =>
    [...snapshot.system.groups.values()].some(
      (group) => groups.has(group.id) && [...group.members.keys()].some((member) => member === id)
    );
  const weighted = [...snapshot.system.groups.values()].some(
    (group) => groups.has(group.id) && group.mass.mass > 0
  );
  const loaded =
    snapshot.document.forces.some((force) => owns(force.bodyId)) ||
    (snapshot.document.settings.gravity && weighted);
  const requirements: { met: boolean; warning?: boolean }[] = [
    { met: true },
    {
      met: runnable.every((part) => part.forces.ok && part.forces.frames.some((frame) => frame.ok)),
    },
    { met: loaded },
  ];
  if (runnable.some((part) => part.forces.ok && part.forces.sharedSupportFrames > 0))
    requirements.push({ met: false, warning: true });
  if (loaded)
    requirements.push({
      met: [...snapshot.system.groups.values()]
        .filter((group) => groups.has(group.id) && !group.fixed)
        .every((group) => group.mass.mass > 0),
      warning: true,
    });
  return requirements;
}
