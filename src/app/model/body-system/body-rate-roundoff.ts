import { BodyId } from './body-id';
import { GroupPoses, pairGeometry } from './body-constraint-rows';
import { BodyConstraintRow } from './compiled-body-system';
import { GroupTwists } from './body-row-quadratic';
import { RowFactorization } from './body-linear-algebra';

/** Absolute component uncertainty, in the same physical units as the twist. */
export interface TwistRoundoff {
  readonly linear: number;
  readonly angular: number;
}

/** A mathematically zero angular velocity can inherit QR round-off from translation.
 * Its Coriolis term must not make consistent redundant acceleration rows contradict.
 * Propagate only that arithmetic uncertainty through the actual row's quadratic terms;
 * a remote boundary or an absolute unit of acceleration supplies no tolerance.
 */
export function quadraticRoundoff(
  row: BodyConstraintRow,
  poses: GroupPoses,
  twists: GroupTwists,
  errors: ReadonlyMap<BodyId, TwistRoundoff>
): number {
  if (row.kind === 'angle') return 0;
  const { a, b, d } = pairGeometry(row.pair, poses);
  const va = twists.get(row.pair.groupA)!,
    vb = twists.get(row.pair.groupB)!;
  const ea = errors.get(row.pair.groupA),
    eb = errors.get(row.pair.groupB);
  const da = ea?.angular ?? 0,
    db = eb?.angular ?? 0;
  const wa = Math.abs(va.omega),
    wb = Math.abs(vb.omega);
  const ra = Math.hypot(a.x, a.y),
    rb = Math.hypot(b.x, b.y);
  const squareA = 2 * wa * da + da * da,
    squareB = 2 * wb * db + db * db;
  let error = ra * squareA + rb * squareB;
  let magnitude = ra * wa * wa + rb * wb * wb;
  if (row.kind === 'lateral' || row.kind === 'travel') {
    const speed = Math.hypot(
      vb.vx - va.vx - b.y * vb.omega + a.y * va.omega,
      vb.vy - va.vy + b.x * vb.omega - a.x * va.omega
    );
    const speedError = (ea?.linear ?? 0) + (eb?.linear ?? 0) + ra * da + rb * db;
    const span = Math.hypot(d.x, d.y);
    error += 2 * (da * speed + wa * speedError + da * speedError) + squareA * span;
    magnitude += 2 * wa * speed + wa * wa * span;
  }
  return error + 128 * Number.EPSILON * magnitude;
}

/** Least squares projects RHS noise into other rows. Bound that same residual projection,
 * rather than giving an unrelated row the largest uncertainty anywhere in the mechanism.
 */
export function projectedRowRoundoff(
  factor: RowFactorization,
  uncertainty: readonly number[]
): number[] {
  const result = new Array<number>(factor.height).fill(0);
  for (const [column, error] of uncertainty.entries()) {
    if (error === 0) continue;
    const vector = new Array<number>(factor.height).fill(0);
    vector[column] = error;
    const reflect = ({ start, vector: axis }: (typeof factor.reflectors)[number]) => {
      const projection = axis.reduce((sum, value, i) => sum + value * vector[start + i], 0);
      for (let i = 0; i < axis.length; i++) vector[start + i] -= 2 * axis[i] * projection;
    };
    for (const reflector of factor.reflectors) reflect(reflector);
    vector.fill(0, 0, factor.rank);
    for (let i = factor.reflectors.length - 1; i >= 0; i--) reflect(factor.reflectors[i]);
    for (let i = 0; i < result.length; i++) result[i] += Math.abs(vector[i]);
  }
  return result;
}

/** A least-squares fit must satisfy every row, including a redundant row with tiny rates. */
export function rateRowsConsistent(
  matrix: readonly number[][],
  answer: readonly number[],
  rhs: readonly number[],
  uncertainty: readonly number[] = []
): boolean {
  const solutionNorm = Math.hypot(...answer);
  return matrix.every((row, i) => {
    const terms = row.map((value, j) => value * answer[j]);
    const residual = terms.reduce((sum, value) => sum + value, -rhs[i]);
    const magnitude = terms.reduce((sum, value) => sum + Math.abs(value), Math.abs(rhs[i]));
    // A mathematically zero component can inherit elimination round-off from another
    // column. This allowance scales with the solve, never with an absolute unit of rate.
    const roundoff = 128 * Number.EPSILON * Math.hypot(...row) * solutionNorm;
    return (
      Number.isFinite(residual) &&
      Number.isFinite(magnitude) &&
      Number.isFinite(roundoff) &&
      Number.isFinite(uncertainty[i] ?? 0) &&
      Math.abs(residual) <= 1e-9 * magnitude + roundoff + (uncertainty[i] ?? 0)
    );
  });
}
