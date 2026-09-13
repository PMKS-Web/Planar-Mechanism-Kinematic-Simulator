# PMKS and MATLAB analysis: ownership audit and roadmap

> **Status:** Reference — architecture audit of `feature/matlab-measurement-analysis` through `0d2cc2a1774d0438b50dff2a07eebdfb784893f3`, against staging `acba1b770a20551b37a9b2f24b459c224c8ed0fc`. This document proposes future work; no analysis migration is implemented here. The MATLAB feature remains frozen pending actual MATLAB testing.

**Actual MATLAB runtime execution: NOT VERIFIED**

## Finding and decision

**The current MATLAB package independently reconstructs important PMKS mathematics. It is not
a translation of the equations that the application currently executes.** Shared authored
mechanism data, physical conversion constants and cross-implementation tests provide a useful
baseline, but they are not shared equation ownership.

`AnalysisExportModel` is an export-specific engineering representation.
`equationPlan` makes the generated equations, their explanations and named results agree with
each other. It does **not** consume PMKS's position constraint assembly, its Jacobian, its
velocity/acceleration assembly or its force matrix. Fundamental formulas remain in the MATLAB
generators and in a separate TypeScript export-contract evaluator.

The architecture is suitable to freeze and test as an independent exporter. It must not be
described as having already achieved the desired common backend. No small, safe correction
would close that architectural gap; this audit changes documentation only.

The long-term objective is achievable: common physical model, constraint semantics, equation
assembly, units/signs, loads and drive semantics, with different numerical runtimes. “Same”
should mean the same mathematical problem and defined numerical acceptance/continuity policy,
not bit-identical floating-point results, iterations or matrix-factorization internals.

## Concrete current paths

Paths below are relative to the repository. The reviewed code is the feature worktree, not
uncommitted work in another checkout.

```text
MechanismService authored Joint / RealLink / SliderBlock / Force / settings
  └─ partitionMechanisms → Mechanism (initial deep copies and motion precompute)
       ├─ APPLICATION
       │    LoopSolver + PositionSolver.determineJointOrder
       │      ├─ geometric placement / circle-line and circle-circle primitives
       │      └─ collectConstraints → SimultaneousSystem → solveSimultaneous
       │    Mechanism.findFullMovementPos / solveLookingAhead
       │      → accepted poses, times, input speeds, branch/reversal decisions
       │    KinematicsSolver.determineKinematics
       │      ├─ constraintKinematics → constraintRates, where that route applies
       │      ├─ loop angular/slider equations → linear point/CoM motion
       │      └─ loopless rigid-body motion
       │    Mechanism.getForceAnalysis → ForceSolver.analyzeMechanism
       │      → frameAt → rates (with finite-difference fallback)
       │      → analyzeFrame → reaction enumeration and Newton/Euler assembly
       │    AnalysisSampleService → application graphs and ordinary exports
       │
       └─ MATLAB EXPORT
            ExportWriterService.writeMatlabPackage
              → matlab-model.analysisExportModel
                 initial joints/bodies, SI properties, reconstructed pin/guide rows
                 PMKS time/speed samples → compact prescribed drive segments
              → matlabChannels (selected outputs; optional PMKS reference samples)
              → matlabPackage → equationPlan
                 ├─ position/velocity/acceleration/force equation generators
                 ├─ named results, engineering guide, startup assembly guard
                 └─ generic MATLAB numerical helpers, plots, runtime validator
              → mechanismSvg(initial joints/links) + ZIP
            MATLAB run_pmks_analysis
              → validate_equations → independent position/rate/force solves
              → named results / plots / optional comparison
            MATLAB validate_pmks_package
              → rerun actual generated solver → re-evaluate its equations
```

Key source entry points:

- [MechanismService](../src/app/services/mechanism.service.ts): partitioning and rebuilding.
- [Mechanism](../src/app/model/mechanism/mechanism.ts): `findFullMovementPos`,
  `solveLookingAhead`, `restoreAnalysisState`, `withDirectionFlipped`, `getForceAnalysis`.
- [PositionSolver](../src/app/model/mechanism/position-solver.ts): geometric and simultaneous
  routes; `collectConstraints`, `buildSimultaneousSystem`, `constraintKinematics`.
