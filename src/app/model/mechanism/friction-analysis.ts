import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, RealLink, SliderBlock } from '../link';
import { frictionPropertyError, hasFriction, INERTIA_FRICTION_REFUSAL } from '../joint-friction';
import { guideFrictionRefusal } from '../friction-contacts';
import type { ForceAnalysisFrame, ForceVector } from './force-solver';

/** Rates in the same coordinate system as the force solver; angular rates are rad/s. */
export interface FrictionMotion {
  /** Internal drawing lengths per user length; direct, unscaled domain callers use 1. */
  coordinateScale?: number;
  jointVelocities: Map<string, ForceVector>;
  angularVelocities: Map<string, number>;
}

export interface FrictionResult {
  jointId: string;
  kind: 'force' | 'torque';
  positiveBodyId: string;
  negativeBodyId?: string;
  normalLoad: number;
  /** Signed on positiveBodyId: N or the force solver's N*length-in-meters. */
  effort: number;
  staticLimit: number;
  relativeRate: number;
}

/** Known contact loads supplied to each equilibrium solve, including their reaction partner. */
export interface FrictionLoad {
  joint: RealJoint;
  bodyId: string;
  force: ForceVector;
  torque: number;
}

interface Contact {
  joint: RealJoint;
  positive: Link;
  negative?: Link;
  tangent: ForceVector;
  rate: number;
  rateTolerance: number;
  radius: number;
  kind: 'force' | 'torque';
}

function refusal(
  frame: ForceAnalysisFrame,
  message: string,
  frictionUnavailable?: ForceAnalysisFrame['frictionUnavailable']
): ForceAnalysisFrame {
  return {
    ...frame,
    status: 'friction-unresolved',
    message,
    frictionUnavailable,
    jointReactions: new Map(),
    jointReactionsByLink: new Map(),
    guideCouples: new Map(),
    inputEffort: undefined,
    rank: 0,
    residual: Infinity,
    minPivot: undefined,
  };
}

/**
 * Iterate the coupled Coulomb/equilibrium problem. A frictionless normal load is only the
 * initial guess: both bearing and guide loads change when their friction is applied.
 * No history is borrowed between samples, so scrubbing and reverse traversal agree.
 */
