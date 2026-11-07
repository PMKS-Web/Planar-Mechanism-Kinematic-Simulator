// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { assignBodies } from '../../app/model/mechanism/bodies';
import { freedomsOf as countedFreedomsOf } from '../../app/model/mechanism/freedoms';
import {
  constraintSystemOf,
  freeDirectionsOf,
  mobilityFromGeometry,
} from '../../app/model/mechanism/mobility';
import { MechanismPartition } from '../../app/model/mechanism/mechanism-partition';
import { OracleReference } from './reference';

/** The quantity a manifest entry names to leave a machine's mobility out. */
export type MobilityQuantity = 'mobility';

export interface MobilityComparison {
  pmks: {
    /** Directions the constraint Jacobian leaves free at the drawn pose. */
    firstOrder: number;
    /** Of those, the ones `mobility.ts` finds the linkage can actually take. */
    secondOrder: number;
    /** Gruebler's count, before the geometry has its say. */
    counted: number;
  };
  /** `secondOrder` is a lower bound where `settled` is false. */
  oracle: { firstOrder: number; secondOrder: number; settled: boolean };
  agree: boolean;
}

/**
 * PMKS+'s mobility of one machine against the oracle's, at the drawn pose: the
 * first-order count (the rank of the constraint Jacobian) and the second-order
 * one (the directions that survive a step along them). The two are computed
 * independently -- PMKS+ in its own body coordinates and step test, the oracle
 * from Exudyn's Jacobian and the quadratic form of its constraint curvature --
 * so they agreeing is evidence about both.
 */
export function compareMobility(
  partition: MechanismPartition,
  reference: OracleReference
): MobilityComparison {
  const { joints, links } = partition;
  const assignment = assignBodies(joints, links);
  const system = constraintSystemOf(joints, links, assignment);
  const directions = system ? freeDirectionsOf(system) : [];
  const pmks = {
    firstOrder: directions.length,
    secondOrder: mobilityFromGeometry(joints, links, assignment) ?? 0,
    counted: countedFreedomsOf(joints, links, assignment).counted,
  };
  const oracle = {
    firstOrder: reference.mobility.freedoms,
    secondOrder: reference.mobility.second_order_freedoms,
    settled: reference.mobility.second_order_settled,
  };
  // Where the oracle's second-order count is only a lower bound, PMKS+'s
  // must reach it and may not exceed the first-order count.
  const second = oracle.settled
    ? pmks.secondOrder === oracle.secondOrder
    : pmks.secondOrder >= oracle.secondOrder && pmks.secondOrder <= oracle.firstOrder;
  const agree = pmks.firstOrder === oracle.firstOrder && second;
  return { pmks, oracle, agree };
}
