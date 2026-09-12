import { Joint } from '../joint';
import { Link } from '../link';
import { FrictionMotion } from './friction-analysis';
import { fillRatesByDifference } from './finite-difference-kinematics';

/** Fill only missing velocities; reverse sampled rates when the drive traverses old poses backward. */
export function completeFrictionMotion(
  mechanism: {
    joints: Joint[][];
    links: Link[][];
    timeNum: number[];
    framesRunBackwards?: boolean;
  },
  index: number,
  motion: FrictionMotion
): FrictionMotion {
  const knownJoints = new Set(
    [...motion.jointVelocities].filter(([, v]) => v.every(Number.isFinite)).map(([id]) => id)
  );
  const knownLinks = new Set(
    [...motion.angularVelocities].filter(([, v]) => Number.isFinite(v)).map(([id]) => id)
  );
  fillRatesByDifference(mechanism, index, {
    jointVel: motion.jointVelocities,
    jointAcc: new Map(),
    linkAngVel: motion.angularVelocities,
    linkAngAcc: new Map(),
    linkAngPos: new Map(),
    linkCoM: new Map(),
    linkVel: new Map(),
    linkAcc: new Map(),
  });
  if (mechanism.framesRunBackwards) {
    for (const [id, value] of motion.jointVelocities) {
      if (!knownJoints.has(id)) motion.jointVelocities.set(id, [-value[0], -value[1]]);
    }
    for (const [id, value] of motion.angularVelocities) {
      if (!knownLinks.has(id)) motion.angularVelocities.set(id, -value);
    }
  }
  return motion;
}
