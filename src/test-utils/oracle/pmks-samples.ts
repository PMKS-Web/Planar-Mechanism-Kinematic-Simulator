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
import { drivenLinkAt } from './export-problem';

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
    const angle = input0.slotAngle;
    const dx = input.x - input0.x;
    const dy = input.y - input0.y;
    return ((dx * Math.cos(angle) + dy * Math.sin(angle)) / MODEL_SCALE) * meters;
  }
  const link0 = drivenLinkAt(input0);
  if (!link0) return undefined;
  const tip0 = link0.joints.find(
    (joint) => joint.id !== inputId && Math.hypot(joint.x - input0.x, joint.y - input0.y) > 1e-9
  );
  if (!tip0) return undefined;
  const tip = joints.find((joint) => joint.id === tip0.id);
  if (!tip) return undefined;
  return (
    Math.atan2(tip.y - input.y, tip.x - input.x) - Math.atan2(tip0.y - input0.y, tip0.x - input0.x)
  );
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