- [simultaneous-solver](../src/app/model/mechanism/simultaneous-solver.ts):
  `Constraint`, `SimultaneousSystem`, `residuals`, `jacobian`, `secondOrderTerms`,
  `constraintRates`, `boundaryTangent`, `solveSimultaneous`.
- [KinematicsSolver](../src/app/model/mechanism/kinematic-solver.ts):
  `solveRates`, `applyConstraintKinematics`, `determineAng`, `determineLin`.
- [ForceSolver](../src/app/model/mechanism/force-solver.ts): `analyzeMechanism`,
  `analyzeFrame`, `enumerateReactions`, `captureCurrentKinematics`,
  `finiteDifferenceKinematics`, `solveLinearSystem`, `evenestSolution`.
- [Export adapter](../src/app/services/export/matlab-model.ts),
  [engineering IR](../src/app/model/analysis-export.ts),
  [equation plan](../src/app/services/export/matlab/equation-plan.ts),
  [equation-contract evaluator](../src/app/model/analysis-equations.ts),
  [package assembly](../src/app/services/export/matlab/package.ts).

### The existing backend has a useful equation seam, but it is not universal

`SimultaneousSystem` already supplies named constraint kinds: distance, coincidence, rigid
offset, fixed/moving guide incidence, fixed angle/direction, driven length and driven angle.
Its residuals, analytic Jacobian and exact second-order terms are shared by its **own** position
and rate paths. This is substantial existing work to retain.

It is joint-coordinate based, with prescribed boundary motion and lengths in model coordinates.
Most supported ordinary grounded-crank mechanisms still take the established geometric/loop
paths; `PositionSolver.constraintKinematics` explicitly gates its coupled/cylinder/floating-pin
route. There is no one exported backend equation model used by all kinematics and forces.

MATLAB instead gives each moving rigid body CoM x/y and relative rotation coordinates, each
slider block x/y, and builds point coincidence or fixed-guide-normal rows. Its force coefficients
are the transpose of that **body-coordinate** Jacobian. The app's force assembly separately
enumerates reactions and their moment arms. The two Jacobians are generally different sizes and
parameterizations, even for the same linkage. Comparing their raw entries today is not a valid test.

## Ownership by analysis stage

In this table “shared” means a real common data/function dependency, not merely equivalent
physics. “Canonical” describes recommended future ownership, not an existing module.

