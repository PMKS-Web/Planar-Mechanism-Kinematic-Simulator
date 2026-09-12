import { AnalysisExportModel } from '../../../model/analysis-export';
import { matlabMatrix, matlabString } from '../matlab-writer';
import { KINEMATIC_FILES } from './kinematics';
import { FORCE_FILE } from './dynamics';
import { resultFiles } from './results';
import { equationPlan, EquationPlan, coordinateComments, commentText } from './equation-plan';
import { positionEquations, rateEquations } from './equations';
import { forceEquations } from './force-equations';
import { engineeringGuide, mechanismOverview } from './engineering-guide';
import { namedResults } from './named-results';
import { validateEquations } from './validate-equations';

const vector = (v: number[]) => `[${v.join(' ')}]`;
/** Named structures make the definition readable; locals are derived from the initial geometry. */
export function mechanismData(
  m: AnalysisExportModel,
  plan: EquationPlan = equationPlan(m)
): string {
  const lines = [
    'function m = mechanism_data()',
    '% Mechanism definition exported from PMKS. Geometry/properties are inputs, not solved histories.',
    '% SI: meters, seconds, radians, kilograms, kg*m^2, newtons, N*m. CCW and +Y upward.',
    '% Body rotation coordinates are relative to this initial configuration.',
    '% Start with ANALYSIS_README.md; executable equations are in position_equations.m.',
    ...mechanismOverview(m, plan).map((line) => '% ' + line),
    ...coordinateComments(m, plan),
    `m.name = ${matlabString(m.name)};`,
    'm.bodies = struct([]); m.joints = struct([]); m.constraints = struct([]); m.loads = struct([]); m.channels = struct([]);',
  ];
  m.bodies.forEach((b, i) =>
    lines.push(
      `% Body ${i + 1}: ${commentText(b.name)} (joint membership below)`,
      `m.bodies(${i + 1}) = struct( ...`,
      `    'id',${matlabString(b.id)}, 'name',${matlabString(b.name)}, ...`,
      `    'joints',{{${b.joints.map(matlabString).join(',')}}}, ...`,
      `    'initial_center',${vector(b.initialCenter)}, 'initial_angle',${b.initialAngle}, ...`,
      `    'mass',${b.mass}, 'inertia',${b.inertia}, ...`,
      `    'offset',${b.offset + 1}, 'dof',${b.dof}); % q entries described above.`
    )
  );
  const local = (body: number, joint: number) =>
    body < 0
      ? `m.joints(${joint + 1}).initial`
      : `m.joints(${joint + 1}).initial-m.bodies(${body + 1}).initial_center`;
  m.joints.forEach((j, i) =>
    lines.push(
      `m.joints(${i + 1}) = struct( ...`,
      `    'id',${matlabString(j.id)}, 'name',${matlabString(j.name)}, 'initial',${vector(j.initial)}, ...`,
      `    'ground',${+j.ground}, 'kind',${matlabString(j.kind)}, 'tracer',${+j.tracer}, ...`,
      `    'body',${j.point.body + 1}, 'local',[0 0]);`,
      `m.joints(${i + 1}).local = ${local(j.point.body, i)};`
    )
  );
  m.constraints.forEach((c, i) =>
    lines.push(
      `% Row ${i + 1}: ${plan.rows[i].description}.`,
      `m.constraints(${i + 1}) = struct('joint',${c.joint + 1}, ...`,
      `    'positive_body',${c.positive.body + 1}, 'positive_local',${local(c.positive.body, c.joint)}, ...`,
      `    'negative_body',${c.negative.body + 1}, 'negative_local',${local(c.negative.body, c.joint)}, ...`,
      `    'normal',${vector(c.normal)});`
    )
  );
  m.loads.forEach((l, i) =>
    lines.push(
      `m.loads(${i + 1}) = struct('id',${matlabString(l.id)},'body',${l.body + 1},'point',${vector(l.point)},'force',${vector(l.force)},'local',${+l.local});`
    )
  );
  lines.push(
    `m.gravity = ${vector(m.gravity)};`,
    `m.driver = struct('joint',${matlabString(m.driver.joint)},'body',${m.driver.body + 1});`,
    '% Driver rows: [time_s, relative_angle_rad, omega_rad_per_s]. Edit to prescribe motion.',
    `m.driver.segments = ${matlabMatrix(m.driver.segments)};`,
    `m.settings = struct('duration',${m.settings.duration},'step',${m.settings.step},'force_mode',${matlabString(m.settings.forceMode)});`,
    `m.initial = zeros(${m.initial.length},1);`,
    'for b = m.bodies, m.initial(b.offset:b.offset+1) = b.initial_center(:); end'
  );
  m.channels.forEach((c, i) =>
    lines.push(
      `m.channels(${i + 1}) = struct('label',${matlabString(c.label)},'quantity',${matlabString(c.quantity)},'index',${c.index + 1},'body',${c.body + 1},'component',${c.component + 1},'unit',${matlabString(c.unit)},'period',${c.period});`
    )
  );
  lines.push('end', '');
  return lines.join('\n');
}

