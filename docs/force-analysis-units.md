# Force Analysis: physical inertia and moment units

> **Status:** Reference — implemented locally on `feature/force-analysis-inertia-scaling`, based on `origin/staging` at `acba1b770a20551b37a9b2f24b459c224c8ed0fc`. Not merged or published.

## Scope and branch boundary

This corrects prescribed-motion Force Analysis. It does not change the position or kinematic solvers, automatic body properties, friction, stress, or introduce force-driven motion.

`feature/friction` is frozen at `278d9e55`, feature-complete V1 and ready for PR with its documented In-motion limitation. Preserve its safeguards, compact panels, disclosures, overlays, persistence, exports and independent verification. Integrating the correction or changing that guard requires a separate, explicitly requested task. The primary `feature/analysis-results-table` worktree is unrelated and was not edited.

## Authoritative boundary

Let `S = mechanism.coordinateScale` and `d = siUnitFactors(unit).distanceToM`.
One geometry coordinate is **d/S meters**. Application mechanisms explicitly use `MODEL_SCALE` (currently 200); direct domain fixtures default to 1. A positive finite scale is required. This is geometry metadata, not a user setting, URL format change or a second physical unit system.

```text
URL / entered length in user units
           │ × MODEL_SCALE on application construction
           ▼
Joint positions, link CoMs, force application points (coordinates)
           │ position / analytic or finite-difference kinematics
           ├── linear velocity: coordinates/s
           ├── linear acceleration: coordinates/s²
           └── angular rates: rad/s and rad/s² (angular position is degrees)
           │
           │ ForceSolver boundary: d / coordinateScale
           ▼
Moment arms in m; linear acceleration in m/s²
           + mass → kg; stored centroidal inertia → kg·m²; applied force → N
           ▼
ΣF = m aG; ΣMG = IG α, assembled entirely in SI
           ▼
Reactions / input force: N; input torque / guide couples: N·m
           │ AnalysisSampleService: physical display conversion only
           ▼
Graphs and ExportTableService → N, kgf or lbf; force-unit × length-unit moments
           ▼
CSV / XLSX / graph images / report share those same sampled numbers
```

Kinematic graph/export samples still remove `MODEL_SCALE` to show application lengths and linear rates in the selected units. Angular quantities do not receive a drawing factor. The force correction does not rescale the kinematic caches. Prismatic application drive speeds are stored in user length/s and multiplied by `MODEL_SCALE`; revolute RPM is converted to rad/s.

### Stored physical properties

| Length system | d (m/user length) | Stored mass → kg | Stored inertia → kg·m² | Stored applied force → N |
| --- | ---: | --- | --- | --- |
| m | 1 | kg × 1 | kg·m² × 1 | N × 1 |
| cm | 0.01 | g × 0.001 | **kg·cm²** × 0.0001 | N × 1 |
| in | 0.0254 | lbm × 0.45359237 | lbm·in² × 0.45359237 × 0.0254² | lbf × 4.4482216152605 |

The stored centimeter inertia unit is kg·cm², not g·cm². The property editor can display g·cm² and converts that selection separately to the stored unit. Millimeters are not a supported length-system choice. Displaying kgf does not change stored force magnitudes.

Automatic rod/lamina properties already remove the squared drawing factor. The stored-inertia factor applied to mass times coordinate² is `massToKg * distanceToM² / inertiaToKgM2 / MODEL_SCALE²`. Compound parallel-axis terms use the same dimensions. Manually entered inertia is already a physical user-unit quantity and must **not** be divided by S² at the force boundary.

## Reproduced defect, before production edits

Commit `26aa6d57` preserves the application-level regression on unchanged staging. A 4 cm rod has a CoM at 2 cm, stored at 400 coordinates. Its 1000 g mass is 1 kg and its drive is 1 rad/s. Kinematics correctly gives `aGx = -400 coordinates/s²`.

The physical acceleration is `-400 × 0.01 / 200 = -0.02 m/s²`. The old force assembly instead calculated:

