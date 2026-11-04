// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { Joint, PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import {
  fillRatesByDifference,
  SampleRates,
} from '../../app/model/mechanism/finite-difference-kinematics';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { cylinderAtSeal } from '../../app/model/cylinder';
import { drivenLinkAt } from './export-problem';
import { angleReference, GROUND_BODY, resolveActuator } from '../../app/model/actuator';

type Vec = [number, number];

/** How PMKS+ produced a rate: its analytic solver, or a difference of its poses. */
export type RateMethod = 'analytic' | 'differenced';

export interface Rated<T> {
  value: T;
  method: RateMethod;
}

/** One PMKS+ frame, in SI, placed on the oracle's driver grid. */
export interface PmksSample {
  frame: number;
  /** Grid index: the driver has travelled k steps from the drawn pose. */
  k: number;
  /** How far the driver coordinate sits from the grid point, in steps. */
  offGrid: number;
  /** +1 while the driver moves toward increasing travel, -1 on the way back. */
  direction: 1 | -1;
  points: Map<string, { pos: Vec; vel?: Rated<Vec>; acc?: Rated<Vec> }>;
  bodies: Map<
    string,
    {
      com?: Vec;
      comVel?: Rated<Vec>;
      comAcc?: Rated<Vec>;
      omega?: Rated<number>;
      alpha?: Rated<number>;
    }
  >;
}

/**
 * Where the driver is at a frame, measured the way the oracle measures it: the
 * driven bar's turn from the drawn pose for a pin, the travel along the slot
 * for a slider. In radians or meters.
 */
function driverCoordinate(
  mechanism: Mechanism,
  frame: number,
  inputId: string,
  meters: number
): number | undefined {
  const joints = mechanism.joints[frame];
  const first = mechanism.joints[0];
  const input = joints.find((joint) => joint.id === inputId);
  const input0 = first.find((joint) => joint.id === inputId);
  if (!(input instanceof RealJoint) || !(input0 instanceof RealJoint)) return undefined;
  if (input instanceof PrisJoint && input0 instanceof PrisJoint) {
    // A cylinder is commanded by the span between its mounts, which nothing
    // but the solve moves (CylinderDrive in position-solver.ts): the seal's
    // travel is that span's change, whatever frame 0 left its interior at.
    const cylinder = cylinderAtSeal(input0);
    if (cylinder) {
      const span = (frameJoints: Joint[]): number | undefined => {
        const a = frameJoints.find((joint) => joint.id === cylinder.mountA.id);
        const b = frameJoints.find((joint) => joint.id === cylinder.mountB.id);
        return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : undefined;
      };
      const now = span(joints);
      const then = span(first);
      if (now === undefined || then === undefined) return undefined;
      return ((now - then) / MODEL_SCALE) * meters;
    }
    // A slot cut into a moving link moves with it: the travel is the block's
    // along the slot from the slot's first joint, as it points at each frame.
    const along = (block: PrisJoint): number | undefined => {
      const origin = block.slotJointA;
      if (!block.isFloating || !origin) return undefined;
      return (
        (block.x - origin.x) * Math.cos(block.slotAngle) +
        (block.y - origin.y) * Math.sin(block.slotAngle)
      );
    };
    const now = along(input);
    const then = along(input0);
    if (now !== undefined && then !== undefined) return ((now - then) / MODEL_SCALE) * meters;
    const angle = input0.slotAngle;
    const dx = input.x - input0.x;
    const dy = input.y - input0.y;
    return ((dx * Math.cos(angle) + dy * Math.sin(angle)) / MODEL_SCALE) * meters;
  }
  // A pin input turns one body against another: the frame and a crank, or two
  // links at a floating pin (PinDrive in position-solver.ts). Its coordinate is
  // the angle between them, read off one other joint on each.
  const drivenBody = drivenLinkAt(input0);
  const tip0 = drivenBody && angleReference(drivenBody, input0);
  let base0: Joint | undefined;
  if (!input0.ground) {
    const actuator = resolveActuator(input0);
    if (!actuator || actuator.kind !== 'angle' || actuator.referenceBody === GROUND_BODY) {
      return undefined;
    }
    base0 = angleReference(actuator.referenceBody, input0);
    if (!base0) return undefined;
  }
  if (!tip0) return undefined;
  const where = (id: string): Joint | undefined => joints.find((joint) => joint.id === id);
  const tip = where(tip0.id);
  const base = base0 && where(base0.id);
  if (!tip || (base0 && !base)) return undefined;
  const bearing = (from: Joint, to: Joint): number => Math.atan2(to.y - from.y, to.x - from.x);
  const turn = bearing(input, tip) - bearing(input0, tip0);
  return base && base0 ? turn - (bearing(input, base) - bearing(input0, base0)) : turn;
}

