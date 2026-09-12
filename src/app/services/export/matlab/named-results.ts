import { AnalysisExportModel } from '../../../model/analysis-export';
import { matlabString } from '../matlab-writer';
import { EquationPlan } from './equation-plan';

/** Friendly fields are aliases of solved arrays, never another calculation path. */
export function namedResults(m: AnalysisExportModel, p: EquationPlan): string {
  const forces = m.settings.forceMode !== 'none';
  const lines = [
    'function r = named_results(r)',
    '% All named series have one row per r.time sample; XY vectors have two columns.',
    '% Original names/IDs remain in each entry. Safe field names are listed in ANALYSIS_README.md.',
    'r.joints = struct(); r.bodies = struct(); r.driver = struct();',
  ];
  m.joints.forEach((j, i) => {
    const key = `r.joints.${p.joints[i]}`;
    lines.push(`${key}.id = ${matlabString(j.id)}; ${key}.name = ${matlabString(j.name)};`);
    for (const quantity of ['Position', 'Velocity', 'Acceleration'])
      lines.push(
        `${key}.${quantity.toLowerCase()} = reshape(r.joint${quantity}(${i + 1},:,:),2,[])';`
      );
  });
  m.bodies.forEach((b, i) => {
    const key = `r.bodies.${p.bodies[i]}`,
      at = b.offset + 1;
    lines.push(
      `${key}.id = ${matlabString(b.id)}; ${key}.name = ${matlabString(b.name)};`,
      `${key}.position = r.q(${at}:${at + 1},:)';`,
      `${key}.velocity = r.v(${at}:${at + 1},:)';`,
      `${key}.acceleration = r.a(${at}:${at + 1},:)';`
    );
    if (b.dof === 3)
      lines.push(
        `${key}.angle = r.q(${at + 2},:)'+r.model.bodies(${i + 1}).initial_angle;`,
        `${key}.angularVelocity = r.v(${at + 2},:)';`,
        `${key}.angularAcceleration = r.a(${at + 2},:)';`
      );
  });
  lines.push(
    `r.driver.joint = ${matlabString(m.driver.joint)};`,
    `r.driver.angle = r.bodies.${p.driver.body}.angle;`,
    `r.driver.angularVelocity = r.bodies.${p.driver.body}.angularVelocity;`,
    `r.driver.angularAcceleration = r.bodies.${p.driver.body}.angularAcceleration;`
  );
  if (forces) {
    lines.push(
      'r.reactions = struct(); r.forceUnknowns = struct();',
      'r.driver.torque = r.torque;'
    );
    p.rows.forEach((row) =>
      lines.push(`r.forceUnknowns.${row.name} = r.lambda(${row.index + 1},:)';`)
    );
    lines.push(`r.forceUnknowns.T_driver = r.lambda(${p.driver.row + 1},:)';`);
    m.joints.forEach((_, joint) => {
      const bodies = new Set(
        p.rows
          .filter((row) => row.constraint.joint === joint)
          .flatMap((row) => [row.constraint.positive.body, row.constraint.negative.body])
          .filter((body) => body >= 0)
      );
      for (const body of bodies)
        lines.push(
          `r.reactions.${p.joints[joint]}.${p.bodies[body]} = reshape(r.reaction(${joint + 1},${body + 1},:,:),2,[])';`
        );
    });
  }
  lines.push('end', '');
  return lines.join('\n');
}