export function analyzeWithFriction(
  joints: Joint[],
  bodies: Link[],
  distanceToM: number,
  motion: FrictionMotion | undefined,
  solve: (loads: FrictionLoad[]) => ForceAnalysisFrame
): ForceAnalysisFrame {
  const initial = solve([]);
  if (initial.status !== 'ok') return initial;
  // The legacy app force solver mixes drawing-scale accelerations with physical mass/inertia.
  // Preserve its frictionless path, but do not certify the resulting bearing loads as friction.
  // Unscaled direct-domain solves and zero-inertia fixtures remain independently verifiable.
  if (
    initial.mode === 'dynamic' &&
    (motion?.coordinateScale ?? 1) !== 1 &&
    bodies.some((body) => body.mass !== 0 || (body instanceof RealLink && body.massMoI !== 0))
  ) {
    return refusal(initial, INERTIA_FRICTION_REFUSAL, { reason: 'inertia' });
  }
  if (initial.sharedSupport) {
    return refusal(initial, 'Friction needs a unique bearing load. Remove the redundant support.');
  }
  if (!motion) return refusal(initial, 'Friction needs relative motion data for this pose.');
  const contacts: Contact[] = [];
  for (const joint of joints) {
    if (!(joint instanceof RealJoint) || !hasFriction(joint.friction)) continue;
    const error = frictionPropertyError(joint.friction, !(joint instanceof PrisJoint));
    if (error) return refusal(initial, `Joint ${joint.name}: ${error}`);
    const reacting = [...(initial.jointReactionsByLink.get(joint.id)?.keys() ?? [])]
      .map((id) => bodies.find((body) => body.id === id)!)
      .filter(Boolean);
    let contact: Contact;
    if (joint instanceof PrisJoint) {
      const unsupported = guideFrictionRefusal(joint);
      if (unsupported)
        return refusal(
          initial,
          unsupported + ' Set its coefficients to zero to analyze this guide.'
        );
      const positive = reacting.find((body) => body instanceof SliderBlock);
      const negative = reacting.find((body) => body !== positive);
      if (!positive || reacting.length > 2) {
        return refusal(initial, `Guide ${joint.name} has no supported friction contact.`);
      }
      const velocity = motion.jointVelocities.get(joint.id);
      const tangent: ForceVector = [Math.cos(joint.slotAngle), Math.sin(joint.slotAngle)];
      let carrierVelocity: ForceVector = [0, 0];
      if (negative) {
        const anchor = negative.joints[0];
        const atAnchor = motion.jointVelocities.get(anchor.id);
        const omega = motion.angularVelocities.get(negative.id);
        if (!atAnchor || !Number.isFinite(omega)) {
          return refusal(initial, `Guide ${joint.name} is missing its carrier's velocity.`);
        }
        carrierVelocity = [
          atAnchor[0] - omega! * (joint.y - anchor.y),
          atAnchor[1] + omega! * (joint.x - anchor.x),
        ];
      }
      const rate = velocity
        ? (velocity[0] - carrierVelocity[0]) * tangent[0] +
          (velocity[1] - carrierVelocity[1]) * tangent[1]
        : NaN;
      // 1 nm/s in physical units, plus the roundoff of subtracting carrier velocities.
      const rateTolerance =
        (1e-9 * (motion.coordinateScale ?? 1)) / distanceToM +
        32 *
          Number.EPSILON *
          Math.max(Math.hypot(...(velocity ?? [0, 0])), Math.hypot(...carrierVelocity));
      contact = {
        joint,
        positive,
        negative,
        tangent,
        rate,
        rateTolerance,
        radius: 1,
        kind: 'force',
      };
    } else {
      // A massless, free-turning block has no moment equation. It cannot react a bearing
      // couple; silently treating it as ground would create an unbalanced external torque.
      if (
        reacting.length < 1 ||
        reacting.length > 2 ||
        reacting.some((body) => !(body instanceof RealLink)) ||
        joint.isWelded ||
        (joint.ground && reacting.length !== 1)
      ) {
        return refusal(
          initial,
          `Pin ${joint.name} needs a simple bearing between two rigid links, or one link and ground. Set its coefficients to zero for this connection.`
        );
      }
      const [positive, negative] = reacting;
      const rate =
        (motion.angularVelocities.get(positive.id) ?? NaN) -
        (negative ? (motion.angularVelocities.get(negative.id) ?? NaN) : 0);
      contact = {
        joint,
        positive,
        negative,
        tangent: [0, 0],
        rate,
        rateTolerance:
          1e-9 +
          32 *
            Number.EPSILON *
            Math.max(
              Math.abs(motion.angularVelocities.get(positive.id) ?? 0),
              Math.abs(negative ? (motion.angularVelocities.get(negative.id) ?? 0) : 0)
            ),
        radius: joint.friction.radius * distanceToM,
        kind: 'torque',
      };
    }
    if (!Number.isFinite(contact.rate)) {
      return refusal(initial, `Joint ${joint.name} is missing relative velocity data.`);
    }
    if (Math.abs(contact.rate) <= contact.rateTolerance) {
      return refusal(
        initial,
        `Joint ${joint.name} has zero relative motion. Static friction is a range at this pose; the prescribed-motion analysis cannot select a unique holding force.`,
        { reason: 'stationary', jointId: joint.id }
      );
    }
    contacts.push(contact);
  }
  const resultsFor = (frame: ForceAnalysisFrame): FrictionResult[] =>
    contacts.map((contact) => {
      const reaction = frame.jointReactionsByLink.get(contact.joint.id)!.get(contact.positive.id)!;
      const normalLoad =
        contact.kind === 'force'
          ? Math.abs(-contact.tangent[1] * reaction[0] + contact.tangent[0] * reaction[1])
          : Math.hypot(...reaction);
      return {
        jointId: contact.joint.id,
        kind: contact.kind,
        positiveBodyId: contact.positive.id,
        negativeBodyId: contact.negative?.id,
        normalLoad,
        effort:
          -Math.sign(contact.rate) *
          contact.joint.friction.kineticCoefficient *
          normalLoad *
          contact.radius,
        staticLimit: contact.joint.friction.staticCoefficient * normalLoad * contact.radius,
        relativeRate: contact.rate,
      };
    });
  const loadsFor = (efforts: number[]): FrictionLoad[] =>
    contacts.flatMap((contact, index) =>
      (
        [
          [contact.positive, 1],
          [contact.negative, -1],
        ] as const
      ).flatMap(([body, sign]) => {
        if (!body) return [];
        const effort = efforts[index] * sign;
        return [
          {
            joint: contact.joint,
            bodyId: body.id,
            force:
              contact.kind === 'force'
                ? ([effort * contact.tangent[0], effort * contact.tangent[1]] as ForceVector)
                : ([0, 0] as ForceVector),
            torque: contact.kind === 'torque' ? effort : 0,
          },
        ];
      })
    );
  let efforts = resultsFor(initial).map((one) => one.effort);
  for (let iteration = 0; iteration < 100; iteration++) {
    const frame = solve(loadsFor(efforts));
    if (frame.status !== 'ok') return frame;
    const results = resultsFor(frame);
    const converged = results.every(
      (one, index) =>
        Math.abs(one.effort - efforts[index]) <=
        1e-10 * Math.max(1, Math.abs(one.effort), Math.abs(efforts[index]))
    );
    if (converged) {
      // The returned normal/pin reactions already balance the applied loads. Add the guide's
      // tangential component to its reported contact resultant, exactly once, after iteration.
      contacts.forEach((contact, index) => {
        results[index].effort = efforts[index];
        if (contact.kind !== 'force') return;
        const byBody = frame.jointReactionsByLink.get(contact.joint.id)!;
        for (const [id, sign] of [
          [contact.positive.id, 1],
          [contact.negative?.id, -1],
        ] as const) {
          if (!id) continue;
          const normal = byBody.get(id)!;
          byBody.set(id, [
            normal[0] + sign * efforts[index] * contact.tangent[0],
            normal[1] + sign * efforts[index] * contact.tangent[1],
          ]);
        }
        frame.jointReactions.set(contact.joint.id, byBody.get(contact.positive.id)!);
      });
      frame.friction = new Map(results.map((one) => [one.jointId, one]));
      if (frame.inputEffort && initial.inputEffort) {
        frame.additionalFrictionEffort = {
          ...frame.inputEffort,
          valueSI: frame.inputEffort.valueSI - initial.inputEffort.valueSI,
        };
      }
      return frame;
    }
    efforts = efforts.map((one, index) => (one + results[index].effort) / 2);
  }
  return refusal(
    initial,
    'The friction and bearing loads did not converge at this pose. Reduce friction or change the geometry.'
  );
}
