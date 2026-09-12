import { AnalysisExportModel } from '../../../model/analysis-export';
import { coordinateComments, EquationPlan } from './equation-plan';

/** Emit the constraint assembly the solver actually executes, with the same row metadata as the guide. */
export function positionEquations(m: AnalysisExportModel, p: EquationPlan): string {
  const lines = [
    'function [c,J,curvature] = position_equations(m,q,v,angle)',
    '% THIS mechanism: C(q,t)=0; J=dC/dq; curvature=J_dot*v.',
    '% v is zero during Newton iteration, and the solved velocity during acceleration analysis.',
    '% R(theta) rotates initial-world-frame offsets; theta is RELATIVE to the initial pose.',
    '% Edit geometry/properties in mechanism_data.m. Re-export after changing topology.',
    ...coordinateComments(m, p),
    `n = ${m.initial.length}; c = zeros(${p.rows.length + 1},1); J = zeros(${p.rows.length + 1},n); curvature = c;`,
  ];
  m.bodies.forEach((b, i) => {
    const name = p.bodies[i],
      at = b.offset + 1;
    lines.push(`x_${name} = q(${at}); y_${name} = q(${at + 1});`);
    if (b.dof === 3)
      lines.push(
        `theta_${name} = q(${at + 2}); omega_${name} = v(${at + 2});`,
        `R_${name} = [cos(theta_${name}) -sin(theta_${name}); sin(theta_${name}) cos(theta_${name})];`
      );
  });
  for (const point of p.points) {
    const name = point.name;
    lines.push(
      '',
      `% Point ${name}: position, analytic derivative and centripetal acceleration.`,
      `D_${name} = zeros(2,n); k_${name} = zeros(2,1);`
    );
    if (point.body < 0) {
      lines.push(`p_${name} = ${point.source}(:); % Fixed world point.`);
      continue;
    }
    const b = m.bodies[point.body],
      body = p.bodies[point.body],
      at = b.offset + 1;
    lines.push(
      `r_${name} = ${b.dof === 3 ? `R_${body}*` : ''}${point.source}(:);`,
      `p_${name} = [x_${body}; y_${body}]+r_${name};`,
      `D_${name}(:,${at}:${at + 1}) = eye(2);`
    );
    if (b.dof === 3)
      lines.push(
        `D_${name}(:,${at + 2}) = [-r_${name}(2); r_${name}(1)];`,
        `k_${name} = -omega_${body}^2*r_${name};`
      );
  }
  for (const row of p.rows) {
    const i = row.index + 1,
      a = p.points[row.positive].name,
      b = p.points[row.negative].name;
    lines.push(
      '',
      `% Row ${i}: ${row.description}.`,
      `n_${row.name} = m.constraints(${i}).normal;`,
      `c_${row.name} = n_${row.name}*(p_${a}-p_${b});`,
      `c(${i}) = c_${row.name};`,
      `J(${i},:) = n_${row.name}*(D_${a}-D_${b});`,
      `curvature(${i}) = n_${row.name}*(k_${a}-k_${b});`
    );
  }
  lines.push(
    '',
    `% Row ${p.driver.row + 1}: rotary driver on ${p.driver.body}.`,
    `c(${p.driver.row + 1}) = theta_${p.driver.body}-angle;`,
    `J(${p.driver.row + 1},${p.driver.coordinate + 1}) = 1;`,
    'end',
    ''
  );
  return lines.join('\n');
}

export function rateEquations(
  m: AnalysisExportModel,
  p: EquationPlan,
  acceleration: boolean
): string {
  const kind = acceleration ? 'acceleration' : 'velocity';
  const lines = [
    `function [J,b_${kind}] = ${kind}_equations(m,q,${acceleration ? 'v,angle,alpha' : 'angle,omega'})`,
    `% Differentiate the actual rows of position_equations.m for this mechanism.`,
    ...coordinateComments(m, p),
    acceleration
      ? '% Point acceleration = a_G + alpha*[-r_y;r_x] - omega^2*r. The last term is curvature.'
      : '% Point velocity = v_G + omega*[-r_y;r_x]. Ground point velocity is zero.',
    ...p.points.map((point) => {
      const rate = acceleration ? 'a' : 'v';
      if (point.body < 0) return `% ${rate}_${point.name} = [0;0]; % Ground has no motion.`;
      const body = p.bodies[point.body],
        arm = `r_${point.name}`;
      const translation = `[${rate}x_${body}; ${rate}y_${body}]`;
      const rotation =
        m.bodies[point.body].dof === 3
          ? ` + ${acceleration ? 'alpha' : 'omega'}_${body}*[-${arm}(2);${arm}(1)]${acceleration ? ` - omega_${body}^2*${arm}` : ''}`
          : '';
      return `% ${rate}_${point.name} = ${translation}${rotation};`;
    }),
    ...p.rows.flatMap((row) => {
      const a = p.points[row.positive].name,
        b = p.points[row.negative].name;
      return [
        `% Row ${row.index + 1}: ${row.description}.`,
        `% n_${row.name}*(${acceleration ? 'a' : 'v'}_${a}-${acceleration ? 'a' : 'v'}_${b}) = 0.`,
        acceleration
          ? `% J(${row.index + 1},:)*a = -n_${row.name}*(k_${a}-k_${b}); k = -omega^2*r.`
          : `% J(${row.index + 1},:)*v = 0; each moving point has v_point = D_point*v.`,
      ];
    }),
  ];
  if (acceleration)
    lines.push(
      '[~,J,curvature] = position_equations(m,q,v,angle);',
      'b_acceleration = -curvature;',
      `b_acceleration(${p.driver.row + 1}) = alpha; % alpha_${p.driver.body} = prescribed input acceleration.`
    );
  else
    lines.push(
      '[~,J] = position_equations(m,q,zeros(size(q)),angle);',
      `b_velocity = zeros(${p.driver.row + 1},1);`,
      `b_velocity(${p.driver.row + 1}) = omega; % omega_${p.driver.body} = prescribed input speed.`
    );
  lines.push(
    `% Solve J*${acceleration ? 'a' : 'v'} = b_${kind} using base MATLAB linear algebra.`,
    'end',
    ''
  );
  return lines.join('\n');
}
