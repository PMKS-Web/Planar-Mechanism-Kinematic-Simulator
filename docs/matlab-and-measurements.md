# MATLAB scripts and measured data

> **Status:** Reference — MATLAB export and experimental comparison in the analysis modes. Feature frozen after the runtime-validator hardening pass, pending execution of the generated packages in an actual MATLAB installation. Add no further capabilities until that validation is reviewed.

## MATLAB Analysis Package

The [architecture audit and roadmap](analysis-matlab-architecture.md) distinguishes shared
mechanism data from equations independently reconstructed by the exporter. The current package
does not yet derive from one canonical equation assembly shared with the PMKS runtime.

In the actual PMKS application, load a mechanism and enter Kinematic or Force Analysis. Open
**Export Data**, choose objects and quantities, then select **MATLAB Analysis Package (.zip)**.
Force selections use the drawer's **Static** or **In-motion** setting. The complete mechanism
defines the equations even when only one object's results are selected for plotting.

Export, unzip, and change MATLAB's current folder to the mechanism's folder. Run:

```matlab
results = run_pmks_analysis;
report = validate_pmks_package;
% Optional: rerun validation and save a report to share for debugging.
report = validate_pmks_package(true,'pmks_validation_report.txt');
```

MATLAB independently calculates configurations, joint/tracer and CoM velocities/accelerations,
link angles/angular rates, and selected static or dynamic joint reactions and driver torque.
No PMKS result table supplies the theoretical solution. **Delete `pmks_reference.csv` and the
complete supported analysis still runs.** Each selected mechanism gets its own folder in one ZIP.
Folder names have a deterministic `pmks_` prefix and safe letters, digits and underscores.

**MATLAB solver units are SI (m, kg, s, rad, N). Current PMKS display units are converted
automatically: 3 cm becomes 0.03 m.** Named results, raw arrays and plots also use SI. Both
**Include PMKS reference results** and **Include measurement-comparison template** default to
**No**; either can be enabled. Optional display-unit plots are deferred because channel labels,
reference samples and measurement units would need a coordinated output conversion layer.
The current architecture remains fixed while real MATLAB validation is pending.

### Generated files

| File | Purpose |
| --- | --- |
| `mechanism_data.m` | Named joints, root bodies, initial geometry, constraints, SI mass properties, loads and drive commands |
| `ANALYSIS_README.md` | This mechanism's geometry, link/ground distances, coordinate meanings, constraint row map and signed free-body equations |
| `position_equations.m` | Executable named point transforms and explicit constraint, Jacobian and curvature rows |
| `velocity_equations.m`, `acceleration_equations.m` | Mechanism-specific differentiated row explanations and actual right-hand sides |
| `force_equations.m` | Per-body Newton/Euler rows and applied-load assembly, when force quantities are selected |
| `run_pmks_analysis.m` | One entry point; calculates results before optionally verifying them |
| `validate_equations.m` | Runtime topology guard and comparison of generated equations with the generic IR interpreter |
| `validate_pmks_package.m` | Reruns the actual MATLAB solver without figures; returns residuals, frame completion, conditioning and PASS/WARN/FAIL |
| `mechanism.svg` | Initial configuration from the existing SVG exporter, with joints, bodies, ground, driver and fixed guides |
| `solve_position.m` | Numerical Newton iteration with backtracking |
| `solve_velocity.m` | Analytic Jacobian equation `J*q_dot = driver RHS` |
| `solve_acceleration.m` | `J*q_ddot = -J_dot*q_dot + driver acceleration RHS` |
| `solve_forces.m` | `J' * lambda = M*q_ddot - applied loads`; static mode zeros inertial terms |
| `named_results.m` | Joint/body/driver aliases of the solved arrays, with deterministic safe field names |
| `plot_results.m` | Grouped Position, Velocity, Acceleration and Force figures, plus joint/tracer paths |
| `+pmks/` | Reusable point transforms, constraints, linear solving, continuation, driver, channel and comparison helpers |
| `compare_pmks.m` | Optional comparison to `pmks_reference.csv` |
| `compare_measurements.m`, `measurements.csv` | Optional experimental comparison and an empty CSV template |
| `README.txt` | Run instructions, units and limitations |

