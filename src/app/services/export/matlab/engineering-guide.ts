import { AnalysisExportModel } from '../../../model/analysis-export';
import { commentText, coordinateComments, EquationPlan } from './equation-plan';
import { forceBalance, forceUnknownComments } from './force-equations';

export function mechanismOverview(m: AnalysisExportModel, p: EquationPlan): string[] {
  const lines = [
    `${commentText(m.name)}: ${m.bodies.length} moving bodies and ${m.joints.length} joints; ground is the fixed reference body.`,
    'All distances below are meters. Angles are radians, CCW positive; world +Y is upward.',
    ...m.joints.map(
      (j, i) =>
        `${p.joints[i]} (${commentText(j.name)}): [${j.initial.join(' ')}]; ${j.kind === 'slider' ? 'slider on fixed guide (moves along the guide)' : j.ground ? 'fixed ground pin' : j.tracer ? 'rigidly attached tracer' : 'moving pin'}.`
    ),
  ];
  m.bodies.forEach((b, i) => {
    lines.push(
      `Body ${p.bodies[i]} (${commentText(b.name)}): joints ${b.joints.map(commentText).join(' <-> ')}.`,
      `  CoM [${b.initialCenter.join(' ')}]; mass ${b.mass} kg; inertia ${b.inertia} kg*m^2; initial angle ${b.initialAngle} rad.`
    );
    b.joints.forEach((id, a) =>
      b.joints.slice(a + 1).forEach((other) => {
        const j = m.joints.find((point) => point.id === id),
          k = m.joints.find((point) => point.id === other);
        if (j && k)
          lines.push(
            `  Length ${p.bodies[i]} (${commentText(id)} to ${commentText(other)}) = ${Math.hypot(j.initial[0] - k.initial[0], j.initial[1] - k.initial[1])} m.`
          );
      })
    );
  });
  const fixed = m.joints.filter((j) => j.ground && j.kind === 'pin');
  fixed.forEach((j, i) =>
    fixed
      .slice(i + 1)
      .forEach((k) =>
        lines.push(
          `Ground spacing ${commentText(j.id)} to ${commentText(k.id)} = ${Math.hypot(j.initial[0] - k.initial[0], j.initial[1] - k.initial[1])} m.`
        )
      )
  );
  lines.push(
    `Driver: body ${p.driver.body} rotates about ground joint ${commentText(m.driver.joint)}.`,
    `theta_${p.driver.body}(0) = 0 relative to the initial body angle ${m.bodies[m.driver.body].initialAngle} rad.`,
    ...m.driver.segments.map(
      (s) => `At t=${s[0]} s: relative angle ${s[1]} rad, prescribed speed ${s[2]} rad/s.`
    ),
    `Analysis duration ${m.settings.duration} s; requested step ${m.settings.step} s; force mode ${m.settings.forceMode}.`
  );
  return lines;
}