| Analysis item | Authoritative application implementation today | MATLAB export implementation today | Shared representation? / Reimplemented? | Drift risk | Recommended long-term owner |
| --- | --- | --- | --- | --- | --- |
| Position | PositionSolver placement primitives or solveSimultaneous; Mechanism accepts motion steps | matlab/kinematics.ts emits Newton/backtracking and continuation over generated C/J | Initial geometry shared; position formulation and numerical policy reimplemented | High: root, range and coordinate choices | Canonical constraints; runtime-specific solve using an explicit acceptance policy |
| Constraint assembly | PositionSolver.collectConstraints/buildSimultaneousSystem; geometric order and LoopSolver for other paths | matlab-model.ts reconstructs ground/shared-pin and fixed-guide rows in AnalysisExportModel | Authored topology shared; rows not reused from backend | High: frame classification, compounds, redundant pins and support coverage | Canonical semantic topology and constraint assembly |
| Jacobian | simultaneous-solver.jacobian for simultaneous route; loop velocity coefficients otherwise | matlab/equations.ts emits point derivatives and normal-projected body-coordinate J; analysis-equations.ts repeats these for tests/preflight | No shared Jacobian evaluator or expression definition | High: different coordinates, row normalization and derivatives | Canonical coordinate/row plan with derivative expressions |
| Velocity | KinematicsSolver.solveRates selects constraint, loop or loopless route; constraintRates differentiates its system | rateEquations emits J*v = driver RHS; generated solve_velocity uses pmks.linear | Same drive speed values, separate equations/solves | High near toggles and fallback boundaries | Canonical differentiated equations; explicit runtime route provenance |
| Acceleration | Loop acceleration assembly or constraintRates/secondOrderTerms including boundary/command terms | rateEquations emits J*a = -curvature plus driver alpha; body point curvature is -omega²*r | Separate second-order expressions | High: curvature, driven boundary, event-side conventions | Same canonical second-order terms as the chosen constraint model |
| Driver handling | Joint.driveSpeed, actuator resolution, PositionSolver stepping; Mechanism records timeNum/inputAngularVelocities | matlab-model converts recorded time/speed changes into segments; pmks.driver evaluates right-sided piecewise-constant speed, zero alpha between events | Speed/time histories shared as command inputs; scheduling/evaluation reconstructed | High: schedule depends on PMKS-discovered limits | Canonical drive plan, with authored versus discovered-event provenance |
| Branch/assembly continuity | Previous poses, geometric root choices, remembered poses, boundary tangents, jump subdivision and Mechanism reversals | Previous body pose; Newton backtracking; pmks.advance bisects, bounds rotation step to pi/8 | Initial assembly shared; continuation rules independent | High: several roots satisfy the same equations | Canonical branch signatures/event and acceptance semantics; runtime continuation implementation |
| Singularity handling | Mobility/rank admission; simultaneous full-column-rank gate; force pivot/residual tests and support policy | Preflight square-system/pivot guard; MATLAB row-scaled rcond refusal; runtime residual/conditioning report | No common thresholds or failure policy | High: “unsolved,” “singular” and redundant support differ | Canonical diagnostics contract and dimensionless acceptance policies |
| Mass | Link.mass, read by ForceSolver using siUnitFactors | Initial root-body mass through the same siUnitFactors | Property and conversion shared; inertia RHS assembly separate | Low for value, medium for unit-boundary use | Canonical physical body properties |
| Center of mass | RealLink.CoM, custom-offset/geometry handling; precomputed body transforms and KinematicsSolver CoM rates | Initial CoM converted to SI; it becomes the translational generalized coordinate | Initial value shared; motion reconstruction independent | Medium: compound membership and off-center data | Canonical body frame/CoM plus output mapping |
| Inertia | RealLink.massMoI; ForceSolver inertiaToKgM2 times angular acceleration | Same property/conversion; generated per-body inertia*alpha | Property and conversion shared; balance assembly separate | Medium: unit meaning and root/compound ownership | Canonical inertia about documented CoM |
| Applied forces | Force objects; PositionSolver transforms application points/local vectors into frame forces; ForceSolver assembles resultant/moment | Initial force magnitude/angle/local flag and CoM-relative arm; force-equations.ts rotates arm/vector and forms cross product | Initial properties shared; transport and moment equations reimplemented | High: local/world direction, moment arm and scale | Canonical load contribution and frame transforms |
| Gravity | Mechanism.gravity boolean; ForceSolver's GRAVITY = 9.80665 | matlab-model hardcodes [0,-9.80665] when enabled | Toggle shared; constant/vector assembly duplicated | Medium: small duplication can change conventions | Canonical gravity vector in m/s² |
| Static equilibrium | ForceSolver.analyzeFrame zeros inertia terms; includes loads/gravity and possible shared-support solve | Generated force equations use zero inertial RHS; square J' solve | Equivalent intended physics in overlap; separate assembly/policy | High for reactions at redundant supports | Canonical physical equilibrium rows plus explicit support policy |
| Dynamic equilibrium | Same app force assembly with kinematic maps or finite-difference fallback; current scale defect remains | J'*lambda = M*a - applied; accelerations from independent SI solve | Same mass/load inputs, not same acceleration or assembly ownership | High: known scale discrepancy and rate provenance | Canonical physical dynamics used by corrected app and generator |
| Joint reactions | enumerateReactions and signed per-joint/per-root-body reconstruction; buildReactionIndex serves UI | Adapter preserves incident order; equationPlan signs and generated solve_forces reconstruct ±normal*lambda | Shared body/joint IDs and intended order; enumeration/sign logic duplicated | High for multi-body pins, frames, guides and redundant support | Canonical reaction incidence/unknown map and output convention |
| Driver torque | ForceSolver input-effort column, CCW moment on input body; sampler display conversion | Last multiplier of body rotation row; named driver torque in N*m | Same selected input; column construction and output scaling separate | High while backend scale issue remains | Canonical effort dual to the prescribed coordinate |