The package uses base MATLAB syntax and linear algebra (`A\b`, `rcond`, `readtable`, plotting).
MATLAB R2016b or newer is the target. No Symbolic Math Toolbox, Optimization Toolbox, or separate
PMKS_Verification installation is required. **Actual MATLAB execution remains unverified on the
development machine, where neither MATLAB nor Octave was found.** Equation tests are not a
substitute for running the emitted MATLAB files. Octave compatibility is not claimed.

These are standard MATLAB `.m` files. Some editors also associate `.m` with Objective-C; choose
MATLAB language mode or configure MATLAB language support if the highlighting looks like C.
Inspection of the user's `pmks_M1_kinematics_analysis.zip` confirmed MATLAB function contents,
not C/C++ source or a packaging extension problem. The extension remains `.m`.

### Validate and share a MATLAB run

1. Unzip the package and set MATLAB **Current Folder** to the folder containing `mechanism_data.m`.
2. Run `results = run_pmks_analysis;`. Selected channels open grouped Position, Velocity,
   Acceleration and (if selected) Force figures. Joint positions also produce a trajectory figure.
3. Run `report = validate_pmks_package;`. It reruns the **actual generated solver**, without
   figures, then calls the generated position, velocity, acceleration and optional force equations
   at every available solved frame. No TypeScript solver or PMKS reference history supplies results.
4. Inspect `results` and `report` in the Workspace. `report.position`, `.velocity`, `.acceleration`
   and optional `.force` contain `maxResidual`, `rmsResidual`, `maxToleranceRatio`,
   `withinTolerance`, and `byRow`. Each row's SI unit is recorded because aggregate summaries mix
   translation/rotation or force/moment rows. `.force.byBody.<body>` exposes Fx/Fy and, for rigid
   bodies, moment statistics from the same force rows used to solve equilibrium.
5. Save with `report = validate_pmks_package(true,'pmks_validation_report.txt');` and return that
   text file with the exported ZIP when reporting a problem. No file is written by default.
   `validate_pmks_package(false)` skips the optional PMKS CSV cross-check.

`report.frames` counts requested, completely solved, kinematically solved, failed/incomplete and
unattempted frames, first failure/time, and NaN/Inf entries in the raw stored arrays (excluding
duplicate named aliases and reference data). Unsolved remainder entries stay NaN. Residuals use
solved frames; no missing frame is filled or reported as successful. Force completion is recorded
only after the force solve succeeds. Conditioning gives minimum raw and row-scaled rcond(J),
plus the worst raw-conditioned frame and its time.

| Check | Tolerance and outcome |
| --- | --- |
| Position closure C | Absolute 1e-8 per scalar SI row, in m or rad |
| Velocity, acceleration, force equilibrium | Absolute 1e-8 + relative 1e-8 × (abs(A) × abs(x) + abs(b)) per scalar row |
| Near singularity | Row-scaled rcond(J) below 1e-8 gives WARN; existing solver refuses below 1e-12 |
| Optional PMKS cross-check | Peak error above 1e-6 for position/angle, 1e-4 otherwise, multiplied by max(1, peak absolute compared theory), gives WARN |

The equation thresholds allow floating-point cancellation while remaining tighter than the
cross-implementation sample tolerances below. **PASS** requires complete frames and acceptable
equations. **WARN** covers partial completion, near singularity or optional comparison differences.
**FAIL** covers no complete frames, a nonfinite frame marked complete, equation-check errors or
excessive core residuals. Optional comparisons report RMSE/bias/peak and cannot fail core equations.
The known PMKS dynamic-force display-scale discrepancy is explained when those channels differ;
MATLAB retains physical SI equations. The PMKS force backend is unchanged by this hardening pass.

The image is a labeled skeleton of `mechanism.joints[0]` / `links[0]`, matching the adapter's
initial configuration even when playback has advanced. The writer passes SVG text into the plain
package generator; it does not introduce an Angular dependency into that generator. Standalone
callers without drawing data may omit the optional image, and the guide then omits its image link.

### Read the engineering equations

Start with `ANALYSIS_README.md`, then open `position_equations.m`. For M1 it identifies the
three moving bodies AB, BC and CD, the fixed ground reference, joints A/B/C/D, and the rotary
driver about A. It lists initial coordinates, each body's CoM/mass/inertia, rigid joint-pair
lengths and ground spacing A–D. The coordinate map explains `q(1)=x_AB`, `q(2)=y_AB`,
`q(3)=theta_AB`, and the corresponding velocity/acceleration entries. Body rotations are
relative to the initial pose; named result angles include the initial absolute angle.

