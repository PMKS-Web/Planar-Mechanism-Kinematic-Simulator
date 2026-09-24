import { PrisJoint, RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { DrawingContext } from './drawing-svg';
import { isGroundPin } from './fact-math';

/**
 * PROTOTYPE -- one machine's solved motion, thinned for a page to animate.
 *
 * The taste-test page shows the mechanism moving beside the two answers, so a
 * reader judges them against what it does rather than against the fact sheet.
 * Positions are in the reader's length unit, y up; hidden cylinder joints are
 * left out, as everywhere else a reader sees.
 */
export interface MachineMotion {
  joints: { id: string; ground: boolean; traced: boolean; slider: boolean }[];
  /** Each moving body as the indices of its visible joints. */
  bodies: number[][];
  /**
   * Links their author drew as discs (a wheel, a flywheel): the body's index
   * in `bodies`, the joint it turns about, and the radius out to its farthest
   * joint -- the disc the app draws.
   */
  discs: { body: number; center: number; radius: number }[];
  /** Each cylinder as the indices of its two mounts. */
  cylinders: [number, number][];
  /** Fixed slider guides, as two end points each. */
  guides: [[number, number], [number, number]][];
  /** Seconds since the start, per frame. */
  time: number[];
  /** frames[f][j]: joint j's position in frame f. */
  frames: [number, number][][];
}

const MAX_FRAMES = 240;

export function machineMotion(ctx: DrawingContext): MachineMotion {
  const joints = ctx.visible.filter((joint) => ctx.samples.paths.has(joint.id));
  const index = new Map(joints.map((joint, i) => [joint.id, i]));
  const count = ctx.samples.paths.get(joints[0].id)!.length;
  const shown = ctx.bodies
    .map((body) => ({
      body,
      ids: body.joints.filter((j) => index.has(j.id)).map((j) => index.get(j.id)!),
    }))
    .filter(({ ids }) => ids.length >= 2);
  const step = Math.max(1, Math.ceil(count / MAX_FRAMES));
  const kept: number[] = [];
  for (let i = 0; i < count; i += step) kept.push(i);
  if (kept[kept.length - 1] !== count - 1) kept.push(count - 1);
  return {
    joints: joints.map((joint) => ({
      id: joint.id,
      ground: isGroundPin(joint),
      traced: joint instanceof RealJoint && joint.showCurve && !isGroundPin(joint),
      slider: joint instanceof PrisJoint,
    })),
    bodies: shown.map(({ ids }) => ids),
    discs: shown.flatMap(({ body, ids }, i) => {
      const pivot = body.joints.find((j) => isGroundPin(j) && index.has(j.id));
      if (!(body instanceof RealLink) || !body.isCircle || !pivot) return [];
      const at = ctx.samples.paths.get(pivot.id)![0];
      const radius = Math.max(
        ...ids.map((j) => {
          const p = ctx.samples.paths.get(joints[j].id)![0];
          return Math.hypot(p[0] - at[0], p[1] - at[1]);
        })
      );
      return [{ body: i, center: index.get(pivot.id)!, radius }];
    }),
    cylinders: ctx.cylinders.map((c) => [index.get(c.mountA.id)!, index.get(c.mountB.id)!]),
    guides: joints
      .filter((joint): joint is PrisJoint => joint instanceof PrisJoint && joint.ground)
      .map((joint) => {
        const path = ctx.samples.paths.get(joint.id)!;
        const ux = Math.cos(joint.angle_rad);
        const uy = Math.sin(joint.angle_rad);
        const along = path.map(([x, y]) => x * ux + y * uy);
        const [x0, y0] = path[0];
        const s0 = x0 * ux + y0 * uy;
        const lo = Math.min(...along) - s0;
        const hi = Math.max(...along) - s0;
        return [
          [x0 + lo * ux, y0 + lo * uy],
          [x0 + hi * ux, y0 + hi * uy],
        ];
      }),
    time: kept.map((i) => ctx.samples.time[i]),
    frames: kept.map((i) => joints.map((joint) => ctx.samples.paths.get(joint.id)![i])),
  };
}
