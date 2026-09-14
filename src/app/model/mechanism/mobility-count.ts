import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { assignBodies, WORLD } from './bodies';

/** The solver's structural count, with the terms retained for a worked explanation. */
export interface MobilityCount {
  readonly bodies: readonly { id: string; links: readonly string[] }[];
  readonly joints: readonly {
    id: string;
    name: string;
    kind: 'Pin' | 'Slider';
    bodies: number;
    pairs: number;
  }[];
  readonly hasGround: boolean;
  readonly N: number;
  readonly J1: number;
  readonly J2: number;
  readonly counted: number;
}

/** Use the same rigid-body assignment as partitioning; drawn objects are not separate freedoms. */
export function countMobility(joints: Joint[], links: Link[]): MobilityCount {
  const { bodyOf, bodiesAt } = assignBodies(joints, links);
  const groups = new Map<string, string[]>();
  groups.set(WORLD, []);
  for (const link of links) {
    const id = bodyOf(link);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(link.name || link.id);
  }
  const jointCounts = joints
    .filter((joint): joint is RealJoint => joint instanceof RealJoint)
    .map((joint) => {
      const bodies = bodiesAt(joint).size;
      return {
        id: joint.id,
        name: joint.name || joint.id,
        kind: joint instanceof PrisJoint ? ('Slider' as const) : ('Pin' as const),
        bodies,
        pairs: Math.max(bodies - 1, 0),
      };
    });
  const N = groups.size;
  const J1 = jointCounts.reduce((sum, joint) => sum + joint.pairs, 0);
  // Every supported connection is a lower pair, including a slot's explicit sliding block.
  const J2 = 0;
  return {
    bodies: [...groups].map(([id, names]) => ({ id, links: names })),
    joints: jointCounts,
    hasGround: joints.some((joint) => joint instanceof RealJoint && joint.ground),
    N,
    J1,
    J2,
    counted: 3 * (N - 1) - 2 * J1 - J2,
  };
}