export function engineeringGuide(
  m: AnalysisExportModel,
  p: EquationPlan,
  hasImage = false
): string {
  const lines = [
    '# Engineering equations for ' + commentText(m.name),
    '',
    '**MATLAB solver units: SI (m, kg, s, rad, N; inertia kg*m^2 and torque N*m). Current PMKS display units are converted automatically. A 3 cm length becomes 0.03 m. All plots and result arrays also use SI.**',
    '',
    'These are MATLAB .m files. Some editors identify .m as Objective-C until MATLAB language support is configured.',
    'Unzip and set MATLAB Current Folder to this folder. Run `results = run_pmks_analysis;`, then `report = validate_pmks_package;`. No PMKS reference file is required.',
    'The analysis opens grouped Position, Velocity, Acceleration and Force figures for the selected quantities, plus joint/tracer paths when joint positions are selected. The validator reruns the solver without opening figures.',
    "Inspect `results` and `report` in the Workspace. Save a shareable report with `report = validate_pmks_package(true,'pmks_validation_report.txt');`. Use `false` as the first argument to skip the optional PMKS cross-check.",
    ...(hasImage
      ? [
          '',
          '![Exported initial mechanism configuration](mechanism.svg)',
          '',
          'The drawing shows the initial configuration used by mechanism_data.m. Joint and body labels match the original names; yellow pins mark the rotary driver. Fixed guides are shown as rails.',
        ]
      : []),
    '',
    '## Runtime validation',
    '',
    '`validate_pmks_package.m` runs the actual generated solver, then re-evaluates its position, velocity, acceleration and (when present) force equations at every solved frame. No separate force derivation or reference history supplies the solution.',
    '`report.position`, `.velocity`, `.acceleration` and optional `.force` contain `maxResidual`, `rmsResidual`, `maxToleranceRatio`, `withinTolerance` and `byRow`. Row units are recorded separately because aggregate residuals mix translation/rotation or force/moment rows. Force packages also expose `.force.byBody.<body>.Fx`, `.Fy` and `.moment` (rigid bodies only).',
    'Position closure uses 1e-8 absolute per SI row (m or rad). Rates and force balance use abs(residual) <= 1e-8 + 1e-8*(abs(A)*abs(x)+abs(b)) per scalar row: an absolute roundoff allowance plus a cancellation-aware relative allowance. These are equation tolerances, tighter than cross-implementation sample comparisons.',
    'PASS means all requested frames completed and all equations met tolerance. WARN means partial completion, row-scaled rcond(J) below 1e-8, or optional PMKS differences. FAIL means no complete frames, an invalid frame marked complete, equation-check errors or a residual outside tolerance. The numerical solver independently refuses row-scaled rcond below 1e-12.',
    '`report.frames` counts requested, solved, failed/incomplete and unattempted frames, the first failure and NaN/Inf entries in the stored raw arrays (excluding duplicate named aliases). Residual summaries use available solved frames; unsolved remainder entries remain NaN. Conditioning reports minimum raw and row-scaled rcond plus the worst raw-conditioned frame.',
    'Optional PMKS comparison reports RMSE, bias and peak error through the existing selected channels. A peak error above 1e-6 for position/angle or 1e-4 for other channels, times max(1,peak absolute compared theory), gives WARN without failing the core equations. Known PMKS dynamic-force display scaling can cause discrepancies; MATLAB retains physically consistent SI equations.',
    'See README.txt for execution and saving instructions. TypeScript generation/equation tests do not verify actual MATLAB runtime execution. Optional display-unit plots are deferred: solver, raw arrays, channels and measurement units remain consistently SI for this validation pass.',
    '',
    '## This mechanism',
    '',
    '```text',
    ...mechanismOverview(m, p),
    '```',
    '',
    '## Unknowns and units',
    '',
    'The translation coordinates are the center of mass. theta is rotation FROM the initial pose, not the absolute link angle.',
    'v = q_dot and a = q_ddot. Named result angles add the initial angle; named rates are in rad/s and rad/s^2.',
    'Slider blocks have x/y translation only, with no rotational coordinate or moment equation.',
    '',
    '```matlab',
    ...coordinateComments(m, p),
    '```',
    '',
    '## Position, velocity and acceleration',
    '',
    '`position_equations.m` is executable mechanism-specific assembly, not a separate illustrative derivation.',
    '`validate_equations.m` runs before analysis: it checks row/column bindings and compares the emitted assembly to the generic IR equations at deterministic probes. Changed topology/directions are refused instead of using stale derivations.',
    'It constructs each point as p = G + R(theta)*r_initial, its analytic derivative D, and its centripetal term k = -omega^2*R(theta)*r_initial.',
    'For each scalar constraint, C = n*(p_positive-p_negative), J = n*(D_positive-D_negative), curvature = n*(k_positive-k_negative).',
    'At ground, p is fixed and D and k are zero. On a slider guide, n is the guide normal; tangential motion remains free.',
    '',
    '```text',
    ...p.rows.map((r) => `Row ${r.index + 1}: ${r.description}.`),
    `Row ${p.driver.row + 1}: theta_${p.driver.body} - prescribed relative angle(t) = 0.`,
    '```',
    '',
    'Newton: J*delta = C; q_new = q-delta (with backtracking and continuation).',
    '`velocity_equations.m`: J*v = b_velocity; every support/pin/guide row has RHS zero, and the last row prescribes input angular velocity.',
    '`acceleration_equations.m`: J*a = -curvature + prescribed input acceleration in the last row.',
    'At a shared joint, both bodies give the same point velocity and acceleration. Centripetal terms move to the acceleration RHS with a minus sign.',
    'Piecewise constant driver speeds have zero acceleration between changes. Reversal impulses are not modeled.',
    '',
    '## Free-body equations',
    '',
  ];
  if (m.settings.forceMode === 'none')
    lines.push(
      'This is a kinematics-only package. Force-specific files and named reaction/torque results are omitted.',
      'To generate static or dynamic free-body equations, select force quantities in PMKS and export again.'
    );
  else {
    lines.push(
      '`force_equations.m` constructs A_force and b_force; `solve_forces.m` solves A_force*lambda = b_force.',
      "A_force = J'. Every force coefficient is read from the same Jacobian used for the kinematic solve.",
      'Constraint normals and body incidence determine the signed physical equations below. A scalar reaction acts along its normal on the positive body, with an equal opposite action on the negative body.',
      'These scalar equations use the exported normals. Re-export after changing topology or constraint directions.',
      '',
      '```matlab',
      ...forceUnknownComments(p),
      '```',
      '',
      'Here r_joint_on_body is the rotated CoM-to-joint vector from position_equations.m. A positive driver torque is CCW.',
      'Applied forces and moments include body-attached load arms. Global vectors keep world direction; local vectors rotate.',
      'Static mode sets the accelerations on the right to zero, retaining gravity and applied loads.',
      ''
    );
    m.bodies.forEach((_, i) =>
      lines.push(
        `### Body ${p.bodies[i]}`,
        '',
        '```text',
        ...p.forceRows
          .filter((r) => r.body === i)
          .map(
            (r) =>
              `Row ${r.coordinate + 1}, ${['sum Fx', 'sum Fy', 'sum M_G'][r.axis]}: ${forceBalance(p, r)}`
          ),
        '```',
        ''
      )
    );
  }
  lines.push(
    '',
    '## Named results',
    '',
    'Every series has one row per results.time sample. Position/velocity/acceleration vectors have X and Y columns. Raw q/v/a arrays remain available.',
    ...m.joints.map(
      (j, i) =>
        `- Joint ${commentText(j.name)} (ID ${commentText(j.id)}): results.joints.${p.joints[i]}.position / velocity / acceleration.`
    ),
    ...m.bodies.map(
      (b, i) =>
        `- Body ${commentText(b.name)} (ID ${commentText(b.id)}): results.bodies.${p.bodies[i]}.position / velocity / acceleration${b.dof === 3 ? ' / angle / angularVelocity / angularAcceleration' : ''}.`
    ),
    '- results.driver.angle / angularVelocity / angularAcceleration use the driven body.',
    ...(m.settings.forceMode === 'none'
      ? []
      : [
          '- results.reactions.<joint>.<body> is the total X/Y force on that body at that joint, in N.',
          '- results.forceUnknowns uses exactly the lambda aliases listed above; results.driver.torque is in N*m.',
        ]),
    'Safe names are deterministic ASCII MATLAB identifiers. Original IDs and names remain in the named entries and results.model.',
    '',
    '## Plots and limitations',
    '',
    'Selected channels are grouped into Position, Velocity, Acceleration and (when selected) Force figures, with separate subplots for different units. Joint/tracer paths share one equal-axis XY figure.',
    'The solver uses base MATLAB R2016b or newer; no Symbolic or Optimization Toolbox. MATLAB runtime validation is separate from generator/equation tests.',
    'Geometry and mass properties can be edited in mechanism_data.m. Constraint topology changes require regeneration so executable assembly, names and the row guide remain consistent.',
    'Singularities stop continuation. Unsupported slides/drivers, friction, flexibility, structural stress and instantaneous reversal impulses remain outside scope.',
    'Optional verification/measurement files never supply the theoretical solution. See README.txt for comparison instructions and the existing PMKS dynamic-force scale discrepancy.',
    ''
  );
  return lines.join('\n');
}