```text
old Fx = (1000 × 0.001) × (-400 × 0.01)       = -4 N
new Fx = (1000 × 0.001) × (-400 × 0.01 / 200) = -0.02 N
```

The failure was at the force boundary, not the analytic acceleration calculation. The original physical assertion remains unchanged. The pre-fix log is `artifacts/staging-reproduction.log`.

### Why correcting acceleration alone is insufficient

| Term in application geometry | Previous effective dimensions/scaling | Corrected assembly |
| --- | --- | --- |
| maG | Linear acceleration too large by S | acceleration × d/S, mass × massToKg |
| IGα | Already physical N·m | unchanged physical inertia and rad/s² |
| r × reaction / inertial force | r too large by S; translational inertial contribution could be S² | r × d/S, physical N |
| r × applied force or gravity | Moment too large by S | physical m × physical N |
| Input torque and guide couple | Mixed moment convention | physical N·m |
| Torque display adapter | Divided every result by S, concealing applied-load scaling but suppressing IGα/S | physical torque-unit conversion only |

Mixed rotational and translational terms also contaminated dynamic reactions; a universal division of the final answer cannot repair that equilibrium system. The correction converts both moment arms and linear acceleration at assembly and removes the adapter's compensating drawing division.

Static reactions and user-visible Static torque retain their physical results. Raw application Static torque legitimately changes: 10 N at 0.20 m previously produced a raw 400, displayed as 200 N·cm after `/200` and `×100`. The raw result is now **2 N·m**, displayed directly as **200 N·cm**. This intentional contract change was explained before production edits. Direct physical domain fixtures with S=1 retain their numerical results.

## Implementation and consumers

- `Mechanism.coordinateScale` records the geometry convention. `MechanismService` supplies `MODEL_SCALE`; the URL-decoded test fixture builder does likewise. Reversed-drive copies retain metadata and reset their force cache through existing behavior.
- `ForceSolver.analyzeFrame` accepts the scale as its final optional argument. Series and legacy entry points propagate it. `metersPerCoordinate` is used for every linear acceleration and every reaction/applied-force moment arm. Normal/tangent directions and angular quantities remain dimensionless/radian-based.
- Guide-couple unknowns and input torque have SI moment coefficients. Translational actuator effort has force coefficients and returns N, including inclined guides and gravity.
- `AnalysisSampleService` converts N or N·m to the selected force/length display units, with no drawing compensation. Modern graphs and exports share it.
- The legacy `Mechanism.forceAnalysis` table now also receives the scale, removes it from geometry/rates, and converts translational input as force. Its historical metric torque header is N·m, including centimeter geometry; English torque is lbf·in. Its prismatic input header now correctly says input force. This compatibility table is not the modern Export Data pipeline.
- No active force consumer requiring the old raw drawing moment was found. Domain fixtures that construct unscaled geometry deliberately retain S=1. New callers supplying application geometry must explicitly supply the scale.

The mechanism-service lint cap rises by one non-comment line solely for the new constructor argument. The conversion behavior lives in the model solver; no new calculation or responsibility was placed in that hub.

## Independent references and numerical evidence

A separate local `PMKS_Verification` worktree lives under `artifacts/PMKS_Verification`, on its own `feature/force-analysis-inertia-scaling` branch from accepted `origin/master` at `5882a1a`. Commit `d57cb71c230d42f4991a96f587fd9344004a8753` adds only the experimental `verification/inertia_scaling/` directory. Accepted reference files and the separate friction verification branch remain unchanged.

`reference.py` uses scalar rigid-body equations about a fixed pivot or along an inclined slider. It imports no PMKS code and does not duplicate the PMKS constraint matrix. It generates 27 cases: seven pinned-body studies at three orientations and six slider studies. Its own power identities check actuator plus external power against the derivative of kinetic energy. The app vendors the JSON with commit provenance and a SHA-256 check over LF-normalized bytes. `force-scaling-reference.spec.ts` compares all 27 cases across m/cm/in and coordinate scales **1, 37 and 200**: 243 physical comparisons.

