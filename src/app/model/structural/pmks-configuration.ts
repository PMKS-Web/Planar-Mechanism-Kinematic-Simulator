import { Joint, RevJoint } from '../joint';
import { Link, RealLink } from '../link';
import type { Force } from '../force';
import { MODEL_SCALE } from '../render-scale';
import { LengthUnit } from '../unit-enums';
import { siUnitFactorsForLength } from '../unit-conversions';
import type { StructuralConfiguration } from './configuration';
import type { LoadCase } from './loads';
import { structuralFailure, StaticForceAnalysisResult } from './results';
import { analyzeStatic, STRUCTURAL_TOLERANCES } from './static-force-solver';

export interface PmksStructuralFrame {
  readonly joints: readonly Joint[];
  readonly links: readonly Link[];
  readonly lengthUnit: LengthUnit;
  /** App/URL-decoded objects use model; numerical fixtures may use project coordinates. */
  readonly coordinateSpace: 'model' | 'project';
}

export type ConfigurationSnapshot =
  | { readonly status: 'ok'; readonly configuration: StructuralConfiguration }
  | {
      readonly status: 'unsupported-joint-type' | 'unsupported-topology' | 'invalid-geometry';
      readonly message: string;
    };

/** Copy a chosen partition/sample. No access to the editable singleton or visualization paths. */
export function snapshotPmksConfiguration(frame: PmksStructuralFrame): ConfigurationSnapshot {
  const fail = (message: string): ConfigurationSnapshot => ({
    status: 'invalid-geometry',
    message,
  });
  if (
    ![LengthUnit.METER, LengthUnit.CM, LengthUnit.INCH].includes(frame.lengthUnit) ||
    !['model', 'project'].includes(frame.coordinateSpace)
  ) {
    return fail('Specify the project length unit and the coordinate space.');
  }
  if (frame.joints.some((j) => !(j instanceof RevJoint))) {
    return {
      status: 'unsupported-joint-type',
      message: 'S1 supports revolute joints only; sliders and cylinders are not supported.',
    };
  }
  if (frame.links.some((link) => !(link instanceof RealLink))) {
    return { status: 'unsupported-topology', message: 'S1 requires root rigid links.' };
  }
  if (
    new Set(frame.joints.map((j) => j.id)).size !== frame.joints.length ||
    new Set(frame.links.map((l) => l.id)).size !== frame.links.length
  ) {
    return fail('The configuration has duplicate joint or link ids.');
  }
  const joints = frame.joints as readonly RevJoint[];
  const links = frame.links as readonly RealLink[];
  const units = siUnitFactorsForLength(frame.lengthUnit);
  const distance = units.distanceToM / (frame.coordinateSpace === 'model' ? MODEL_SCALE : 1);
  const point = (p: { x: number; y: number }) => ({ x: p.x * distance, y: p.y * distance });
  const canonical = new Map(joints.map((joint) => [joint.id, joint]));
  for (const link of links) {
    if (
      link.joints.length < 2 ||
      link.joints.some((joint) => {
        const source = canonical.get(joint.id);
        return !source || source.x !== joint.x || source.y !== joint.y;
      })
    )
      return fail('Link geometry does not match the supplied joint snapshot.');
  }
  // The existing force solver treats a body with two distinct ground pins as inertial frame.
  const frameLinks = new Set(
    links.filter((link) => {
      const pins = link.joints.filter((j) => canonical.get(j.id)!.ground);
      return pins.some((a) =>
        pins.some(
          (b) => Math.hypot(a.x - b.x, a.y - b.y) * distance > STRUCTURAL_TOLERANCES.lengthM
        )
      );
    })
  );
  const framePins = new Set([...frameLinks].flatMap((link) => link.joints.map((j) => j.id)));
  const moving = links.filter((link) => !frameLinks.has(link));
  for (let a = 0; a < moving.length; a++) {
    for (let b = a + 1; b < moving.length; b++) {
      const shared = moving[a].joints.filter((j) => moving[b].joints.some((k) => j.id === k.id));
      if (shared.length > 1 || shared.some((j) => canonical.get(j.id)!.isWelded)) {
        return {
          status: 'unsupported-topology',
          message: 'Merge rigidly joined links into a root compound before structural analysis.',
        };
      }
    }
  }
  const drivers: { jointId: string; linkId: string }[] = [];
  for (const joint of joints.filter((j) => j.input)) {
    const incident = moving.filter((link) => link.joints.some((j) => j.id === joint.id));
    if (!(joint.ground || framePins.has(joint.id)) || incident.length !== 1) {
      return {
        status: 'unsupported-topology',
        message: 'The holding input must be grounded and drive exactly one moving root body.',
      };
    }
    drivers.push({ jointId: joint.id, linkId: incident[0].id });
  }
  return {
    status: 'ok',
    configuration: {
      joints: joints.map((joint) => ({
        id: joint.id,
        kind: 'revolute',
        positionM: point(joint),
        grounded: joint.ground || framePins.has(joint.id),
      })),
      bodies: moving.map((link) => ({
        id: link.id,
        memberGeometry: link.subset.length
          ? 'compound'
          : link.isCircle || link.drawnByACylinderSkin
            ? 'non-beam'
            : link.joints.length === 2
              ? 'two-pin'
              : 'multi-pin',
        jointIds: link.joints.map((j) => j.id),
        frameJointIds: [link.joints[0].id, link.joints[1].id],
        massProperties: {
          massKg: link.mass * units.massToKg,
          centerOfMassM: point(link.CoM),
          inertiaKgM2: link.massMoI * units.inertiaToKgM2,
        },
        structural: link.structural === undefined ? undefined : structuredClone(link.structural),
      })),
      drivers,
    },
  };
}

export function analyzePmksFrame(
  frame: PmksStructuralFrame,
  loadCase: LoadCase
): StaticForceAnalysisResult {
  const snapshot = snapshotPmksConfiguration(frame);
  return snapshot.status === 'ok'
    ? analyzeStatic(snapshot.configuration, loadCase)
    : structuralFailure(snapshot.status, snapshot.message);
}

/** Existing Force instances at this solved sample already carry their global direction. */
export function loadCaseFromPmksForces(
  frame: PmksStructuralFrame,
  forces: readonly Force[],
  name: string
): LoadCase {
  const units = siUnitFactorsForLength(frame.lengthUnit);
  const distance = units.distanceToM / (frame.coordinateSpace === 'model' ? MODEL_SCALE : 1);
  return {
    name,
    loads: forces.map((force) => ({
      kind: 'point-force',
      linkId: force.link.id,
      at: {
        frame: 'global',
        positionM: { x: force.startCoord.x * distance, y: force.startCoord.y * distance },
      },
      directionFrame: 'global',
      forceN: {
        x: force.mag * Math.cos(force.angleRad) * units.forceToN,
        y: force.mag * Math.sin(force.angleRad) * units.forceToN,
      },
    })),
  };
}
