import { PrisJoint, RealJoint } from './joint';
import { FrictionResult } from './mechanism/friction-analysis';
import { arrowPath, LONGEST_ARROW_FRACTION, momentArrowPath } from './vector-trace';

/** One receiving-body contact glyph; the opposite action is not drawn over it. */
export function frictionGlyph(
  joint: RealJoint,
  result: FrictionResult,
  span: number,
  peak: number
) {
  if (!(span > 0) || !(peak > 0) || !Number.isFinite(result.effort) || result.effort === 0)
    return undefined;
  const ratio = result.effort / peak;
  if (result.kind === 'force') {
    if (!(joint instanceof PrisJoint)) return undefined;
    const tx = Math.cos(joint.slotAngle),
      ty = Math.sin(joint.slotAngle);
    // A short leader locates the contact; offset the tangent arrow clear of the guide artwork.
    const x = joint.x - ty * span * 0.045,
      y = joint.y + tx * span * 0.045;
    const dx = tx * ratio * span * LONGEST_ARROW_FRACTION;
    const dy = ty * ratio * span * LONGEST_ARROW_FRACTION;
    return {
      d: arrowPath([{ x, y, dx, dy }]),
      leader: `M ${joint.x} ${joint.y} L ${x} ${y}`,
      label: { x: x + dx / 2, y: y + dy / 2 },
      fx: result.effort * tx,
      fy: result.effort * ty,
      sweep: 0,
    };
  }
  const radius = span * 0.05;
  const sweep = ratio * Math.PI * 1.5;
  return {
    d: momentArrowPath(joint.x, joint.y, radius, sweep),
    leader: '',
    label: { x: joint.x, y: joint.y + radius },
    fx: 0,
    fy: 0,
    sweep,
  };
}