The generated position code explicitly constructs named points, for example
`p_B_on_AB = [x_AB;y_AB]+R_AB*r_initial`, and assembles the shared-pin row
`c_B_on_AB_x = n_B_on_AB_x*(p_B_on_AB-p_B_on_BC)`. The same row constructs its analytic
Jacobian and curvature. The velocity and acceleration files identify the matching point-rate
equalities, show where `-omega^2*r` enters, and form their driver right-hand sides. Newton
continuation and base-MATLAB linear algebra remain generic.

**The readable equations are on the execution path.** One `equationPlan` made from the plain
analysis IR supplies point bindings, coordinate offsets, constraint row ordering, reaction
names/signs and body balance rows to every renderer. The solve routines call these generated
equation files. Force coefficients are read directly from the same Jacobian as `A_force=J'`;
the body balance descriptions and named force unknowns use those constraint rows. No separate
four-bar or Stephenson derivation is maintained.

Before running, `validate_equations.m` checks body/driver/constraint bindings and compares the
generated position/Jacobian/curvature, velocity and acceleration equations at deterministic
probes against `+pmks/constraints.m`. Force packages also check their assembled matrix and RHS
against generic free-body assembly. A changed topology, normal direction or binding requires
re-export, avoiding a stale row guide. Geometry, mass properties and load values remain editable
in `mechanism_data.m`. These checks execute in MATLAB when the user runs the package; they have
not been claimed as executed on this development machine.

### Named results and grouped plots

Raw `q`, `v` and `a` remain available. `results.joints.B.position`, `.velocity` and
`.acceleration` are time-by-XY arrays. `results.bodies.BC` includes CoM position/velocity/
acceleration and `.angle`, `.angularVelocity`, `.angularAcceleration` for rotating bodies.
Force packages also expose `results.reactions.B.AB` and `.BC` as the total XY forces on the
respective bodies; `results.forceUnknowns.B_on_AB_x` maps directly to its scalar `lambda` row;
and `results.driver.torque` is the driver torque in N*m. Original names and IDs remain in the
entries/model, while deterministic MATLAB identifiers avoid keywords, invalid characters,
collisions and the 63-character field-name limit.

Plots use at most four analysis figures (Position, Velocity, Acceleration, Force) and one
trajectory figure. Each quantity/component gets its own subplot, so X, Y, magnitude, CoM and
angular quantities do not share an undifferentiated plot. Legends identify selected joints/
bodies, and axes retain their SI units. This follows the historical grouped-plot intent without
hard-coded joint names or `.mat` intermediates. MATLAB plot appearance remains subject to runtime
validation; browser screenshots validate the export UI only.

Kinematics-only packages omit `solve_forces.m`, `force_equations.m`, force execution and named
reaction/torque fields. Position, velocity and acceleration remain together because the latter
depend on the former. To add force analysis, select force quantities in PMKS and export again.
The force-enabled package can switch between static and dynamic analysis in its settings.

### Constraint and force support

Supported: revolute pins; ground pins; rigid binary, ternary and multi-joint bodies; root compound
bodies; rigidly attached tracer points; fixed guides with free-turning slider blocks; one
grounded rotary driver. The mathematical formulation is the same for all mechanism graphs.
Frame bodies pinned at two distinct ground points are excluded from moving-body equilibrium;
their pins are ground supports for adjacent bodies. A slider block has two translational
coordinates and no rotational inertia. Its guide reaction is normal to the fixed line.

Not supported: linear or floating drivers, floating slots, welded slides, sealed cylinders,
redundant/underdetermined systems, ambiguous support splitting, friction, flexibility, structural
stress or deformation. These topologies are refused before export instead of silently falling
back to reference results. A singular initial pose is also refused. An encountered singularity
or nonconvergence stops the analysis, records the failure, and leaves later results `NaN`.

Position continuation starts from the previous assembly and subdivides failed/large angular
steps. It does not choose a branch through a toggle. The exported drive has a compact
piecewise-constant command profile, preserving PMKS's recorded reversal timing and direction.
These command boundaries are inputs; they are not solved joint coordinates. Acceleration is
zero between command changes. Instantaneous reversal impulses are outside this model, and rates
at a reversal are right-sided. Edit `m.settings.duration`, `step`, and `m.driver.segments` to
investigate a different prescribed motion; automatic rediscovery of stroke limits is not included.