The app can express more mechanisms and force-support policies than the exporter. Unsupported
slides/drivers and non-square/initially singular export systems are deliberately refused.
That difference must stay explicit; a future shared model is not permission to silently widen
export support.

### What is actually one source of truth today

- Authored identities/topology and initial body/joint/force properties originate in PMKS
  model objects. The adapter reads `mechanism.joints[0]` / `links[0]`, not current playback pose.
- [unit-conversions.ts](../src/app/model/unit-conversions.ts) supplies `siUnitFactors` to both
  ForceSolver and the export adapter. Shared conversion factors do not guarantee they are
  applied at the same coordinate boundary. In particular the `cm` system's inertia factor is
  **kg·cm² → kg·m²**, not grams inferred from the mass display label.
- Inside the export path, one IR/plan controls point and row identity, force incidence, comments,
  named results and the guide. Generated rate functions call the generated position assembly;
  generated force coefficients read that J transpose.
- The MATLAB runtime validator calls those same emitted equation functions. Its startup
  `validate_equations` compares emitted assembly to generated generic helpers and checks topology.
  This proves internal agreement when run; it cannot prove that both encode the right physics.
- Inside the application's simultaneous route, residual/Jacobian/second-order definitions feed
  both positions and rates. Application force graphs share cached `getForceAnalysis` results.
- Optional reference export uses the application's actual sample/channel path. It is a
  cross-check, not an input to MATLAB's position or force solution.

### What is still maintained separately

`analysis-equations.ts` declares itself independent of PMKS solvers. Import/call-site inspection
shows `analysisConstraints`/`analysisLinear` used by export preflight; `analysisState` and
`analysisForces` serve equation-contract tests rather than the application solver. Being under
`model/` does not make these the application's canonical equations.

There are currently multiple expressions of the body-point/constraint/force physics: the
TypeScript contract evaluator, mechanism-specific MATLAB templates, and generic MATLAB helpers
used for checks. Tests limit drift; they do not eliminate it. `equationPlan` itself combines
presentation choices (MATLAB identifiers/source strings) with semantic choices (force incidence,
driver-coordinate and body-balance rows). Only the semantic portion belongs in a future core.

Also, “independent MATLAB solving” does not mean independent discovery of the motion program.
The exporter uses PMKS's completed motion duration and recorded input speeds/times to derive
reversal segments. It does not read solved joint positions to calculate MATLAB poses, but the
range/reversal schedule still depends on the PMKS precompute. Future provenance should say whether
an event was explicitly prescribed or discovered by a runtime.

## Recommended canonical boundary

Use a pure, versioned module under `src/app/model/analysis/` (proposed, not created here).
It should have no Angular services, canvas coordinates, MATLAB identifiers or file paths.

```text
PMKS authored mechanism
  → one adapter: stable topology + physical SI values + drive/analysis policy
  → CanonicalAnalysisDefinition
      bodies/frames/CoMs/inertias, pins/guides, loads, gravity, prescribed motion
  → canonical coordinate and equation assembly
      row/unknown IDs, C, J, acceleration terms, physical force contributions
      reaction/effort maps, support policy, diagnostics and output mappings
       ├─ PMKS numerical executor → canonical results → display-unit adapter
       └─ MATLAB syntax renderer → .m files → MATLAB numerical executor
                         [future consumers possible; none added now]
```

Start with the supported overlap, not a universal solver language. The existing export body
coordinates are a reasonable candidate for a common rigid-pin/fixed-guide kernel, because they
already support CoM inertia and physical reaction mapping. Adoption into the application must
pass the existing corpus first. Preserve the existing simultaneous constraint primitives and
analytic derivatives as reviewed inputs to that decision; do not replace broad backend coverage
with the exporter's smaller constraint set.

The semantic definition should own:
- stable body, joint, constraint-row and reaction IDs; root/frame membership and local points;
- parameterization and reference orientation, units, row scaling and reaction dual conventions;
- elementary point transforms, constraint residuals, analytic first/second-order contributions;
- mass/inertia/load/gravity terms and signed Newton/Euler rows;
- authored/discovered drive-event provenance, side at a reversal and branch signature;
- supported capabilities, diagnostics and tolerances; explicit policy for redundant supports.

