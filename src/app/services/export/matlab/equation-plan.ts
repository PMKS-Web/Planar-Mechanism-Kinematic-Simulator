import { AnalysisExportModel, AnalysisPoint } from '../../../model/analysis-export';

/** ASCII MATLAB identifiers, unique in their namespace, including after truncation. */
export function matlabIdentifiers(labels: string[], limit = 63): string[] {
  const used = new Set<string>();
  const reserved = new Set(
    'break case catch classdef continue else elseif end for function global if otherwise parfor persistent return spmd switch try while methods properties events enumeration arguments true false'.split(
      ' '
    )
  );
  return labels.map((label) => {
    let stem = label.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!/^[a-zA-Z]/.test(stem) || reserved.has(stem)) stem = 'item_' + stem;
    stem = stem.slice(0, limit);
    let name = stem;
    for (let i = 2; used.has(name); i++) {
      const suffix = '_' + i;
      name = stem.slice(0, limit - suffix.length) + suffix;
    }
    used.add(name);
    return name;
  });
}

/** Comments must not let a user-supplied name introduce another MATLAB line. */
export const commentText = (text: string) => text.replace(/[\r\n\u2028\u2029]/g, ' ');

export interface EquationPoint {
  name: string;
  body: number;
  joint: number;
  source: string;
  point: AnalysisPoint;
}

/** This one row order drives executable equations, row descriptions and force aliases. */
export function equationPlan(m: AnalysisExportModel) {
  const bodies = matlabIdentifiers(
    m.bodies.map((b) => b.id),
    40
  );
  const joints = matlabIdentifiers(
    m.joints.map((j) => j.id),
    40
  );
  const loads = matlabIdentifiers(
    m.loads.map((l) => l.id),
    40
  );
  const points: EquationPoint[] = [];
  const point = (p: AnalysisPoint, joint: number, source: string) => {
    let i = points.findIndex((other) => other.body === p.body && other.joint === joint);
    if (i < 0) {
      i = points.length;
      points.push({ name: '', body: p.body, joint, source, point: p });
    }
    return i;
  };
  const rowNames = matlabIdentifiers(
    m.constraints.map((c) => {
      const axis =
        c.normal[0] === 1 && c.normal[1] === 0
          ? 'x'
          : c.normal[0] === 0 && c.normal[1] === 1
            ? 'y'
            : 'normal';
      return `${joints[c.joint]}_on_${bodies[c.positive.body]}_${axis}`;
    }),
    48
  );
  const rows = m.constraints.map((c, i) => ({
    index: i,
    name: rowNames[i],
    constraint: c,
    positive: point(c.positive, c.joint, `m.constraints(${i + 1}).positive_local`),
    negative: point(c.negative, c.joint, `m.constraints(${i + 1}).negative_local`),
    description: `${m.joints[c.joint].kind === 'slider' ? 'fixed guide' : c.negative.body < 0 ? 'ground pin' : 'shared pin'} ${commentText(m.joints[c.joint].name)}: ${bodies[c.positive.body]} to ${c.negative.body < 0 ? 'ground' : bodies[c.negative.body]}, normal [${c.normal.join(' ')}]`,
  }));
  matlabIdentifiers(
    points.map((p) => `${joints[p.joint]}_on_${p.body < 0 ? 'ground' : bodies[p.body]}`),
    48
  ).forEach((name, i) => {
    points[i].name = name;
  });
  const driver = {
    row: rows.length,
    coordinate: m.bodies[m.driver.body].offset + 2,
    body: bodies[m.driver.body],
  };
  const forceRows = m.bodies.flatMap((body, b) => {
    const incident = rows.flatMap((row) => {
      const sign =
        row.constraint.positive.body === b ? 1 : row.constraint.negative.body === b ? -1 : 0;
      return sign ? [{ row: row.index, sign, point: sign > 0 ? row.positive : row.negative }] : [];
    });
    return Array.from({ length: body.dof }, (_, axis) => ({
      coordinate: body.offset + axis,
      body: b,
      axis,
      incident,
      driver: axis === 2 && b === m.driver.body,
    }));
  });
  return { bodies, joints, loads, points, rows, driver, forceRows };
}
export type EquationPlan = ReturnType<typeof equationPlan>;

export function coordinateComments(m: AnalysisExportModel, p: EquationPlan): string[] {
  return m.bodies.flatMap((b, i) => [
    `% Body ${p.bodies[i]}: ${commentText(b.name)}. CoM coordinates in m; rotation from initial pose in rad.`,
    `% q(${b.offset + 1}) = x_${p.bodies[i]}; v(${b.offset + 1}) = vx_${p.bodies[i]}; a(${b.offset + 1}) = ax_${p.bodies[i]};`,
    `% q(${b.offset + 2}) = y_${p.bodies[i]}; v(${b.offset + 2}) = vy_${p.bodies[i]}; a(${b.offset + 2}) = ay_${p.bodies[i]};`,
    ...(b.dof === 3
      ? [
          `% q(${b.offset + 3}) = theta_${p.bodies[i]}; v(${b.offset + 3}) = omega_${p.bodies[i]}; a(${b.offset + 3}) = alpha_${p.bodies[i]};`,
        ]
      : []),
  ]);
}
