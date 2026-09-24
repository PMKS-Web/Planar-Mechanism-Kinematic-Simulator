import { ForceExplanation, LinearSystemExplanation } from './solver-explanation';
import { forceConventions } from './worksheet-conventions';

/** Coordinates in a right-handed frame whose +x is angle degrees counterclockwise from right. */
export function axisCoordinates(v: readonly number[], angle: number): [number, number] {
  const a = (angle * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  const clean = (n: number) => (Math.abs(n) < 1e-12 ? 0 : n);
  return [clean(c * v[0] + s * v[1]), clean(-s * v[0] + c * v[1])];
}

/** Only a free pin reaction can exchange its two component coordinates. */
export function forceAxisPairs(trace: ForceExplanation) {
  return forceConventions(trace).flatMap((group) => {
    const loads = trace.bodies
      .flatMap((b) => b.loads)
      .filter((l) => l.sign === 1 && group.columns.includes(l.column!));
    const x = loads.find((l) => l.direction?.[0] === 1 && l.direction[1] === 0);
    const y = loads.find((l) => l.direction?.[0] === 0 && l.direction[1] === 1);
    return x && y ? [[x.column!, y.column!]] : [];
  });
}

/** Change both equilibrium rows and paired pin-force unknowns; constrained normals stay physical. */
export function forceAxes(trace: ForceExplanation, system: LinearSystemExplanation, angle: number) {
  if (!angle) return { trace, system };
  const pairs = forceAxisPairs(trace);
  const A = system.A.map((r) => [...r]);
  const x = [...system.x],
    b = [...system.b];
  for (const [i, j] of pairs) {
    // old x = R new x, so A_new = A_old R and x_new = R^T x_old.
    A.forEach((row) => {
      [row[i], row[j]] = axisCoordinates([row[i], row[j]], angle);
    });
    [x[i], x[j]] = axisCoordinates([x[i], x[j]], angle);
  }
  const bodies = trace.bodies.map((body) => {
    const r = body.startRow;
    const rows = A[r].map((_, col) => axisCoordinates([A[r][col], A[r + 1][col]], angle));
    A[r] = rows.map((v) => v[0]);
    A[r + 1] = rows.map((v) => v[1]);
    [b[r], b[r + 1]] = axisCoordinates([b[r], b[r + 1]], angle);
    return {
      ...body,
      points: body.points.map((p) => {
        const [x, y] = axisCoordinates([p.x, p.y], angle);
        return { ...p, x, y };
      }),
      center: axisCoordinates(body.center, angle),
      known: [...axisCoordinates(body.known, angle), ...body.known.slice(2)],
      inertia: [...axisCoordinates(body.inertia, angle), ...body.inertia.slice(2)],
      loads: body.loads.map((load) => {
        const pair = pairs.find((p) => p.includes(load.column!));
        const direction: [number, number] | undefined = pair
          ? load.column === pair[0]
            ? [1, 0]
            : [0, 1]
          : load.direction
            ? axisCoordinates(load.direction, angle)
            : undefined;
        return {
          ...load,
          point: axisCoordinates(load.point, angle),
          direction: load.kind === 'weight' ? axisCoordinates([0, -1], angle) : direction,
          vector: pair
            ? (direction!.map((v) => v * x[load.column!] * (load.sign ?? 1)) as [number, number])
            : axisCoordinates(load.vector, angle),
        };
      }),
    };
  });
  const rotated = { ...system, A, b, x };
  return { trace: { ...trace, bodies, system: rotated }, system: rotated };
}
