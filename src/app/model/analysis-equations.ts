import { AnalysisExportModel, AnalysisPoint } from './analysis-export';

/** Executable equation contract used to validate the exported definition, independent of PMKS solvers. */
export function analysisPoint(
  model: AnalysisExportModel,
  q: number[],
  v: number[],
  point: AnalysisPoint
) {
  const D = [q.map(() => 0), q.map(() => 0)];
  if (point.body < 0) return { p: point.xy, D, curvature: [0, 0] };
  const body = model.bodies[point.body],
    i = body.offset;
  const phi = body.dof === 3 ? q[i + 2] : 0;
  const w = body.dof === 3 ? v[i + 2] : 0;
  const r = [
    Math.cos(phi) * point.xy[0] - Math.sin(phi) * point.xy[1],
    Math.sin(phi) * point.xy[0] + Math.cos(phi) * point.xy[1],
  ];
  D[0][i] = D[1][i + 1] = 1;
  if (body.dof === 3) {
    D[0][i + 2] = -r[1];
    D[1][i + 2] = r[0];
  }
  return { p: [q[i] + r[0], q[i + 1] + r[1]], D, curvature: r.map((x) => -w * w * x) };
}
export function analysisConstraints(
  model: AnalysisExportModel,
  q: number[],
  v: number[],
  angle: number
) {
  const c: number[] = [],
    J: number[][] = [],
    curvature: number[] = [];
  for (const row of model.constraints) {
    const a = analysisPoint(model, q, v, row.positive),
      b = analysisPoint(model, q, v, row.negative),
      n = row.normal;
    c.push(n[0] * (a.p[0] - b.p[0]) + n[1] * (a.p[1] - b.p[1]));
    J.push(q.map((_, i) => n[0] * (a.D[0][i] - b.D[0][i]) + n[1] * (a.D[1][i] - b.D[1][i])));
    curvature.push(
      n[0] * (a.curvature[0] - b.curvature[0]) + n[1] * (a.curvature[1] - b.curvature[1])
    );
  }
  const i = model.bodies[model.driver.body].offset + 2;
  c.push(q[i] - angle);
  J.push(q.map((_, j) => +(i === j)));
  curvature.push(0);
  return { c, J, curvature };
}
/** Pivoted elimination with row scaling, avoiding the squared condition number of normal equations. */
export function analysisLinear(A: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  if (A.length !== n || A.some((row) => row.length !== n))
    throw new Error('Constraint system must be square.');
  const a = A.map((row, i) => {
    const s = Math.max(...row.map(Math.abs));
    return [...row, rhs[i]].map((x) => x / s);
  });
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(a[r][k]) > Math.abs(a[pivot][k])) pivot = r;
    if (!Number.isFinite(a[pivot][k]) || Math.abs(a[pivot][k]) < 1e-10)
      throw new Error('Singular constraint system.');
    [a[k], a[pivot]] = [a[pivot], a[k]];
    for (let r = k + 1; r < n; r++) {
      const f = a[r][k] / a[k][k];
      for (let j = k; j <= n; j++) a[r][j] -= f * a[k][j];
    }
  }
  const x = Array(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let s = a[k][n];
    for (let j = k + 1; j < n; j++) s -= a[k][j] * x[j];
    x[k] = s / a[k][k];
  }
  return x;
}
export function analysisDrive(model: AnalysisExportModel, t: number) {
  const segment = [...model.driver.segments].reverse().find((s) => s[0] <= t + 1e-12)!;
  return { angle: segment[1] + segment[2] * (t - segment[0]), speed: segment[2] };
}
export function analysisState(model: AnalysisExportModel, previous: number[], t: number) {
  const drive = analysisDrive(model, t),
    zero = previous.map(() => 0);
  let q = [...previous];
  for (let it = 0; it < 50; it++) {
    const { c, J } = analysisConstraints(model, q, zero, drive.angle);
    const delta = analysisLinear(J, c);
    if (Math.max(...c.map(Math.abs)) < 1e-11) break;
    const norm = Math.max(...c.map(Math.abs));
    let fraction = 1;
    while (fraction > 1 / 128) {
      const candidate = q.map((x, i) => x - fraction * delta[i]);
      if (
        Math.max(...analysisConstraints(model, candidate, zero, drive.angle).c.map(Math.abs)) < norm
      )
        break;
      fraction /= 2;
    }
    q = q.map((x, i) => x - fraction * delta[i]);
  }
  const { c, J } = analysisConstraints(model, q, zero, drive.angle);
  if (Math.max(...c.map(Math.abs)) > 1e-9) throw new Error('Position did not converge.');
  const rhs = zero.map((_, i) => (i === zero.length - 1 ? drive.speed : 0));
  const v = analysisLinear(J, rhs);
  const curvature = analysisConstraints(model, q, v, drive.angle).curvature;
  const a = analysisLinear(
    J,
    curvature.map((x) => -x)
  );
  return { q, v, a, J };
}
/** J' lambda + applied = M qdd; each pin column acts equally and oppositely on its bodies. */
export function analysisForces(
  model: AnalysisExportModel,
  q: number[],
  a: number[],
  J: number[][]
) {
  const rhs = q.map(() => 0);
  model.bodies.forEach((body) => {
    const i = body.offset,
      dynamic = model.settings.forceMode === 'dynamic';
    rhs[i] = body.mass * ((dynamic ? a[i] : 0) - model.gravity[0]);
    rhs[i + 1] = body.mass * ((dynamic ? a[i + 1] : 0) - model.gravity[1]);
    if (body.dof === 3) rhs[i + 2] = dynamic ? body.inertia * a[i + 2] : 0;
  });
  for (const load of model.loads) {
    const i = model.bodies[load.body].offset,
      phi = q[i + 2],
      c = Math.cos(phi),
      s = Math.sin(phi);
    const r = [c * load.point[0] - s * load.point[1], s * load.point[0] + c * load.point[1]];
    const f = load.local
      ? [c * load.force[0] - s * load.force[1], s * load.force[0] + c * load.force[1]]
      : load.force;
    rhs[i] -= f[0];
    rhs[i + 1] -= f[1];
    rhs[i + 2] -= r[0] * f[1] - r[1] * f[0];
  }
  return analysisLinear(
    J[0].map((_, i) => J.map((row) => row[i])),
    rhs
  );
}