Dynamics uses `sum F = m*a_G` and `sum M_G = I_G*alpha` on each moving body. Constraint reactions
act equally and oppositely across pins. Reactions are indexed by **joint and body**, never just a
joint name; driver torque is positive counterclockwise. Gravity is `[0,-9.80665] m/s^2` when
enabled. Force application points stay attached to their body; local force vectors rotate with
it and global vectors retain their world direction. Current PMKS has no separate applied-couple
property to extract; driver torque is solved. Static mode suppresses inertia only, retaining loads
and gravity. The solver does not use PMKS force values for either analysis mode.

### Units and property mapping

The adapter uses PMKS's `siUnitFactors` and removes `MODEL_SCALE = 200` from every canvas length
at the boundary. All generated engineering calculations use m, kg, s, rad, N and N*m. In the
centimeter system PMKS stores mass in g and inertia in kg*cm^2; inertia therefore has its own
conversion, not the product of the mass conversion and squared coordinate conversion.

| PMKS property | Generated MATLAB field |
| --- | --- |
| Joint ID/name, initial x/y | `m.joints(i).id`, `.name`, `.initial` (m) |
| Ground/slider/tracer state | `m.joints(i).ground`, `.kind`, `.tracer` |
| Root link membership | `m.bodies(b).joints` (joint IDs) |
| CoM and initial orientation | `m.bodies(b).initial_center`, `.initial_angle` (m, rad) |
| Mass and moment of inertia | `m.bodies(b).mass`, `.inertia` (kg, kg*m^2) |
| Pin and fixed-guide constraints | `m.constraints(k)`; positive/negative body, local point, normal, joint |
| Input joint/body, speed and reversals | `m.driver.joint`, `.body`, `.segments` (`time, relative angle, rad/s`) |
| Applied force | `m.loads(i).body`, `.point`, `.force`, `.local` (m, N) |
| Gravity | `m.gravity` (m/s^2) |
| Analysis mode | `m.settings.force_mode`: `none`, `static`, `dynamic` |
| Selected quantities | `m.channels`: label, quantity, joint/body index, component, SI unit |

Rigid-body coordinates are `[CoM_x, CoM_y, rotation_from_initial]`; slider coordinates are `[x,y]`.
`results.q`, `.v`, `.a` are coordinate-by-time matrices. `jointPosition`, `jointVelocity`, and
`jointAcceleration` are joint-by-XY-by-time. `reaction` is joint-by-body-by-XY-by-time and `torque`
is time-by-one. `results.values` is time-by-selected-channel, with metadata in `results.model.channels`.

### PMKS verification data

**Include PMKS reference results for verification** is off by default. Enabling it adds a CSV of
the selected PMKS values, converted to the channel's SI unit. MATLAB first calculates its own
solution, then interpolates that solution to reference times and reports RMSE, bias and peak
absolute error. Missing samples are excluded. Verification failure does not discard the independent
results. No calibration, fitting, extrapolation or outlier removal is performed.

**Known PMKS dynamic-force discrepancy:** current `Mechanism.getForceAnalysis` passes canvas-scale
geometry/linear acceleration to `ForceSolver`, while mass and inertia remain physical properties.
`AnalysisSampleService` subsequently divides torque by 200, but does not correct the mixed inertial
terms. Consequently current app dynamic-force readings are not an authoritative SI numerical
baseline. This pass preserves those app readings and exports them honestly when verification is
requested. The MATLAB solver uses physical SI equations; it is not rescaled to imitate that issue.
Tests compare against the current PMKS free-body equations on physical user-unit frames and record
the display-path discrepancy separately. Correcting the app's dynamics unit boundary is a separate
follow-up requiring its existing force regressions to be reviewed.

### Experimental comparison in MATLAB

Choose **Include measurement-comparison template** (on by default). Enter CSV columns `Time,Value`;
time is seconds from the initial pose and values use the chosen result channel's SI unit. Inspect
`results.model.channels`, then call, for example:

```matlab
stats = compare_measurements(results,'measurements.csv',1,0,'m');
```

The arguments identify file, selected channel, time offset, and measurement unit. A mismatched unit
is refused; convert measurements explicitly. Timestamps must be finite and strictly increasing.
The offset is added to measured time. Linear interpolation never crosses a missing solve or extends
beyond the solved interval. Angular position errors take the shortest rotation. The comparison
plots theoretical and measured values and reports RMSE, bias, peak error, compared/excluded counts.
Measurements are never required to run the solver and the empty template is not automatically loaded.

