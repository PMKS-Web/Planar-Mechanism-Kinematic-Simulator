# Joint friction

> **Status:** Partly built — prescribed-motion sliding friction and local static limits are implemented on `feature/friction`; forward dynamics and static holding solves remain future work.

**Current app limit:** Friction in **Static analysis** (which omits inertia) is supported.
This does not solve stationary holding friction. In-motion friction is refused for
bodies with nonzero mass or inertia because an inherited force-solver drawing-scale error changes
their bearing loads. Zero-inertia In-motion cases and unscaled domain calculations remain supported.
See the audit below; this restriction prevents unverified physical results from reaching users.

## Branch and purpose

Develop on `feature/friction`, created from `origin/staging` at `acba1b77` on September 12,
2026. The worktree is `.claude/worktrees/friction`. Keep this feature independent of
`feature/analysis-results-table`; its uncommitted work stays in the original checkout.
Any eventual pull request targets `staging`.

The requested feature covers friction between a slider and its guide, the distinction between
static and kinetic friction, and friction in revolute joints. Default friction must remain zero
so existing mechanisms and shared URLs retain their results.

## Physics

Friction acts between contacting bodies. Static and kinetic friction describe the state of the
same contact, rather than additional forces to add together.

### Prismatic joints

For a guide tangent **t**, signed guide-normal reaction Rn, and relative sliding velocity v:

- Normal load: `N = abs(Rn)` for the proposed ideal single-resultant guide contact.
- While sliding: `Ff = -muK * N * sign(v)` along **t**.
- While sticking: `abs(Ff) <= muS * N`, with the actual force determined by equilibrium.
- At impending slip: the force reaches the static limit in opposition to the proposed motion.

The normal load must come from the coupled force balance. It is not generally the slider's
weight: link forces, guide angle and inertia contribute, and friction changes the reactions.
Apply equal and opposite forces to the block and its carrier; ground is the carrier for a fixed
guide. In a moving slot, evaluate velocity relative to the carrier at the contact point, including
the carrier's rotation. World velocity alone gives the wrong friction direction.

A welded guide can also transmit a couple. Its net normal resultant does not determine the sum
of contact loads at separated bearing surfaces: a pure couple can exist with zero resultant.
Supporting load-dependent friction for that physical model requires bearing spacing and a contact
load distribution, or an explicitly identified approximation. Do not silently treat a loaded,
moment-carrying guide as frictionless because its net normal reaction is zero.

### Revolute joints

Use an explicitly labeled effective-radius bearing approximation for a simple pin connection:

- Radial load: `N = hypot(Rx, Ry)` for that bearing pair.
- Relative angular velocity: `omega = omegaBodyA - omegaBodyB`.
- Sliding friction torque: `Tf = -muK * N * effectiveRadius * sign(omega)`.
- Static limit: `abs(Tf) <= muS * N * effectiveRadius`.

Apply opposite torques to the connected bodies. The radius is a physical parameter, independent
of the SVG joint marker's radius. Ground has zero angular velocity. A welded connection has no
relative rotation and must not acquire a rotating-bearing friction torque.

A multi-link pin needs explicit bearing pairs and their loads. A single resultant at the joint
does not identify every rubbing interface. Either represent the pairs or explain that friction
is unavailable for that topology; do not assign the same torque to every incident body.

These are Coulomb approximations. Lubrication, viscous drag, Stribeck behavior, wear, temperature
and rolling-bearing losses are separate extensions; no material coefficients should be guessed
from the drawing.

