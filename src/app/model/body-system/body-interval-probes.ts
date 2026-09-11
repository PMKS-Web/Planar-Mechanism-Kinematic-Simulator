import { AdmittedBodySystem, advanceBodyCommand, BodyContinuationState } from './body-continuation';
import { BodyMotion, solveBodyRates } from './body-rates';
import { bodyCoordinateMotion } from './body-coordinate-rates';
import { relaxBodyPosition } from './body-position-solver';
import { BodyFold, searchBodyFold } from './body-fold';
import { bodyPositionScale } from './body-position-scale';
import { passiveBodyTangent } from './body-arc-step';
import { bodyRowGradient, bodyRowValue } from './body-constraint-rows';
import { BodyIntervalPoint, BodyIntervalRefusal } from './body-interval-types';

/** Only this private continuation omits bounds: it must see the other side to prove a crossing. */
export class BodyIntervalProbes {
  readonly unrestricted: AdmittedBodySystem;
  readonly commandScale: number;
  count = 0;
  constructor(
    readonly admitted: AdmittedBodySystem,
    readonly maximum: number
  ) {
    this.unrestricted = {
      ...admitted,
      frame: { ...admitted.frame, partition: { ...admitted.frame.partition, limits: [] } },
    };
    this.commandScale =
      admitted.frame.partition.drivers[0].row.kind === 'angle' ? 1 : admitted.scale.length;
  }
  point(
    state: BodyContinuationState,
    fold?: { readonly value: BodyFold; readonly direction: number }
  ): BodyIntervalPoint {
    const part = this.admitted.frame.partition;
    if (!part.limits.length) return { state, limits: [], ...(fold ? { fold: fold.value } : {}) };
    const still: BodyMotion = {
      velocity: { vx: 0, vy: 0, omega: 0 },
      acceleration: { ax: 0, ay: 0, alpha: 0 },
    };
    const rates = solveBodyRates(
      part,
      state.poses,
      new Map([[part.drivers[0].id, { value: state.command, velocity: 1, acceleration: 0 }]]),
      new Map(part.boundary.map((id) => [id, still]))
    );
    const reference = state.tangent.map(
      (value, i) => (value * (fold?.direction ?? 1)) / this.admitted.scale.columns[i]
    );
    const tangent = fold
      ? passiveBodyTangent(part, state.poses, this.admitted.scale, reference)
      : undefined;
    return {
      state,
      ...(fold ? { fold: fold.value } : {}),
      limits: part.limits.map((limit) => {
        const value = bodyRowValue(limit.row, state.poses);
        const driver = part.drivers[0].row;
        if (limit.row.jointId === driver.jointId && limit.row.kind === driver.kind)
          return { value, slope: 1 };
        if (limit.row.pair.groupA === limit.row.pair.groupB) return { value, slope: 0 };
        if (fold && tangent) {
          const gradient = bodyRowGradient(limit.row, state.poses);
          const slope = part.unknowns.reduce(
            (sum, id, i) =>
              sum +
              (gradient.get(id) ?? [0, 0, 0]).reduce(
                (total, coefficient, j) =>
                  total + coefficient * tangent[3 * i + j] * this.admitted.scale.columns[3 * i + j],
                0
              ),
            0
          );
          // The passive curve stays regular where command speed cannot parameterize it.
          return { value, slope: slope * fold.direction };
        }
        const motion = rates.ok
          ? bodyCoordinateMotion(limit.row, state.poses, rates.motions)
          : undefined;
        return motion ? { value: motion.value, slope: motion.velocity } : undefined;
      }),
    };
  }
  findFold(from: BodyIntervalPoint, command: number): BodyIntervalPoint | undefined {
    if (++this.count > this.maximum) throw new BodyIntervalRefusal('unsolved');
    const partition = this.unrestricted.frame.partition;
    const currentScale = bodyPositionScale(
      partition,
      from.state.poses,
      new Map([[partition.drivers[0].id, command]])
    );
    // Shrinking a command must shrink the arc to search, even for a lone P whose only
    // instantaneous length is that same command. Keep the admitted physical scale.
    const scale =
      currentScale.length >= this.admitted.scale.length ? currentScale : this.admitted.scale;
    const found = searchBodyFold(partition, from.state.poses, from.state.tangent, command, scale);
    if (found.kind === 'unresolved') throw new BodyIntervalRefusal('unsolved');
    return found.kind === 'fold' ? this.foldPoint(from, command, found.fold) : undefined;
  }
  read(from: BodyIntervalPoint, command: number): BodyIntervalPoint {
    // Newton can accept the far side or a residual-sized neighborhood of a fold.
    // A positive passive-curve proof takes precedence over that endpoint answer.
    const fold = this.findFold(from, command);
    if (fold) return fold;
    const advance = advanceBodyCommand(this.unrestricted, from.state, command);
    if (advance.ok) {
      // Near a shallow crossing, a tiny pose residual is a much larger command error.
      const polished = relaxBodyPosition(
        this.unrestricted.frame.partition,
        advance.state.poses,
        new Map([[this.admitted.frame.partition.drivers[0].id, command]]),
        { residualTolerance: 1e-13, allowSingularCorrection: true }
      );
      if (!polished.ok) throw new BodyIntervalRefusal('unsolved');
      return this.point({ ...advance.state, poses: polished.poses });
    }
    if (advance.fold) return this.foldPoint(from, command, advance.fold);
    throw new BodyIntervalRefusal(advance.reason === 'branch' ? 'branch' : 'unsolved');
  }
  private foldPoint(from: BodyIntervalPoint, command: number, fold: BodyFold): BodyIntervalPoint {
    return this.point(
      { poses: fold.poses, command: fold.command, tangent: from.state.tangent, regular: false },
      { value: fold, direction: Math.sign(command - from.state.command) }
    );
  }
  value(point: BodyIntervalPoint, index: number): number {
    const value =
      point.limits[index]?.value ??
      bodyRowValue(this.admitted.frame.partition.limits[index].row, point.state.poses);
    if (!Number.isFinite(value)) throw new BodyIntervalRefusal('unsolved');
    return value;
  }
  scale(index: number): number {
    return this.admitted.frame.partition.limits[index].row.kind === 'angle'
      ? 1
      : this.admitted.scale.length;
  }
  exact(from: BodyIntervalPoint, command: number): BodyIntervalPoint {
    const point = this.read(from, command);
    if (point.fold || Math.abs(point.state.command - command) > 1e-12 * this.commandScale)
      throw new BodyIntervalRefusal('unsolved');
    return point;
  }
}
