import { BodyExplanation, ForceExplanation, LinearSystemExplanation } from './solver-explanation';
import { MODEL_SCALE } from '../render-scale';
import { siUnitFactors } from '../unit-conversions';

export const COM_REFERENCE = '@CoM';
export const COM_TEX = '\\mathrm{CoM}';

/** Name the existing physical application locations; never move an applied force to its new label. */
export function labelApplicationPoints(trace: ForceExplanation): ForceExplanation {
  const used = new Set(trace.bodies.flatMap((b) => b.points.map((p) => p.id)));
  let next = 1;
  return {
    ...trace,
    bodies: trace.bodies.map((body) => ({
      ...body,
      loads: body.loads.map((load) => {
        if (load.kind !== 'applied') return { ...load };
        while (used.has(`P${next}`)) next++;
        const applicationId = `P${next++}`;
        used.add(applicationId);
        return { ...load, applicationId };
      }),
    })),
  };
}

export function referenceOptions(body: BodyExplanation) {
  return [
    { id: COM_REFERENCE, label: 'CoM', point: body.center },
    ...body.points.map((p) => ({ id: p.id, label: p.id, point: [p.x, p.y] })),
    ...body.loads
      .filter((l) => l.applicationId)
      .map((l) => ({
        id: l.applicationId!,
        label: `${l.applicationId} (Applied Force)`,
        point: l.point,
      })),
  ];
}

/** Translate the moment row about CoM to P: M_P = M_CoM + r_CoM/P × ΣF. */
export function referenceSystem(
  trace: ForceExplanation,
  system: LinearSystemExplanation,
  choices: Record<string, string>,
  unit: string
) {
  const scale = siUnitFactors(unit).distanceToM / MODEL_SCALE;
  const A = system.A.map((row) => [...row]),
    b = [...system.b],
    rows = [...system.rows];
  const bodies = trace.bodies.map((body) => {
    const options = referenceOptions(body);
    const reference = options.find((o) => o.id === choices[body.id]) ?? options[0];
    const dx = (body.center[0] - reference.point[0]) * scale;
    const dy = (body.center[1] - reference.point[1]) * scale;
    const known = [...body.known],
      inertia = [...body.inertia];
    if (body.rowCount === 3) {
      const r = body.startRow;
      A[r + 2] = A[r + 2].map((a, col) => a + dx * A[r + 1][col] - dy * A[r][col]);
      b[r + 2] += dx * b[r + 1] - dy * b[r];
      known[2] += MODEL_SCALE * (dx * known[1] - dy * known[0]);
      inertia[2] += MODEL_SCALE * (dx * inertia[1] - dy * inertia[0]);
      rows[r + 2] = `${body.name} moment about ${reference.label} · z`;
    }
    return { ...body, known, inertia, reference, referenceOptions: options, lengthToM: scale };
  });
  return { bodies, system: { ...system, A, b, rows } };
}