export function matlabPackage(
  m: AnalysisExportModel,
  measurements = true,
  reference?: string
): Record<string, string> {
  const plan = equationPlan(m),
    forces = m.settings.forceMode !== 'none';
  if (!forces && m.channels.some((c) => c.quantity === 'reaction' || c.quantity === 'torque'))
    throw new Error('Force result channels require a static or dynamic MATLAB package.');
  const files: Record<string, string> = {
    'mechanism_data.m': mechanismData(m, plan),
    'ANALYSIS_README.md': engineeringGuide(m, plan),
    'position_equations.m': positionEquations(m, plan),
    'velocity_equations.m': rateEquations(m, plan, false),
    'acceleration_equations.m': rateEquations(m, plan, true),
    'named_results.m': namedResults(m, plan),
    'validate_equations.m': validateEquations(m, plan),
    ...KINEMATIC_FILES,
    ...resultFiles(forces),
  };
  if (forces) {
    files['solve_forces.m'] = FORCE_FILE;
    files['force_equations.m'] = forceEquations(m, plan);
  }
  if (!measurements) delete files['compare_measurements.m'];
  else files['measurements.csv'] = 'Time,Value\n';
  if (reference !== undefined) files['pmks_reference.csv'] = reference;
  files['README.txt'] = `PMKS MATLAB Analysis Package: ${m.name}
Unzip and change MATLAB's current folder to this folder. Run:
  results = run_pmks_analysis;
MATLAB R2016b or newer. Base MATLAB only: no Symbolic or Optimization Toolbox.
Actual MATLAB execution must be validated on your installation; generation/equation tests are separate.
These are MATLAB .m files. Some editors identify .m as Objective-C unless MATLAB language support is configured.

Start with ANALYSIS_README.md: this mechanism's geometry, coordinates, constraint rows and signed balances.
mechanism_data.m: human-readable initial geometry, membership, masses, inertias, loads, drive and units.
position_equations.m: executable named point transforms and each actual C/J/curvature row.
velocity_equations.m and acceleration_equations.m: differentiated rows and driver right-hand sides.
solve_position/velocity/acceleration.m: independent constraint equations and analytic Jacobian.
${forces ? 'force_equations.m and solve_forces.m: named Newton/Euler balances and static/dynamic equilibrium.' : 'Kinematics-only export: force_equations.m and solve_forces.m are intentionally omitted.'}
named_results.m: readable joint/body/driver aliases of the raw solved arrays, with original names preserved.
validate_equations.m: checks generated assembly against the generic model before running; refuses changed topology.
+pmks/: reusable point, constraint, drive, linear solve, continuation and comparison functions.
plot_results.m: grouped Position, Velocity, Acceleration, Force (if selected) and joint/tracer paths.
Different units have separate subplots, rather than opening a window for each scalar channel.
Edit geometry/properties in mechanism_data.m; re-export after changing topology or constraint directions.
All calculation uses SI (m, s, rad, kg, N, N*m); no PMKS results are used to solve.
External load application points rotate with their body. Local vectors also rotate; global vectors do not.
No independent applied-couple field exists in current PMKS. Driver torque is solved, not prescribed.
Rigid pins, root rigid bodies (including ternary/compound), tracer points, fixed free-turning slider
blocks, and one grounded rotary driver are supported. Other slides/drivers are refused before export.
Singular/indeterminate configurations stop with a warning and leave remaining results as NaN.
Drive reversal segments are prescribed inputs. Reversal impulses are not modeled.
Static analysis ignores inertia; dynamic analysis uses MATLAB's calculated accelerations.
No friction, compliance, structural stress, or ambiguous support splitting is modeled.

PMKS_Verification is a historical workflow reference. The current PMKS model defines the engineering
properties. Optional pmks_reference.csv is verification only: delete it and the solver still runs.
Current PMKS display-scale handling can cause dynamic-force discrepancies; compare_pmks reports
differences without calibrating MATLAB to the reference. See docs/matlab-and-measurements.md.

Experimental comparison (if included): CSV header Time,Value; time in seconds, strictly increasing.
Inspect results.model.channels to select the joint/body, quantity and SI unit. For example:
  stats = compare_measurements(results,'measurements.csv',1,0,results.model.channels(1).unit);
The offset is added to measurement time. No extrapolation, gap bridging or outlier removal.
RMSE = sqrt(mean(error.^2)); bias = mean(error); peak = max(abs(error)). Angle errors wrap.
Experimental data is optional. The supplied CSV is an empty template, never loaded automatically.
`;
  return files;
}
