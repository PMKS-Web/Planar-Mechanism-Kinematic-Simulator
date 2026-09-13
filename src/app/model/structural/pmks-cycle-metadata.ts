import { RealJoint, PrisJoint } from '../joint';
import { angleReference, GROUND_BODY, resolveActuator } from '../actuator';
import type { Mechanism } from '../mechanism/mechanism';
import { MODEL_SCALE } from '../render-scale';
import { siUnitFactorsForLength } from '../unit-conversions';
import type { PmksStructuralFrame } from './pmks-configuration';
import type { CycleSampleMetadata, CycleSequenceMetadata, DriveCoordinate } from './cycle-results';

/** Geometry is read in solved order before subsetting: reordering a request cannot unwrap it anew. */
export function pmksCycleMetadata(
  mechanism: Mechanism,
  indices: readonly number[],
  units: Pick<PmksStructuralFrame, 'lengthUnit' | 'coordinateSpace'>
): { samples: CycleSampleMetadata[]; sequence: CycleSequenceMetadata } {
  const coordinates = driveCoordinates(mechanism, units);
  const samples = indices.map((sampleIndex): CycleSampleMetadata => ({
    sampleIndex,
    timeSeconds: Number.isFinite(mechanism.timeNum[sampleIndex])
      ? mechanism.timeNum[sampleIndex]
      : null,
    drive: coordinates[sampleIndex] ?? {
      kind: 'unavailable',
      reason: 'No existing solved sample.',
    },
  }));
  const steps = indices.slice(1).map((n, i) => n - indices[i]);
  const order = steps.every((n) => n > 0)
    ? 'forward'
    : steps.every((n) => n < 0)
      ? 'reverse'
      : 'explicit';
  const values = samples.map((s) =>
    s.drive.kind === 'angle'
      ? s.drive.unwrappedRad
      : s.drive.kind === 'length'
        ? s.drive.displacementM
        : NaN
  );
  const differences = values.slice(1).map((n, i) => n - values[i]);
  const duplicateEndpointPose = samePose(mechanism, indices[0], indices[indices.length - 1]);
  return {
    samples,
    sequence: {
      order,
      duplicateEndpointPose,
      closure:
        indices.length < 2 ||
        indices[0] === indices[indices.length - 1] ||
        duplicateEndpointPose === null
          ? 'unknown'
          : duplicateEndpointPose
            ? 'closed'
            : 'open',
      reverses:
        order === 'explicit' || values.some((n) => !Number.isFinite(n)) || values.length < 2
          ? null
          : differences.some((n) => n > 1e-9) && differences.some((n) => n < -1e-9),
      coversAllSolvedSamples:
        new Set(indices.filter((i) => Number.isInteger(i) && i >= 0 && i < mechanism.joints.length))
          .size === mechanism.joints.length && mechanism.joints.length > 0,
      notes: [
        'Closure compares endpoint joint geometry only (relative tolerance 1e-8); it does not assert periodic loads, motion, or stress.',
        'Angles are relative-body geometric angles, unwrapped through all solved frames with adjacent changes below pi. Times retain solved-array order, including reverse playback.',
        'Duplicate endpoint samples are retained. Reordered sequences do not imply a physical traversal.',
      ],
    },
  };
}

function driveCoordinates(
  mechanism: Mechanism,
  units: Pick<PmksStructuralFrame, 'lengthUnit' | 'coordinateSpace'>
): DriveCoordinate[] {
  const frames = mechanism.joints;
  const inputs = frames[0]?.filter((j) => j instanceof RealJoint && j.input) ?? [];
  const input = inputs.length === 1 ? (inputs[0] as RealJoint) : undefined;
  const unavailable = (reason: string): DriveCoordinate[] =>
    frames.map(() => ({
      kind: 'unavailable',
      jointId: input?.id,
      reason,
    }));
  if (!input) return unavailable('No unambiguous input joint in the selected partition.');
  if (input instanceof PrisJoint) {
    if (!input.ground || input.carrier)
      return unavailable(
        'A floating prismatic drive has no supported displacement reference in S5.'
      );
    const scale =
      siUnitFactorsForLength(units.lengthUnit).distanceToM /
      (units.coordinateSpace === 'model' ? MODEL_SCALE : 1);
    return frames.map((frame) => {
      const joint = frame.find((j) => j.id === input.id);
      const displacementM = joint
        ? ((joint.x - input.x) * Math.cos(input.slotAngle) +
            (joint.y - input.y) * Math.sin(input.slotAngle)) *
          scale
        : NaN;
      return Number.isFinite(displacementM)
        ? {
            kind: 'length',
            jointId: input.id,
            displacementM,
            reference: 'initial-position-along-slot',
          }
        : { kind: 'unavailable', jointId: input.id, reason: 'Missing finite prismatic sample.' };
    });
  }
  const actuator = resolveActuator(input);
  if (!actuator) return unavailable('Input actuator body pair is ambiguous.');
  const references = [actuator.referenceBody, actuator.drivenBody].map((body) =>
    body === GROUND_BODY ? undefined : angleReference(body, input)?.id
  );
  let previous: number | undefined;
  let unwrapped = 0;
  return frames.map((frame) => {
    const pivot = frame.find((j) => j.id === input.id);
    const angles = references.map((id) => {
      if (!id) return 0;
      const joint = frame.find((j) => j.id === id);
      return joint && pivot && Math.hypot(joint.x - pivot.x, joint.y - pivot.y) > 0
        ? Math.atan2(joint.y - pivot.y, joint.x - pivot.x)
        : NaN;
    });
    const canonicalRad = Math.atan2(
      Math.sin(angles[1] - angles[0]),
      Math.cos(angles[1] - angles[0])
    );
    if (!Number.isFinite(canonicalRad) || (previous !== undefined && !Number.isFinite(previous))) {
      previous = NaN;
      return {
        kind: 'unavailable',
        jointId: input.id,
        reason: 'Cannot unwrap across missing geometric drive coordinates.',
      };
    }
    unwrapped =
      previous === undefined
        ? canonicalRad
        : unwrapped +
          Math.atan2(Math.sin(canonicalRad - previous), Math.cos(canonicalRad - previous));
    previous = canonicalRad;
    return {
      kind: 'angle',
      jointId: input.id,
      canonicalRad,
      unwrappedRad: unwrapped,
      referenceBodyId:
        actuator.referenceBody === GROUND_BODY ? GROUND_BODY : actuator.referenceBody.id,
      drivenBodyId: actuator.drivenBody === GROUND_BODY ? GROUND_BODY : actuator.drivenBody.id,
    };
  });
}

function samePose(mechanism: Mechanism, first: number, last: number): boolean | null {
  const a = mechanism.joints[first],
    b = mechanism.joints[last];
  if (!a?.length || !b || a.length !== b.length) return null;
  const xs = a.map((j) => j.x),
    ys = a.map((j) => j.y);
  const scale = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!Number.isFinite(scale) || scale === 0) return null;
  let matched = true;
  for (const joint of a) {
    const other = b.find((j) => j.id === joint.id);
    if (!other || ![joint.x, joint.y, other.x, other.y].every(Number.isFinite)) return null;
    if (Math.hypot(joint.x - other.x, joint.y - other.y) > scale * 1e-8) matched = false;
  }
  return matched;
}