| Independent case | Physical data | Expected result |
| --- | --- | --- |
| A: centripetal | m=1 kg, r=0.02 m, ω=1 rad/s | inward force 0.02 N |
| B: tangential | m=2 kg, r=0.2 m, α=3 rad/s², ω=0 | tangential force 1.2 N; eccentric moment 0.24 N·m |
| C: balanced rotor | CoM on pivot, IG=0.08 kg·m², α=3 | input moment 0.24 N·m |
| D: applied load | 10 N downward at x=0.2 m | balancing input +2 N·m |
| Applied pure couple | equal/opposite 5 N forces, separated 0.4 m | 2 N·m, zero resultant load |
| E: combined, horizontal pose | m=2, r=0.2, IG=2×0.4²/12, ω=-2, α=3; gravity; 10 N downward at x=0.4 | reaction (-1.6, 30.8133) N; input +8.24266 N·m |
| Driven slider | m=2 kg, acceleration ±3 m/s², horizontal; gravity | input ±6 N; guide balances 19.6133 N vertically |

PMKS has no separate native external-torque load object on this staging base. The pure applied moment is represented by a force couple, rather than adding an unrelated load feature.

For the 2 kg, 0.4 m rod, automatic `IG = mL²/12 = 0.0266666667 kg·m²`. With α=3, its centroidal inertia torque is 0.08 N·m; the eccentric contribution is 0.24 N·m; a 2 N·m external-load requirement brings input torque to 2.32 N·m. Custom IG=0.08 kg·m² stays unchanged through actual cm→m→in→cm service edits. Both automatic and custom cases are covered.

The same physical torque is `2 N·m = 200 N·cm ≈ 17.70149158 lbf·in`. Tests compare normalized physical numbers from solver, kinematic samples, graph samples, modern export tables and the compatibility table, not just strings. The 2 cm radius is exactly `0.02/0.0254` inches, rather than the rounded 0.7874-inch example.

## Existing fixtures and broader regressions

| Fixture family | Trust classification and treatment |
| --- | --- |
| Closed-form force fixtures, inclined/driven sliders, uniform-body properties, new independent references | Physically checked within their stated assumptions; numerical expectations unchanged |
| Accepted external kinematic references and legacy six-bar MATLAB tables | Kinematic regression/reference coverage; do not promote them into a blanket force-unit oracle |
| Watt I and Stephenson III accepted dynamics data | Independent Newton–Euler consistency checks for their serialized parameters; not an independent end-to-end dynamic oracle |
| Teaching mechanisms with mismatched CoMs/mass/inertia and large legacy data | Diagnostic/regression coverage only; unsuitable for certifying physical torque without a parameter audit |
| UI snapshots, structural/display-contract tests, massless examples | Behavioral regression coverage, not independent physics evidence |

No existing expected physical force or moment literal was changed. URL-decoded fixtures gained explicit scale metadata. The only new expected values are derived analytically. Two gallery rows were added, leaving existing mechanisms intact.

`force-scaling-cycles.spec.ts` compares Static and In-motion results across three length systems for an offset-load four-bar, slider-crank with block mass/load, Watt I and Stephenson III with gravity, and Scotch yoke with welded guide couples. It also checks physical power through a four-bar cycle and exact Static/In-motion equality when mass and inertia are zero. The finite-difference fallback is separately exercised with prescribed θ(t)=2t+1.5t² and its independently known acceleration/torque.

**Precision boundary:** the position solver rounds to four coordinate decimals. Independently re-solving differently scaled geometry can therefore sample slightly different physical poses. The force-cycle comparison deliberately encodes identical sampled physical poses in each unit system, then recomputes kinematics/forces. Actual unit edits are additionally tested through `MechanismService`, and existing kinematic references run in the full suite. This correction does not alter position rounding; highly ill-conditioned or near-toggle mechanisms retain that pre-existing limitation.

## Validation record