### Historical reference and architectural audit

`PMKS_Verification/Mechanisms/Stephenson_III/Example_1` and `CommonUtils` provide the historical
design: initialization → position → velocity/acceleration → free-body forces → plots → experimental
RMSE. The February 7, 2025 work demonstrates the experimental workflow. The current PMKS backend
defines the geometry, mass properties, constraints and conventions.

The audit covered Initializer, PosSolver, VelAccSolver, ForceSolver, StressSolver, Plots, RMSE and
Utils, plus the corresponding CommonUtils helpers. The prototype hard-codes joint sequences,
uses Symbolic Math Toolbox, saves many `.mat` intermediates, has inconsistent CoM/plot names,
copy/paste intersection checks, and an extraneous D-reaction moment on BC. Its stress helper is an
axial approximation with topology-specific dimensions; current PMKS has no validated structural
model to export. None of those assumptions is carried into this generator.

Current PMKS combines a geometric position walk and a simultaneous constraint solver (distance,
coincidence, rigid offsets, fixed/moving lines, fixed angles and driver constraints). Rates use
differentiated constraints or loop equations. This exporter expresses its supported subset with
rigid-body coordinates; it preserves rigid offsets including collinear multi-joint bodies and
gives force equilibrium the transpose of the same analytic Jacobian. Unsupported constraint kinds
are explicitly refused. `model/analysis-export.ts` is a plain-data engineering IR;
`services/export/matlab-model.ts` is the PMKS adapter; `services/export/matlab/` contains separate
data, kinematic, dynamic and result/comparison generators. The generator never imports UI services.

### Retained reference script

**PMKS Reference Script (.m)** retains the earlier table/plot/RMSE export and its limited example
kinematic solver. It remains reference-oriented and does not independently solve forces. Use
**MATLAB Analysis Package** for independent analysis.

## Compare measurements in PMKS

Select a joint or link, expand its quantity, and press **Compare Measurements**. Select X, Y or
magnitude where offered. Paste two columns using commas, tabs or whitespace:

```text
Time,Value
0,1.25
0.1,1.32
0.2,1.47
```

Time is in seconds; the measured value uses the displayed unit. Match the drawing's origin,
axes, positive direction, and the chosen joint/body reaction convention. The header is optional.
Decimals use a period. Up to 10,000 rows are accepted; both numbers must be finite and times must
increase without duplicates.

Set **Time Offset (s)** to align the clocks:

`compared time = measured time + offset`

For example, an experiment starting at 12 seconds matches the mechanism's start pose with an
offset of −12 seconds. **Calculate RMSE** interpolates theoretical values linearly to those
times and shows the measured points over the theoretical curve. It reports RMSE, mean signed
error, peak absolute error, and compared/excluded counts. RMSE is
`sqrt(mean((measured − theoretical)^2))`, in the quantity's unit.

Out-of-range samples and gaps in the theoretical curve are excluded and counted. No samples are
extrapolated, no outliers are removed, and no automatic alignment or cycle repetition occurs.
Angular positions interpolate and compare by the shortest rotation; their overlay uses
equivalent angles on a continuous branch. Angular rates do not wrap.

Editing the data, component or offset removes the old result. A rebuilt mechanism or changed
analysis settings/units requires comparing again. Measured values are never silently converted.
Collapsing a quantity retains its input, but leaving the analysis panel or changing the selected
part may discard it. Measurements stay in this panel session: they are not saved in project
links or included automatically in an exported script.

## Verification

`matlab-package.spec.ts` tests the plain model/equation contract independently of UI rendering:
four-bar, teaching-lab four-bar with tracer points and mass properties, fixed-guide slider-crank,
and reversing multi-loop Stephenson III. It checks joint positions/rates, body angular rates,
equal-and-opposite reactions and driver torque. Additional tests check analytic Jacobians by
finite differences, static local/world loads, reversed playback, topology refusal, deterministic
files, escaped names and optional-data independence.