To make this actual shared mathematics, both consumers must use **one expression definition**
for each supported primitive and assembly operation. A small typed arithmetic/matrix expression
representation for the existing primitives can be evaluated in TypeScript and printed as MATLAB.
It needs no symbolic solver or algebra simplification. Merely sharing interfaces, moving template
strings into `model/`, or writing a second MATLAB renderer by hand from TS formulas is insufficient.

For the existing joint-coordinate route, retain coordinate/boundary maps until migration is
demonstrated. Do not use that J transpose as physical joint reactions without deriving the
coordinate and row-normalization dual mapping: a distance-normalized constraint multiplier is
not automatically the same quantity as a body-coordinate pin reaction.

Keep MATLAB-specific syntax, escaping, names, function/file organization, plots, README,
report text and ZIP orchestration under export. Keep numerical linear algebra and continuation
implementations runtime-specific, but make their acceptance, event and failure contracts explicit.
Different backslash/pivot/damping algorithms need not agree bitwise. Optimized geometric paths
may remain only with a stated equivalence contract and canonical postchecks; until all relevant
paths consume the definitions, describe unconverted paths as legacy, not “fully shared.”

## Physical dynamics correction is a separate task

The application call chain is `getForceAnalysis → analyzeMechanism → frameAt → analyzeFrame`.
It supplies stored model-coordinate positions/CoMs and linear accelerations. ForceSolver uses
physical `distanceToM` on those lengths without removing `MODEL_SCALE`; physical mass/inertia
factors then multiply incompatible linear/rotational scales. The sampler subsequently divides
torque by `MODEL_SCALE`. That display adjustment does not establish physical dynamic equivalence.

The exporter removes `MODEL_SCALE` on entry and solves in SI. Existing package equation tests
compare to ForceSolver on explicitly converted **physical-coordinate fixture frames**, not to
the application's uncorrected displayed dynamics. Preserve that distinction in all reports.

The future backend fix should enter the canonical physical model **before** moment arms,
linear accelerations and load moments are assembled. Rendering scale stays in adapters; solved
forces and torque leave core in N and N*m, and display conversions happen once. Add scale/unit
invariance tests before changing the backend. Never calibrate MATLAB to the current defect.
The backend's finite-difference fallback and minimum-norm shared-support behavior also require
separate policy decisions, not implicit inheritance into the exporter.

## Durable mechanism-validation matrix

Use [FIXTURE_GALLERY](../src/test-utils/verification/fixture-gallery.ts) and generated fixture URLs
as the mechanism inventory, with stable case IDs and manifests. Keep demonstration mass/inertia
distinct from measured data and original zero-mass templates.

For every eligible case collect joint position/velocity/acceleration, body angle/angular
velocity/angular acceleration, CoM position/velocity/acceleration, signed joint/body reactions,
driver torque, C/Jv-b/Ja-b residuals and force/moment residuals. A kinematics-only case marks force
channels **not applicable**, rather than fabricating zeros or a pass.

