import { AnalysisExportModel } from '../../../model/analysis-export';
import { matlabString } from '../matlab-writer';
import { EquationPlan } from './equation-plan';

/** Runtime guard: the emitted assembly must agree with the generic IR interpreter. */
export function validateEquations(m: AnalysisExportModel, p: EquationPlan): string {
  const forces = m.settings.forceMode !== 'none';
  const lines = [
    'function validate_equations(m)',
    '% Check generated row/column bindings and equations before any numerical solve.',
    '% Geometry/mass/load values may change. Changed topology/directions require re-export.',
    `assert(numel(m.initial)==${m.initial.length} && numel(m.bodies)==${m.bodies.length} && numel(m.joints)==${m.joints.length} && numel(m.constraints)==${m.constraints.length} && numel(m.loads)==${m.loads.length},'PMKS:Layout','Topology changed; re-export from PMKS.');`,
    `assert(m.driver.body==${m.driver.body + 1} && strcmp(m.driver.joint,${matlabString(m.driver.joint)}),'PMKS:Layout','Driver changed; re-export.');`,
  ];
  m.bodies.forEach((b, i) =>
    lines.push(
      `assert(m.bodies(${i + 1}).offset==${b.offset + 1} && m.bodies(${i + 1}).dof==${b.dof} && strcmp(m.bodies(${i + 1}).id,${matlabString(b.id)}),'PMKS:Layout','Body layout changed; re-export.');`
    )
  );
  m.joints.forEach((j, i) =>
    lines.push(
      `assert(strcmp(m.joints(${i + 1}).id,${matlabString(j.id)}) && m.joints(${i + 1}).body==${j.point.body + 1},'PMKS:Layout','Joint binding changed; re-export.');`
    )
  );
  p.rows.forEach((row) => {
    const c = row.constraint,
      k = row.index + 1;
    lines.push(
      `assert(isequal([m.constraints(${k}).joint m.constraints(${k}).positive_body m.constraints(${k}).negative_body m.constraints(${k}).normal],[${c.joint + 1} ${c.positive.body + 1} ${c.negative.body + 1} ${c.normal.join(' ')}]),'PMKS:Layout','Constraint direction/binding changed; re-export.');`
    );
  });
  m.loads.forEach((load, i) =>
    lines.push(
      `assert(m.loads(${i + 1}).body==${load.body + 1},'PMKS:Layout','Load body changed; re-export.');`
    )
  );
  lines.push(
    `assert(${forces ? "any(strcmp(m.settings.force_mode,{'static','dynamic'}))" : "strcmp(m.settings.force_mode,'none')"},'PMKS:Layout','Force selection changed; re-export.');`,
    '% Deterministic off-constraint probes also exercise point rotation and centripetal terms.',
    'for probe = 0:2',
    "    n = numel(m.initial); q = m.initial+probe*1e-4*sin((1:n)');",
    "    v = cos((1:n)'); a = sin((1:n)'); angle = q(m.bodies(m.driver.body).offset+2);",
    '    [c,J,k] = position_equations(m,q,v,angle);',
    '    [expected_c,expected_J,expected_k] = pmks.constraints(m,q,v,angle);',
    '    actual = [c;J(:);k]; expected = [expected_c;expected_J(:);expected_k];',
    "    assert(all(isfinite(actual)) && norm(actual-expected,inf)<=1e-12*max(1,norm(expected,inf)),'PMKS:Equations','Generated constraints differ from the generic model.');",
    '    [Jv,bv] = velocity_equations(m,q,angle,2); [Ja,ba] = acceleration_equations(m,q,v,angle,3);',
    '    expected_v = zeros(size(c)); expected_v(end) = 2; expected_a = -expected_k; expected_a(end) = 3;',
    '    actual = [Jv(:);Ja(:);bv;ba]; expected = [expected_J(:);expected_J(:);expected_v;expected_a];',
    "    assert(all(isfinite(actual)) && norm(actual-expected,inf)<=1e-12*max(1,norm(expected,inf)),'PMKS:Equations','Generated rate equations differ from the generic model.');"
  );
  if (forces)
    lines.push(
      '    [A_force,b_force] = force_equations(m,q,a,J);',
      "    expected_force = zeros(n,1); dynamic = strcmp(m.settings.force_mode,'dynamic');",
      '    for b = m.bodies',
      '        i = b.offset; expected_force(i:i+1) = b.mass*(double(dynamic)*a(i:i+1)-m.gravity(:));',
      '        if b.dof==3, expected_force(i+2) = double(dynamic)*b.inertia*a(i+2); end',
      '    end',
      '    for load = m.loads',
      '        i = m.bodies(load.body).offset; phi = q(i+2);',
      '        R = [cos(phi) -sin(phi);sin(phi) cos(phi)]; arm = R*load.point(:); f = load.force(:);',
      '        if load.local, f = R*f; end',
      '        expected_force(i:i+1) = expected_force(i:i+1)-f;',
      '        expected_force(i+2) = expected_force(i+2)-(arm(1)*f(2)-arm(2)*f(1));',
      '    end',
      "    expected = [reshape(J',[],1);expected_force]; actual = [A_force(:);b_force];",
      "    assert(all(isfinite(actual)) && norm(actual-expected,inf)<=1e-12*max(1,norm(expected,inf)),'PMKS:Equations','Generated force assembly differs from the generic model.');"
    );
  lines.push('end', 'end', '');
  return lines.join('\n');
}