`matlab-equations.spec.ts` additionally checks generated row bindings against the equation
contract, evaluates the rendered scalar Newton/Euler balances under nonzero mass/inertia and
both local/world loads in static and dynamic modes, verifies naming and channel mappings, and
checks coherent kinematics-only content. It covers M1, the tracer four-bar, slider-crank and
Stephenson III. With `PMKS_WRITE_MATLAB` set, it writes inspectable M1 kinematics, M1 dynamic
(explicitly configured 0.2 kg / 0.0001 kg*m² demonstration bodies), Stephenson III and fixed-guide
slider-crank ZIPs under
`<PMKS_WRITE_MATLAB>/readable-equations/`. M1 geometry and clockwise speed are checked against
the user's inspected download. Numerical equation tests remain distinct from MATLAB execution.

`matlab-validation.spec.ts` checks validator inclusion/call wiring, force-row mappings, omission
for kinematics, deterministic optional-data behavior, emitted status/error policies, SI wording,
SVG labels/escaping and frame-zero selection. The browser suite verifies both No defaults,
opt-in templates, validator/image downloads and the changed UI. These are generation contracts;
PASS/WARN/FAIL execution must still be exercised in MATLAB itself.

These are **TypeScript equation-contract versus PMKS comparisons**, not results from executing
MATLAB. No MATLAB runtime is installed on the development machine. The generated code targets
base MATLAB R2016b or newer; actual MATLAB execution remains unverified. Octave compatibility
is not claimed. The next validation stage is to run the exported fixture packages in MATLAB.

The September 2026 validation measured the following maximum errors. Position and rate errors
use `abs(actual-reference)/max(1,abs(reference))` in SI. Force and torque errors use maximum
absolute error divided by `max(1, cycle peak reference magnitude)`; this avoids unstable relative
errors at zero crossings. Force references use the physical-coordinate PMKS assembly described
above, not the app's uncorrected dynamic-force readouts.

| Mechanism | Compared frames | Position | Largest velocity/acceleration/angular error | Reaction | Driver torque |
| --- | ---: | ---: | ---: | ---: | ---: |
| Basic four-bar | 361 | 1.79e-8 | 2.36e-6 | 0 | 0 |
| Teaching-lab four-bar with tracers | 361 | 5.54e-8 | 3.23e-7 | 1.17e-6 | 1.52e-6 |
| Teaching-lab slider-crank | 361 | 2.25e-8 | 7.79e-8 | 4.80e-10 | 7.85e-10 |
| Stephenson III | 367 | 7.44e-7 | 6.39e-5 | 4.65e-5 | 4.73e-5 |

Acceptance limits are 1e-6 for positions and 1e-4 for rates and cycle-normalized force/torque.
The basic template has zero masses by default; a separate test assigns 0.2 kg and 0.0001 kg*m²
to each body, checks nonzero dynamics and reproduces the current PMKS scale discrepancy.
Ideal reversal instants are excluded from rate/force comparisons when the two solvers use
opposite sides of the velocity jump. PMKS's rounded positions amplify rate differences near
Stephenson's limiting configurations.

Set `PMKS_WRITE_MATLAB=artifacts/matlab-package-validation` when running that spec to retain
the per-fixture generated files and JSON numerical reports. `e2e/matlab-package.mjs` exercises
the actual application: select analysis quantities, export the ZIP, inspect/extract its files,
verify that enabling reference CSV changes no solver file, check phone controls and refuse an
unsupported driver. Its artifacts include an example ZIP, extracted MATLAB files, screenshots
and the drawer-opening filmstrip under `artifacts/matlab-package/`.

PMKS's fast reverse-playback optimization retains its original pose order. Closed,
constant-speed cycles are supported and the optional reference rows are reordered by elapsed
time. Fast-reversed open or reversing cycles are explicitly refused; rebuild that motion before
export. Normally solved reversing cycles use their compact prescribed reversal profile.

The UI gallery's **Feedback → Measurement Comparison** stories show the collapsed, empty,
invalid, compared, unsolved and narrow angular states using the real component with synthetic
samples. Run the local gallery to review a branch; docs.pmksplus.com reflects `staging`.

`measurement-comparison.spec.ts` tests interpolation, offsets, RMSE, missing samples, invalid
input and angular wrapping. `matlab-writer.spec.ts` checks exported numeric literals and
constraints against the teaching-lab four-bar and slider-crank pose histories, and checks scope
refusals for reversing six-bars. `e2e/matlab-measurements.mjs` checks downloads, overlays, known
RMSE, input refusals, stale results and phone layout.

These tests validate script generation and model data. Executing the generated `.m` file also
requires validation in a MATLAB runtime, which is not part of the app's test runner.