function rates(mechanism: Mechanism, frame: number): { kept: SampleRates; filled: SampleRates } {
  mechanism.prepareSolvers();
  KinematicsSolver.determineKinematics(
    mechanism.joints[frame],
    mechanism.links[frame],
    mechanism.inputAngularVelocities[frame]
  );
  const kept: SampleRates = {
    jointVel: new Map(KinematicsSolver.jointVelMap),
    jointAcc: new Map(KinematicsSolver.jointAccMap),
    linkCoM: new Map(KinematicsSolver.linkCoMMap),
    linkVel: new Map(KinematicsSolver.linkVelMap),
    linkAcc: new Map(KinematicsSolver.linkAccMap),
    linkAngPos: new Map(KinematicsSolver.linkAngPosMap),
    linkAngVel: new Map(KinematicsSolver.linkAngVelMap),
    linkAngAcc: new Map(KinematicsSolver.linkAngAccMap),
  };
  const filled: SampleRates = {
    jointVel: new Map(kept.jointVel),
    jointAcc: new Map(kept.jointAcc),
    linkCoM: new Map(kept.linkCoM),
    linkVel: new Map(kept.linkVel),
    linkAcc: new Map(kept.linkAcc),
    linkAngPos: new Map(kept.linkAngPos),
    linkAngVel: new Map(kept.linkAngVel),
    linkAngAcc: new Map(kept.linkAngAcc),
  };
  // The same fill the analysis panel applies (analysis-sample.service.ts):
  // what the analytic solver leaves blank, a reader sees differenced.
  fillRatesByDifference(mechanism, frame, filled);
  return { kept, filled };
}

const finiteVec = (v: Vec | undefined): v is Vec =>
  !!v && Number.isFinite(v[0]) && Number.isFinite(v[1]);

function rated<T extends Vec | number>(
  kept: T | undefined,
  filled: T | undefined,
  scale: number
): Rated<T> | undefined {
  const ok = (v: T | undefined): v is T =>
    typeof v === 'number' ? Number.isFinite(v) : finiteVec(v as Vec | undefined);
  if (ok(kept)) return { value: scaled(kept, scale), method: 'analytic' };
  if (ok(filled)) return { value: scaled(filled, scale), method: 'differenced' };
  return undefined;
}

function scaled<T extends Vec | number>(value: T, scale: number): T {
  return (typeof value === 'number' ? value * scale : [value[0] * scale, value[1] * scale]) as T;
}

/**
 * Every frame of a solved PMKS+ machine, in SI and keyed by the driver's grid
 * index, with each rate marked by how PMKS+ produced it.
 */
export function pmksSamples(
  mechanism: Mechanism,
  inputId: string,
  step: number,
  meters: number
): PmksSample[] {
  const toMeters = meters / MODEL_SCALE;
  const samples: PmksSample[] = [];
  KinematicsSolver.resetVariables();
  let previous: number | undefined;
  let unwrapped = 0;
  for (let frame = 0; frame < mechanism.joints.length; frame++) {
    const raw = driverCoordinate(mechanism, frame, inputId, meters);
    if (raw === undefined) continue;
    // A pin's angle is read off atan2, so it is unwrapped against the last frame.
    if (previous === undefined) unwrapped = raw;
    else unwrapped += Math.atan2(Math.sin(raw - previous), Math.cos(raw - previous));
    const isPin = !(mechanism.joints[frame].find((j) => j.id === inputId) instanceof PrisJoint);
    const travel = isPin ? unwrapped : raw;
    previous = raw;
    const k = Math.round(travel / step);
    const { kept, filled } = rates(mechanism, frame);
    const points: PmksSample['points'] = new Map();
    for (const joint of mechanism.joints[frame] as Joint[]) {
      points.set(joint.id, {
        pos: [joint.x * toMeters, joint.y * toMeters],
        vel: rated(kept.jointVel.get(joint.id), filled.jointVel.get(joint.id), toMeters),
        acc: rated(kept.jointAcc.get(joint.id), filled.jointAcc.get(joint.id), toMeters),
      });
    }
    const bodies: PmksSample['bodies'] = new Map();
    for (const link of mechanism.links[frame]) {
      if (!(link instanceof RealLink)) continue;
      bodies.set(link.id, {
        com: [link.CoM.x * toMeters, link.CoM.y * toMeters],
        comVel: rated(kept.linkVel.get(link.id), filled.linkVel.get(link.id), toMeters),
        comAcc: rated(kept.linkAcc.get(link.id), filled.linkAcc.get(link.id), toMeters),
        omega: rated(kept.linkAngVel.get(link.id), filled.linkAngVel.get(link.id), 1),
        alpha: rated(kept.linkAngAcc.get(link.id), filled.linkAngAcc.get(link.id), 1),
      });
    }
    samples.push({
      frame,
      k,
      offGrid: travel / step - k,
      direction: mechanism.inputAngularVelocities[frame] < 0 ? -1 : 1,
      points,
      bodies,
    });
  }
  return samples;
}
