import { cylindersIn } from '../cylinder';
import { isFrozenCylinder } from '../cylinder-frozen';
import { Joint } from '../joint';
import { RealLink } from '../link';
import type { SampleRates } from './finite-difference-kinematics';

type Vector = [number, number];
const finite = (v: Vector | undefined): v is Vector => !!v && v.every(Number.isFinite);

/** Differentiate the same mount-axis geometry that places a cylinder's interiors. */
export function transferCylinderRates(joints: Joint[], rates: SampleRates): void {
  for (const cylinder of cylindersIn(joints)) {
    if (isFrozenCylinder(cylinder)) continue;
    const a = cylinder.mountA,
      b = cylinder.mountB;
    const va = rates.jointVel.get(a.id),
      vb = rates.jointVel.get(b.id);
    const aa = rates.jointAcc.get(a.id),
      ab = rates.jointAcc.get(b.id);
    if (!finite(va) || !finite(vb)) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const e: Vector = [(b.x - a.x) / length, (b.y - a.y) / length];
    const dv: Vector = [vb[0] - va[0], vb[1] - va[1]];
    const lengthRate = e[0] * dv[0] + e[1] * dv[1];
    const ev: Vector = [(dv[0] - lengthRate * e[0]) / length, (dv[1] - lengthRate * e[1]) / length];
    const omega = e[0] * ev[1] - e[1] * ev[0];
    const hasAcceleration = finite(aa) && finite(ab);
    let ea: Vector | undefined;
    if (hasAcceleration) {
      const da: Vector = [ab[0] - aa[0], ab[1] - aa[1]];
      const lengthAcc = e[0] * da[0] + e[1] * da[1] + length * (ev[0] ** 2 + ev[1] ** 2);
      ea = [
        (da[0] - lengthAcc * e[0] - 2 * lengthRate * ev[0]) / length,
        (da[1] - lengthAcc * e[1] - 2 * lengthRate * ev[1]) / length,
      ];
    }
    const interior = (point: Joint, mount: Joint, v: Vector, acc: Vector | undefined) => {
      const offset = (point.x - mount.x) * e[0] + (point.y - mount.y) * e[1];
      rates.jointVel.set(point.id, [v[0] + offset * ev[0], v[1] + offset * ev[1]]);
      if (finite(acc) && ea) {
        rates.jointAcc.set(point.id, [acc[0] + offset * ea[0], acc[1] + offset * ea[1]]);
      }
    };
    interior(cylinder.inner, a, va, aa);
    interior(cylinder.seal, b, vb, ab);
    const alpha = ea ? e[0] * ea[1] - e[1] * ea[0] : undefined;
    for (const [body, root, mount, v, acc] of [
      [cylinder.barrel, cylinder.barrelRoot, a, va, aa],
      [cylinder.rod, cylinder.rodRoot, b, vb, ab],
    ] as const) {
      // Welded compounds already have their parent body's rigid motion.
      if (!(body instanceof RealLink) || body.id !== root.id) continue;
      const rx = body.CoM.x - mount.x,
        ry = body.CoM.y - mount.y;
      rates.linkVel.set(body.id, [v[0] - omega * ry, v[1] + omega * rx]);
      rates.linkAngVel.set(body.id, omega);
      if (finite(acc) && alpha !== undefined) {
        rates.linkAcc.set(body.id, [
          acc[0] - alpha * ry - omega ** 2 * rx,
          acc[1] + alpha * rx - omega ** 2 * ry,
        ]);
        rates.linkAngAcc.set(body.id, alpha);
      }
    }
  }
}