| Case | Structural/physical focus | Numerical comparisons | Events and qualification |
| --- | --- | --- | --- |
| Original M1 four-bar kinematics | A/B/C/D, ground A/D, AB/BC/CD, exact initial properties/driver; no force files | All joint/body/CoM kinematics and constraint/rate residuals | Full-cycle closure and assembly; original masses remain zero |
| M1 dynamic demonstration | Same geometry; explicit 0.2 kg and 0.0001 kg*m² per body | Full channel set including reactions/torque and each body's Fx/Fy/M | Compare corrected physical backend separately from current app readouts |
| Fixed-guide slider-crank | Guide normal, coincidence and translation-only block; no slider moment row | Full eligible channel set, guide-normal reaction and zero tangential constraint force | Sign/orientation variations; unsupported slide types remain refusal cases |
| Stephenson III / multi-loop six-bar | Ternary body, multiple loops, reactions keyed by body | Full channel set and per-loop/per-body closure/balance | Record branch and each reversal; compare event sides explicitly |
| Tracer-point four-bar | Rigid local offsets; adding tracer creates no reaction unknown | Tracer position/rates, CoM and angular motion; unchanged original forces | Adding/removing tracer must not change the mechanism solution |
| Static loaded case | Nonzero off-center global/local load; gravity on/off; inertia ignored | Reactions/torque and Fx/Fy/M residuals; kinematics where requested | Static force result independent of imposed speed and mass inertia term |
| Dynamic loaded case | Custom CoM, nonzero inertia, local/world load transport | Full channels, inertia/load balance; power as an independent check | Speed scaling: inertia scales with speed squared; gravity/load contribution separated |
| Reversing drive | Signed speed, compact events, elapsed time, initial assembly | One-sided joint/body rates and force channels; positions through event | No finite acceleration/impulse claim at an ideal velocity jump |
| Near-singular / limiting pose | Branch signature, rank and dimensionless conditioning | Positions where finite; derivatives/forces only on justified valid frames | Gaps/stops/warnings recorded; never silently widen exclusions |
| Unit/render-scale variants | Same SI mechanism in cm/m/in and different drawing scales | Identical physical channels within numeric tolerance | Detect MODEL_SCALE leakage, mass/inertia unit mistakes |
| Redundant/unsupported system | Support-policy identity and capability manifest | Only defined unique physical quantities; otherwise explicit refusal | Existing PMKS support splitting must not become an unannounced MATLAB promise |

Comparison classes:
- **Exact/structural:** IDs, incidence signs and normals, root/ground/tracer classification,
  units, command/event metadata, included files, output-channel mappings, deterministic output
  and explicit capability/refusal policy. Once a common assembly exists, compare its symbolic
  structure and row/column mapping exactly. Current differently parameterized matrices are not
  expected to match entry for entry.
- **Numerical tolerance:** physical series, C/J/second derivatives at mapped probes,
  forces/torque, residuals and independently differentiated point motion. Include off-constraint
  probes, finite-difference derivative checks away from singularities, equal/opposite reactions,
  known hand-calculable equilibria and unit invariance so shared bugs can be detected.
- **Qualitative only:** figure readability, path shape/topology and diagnostic usefulness.
  Visual agreement is never sufficient evidence for a numerical channel. Status categories and
  exclusions should become structural assertions once the policy is pinned.

Retain current documented thresholds as the initial baseline: export core position closure
1e-8 per SI row; rate/equilibrium 1e-8 absolute plus 1e-8 cancellation-aware scale; current
cross-implementation package tests use 1e-6 positions and 1e-4 rates/cycle-normalized forces.
Record units, normalization and conditioning alongside each threshold. These are different
checks, not interchangeable numbers. Tighten or justify case thresholds from runtime evidence;
never loosen them solely to make three sources agree.

A durable run manifest should record source/generator commits, canonical-model version/hash
when available, geometry/properties, units, solver route, runtime version, force mode, input
speed and event side, assembly signature, selected channels, sample alignment, finite/failed
counts and every exclusion with reason. Retain raw outputs and residuals, not just maxima.
Fixtures are versioned; artifacts and runtime reports can be retained by CI or attached to the
case record without putting huge generated histories in the application bundle.

## Historical PMKS_Verification as a third benchmark

