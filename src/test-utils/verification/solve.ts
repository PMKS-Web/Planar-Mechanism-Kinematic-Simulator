// joint.ts first: see the import-cycle note in fixture.ts.
import '../../app/model/joint';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { BuiltMechanism } from './fixture';

type XY = [number, number];

export interface KinematicsTrace {
  steps: number;
  jointPos: Record<string, XY>[];
  jointVel: Record<string, XY>[];
  jointAcc: Record<string, XY>[];
  linkCoMPos: Record<string, XY>[];
  linkCoMVel: Record<string, XY>[];
  linkCoMAcc: Record<string, XY>[];
  linkAngVel: Record<string, number>[];
  linkAngAcc: Record<string, number>[];
}

export interface DynamicsTrace {
  steps: number;
  jointForce: Record<string, XY>[];
  torque: number[];
}

function snapshotXY(map: Map<string, [number, number]>): Record<string, XY> {
  const out: Record<string, XY> = {};
  for (const [id, val] of map.entries()) {
    out[id] = [val[0], val[1]];
  }
  return out;
}

function snapshotZ(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, val] of map.entries()) {
    out[id] = val;
  }
  return out;
}

export function solveKinematics(built: BuiltMechanism): KinematicsTrace {
  const { mechanism } = built;
  const trace: KinematicsTrace = {
    steps: mechanism.joints.length,
    jointPos: [],
    jointVel: [],
    jointAcc: [],
    linkCoMPos: [],
    linkCoMVel: [],
    linkCoMAcc: [],
    linkAngVel: [],
    linkAngAcc: [],
  };
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  for (let t = 0; t < mechanism.joints.length; t++) {
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    const pos: Record<string, XY> = {};
    mechanism.joints[t].forEach((j) => {
      pos[j.id] = [j.x, j.y];
    });
    trace.jointPos.push(pos);
    trace.jointVel.push(snapshotXY(KinematicsSolver.jointVelMap));
    trace.jointAcc.push(snapshotXY(KinematicsSolver.jointAccMap));
    trace.linkCoMPos.push(snapshotXY(KinematicsSolver.linkCoMMap));
    trace.linkCoMVel.push(snapshotXY(KinematicsSolver.linkVelMap));
    trace.linkCoMAcc.push(snapshotXY(KinematicsSolver.linkAccMap));
    trace.linkAngVel.push(snapshotZ(KinematicsSolver.linkAngVelMap));
    trace.linkAngAcc.push(snapshotZ(KinematicsSolver.linkAngAccMap));
  }
  return trace;
}

/**
 * Runs the dynamic (Newton) force analysis at every timestep. Assumes the
 * mechanism was built with the desired gravity flag.
 */
export function solveDynamics(built: BuiltMechanism): DynamicsTrace {
  const { mechanism } = built;
  const trace: DynamicsTrace = { steps: mechanism.joints.length, jointForce: [], torque: [] };
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  ForceSolver.resetVariables();
  ForceSolver.determineDesiredLoopLettersForce(mechanism.requiredLoops);
  for (let t = 0; t < mechanism.joints.length; t++) {
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    ForceSolver.determineForceAnalysis(
      mechanism.joints[t],
      mechanism.links[t],
      'dynamics',
      mechanism.gravity,
      mechanism.unit
    );
    trace.jointForce.push(snapshotXY(ForceSolver.unknownVariableForcesMap));
    trace.torque.push(ForceSolver.unknownVariableTorque);
  }
  return trace;
}