- New scaling tests: 36 passing tests across three files, including 243 independent case comparisons, service unit edits, finite differences, modern export values, guide couples and power.
- Full application suite: **2533 passed, 3 failed**, 240 files. Force, acceleration/kinematics, mass/inertia, dynamics, unit conversions and gallery checks run in this suite.
- Production build and full-source type check: passed. The type check uses `.storybook/tsconfig.json`, `--rootDir . --skipLibCheck --types node,vitest/globals`; the declaration-library skip avoids unrelated Storybook/React dependency declarations, not application source checking.
- `npm run check`: passed (ESLint's 15 existing warnings, stylelint and Prettier). `git diff --check`: passed. The production build exits 0 with existing component-budget and CommonJS warnings.
- `PMKS_Verification`: `reference.py --check` passes 27 cases and power identities; `tools/validate_v1.py --require-sources` passes six accepted cases; `tools/check_dynamics.py --root reference-data/v1` passes two consistency cases (maximum normalized residuals approximately 8.417e-13 and 3.254e-15).
- MATLAB/Octave runtime was not found. Existing MATLAB force/kinematic routines were inspected. An independent `check_inertia_scaling.m` is supplied alongside the experimental Python reference but **MATLAB did not execute**.

The three remaining full-suite failures were reproduced before production changes on staging: MotionGen gripper span (1.036629237 versus >2.3), gripper closure error (1.051501 versus <0.0001), and the Windows stylesheet fence (99 rgba occurrences versus cap 87). A fresh CRLF worktree also exposed two existing raw-text LF assumptions in gallery/template source checks; regenerating the gallery and normalizing the template file's local line endings resolves those without changing an expected value or template payload. No semantic template change belongs in this patch.

Browser validation passed `e2e/force-inertia-scaling.mjs` (both numerical demonstrations, no page errors) and `e2e/force-units.mjs` (20/20 checks). Screenshots and the eight-frame mode-change filmstrip were visually inspected. Standard Codex computer use reported no available browser surfaces; the tracked Playwright suites used disposable profiles. The URL codec rounds the first example's RPM slightly: its raw horizontal force is -0.0199987577 N, displayed as -0.02 N; the exact unquantized service regression remains -0.02 N.

Logs are under `artifacts/`: `staging-full.log`, `final-full-tests.log`, `scaling-tests.log`, `guide-scaling-tests.log`, `export-scaling-tests.log`, `production-build.log`, `source-typecheck.log`, `check.log`, the browser logs and the verification logs. Prettier initially reported hundreds of unchanged CRLF files; local line-ending normalization leaves no semantic source diff for those files. The final patch does not contain a mass formatting change.

## Demonstration and future friction integration

The generated [fixture gallery](fixture-urls.md) contains **Centripetal force scaling** and **Physical applied-force moment**. Use those payloads on this branch's local server, not the published app: this branch is unpublished. Select Joint A and Force Analysis. For the first example, retain gravity, choose In-motion, expand Force on Link AB and choose X & Y components: the horizontal component reads -0.02 N and weight gives the vertical 9.81 N. The second example's Static input moment reads 200 N·cm. `e2e/force-inertia-scaling.mjs` retains these numeric/readout checks and screenshots.

**Existing UI readiness limitation:** gravity-free inertia alone does not satisfy the current requirement for gravity or an applied load before entering Force Analysis. It was not bypassed or changed in this branch. The isolated gravity-free 0.02 N magnitude is covered by the domain and real-service tests; the browser demonstration retains gravity and isolates the horizontal component. This limitation and coordinate/URL quantization remain separate from the corrected force-unit boundary.

This removes the identified foundational unit defect that motivated the friction In-motion safeguard. It is **not yet evidence that the guard can be removed**. Friction integration must reconcile its `analyzeFrame` extension with the new scale argument, convert contact radii and friction moment arms using the same physical boundary, preserve SI loads across its coupled reaction solve, and validate power, moving-guide/bearing cases, exports and overlays. Merely deleting the guard or dividing friction torque again would be incorrect.

Recommended sequence: review this correction independently; merge it to staging only when authorized; rebase friction onto the reviewed staging correction in a separate integration task; run both independent reference sets and combined application/browser checks. Keep the guard until that combined evidence passes. No integration, push or merge was performed here.