Keep [PMKS_Verification](https://github.com/PMKS-Web/PMKS_Verification) as an external historical
workflow and benchmark source. Do not copy its topology-specific solvers into the application.

The locally inspected verification checkout is `5882a1ac5de0942105e03c95d5ee8dfc24722941`.
Its README and `reference-data/v1/README.md` distinguish trusted v1 contracts from legacy
outputs and diagnostic-only data. Its “PMKS” oracle is a pinned .NET PMKS fork, **not this
Angular application's current TypeScript solver**. Its MATLAB R2024a/Symbolic toolchain also
does not establish execution of our base-MATLAB R2016b-targeted generated packages.

Existing application [Stephenson III tests](../src/tests/verification/stephenson-iii-ex2.spec.ts)
use checked-in historical tables and explicit adjacent-reversal exclusions; the test-utils
verification suites and fixture data should remain benchmarks during migration. Do not silently
promote old tables to a new trust level or widen their exclusions.

A future three-way run should:
1. Pin a reviewed historical case and its source metadata. For Stephenson, match Example 2's
   exact geometry, mass/CoM/inertia, 50 N output-link load, gravity and speed. The gallery/export
   fixture's drive speed must be explicitly reconciled with the historical 10 RPM test.
2. Run the **current application solver**, the **generated MATLAB package in MATLAB**, and use
   a provenance-qualified historical result as three separately labeled sources.
3. Normalize to documented physical units and stable joint/body identities. Align by input
   angle, sweep/direction, assembly and event side (and elapsed time when commands agree), never
   just row number. Use the historical v1 alignment contract where that is the chosen dataset.
4. Compare all eligible vectors/scalars using their declared tolerances, retaining separate
   pairwise comparisons and each source's own residuals. Diagnose disagreement, not majority-vote.
5. Honor trust limits: the inspected v1 metadata calls teaching CoMs diagnostic-only and
   Stephenson Example 2 dynamics Newton/Euler-consistency checked, not externally corroborated
   dynamics. Historical slider reactions/static cases are not validated by an absent oracle.
6. Record every excluded event sample and condition measurement. Passing old data cannot
   substitute for actually executing a newly generated package.

Historical results remain test inputs only, never a runtime solver dependency.

## Migration stages and gates

1. **Now: freeze and obtain real MATLAB evidence.** Run M1 kinematics, M1 dynamic, slider-crank
   and Stephenson packages. Return `pmks_validation_report.txt`, MATLAB version/errors/warnings,
   generated figures and numerical comparisons. Fix only demonstrated defects before expansion.
2. **Pin conventions and baseline artifacts.** Establish manifests, coordinate/output mappings,
   event sides, support policies and the matrix above. Audit mass/inertia and scale boundaries.
   This is a prerequisite for both backend correction and equation extraction.
3. **Introduce the physical definition seam and correct dynamics in a separate branch.**
   Feed physical SI state/properties to backend equilibrium, with unit/scale-invariance checks.
   Preserve original authored properties; publish the changed readouts and provenance. Do not
   bundle a full position-solver replacement into the scale fix.
4. **Extract canonical primitives and assembly for the supported overlap.** Move semantic
   topology, point/constraint derivatives, load terms, reaction signs and body balances into the
   pure core. Retain existing simultaneous primitives as regression evidence. Keep MATLAB
   naming/comments/files outside. Both evaluator and code renderer consume the same definitions.
5. **Pilot PMKS execution against that assembly.** Run common four-bar/slider cases through
   the new path in tests, compare to retained legacy behavior and actual MATLAB outputs, then
   multi-loop/tracers/reversals/near-singular cases. Do not claim ownership convergence while the
   app still only calls a legacy solver and the canonical evaluator is used solely in tests.
6. **Migrate deliberately, then retire duplicate formulas.** Preserve unsupported backend routes
   and their tests until covered, benchmark precompute responsiveness and multi-mechanism state,
   and retain independent benchmark/invariant tests. Only after the matrix passes should the
   application default change and duplicated export/test formulas be removed. Future exporters
   become syntax consumers of this same core, not new mechanics implementations.

Principal migration risks are hidden branch changes, turning solver thresholds into physical
claims, changing redundant-support semantics, lost custom-CoM/compound identity, global solver
state leaking between mechanisms, performance regressions, and false confidence from two outputs
sharing the same bug. A shared equation model reduces maintenance drift; it increases the need
for independent physical invariants and provenance-qualified benchmarks.

## Audit outcome

No runtime code, generated capability, force backend, UI or plotting behavior is changed by this
audit. The architecture and user-facing feature remain frozen at the reviewed baseline until
real MATLAB results are available. Branch publication is a source-code handoff, not proof of
MATLAB runtime correctness or completion of the canonical migration.

**Yes, PMKS can eventually generate MATLAB representing its own backend mathematics.**
The target is the same canonical model, constraints, equation assembly, physical assumptions,
unit/sign conventions, drive and force semantics, with different numerical runtime implementations.
That target is **partly prepared, not yet implemented**.

**Actual MATLAB runtime execution: NOT VERIFIED**