Sources: MathWorks describes the [static/kinetic contact law](https://www.mathworks.com/help/sdl/ug/clutches-clutch-like-elements-and-coulomb-friction.html),
[loaded sliding contact](https://www.mathworks.com/help/sdl/ref/loadedcontacttranslationalfriction.html),
and [loaded rotational contact with an effective radius](https://www.mathworks.com/help/sdl/ref/loadedcontactrotationalfriction.html).
The particular bearing approximation and supported topologies above are proposed PMKS choices.

## Scope decision

PMKS currently prescribes the input motion, precomputes its positions, and then solves for the
input effort and reactions. Its existing Static and Dynamic force modes select whether inertia
is included. They do **not** select static versus kinetic friction: a quasistatic analysis of a
moving slider still uses kinetic friction.

Two distinct capabilities are possible:

1. **Required input effort and breakaway limits.** Retain prescribed motion. Include friction in
   the equilibrium equations, report the extra required torque/force and dissipation, and expose
   static holding limits or direction-specific impending-motion calculations. Friction changes
   the required effort; animation continues at its prescribed speed. A local static limit is not
   by itself the actuator torque needed to start the whole mechanism.
2. **Sticking, starting and stalling under an applied input.** Add forward dynamics with an
   applied force/torque input, evolving speed, and contact state transitions. The motion must be
   solved together with friction and inertia; editing a force-balance result cannot provide this
   behavior. This also changes input controls, sampling, animation, kinematic graphs and export.

**Maintainer decision, September 12, 2026:** implement the first option. Keep the second option
in these notes to revisit later. The implemented first step reports local static contact limits;
it does not yet solve the complete mechanism's startup effort envelope. Do not label it a stall
simulation.

At zero relative velocity, never automatically set friction to its maximum static value or
switch it off. Equilibrium may admit a range of forces. At a reversal, the moving solution can
have different one-sided limits. State the ambiguity or solve a specified impending direction;
do not invent a unique force by borrowing a sign from an unrelated previous frame.

## Implementation for prescribed motion

Select a supported pin or a slider's visible pin in Edit and open **Friction**. Set the static
and kinetic coefficients, and the **Effective Radius** for a pin bearing. **Apply Friction**
saves one undoable edit. Setting both coefficients to zero restores a frictionless contact.
The same section in Force Analysis reports normal load, signed friction effort, and the local
static limit at the current sample. Export Data offers these three quantities alongside the
existing reactions and input effort, which include the effect of friction.
It also reports **additional input effort from all friction**, computed as the total input effort
minus the frictionless solve at the identical pose, acceleration and external loading. This is a
signed force or torque in the input's convention, not a per-contact allocation. Export offers it
on the driven joint (or the visible pin of a driven guide).

`joint-friction.ts` owns parameters and validation. `friction-contacts.ts` resolves the contacts
behind a selectable pin and the refusal for a moment-carrying guide. `friction-analysis.ts`
iterates equilibrium and Coulomb loads with relaxation and an explicit convergence check.
`friction-motion.ts` supplies missing rates from the existing sampled-rate fallback. The URL
appends optional friction fields after the drive-speed field; decimal text uses `~` in place
of the section delimiter `.` so small radii and coefficients do not round to zero.

Supported contacts are simple grounded/floating guides with a free-turning block, and simple
pin bearings between two rigid root links or a rigid link and the frame. Moment-carrying guides,
multi-link bearings, pin friction against a free-turning block, and ambiguous shared support
loads require additional contact models. Existing settings remain accessible for removal when
a topology edit makes their contact unsupported. Zero relative velocity produces an explicit
diagnostic and a gap in force results, rather than a guessed static holding force.

The integration requirements were:

1. Add a dedicated friction model and validation, with per-contact static and kinetic coefficients
   and a physical effective radius for supported pin bearings. Reject nonfinite or negative
   values. Explain any chosen restriction such as `muS >= muK` rather than silently clamping.
2. Extend the URL codec additively. Omit default fields, decode old URLs as frictionless, and
   preserve settings through undo/redo, reload, joint cloning, unit changes and topology edits.
   `Mechanism.cloneJointAt` explicitly copies analysis properties and needs the new fields.
3. Add controls to the existing joint properties panel using the shared form blocks and edit
   permission service. A slider's marker may be a revolute joint attached to a `SliderBlock`;
   resolve its prismatic contact so its guide friction and pin friction have distinct settings.
4. Supply relative velocities for both force modes. The existing static force solve does not
   request kinematics, and acceleration-only `FrameKinematics` cannot determine friction signs.
   Any sampled fallback must respect moving carriers, nonuniform times and reversals.
5. Couple friction to the reaction solve in `ForceSolver.analyzeFrame`. Iterating once from a
   frictionless normal load is insufficient. Check convergence, equilibrium residuals and
   dissipative sign, and diagnose nonconvergence or an unsupported contact explicitly.
   Treat ambiguous shared-support load splits carefully: friction depends on those loads.
6. Include friction in body resultants, input effort, graphs and export. Expose contact load,
   friction force/torque, static limit and contact-state assumptions through an analysis service.
   Diagnostics must reach the existing readiness and result views. Do not depend on the separate
   analysis-table branch to make these results inspectable.

## Verification gates

- Zero coefficients reproduce the existing MATLAB and force fixture baselines.
- A driven slider under a known transverse load has `abs(Ff) = muK * N`, reverses sign with
  relative motion, and dissipates power: `Ff * v <= 0`.
- An inclined guide under gravity separates normal and tangential weight components correctly.
- A loaded slider-crank satisfies every body's force and moment balance with friction included;
  a second calculation that holds the frictionless normal load fixed must not be the oracle.
- A floating guide has equal and opposite contact forces, with sign set by relative motion.
- A supported pin bearing has the expected torque for known radial load and radius; opposite
  torques balance and `Tf * omega <= 0`.
- Static friction below the limit balances the required load without being forced to saturation.
  At the limit, direction-specific breakaway is distinguished from ongoing sliding. A reversal
  or ambiguous resting pose is reported according to the selected scope.
- Unsupported multi-link bearings and moment-carrying guide contact models are identified.
- Units, multiple independent mechanisms, parameter validation, save/load and undo/redo work.
- Publish any new mechanism in `FIXTURE_GALLERY` and regenerate `docs/fixture-urls.md`.
- Run relevant solver and codec unit suites, `npm run check`, production build, and targeted
  browser checks. Inspect screenshots of controls and a filmstrip for changing results.

If forward dynamics is selected, add event and energy checks for sticking, breakaway, stopping,
and restart, including timestep refinement. Numerical smoothing near zero is not proof of a
static sticking constraint.

## Deferred work

The maintainer is interested in returning to force-driven sticking, starting, slowing and
stalling later. That option needs an applied input force/torque instead of prescribed speed,
forward integration of the mechanism's motion, static-contact feasibility or complementarity,
and event handling at breakaway and stopping. Animation and all kinematic results must follow
that solved motion. Validate energy balance and timestep refinement before presenting it as
a physical simulation.

Related future work: direction-specific whole-mechanism breakaway effort, static holding
feasibility at rest, multi-link bearing pairs, and moment-carrying guides with bearing spacing
and separated contact loads. These are recorded here rather than represented by unverified
values in the current results.

## Validation on September 12, 2026

The final focused solver, parameter, URL, fixture-gallery and template-payload suites passed
106 tests. `e2e/friction.mjs` passed all 13 checks, including editing, invalid input, undo/redo,
reload, displayed torque units, export columns and live sample updates. Its screenshots and
animation filmstrip were inspected. `npm run check`, the production build, the Storybook build
and `git diff --check` passed.

The full unit run passed 2,512 tests and failed four. Three failures reproduce on unchanged
staging: two MotionGen gripper reference assertions and the Windows path handling in the
stylesheet color fence. The fourth was the template-payload check's literal-LF assumption;
it passes after normalizing this worktree's line endings. See
[tips-and-tricks.md](tips-and-tricks.md#friction-reads-motion-even-in-static-force-analysis).

## Rigorous follow-up audit

The baseline was commit `75ef54ee`, reviewed in full against `origin/staging` `acba1b77`.
There were no subsequent friction commits or uncommitted changes before the audit. A fresh fetch
confirmed that origin/staging remained current; local staging was older, so no backward rebase
was performed. Other worktrees were left alone.

### Corrections and numerical conventions

- Fixed single-link Duplicate dropping friction properties. Both single-link and batch copies
  now retain independent property objects. URL history, refreshed browser state, tiny radii,
  old records, malformed records with valid checksums, and the actual cm/inch conversion path
  have coverage. SVG/DXF are drawings, not mechanism-state import formats; friction persists
  through PMKS's URL/file/history codec, and numeric friction results through data export.
- Fixed the stationary threshold ignoring the internal drawing scale. Linear motion is
  approximately stationary when `abs(v_relative) <= 1e-9 m/s + roundoff`, with the floor converted
  into the supplied coordinate system. `FrictionMotion.coordinateScale` is 200 for application
  samples and defaults to 1 for direct unscaled domain calls. Angular motion uses `1e-9 rad/s`.
  Roundoff is `32 * Number.EPSILON * max(abs(incoming rates))` in the same rate units, accounting
  for cancellation when a carrier moves. These are deterministic deadbands, with no memory,
  smoothing, force blending or guessed static holding force. They are distinct from the force
  matrix's dimensionless singular-pivot tolerance. Sampled-rate truncation error may exceed
  roundoff near a reversal; exact one-sided breakaway calculations remain future work.
- The guide tangent is `(cos(slotAngle), sin(slotAngle))`; its positive normal is `(-ty, tx)`.
  Normal load is the absolute normal projection, never the total guide resultant. Pin load is
  the radial resultant for one supported pair. Output signs identify the receiving body.
- Force and moment equilibrium are re-solved with equal/opposite contact loads, with relaxation
  0.5 and a 100-iteration ceiling. Convergence requires a friction-effort change below
  `1e-10 * max(1, abs(old), abs(new))` for every contact. This finds a consistent equilibrium,
  not a proof of global uniqueness for arbitrary high-friction geometry. It may reject a
  physically solvable but poorly conditioned case. Failure returns a diagnostic and gaps,
  never the initial frictionless values as a successful friction result.
- Added the additional actuator-effort result to the domain frame, display adapter and export.
  Static capacity remains `muS*N` or `muS*N*r`, using the converged moving load. It is not the
  actuator breakaway torque. At rest the current inverse problem leaves friction/actuation
  underdetermined: below/at/above static-demand comparisons are **not** reported as solved.
- Native fields and Apply are disabled during playback, with the model's reason. Read-only
  results do not query edit permissions. Changing selection clears obsolete validation errors.
  The reusable section exposes its expanded state; nine gallery stories cover its states.

### Inherited In-motion limitation, reproduced on staging

A 1 kg bar drawn 4 cm long has its CoM at 2 cm. At 1 rad/s with no external forces, its required
centripetal reaction is `1 * 0.02 * 1^2 = 0.02 N`. The app's internal coordinates and linear
accelerations are 200 times the physical values. Staging's force assembly multiplies that
internal acceleration by cm-to-m without removing the drawing scale and returns **4 N**.
Angular-inertia moments and applied-force lever arms also use different scale conventions.

The no-friction probe was run against unchanged staging source and reproduced exactly.
`friction-inertia.spec.ts` retains the reproduction and verifies the refusal for affected
friction cases. An unscaled physical case verifies the expected 0.02 N bearing load and
0.00002 N*m resisting torque. Fixing the general inertia normalization must be a deliberate
force-analysis change: this branch preserves the explicitly required friction-disabled staging
behavior. Until that correction is verified, application In-motion friction with nonzero mass
or inertia is refused, including static-capacity readouts derived from those loads. Static mode
omits inertia and remains available. This is a material V1 limitation, not forward dynamics.

Internal torque outputs retain the existing force solver's drawing-length factor so existing
graphs remain compatible. `AnalysisSampleService` removes that factor and applies the shared
force/length conversions for display/export. Raw `valueSI` on an app frame is therefore not a
standalone physical torque API; a future stress/energy consumer must use the same boundary.

### Independent verification repository

Downloaded copies were found under `C:/Users/adg66/Downloads/PMKS_Verification-master/`.
They were preserved. The audit created a clean checkout of PMKS-Web/PMKS_Verification at
`artifacts/PMKS_Verification` in this worktree, on its own `feature/friction` branch, based on
`5882a1a`. Its local commit `0f2d7745efef285e35574878592ec09141fc1f5b` adds the independent reference.

The repository's reviewed v1 contract explicitly excludes friction. Its legacy teaching friction
script also uses frictionless pin loads and CoM-to-pin distances as radii, so agreement with
those old outputs would not establish this model's correctness. New cases live separately in
`verification/friction/`, labeled experimental. No reviewed v1 data was changed.

The Python generator derives closed-form guide equilibrium with signed-normal branch checks.
The MATLAB function independently solves the two-unknown equilibrium matrix for each branch;
neither imports PMKSWeb's implementation or uses its iterative algorithm. There are 560 rows:
70 crank angles, both motion directions, both transverse-load directions, with and without
ground-bearing friction. Power and rod moment balance are checked; deliberate corruption of
friction, normal load, bearing torque, and row count must be rejected.

PMKSWeb vendors the CSV in `src/test-data/friction/`, with source commit and normalized-LF SHA256
in `provenance.json`. The actual PMKS force solver is compared against all 560 rows in both
meters and centimeters (1,120 pose comparisons), including actuator effort and dissipation.
The independent generator and comparison can be rerun with:

```text
python verification/friction/reference.py --check verification/friction/reference.csv
```

No MATLAB or Octave executable was located. The new manually dispatched `friction-reference.yml`
workflow is ready to run MATLAB R2024a and compare its output, but it has **not** been executed:
the user explicitly prohibited pushing. Python checks are not labeled MATLAB verification.
Existing verification-repository schema checks (six cases), dynamics checks (two cases), and
14 contract unit tests pass locally.

### Examples and remaining extensions

The fixture gallery now contains a simple driven slider (100 N normal, 20 N kinetic resistance,
30 N static capacity), a loaded slider-crank, a loaded pin bearing, and combined pin/guide
friction. The simple block has no rigid-link manufacturing outline; its DXF reference entities
still round-trip. The gallery test now applies its rigid-body assertion only to rigid links.

Bearing friction is an effective-radius Coulomb approximation. It is not a rolling-bearing
catalog model. Future work includes the inertia correction above, stationary feasibility and
direction-specific startup envelopes, explicit multi-link bearing pairs, separated guide
contact loads, viscous friction, rolling resistance, lubrication/Stribeck curves, seals,
backlash/contact effects and user-defined laws. Arbitrary surface contact, stress/FEA, thermal
effects, wear and forward stick-slip integration are outside this branch.

### Final follow-up validation

- Focused friction domain, reference, component and persistence tests: **64/64**, eight files.
- Full application suite: **2,566 passed, three failed**, 2,569 tests in 245 files. The only
  failures are the two MotionGen gripper assertions and the Windows stylesheet path fence.
  A fresh unchanged-staging run of those two files reproduced all three (four tests passed).
  The separate unchanged-staging inertia reproduction also passed its one diagnostic test.
- `npm run check`: passed, zero errors and the existing 15 permitted lint warnings.
- Production build and static Storybook build: passed.
- Storybook/application TypeScript source check: passed using
  `tsc -p .storybook/tsconfig.json --noEmit --rootDir . --skipLibCheck --types node,vitest/globals`.
  The command supplies the repository root and globals needed by the configuration's broad
  source include. Dependency declaration checking is skipped because installed Storybook
  declarations reference the absent React renderer; this is not a dependency-type audit.
- `e2e/friction.mjs`: **15/15**; `e2e/friction-stories.mjs`: **9/9**;
  `e2e/ui-copy.mjs`: **17/17**. No uncaught browser errors. Gallery screenshots and the final
  14-frame interaction/animation filmstrip were inspected. On Windows the automatic contact
  sheet helper could not find its Unix Python candidates; the captured frames were tiled with
  the installed Pillow runtime and inspected separately.
- Independent Python reference: **560 rows and four corruption checks** passed. Existing
  PMKS_Verification contracts remain green: six schema cases, two dynamics cases, 14 unit tests.
  MATLAB execution is pending, as described above.
- `git diff --check`: passed. Builds, logs, screenshots, and the independent repository checkout
  are in this worktree's ignored `artifacts/`; only source, tests, provenance and notes are
  included in the application commit. No push or merge was performed.
