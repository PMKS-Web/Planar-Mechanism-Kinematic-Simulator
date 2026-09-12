import { AnalysisExportModel } from '../../../model/analysis-export';
import { EquationPlan } from './equation-plan';

/** Names and signs come from the very same constraint rows that produce J. */
export function forceUnknownComments(p: EquationPlan): string[] {
  return [
    '% Force unknown vector (N, except driver torque in N*m):',
    ...p.rows.map(
      (row) =>
        `% lambda(${row.index + 1}) = ${row.name}; acts along n_${row.name} on ${p.bodies[row.constraint.positive.body]}, opposite on ${row.constraint.negative.body < 0 ? 'ground' : p.bodies[row.constraint.negative.body]}.`
    ),
    `% lambda(${p.driver.row + 1}) = T_driver; CCW torque on ${p.driver.body}.`,
  ];
}

/** A readable scalar Newton/Euler row, projected from its incident constraint columns. */
export function forceBalance(p: EquationPlan, row: EquationPlan['forceRows'][number]): string {
  const terms = row.incident.flatMap((term) => {
    const constraint = p.rows[term.row],
      arm = p.points[term.point].name;
    const n = constraint.constraint.normal;
    const parts: [number, string][] =
      row.axis < 2
        ? [[term.sign * n[row.axis], '']]
        : [
            [term.sign * n[1], `r_${arm}(1)*`],
            [-term.sign * n[0], `r_${arm}(2)*`],
          ];
    return parts
      .filter(([factor]) => factor !== 0)
      .map(
        ([factor, lever]) =>
          `${factor > 0 ? '+' : '-'} ${Math.abs(factor) === 1 ? '' : Math.abs(factor) + '*'}${lever}${constraint.name}`
      );
  });
  if (row.driver) terms.push('+ T_driver');
  const body = p.bodies[row.body];
  return `${terms.join(' ') || '0'} + ${row.axis < 2 ? `applied_${row.axis === 0 ? 'Fx' : 'Fy'}_${body} + mass_${body}*gravity(${row.axis + 1})` : `applied_M_${body}`} = ${row.axis < 2 ? `mass_${body}*${row.axis === 0 ? 'ax' : 'ay'}_${body}` : `inertia_${body}*alpha_${body}`}`;
}

export function forceEquations(m: AnalysisExportModel, p: EquationPlan): string {
  const lines = [
    'function [A_force,b_force] = force_equations(m,q,a,J)',
    '% THIS mechanism: Newton/Euler equilibrium, A_force*lambda = b_force.',
    '% J is the analytic matrix returned by position_equations.m at the solved pose.',
    "% The coefficient of lambda(k) in balance i is EXACTLY J(k,i); A_force = J'.",
    '% r_joint_on_body is the rotated vector from its CoM to the joint (see position_equations.m).',
    '% n is the constraint normal. cross(r,n) = r_x*n_y-r_y*n_x, positive CCW.',
    '% Static mode zeros ax, ay and alpha in the balances below; gravity and applied loads remain.',
    ...forceUnknownComments(p),
    `A_force = zeros(${m.initial.length},${p.rows.length + 1}); b_force = zeros(${m.initial.length},1);`,
    "dynamic = strcmp(m.settings.force_mode,'dynamic');",
  ];
  m.loads.forEach((load, i) => {
    const name = p.loads[i],
      b = m.bodies[load.body];
    lines.push(
      '',
      `% Applied load ${name}: anchor rotates with the body; vector rotates only when local.`,
      `load_${name} = m.loads(${i + 1}); phi_${name} = q(${b.offset + 3});`,
      `R_load_${name} = [cos(phi_${name}) -sin(phi_${name}); sin(phi_${name}) cos(phi_${name})];`,
      `r_load_${name} = R_load_${name}*load_${name}.point(:);`,
      `F_load_${name} = load_${name}.force(:);`,
      `if load_${name}.local, F_load_${name} = R_load_${name}*F_load_${name}; end`,
      `M_load_${name} = r_load_${name}(1)*F_load_${name}(2)-r_load_${name}(2)*F_load_${name}(1);`
    );
  });
  m.bodies.forEach((body, b) => {
    const name = p.bodies[b],
      at = body.offset + 1;
    const loads = m.loads.flatMap((load, i) => (load.body === b ? [p.loads[i]] : []));
    const sum = (axis: number) =>
      loads
        .map((load) => (axis < 2 ? `F_load_${load}(${axis + 1})` : `M_load_${load}`))
        .join(' + ') || '0';
    lines.push(
      '',
      `% BODY ${name}: balances about its own center of mass.`,
      `mass_${name} = m.bodies(${b + 1}).mass;`,
      `ax_${name} = double(dynamic)*a(${at}); ay_${name} = double(dynamic)*a(${at + 1});`,
      `applied_Fx_${name} = ${sum(0)}; applied_Fy_${name} = ${sum(1)};`
    );
    if (body.dof === 3)
      lines.push(
        `inertia_${name} = m.bodies(${b + 1}).inertia; alpha_${name} = double(dynamic)*a(${at + 2});`,
        `applied_M_${name} = ${sum(2)};`
      );
    for (const row of p.forceRows.filter((r) => r.body === b)) {
      const i = row.coordinate + 1;
      lines.push(
        `% Balance row ${i}: ${['sum Fx', 'sum Fy', 'sum M_G'][row.axis]}.`,
        `% ${forceBalance(p, row)}`,
        `A_force(${i},:) = J(:,${i})';`
      );
      if (row.axis < 2)
        lines.push(
          `b_force(${i}) = mass_${name}*(${row.axis === 0 ? 'ax' : 'ay'}_${name}-m.gravity(${row.axis + 1}))-applied_${row.axis === 0 ? 'Fx' : 'Fy'}_${name};`
        );
      else lines.push(`b_force(${i}) = inertia_${name}*alpha_${name}-applied_M_${name};`);
    }
  });
  lines.push('end', '');
  return lines.join('\n');
}
