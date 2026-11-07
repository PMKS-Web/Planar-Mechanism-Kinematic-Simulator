# An independent numerical oracle for every verification mechanism

> **Status:** Phases 0 to 4 built, 2026-11-06. **Exudyn is chosen**; Simbody, the runner-up, is
> the intended cross-engine check, not yet built (see [Phase 0 results](#phase-0-results)). Of 202 published machines, **155
> are verified** against the oracle in their motion and forces (thirteen of them in part; many carry
> no force, and are checked to come out zero) and **43 agree they do not run**; **4 are
> excluded** whole by the manifest, and none is left unsupported by the exporter. PMKS+'s mobility
> agrees with the oracle's, at first and second order, on all 202 (see [Phase 4
> results](#phase-4-results)). There are **6 disagreements**, each with an issue (see [Phase 3
> results](#phase-3-results)). The plan was revised on 2026-11-03 after an external review (see
> [Review history](#review-history)).

## The problem

PMKS+ checks its solvers in three ways today, and only one of them is independent:

| What | Where | Covers | Independent of PMKS+? |
| --- | --- | --- | --- |
| MATLAB reference traces | `src/test-data/verification/` | 5 cases: four-bar, slider-crank, tracer, Watt I, Stephenson III | Partly. The MATLAB comes from a fork of the original PMKS, written by the same research group. |
| Self-snapshots | `template-baseline.ts` and similar | The templates | No. They catch *change*, not *error*. |
| Internal invariants | `constraint-residuals.ts`, `force-power-balance.spec.ts`, finite differences | Many fixtures | Partly. They catch inconsistency, not a wrong model of the physics. |

`FIXTURE_GALLERY` holds 74 mechanisms. They include floating slots, Slides, cylinders, frozen
cylinders, welded compounds, several machines in one drawing, and multi-loop linkages. None of the
mechanisms the reference data cannot express has ever been compared with a second solver. A bug
in a shared assumption, such as a sign convention, which body a reaction acts on, or how a weld
transmits moment, would pass every test we have.

## The goal

**Every library template and every gallery fixture is solved a second time by an established
multibody solver that shares no code or formulation with PMKS+. Every quantity the physics
determines uniquely is compared in CI.** A quantity the oracle cannot express, or that the physics
does not determine, is listed with its reason, never left out silently.

Agreement between the two solvers is evidence, not proof. A mismatch is a lead, not a verdict on
which side is wrong.

## Is this the right approach?

Yes, as long as the comparison is defined before the engine is chosen, and the limits below are
written down.

**Why it is right**

- PMKS+ solves by finding loops and walking dyads (`loop-solver`, `position-solver`), and by
  Newton–Raphson only where that walk fails (`simultaneous-solver`). The textbook alternative
  formulates the whole mechanism as one constraint set in body coordinates, Φ(q, t) = 0, and
  solves that (E. J. Haug, *Computer Aided Kinematics and Dynamics of Mechanical Systems*, 1989;
  P. E. Nikravesh, *Planar Multibody Dynamics*, 2nd ed., 2018). A loop-closure bug and a
  body-coordinate bug are unlikely to produce the same wrong number.
- Inverse dynamics (joint reactions and input effort under prescribed motion) is where a
  formulation difference earns the most. The force solver is the least checked part of PMKS+:
  only two of the five MATLAB cases carry dynamics.
- Reference data generated once and committed keeps `npm test` free of Python and the network.
  The existing MATLAB data already works this way.

**What it cannot do (out of scope on purpose)**

- **Edit semantics.** Holds, the cylinder `whatGives` ladder, re-anchoring and split joints decide
  *which* mechanism exists. They are design rules, not physics.
- **Readiness and wording.** Setup issues, refusals and family names stay with the existing specs.
- **Which assembly branch a reader meant.** The oracle starts from the drawn pose and checks that
  PMKS+ stays on that branch. It cannot say what the reader intended.
- **Reactions the physics leaves undetermined.** Where supports are redundant (PMKS+ records this
  as `sharedSupport` in `force-solver.ts` and splits the load evenly), any solver's split is a
  choice, not a measurement. Only the resultant and the equilibrium are compared there.
- **Semantic independence of the translation.** Converting a PMKS+ mechanism into the oracle's
  input is new code that reads PMKS+'s own data structures. Reading only start-pose data keeps the
  *computation* separate. It does not stop a shared *interpretation*, such as where a default
  center of mass sits or what a weld means, from leaking into both sides. Phase 1 tests the
  translation against independently specified cases for exactly that reason.

## The comparison contract (Phase 0, before any engine is chosen)

The review's main point was that the contract matters more than the engine. It has four parts.

### 1. Identical physical inputs

Two problem sources, kept apart:

- **Raw benchmark cases.** Textbook worked examples, the MATLAB v1 cases and closed-form
  mechanisms. Each is written once in the neutral schema by hand from its source, never exported
  from PMKS+. These test the translation layer and the oracle together.
- **Published cases.** Every gallery fixture and library template, exported from what the URL
  decoder produces. These test what a student actually opens.

Today `fixturePayload` calls `buildMechanism`, which runs the solver, and the published path also
rescales to model units and can change speeds, masses and loads. The exporter therefore needs a
**non-solving builder** first: construct and serialize without solving, enforced by making the
solver entry points throw during export.

### 2. Classify every quantity before comparing it

For each mechanism, the oracle records the rank of the constraint Jacobian, both before and after
the driver is added, with scaled thresholds and the smallest singular values. Each output quantity
is then classed as one of:

| Class | Meaning | Compared how |
| --- | --- | --- |
| Unique | The physics fixes it | Against tolerance |
| Resultant only | Redundant supports: only the total is fixed | Resultant, plus equilibrium residuals |
| Convention | Depends on a sign or body choice | After an explicit, tested conversion |
| Undefined | For example, the internal force of a frozen cylinder, or the acceleration at an instantaneous reversal | Not compared; listed |
| Unsupported | The oracle cannot model it yet | Excluded with a reason |

That is why mobility classification moves from the old Phase 4 into Phase 0.

### 3. Motion as explicit segments

- Samples are keyed by **driver coordinate** (angle for a pin, travel for a slider), sweep segment,
  direction and branch. They are not keyed by rounded whole degrees: `alignRows` in `compare.ts`
  rounds rotary travel to integer degrees modulo 360, which cannot align a linear driver or
  adaptive sampling.
- The oracle **brackets and refines** each geometric singularity and each travel limit (slot end,
  cylinder stroke) independently. A Newton step that fails to converge is reported as a solver
  failure, never as a toggle.
- The oracle continues **past a reversal** onto the return segment, so PMKS+'s return sweep is
  checked too. Smooth segments are compared on their own. Reversal samples are named and treated
  as `undefined` for acceleration.
- PMKS+'s reversal must fall within one sample of the oracle's refined toggle. That makes a
  toggle disagreement a test failure instead of an exclusion.

### 4. Tolerances justified by method

PMKS+ produces some numbers analytically and some by differencing. `finite-difference-kinematics.ts`
fills rates the analytic solver leaves blank, using a central difference over 1° samples, and
differences again for acceleration. For a sinusoid that alone is about 5×10⁻⁵ relative error, so
one global 1e-6 tolerance cannot hold. (The 4-decimal rounding in `mechanism.ts` affects only
exported CSV, not the solver output the specs read.)

So each comparison carries:

- a dimensional **absolute floor**, scaled to the mechanism's characteristic length, speed and
  force;
- a **relative** term, set by the method that produced the number: analytic, singly differenced
  or doubly differenced;
- a **conditioning limit**: samples whose Jacobian condition exceeds it compare positions only.

Phase 0 runs step-refinement experiments (½° and ¼°) to measure the real error of each method,
and the budgets are set from those measurements. A wider budget is justified by method, never
granted to a single case.

## Which solver

**Chosen in Phase 0: [Exudyn][exudyn].** [Simbody][simbody] passed too and becomes the
cross-engine check in the nightly. [PyChrono][chrono] was ruled out. The measurements are in
[Phase 0 results](#phase-0-results). The table below is the brief the trial was run against.

| Candidate | Strength | What Phase 0 must prove |
| --- | --- | --- |
| **Exudyn** | Native planar bodies and joints (`RigidBody2D`, `RevoluteJoint2D`, `PrismaticJoint2D`). Installs with pip. Exposes the solver's constraint Jacobian. Published (Gerstmayr, *Multibody System Dynamics*, 2023). | A full integration-free route: the acceleration right-hand side, driver derivatives, mass and load terms, and what its Lagrange multipliers mean physically. |
| **Simbody** | Planar mobilizers. Prescribed-motion realization yields accelerations, multipliers and driving forces directly. The engine underneath OpenSim; assess Simbody itself, not OpenSim. | Closed-loop assembly and velocity consistency on our cases. How it packages for CI. |
| **PyChrono** | Strong publication record (Tasora et al., 2016). | Its assembly documentation uses small integration steps for velocity and acceleration assembly, so precision must be shown by step convergence. Planar motion needs correctly constrained 3D bodies, not only Z-aligned axes. |
| MBDyn | Established research code. The manual describes kinematic and inverse-dynamics problems. | Its older manual labels inverse dynamics as under development. Only a candidate if current capability is shown. |
| Drake | Official pip wheels exist. | Its inverse dynamics takes a given acceleration; recovering closed-loop reactions is our own adapter work. Likely more effort than Exudyn. |
| SymPy mechanics, or a hand-written Haug/Nikravesh solver | Fully transparent. SymPy documents a closed-loop four-bar with constraint forces. | Used to **generate raw benchmark cases** in any event. Becomes the main oracle only if no library passes, and then carries no outside validation record. |

MuJoCo is ruled out: it closes loops with soft constraints.

## Architecture

```
raw benchmark cases (hand-written)      FIXTURE_GALLERY / library templates
              │                                     │  non-solving builder → URL codec → decode
              │                                     ▼
              └──────────────►  oracle problem JSON (schema vN)
                                     │
                                     ▼
                       oracle/ (Python, uv-locked) ── run.py → Exudyn
                                     │
                                     ▼
              src/test-data/oracle/<case-id>.json   (committed, generated, Prettier-ignored)
                                     │
                                     ▼
              src/tests/verification/oracle.spec.ts (Vitest)
```

- **The problem schema is the contract.** It describes bodies with mass, center of mass and
  inertia; attachment points; joints with their constraint count; drivers; loads (global or
  local); gravity; travel limits; and the sweep plan. It is versioned like the URL codec.
- **Each reference file embeds** the schema version, the oracle and library versions, the class
  of every quantity, the tolerances and the exclusions, plus one **staleness hash**. That hash
  covers the canonical problem JSON, the exporter and runner source, the dependency lock and the
  settings, so a change to the generator makes the reference stale just as a changed fixture
  does.
- **The spec compares the current force API**: reactions per `(joint, body)` pair, Slide couples,
  and the actuator effort typed by driver (torque for a pin, force for a slider). The legacy joint
  force map that `solve.ts` reads today is not enough.
- **The spec checks the exact file inventory**: one reference per case, none missing and none
  left over from a deleted case.

## Equivalence rules (Phase 1)

Each rule is one documented exporter function. Each states its equations, its constraint count,
how mass is treated, which forces it exposes and its travel bounds, and each has its own spec.

- **Bodies and welds.** A `RealLink` is one body. A welded compound (`subset`) is one body whose
  mass, center of mass and inertia are aggregated with the parallel-axis rule. A weld merges the
  bodies that meet at that joint. A *grounded* welded pivot does **not** weld the turning body to
  ground: welding fixes the bars to each other, not to the frame.
- **Pin-in-slot versus prismatic.** A pin-in-slot (`PrisJoint` with `rotates`) is **one**
  constraint: the point stays on the line. A Slide (`rotates` false) is **two**: on the line, plus
  the rotation lock. The lock is set explicitly in every case, never left to a library default.
- **Sliders.** A grounded slot is to ground; a floating slot is to its carrier, along the line
  through carrier joints a→b. The block's own mass (`PrisJoint.mass`) is a point mass. Several
  riders on one slider are handled explicitly. Slot ends are travel limits.
- **Cylinders.** Barrel and rod are two bodies with a prismatic pair, with stroke limits. A frozen
  cylinder (S25) is folded into its body: its mass and loads are aggregated once, without double
  counting, and its internal force is `undefined`. A passive cylinder adds a freedom (S30). Whether
  the whole mechanism is then under-driven is the rank analysis's answer, not an assumption.
- **Several machines.** `partitionMechanisms` groups chains that share a ground pivot. Shared
  geometry is grounded only after it is proven fixed, and a whole-drawing versus per-partition
  equivalence test confirms the split changes nothing.
- **Conventions.** Y points up. Angles are counter-clockwise positive. Negative `driveSpeed` is
  clockwise (`drive-direction.ts`). The oracle works in SI, converted once at the edge.

Tested on their own: a slot axis reversed (b→a), an oblique moving carrier, a custom center of
mass, local versus global loads, and every unit and speed conversion.

## CI integration

- **Required `test` job.** It runs `oracle.spec.ts` against the committed JSON, with no Python.
  It fails on a stale hash, a missing or extra reference, or a comparison outside budget. Its
  added time is measured in Phase 1, not assumed.
- **New `oracle` job, always reporting.** It runs on every pull request so it can become required,
  but skips the expensive step unless the change could affect references. The trigger is broad
  on purpose: `src/app/model/**`, `src/app/services/transcoding/**`, `src/test-utils/**`,
  `src/test-data/oracle/**`, `oracle/**`, the library templates and the workflow itself. When it
  runs, it regenerates every reference on **pinned Linux** and fails if any tracked file changed
  or any untracked file appeared (`git status --porcelain`). The regeneration leaves a reference
  alone when it reproduces it numerically (see [Reproduction across
  platforms](#reproduction-across-platforms)), so a reference written on macOS passes on Linux and
  the reverse. It becomes required once green for two weeks.
- **Two nightlies**, in `.github/workflows/oracle-nightly.yml`. A *pinned* regeneration confirms
  the committed references still reproduce. A separate *upstream* run installs the newest Exudyn
  patch release over the lock and solves again with `PMKS_ORACLE_NUMBERS_ONLY=1`, which lets the
  generator differ and asks only whether a number moved. Either failing opens or updates one issue
  labelled `nightly-oracle`, and a green night closes it. Scheduled workflows run off the default
  branch (`main`, see the note in `e2e-nightly.yml`), so both check out `staging` explicitly, and
  neither runs until a release carries the file to `main`.

## Keeping it current

- **Adding a mechanism**: add it to `FIXTURE_GALLERY` as today, run `npm run oracle` (which wraps
  the uv runner), and commit the JSON. Until then the spec fails and names the case, just as it
  does with `npm run fixture-urls`.
- **An exclusion** in `src/test-data/oracle/manifest.ts` names the case, the quantity, the samples,
  the reason, a tracking issue, an owner, and the condition under which it is reviewed. The spec
  reports verified coverage and excluded coverage separately, and this document's status line
  carries both counts.
- **Triage of a disagreement**: first the exporter's equivalence rule, then the oracle model, then
  PMKS+'s solver. Never loosen a budget for one case.
- **Changing a PMKS+ solver** never regenerates oracle data. If the spec goes red, either the
  solver change is wrong, or it fixed something the manifest excluded, in which case delete that
  exclusion.
- **Upgrading the oracle library** is its own pull request: bump the lock, regenerate, and attach
  the runner's diff report (largest change per quantity per case).
- **A new joint type or feature** extends the schema and the exporter, adds one raw benchmark case
  that proves the mapping, then retires the matching exclusions.
- **Keeping the other witnesses.** The MATLAB v1 data, the power-balance and equilibrium residuals,
  and transformation tests (translate, rotate, rescale units, speed and loads, which must change the
  answers in known ways) all stay. The oracle adds a witness; it replaces none.
- A short project skill, `.claude/skills/oracle/SKILL.md`, carries the commands and the triage
  order, so an agent that adds a fixture also regenerates its reference.

## Phases

| Phase | Delivers | Done when |
| --- | --- | --- |
| **0. Contract and spike** | The comparison contract above. The non-solving builder. Raw benchmark cases: a four-bar, a slider-crank, Stephenson III Ex. 2, a closed-form dynamic case, a floating slot and a redundant support. Exudyn, then Simbody, then PyChrono attempt them. | For each library: agreement with the raw cases and MATLAB v1; integration-free rates and reactions shown; rank classification working; cold CI install time; determinism on pinned Linux. Step-refinement measurements set the tolerance budgets. One library is chosen and recorded here. |
| **1. Kinematics: pins, grounded slots, welds** | Schema v1, exporter, runner, `oracle.spec.ts`, manifest, new alignment by driver coordinate | Textbook worked examples (such as Norton, *Design of Machinery*) and the five MATLAB cases agree three ways. The classic gallery fixtures pass. The equivalence-rule specs pass. |
| **2. Inverse dynamics** | Reactions per `(joint, body)`, Slide couples, typed actuator effort, gravity on and off | The force fixtures and the two MATLAB dynamics cases agree. Redundant supports compare resultants. Power balance holds inside the oracle too. |
| **3. The rest of the gallery** | Floating slots, Slides, cylinders (driven, passive, frozen), several machines, travel limits, return sweeps | Every gallery entry and library template is `verified` or carries a full exclusion record. The CI `oracle` job is required. |
| **4. Mobility cross-check** | The oracle's rank analysis against `mobility.ts` for every mobility and student-mistake fixture | They agree, or each disagreement is explained. These are the cases where Gruebler's count is wrong and the geometry decides. |

## Phase 4 results

Measured on 2026-11-06. `oracle-mobility.spec.ts` compares PMKS+'s mobility
(`model/mechanism/mobility.ts`) with the oracle's for every published machine, 202 of them, at
the drawn pose, and **they agree on every one**, at first order and at second. No manifest entry
leaves a machine's mobility out.

### The oracle's second-order test

Phase 0 counted freedoms by the rank of the constraint Jacobian alone, which is first order: a
tangency, where two constraints touch rather than cross, looks free. `oracle/pmks_oracle/mobility.py`
now puts every first-order flex to the second-order question. A flex v of the null space survives
when uᵀΦ_qq[v, v] = 0 for every left null vector u, the constraint forces that could stop it;
so for each u the oracle forms the quadratic form A_u[i, j] = uᵀΦ_qq[n_i, n_j] over a basis of
the null space, by polarizing a Richardson-extrapolated second difference of the constraints
(step 10⁻³ of the machine's size), and the flexes that survive are the common kernel of every
A_u, with a zero threshold of 10⁻⁶ over that size. This is the classical test, and is
sufficient where the forms are definite; it is not a full higher-order analysis, and no
published machine needs one.

The reference records `second_order_freedoms` and `second_order_driven_freedoms` beside the
first-order counts. A machine runs when it has one second-order freedom and holding its driver
leaves none but dead ones: the first-order flexes that second order removes are not motions.
Where first order finds more than one free direction, the sweep's tangent is the one flex that
survives.

`oracle/tests/test_mobility.py` holds it to four raw cases: the redundant parallelogram (one
freedom at both orders, one redundant constraint), the MotionGen gripper (two at first order,
one at second), the slotted lever with a rod that cannot tilt (one, then none), and Norton's
four-bar (one at both, nothing redundant).

### What it changed

| Machine | First order | Second order | Effect |
| --- | --- | --- | --- |
| MotionGen gripper | 2 | 1 | Each jaw rides two parallel slots at one height, so carriage and jaws can turn together to first order and not to second. It was excluded as "the oracle's rank test is first order"; both solvers now agree that it runs and how far, and its rates and forces are compared. Its poses are not, as an oracle limitation: the turn is held only weakly at second order, so a converged pose is fixed along it to the square root of its residual over that curvature, and re-solving the oracle's own pose at k = −11 moves it 8.7×10⁻⁶ of its size, against a pose budget of 10⁻⁷. Its rates are past the conditioning limit throughout |
| Slotted lever with a rod that cannot tilt | 1 | 0 | Rigid. The oracle used to walk it and stop at a solver failure; it now agrees with PMKS+ that it does not move |
| Crank-rocker driven from the rocker at its limit | 1 | 1 | Unchanged as a machine; with the driver held, the one first-order flex dies at second order, which is what a dead point is. It stays an oracle limitation: which branch to leave a dead point by is not the oracle's to choose |

### Where Gruebler's count is wrong

Gruebler's count disagrees with both solvers on ten published machines. On nine it counts no
freedom where there is one: a redundant support or a parallel guide (the parallelogram with a
third crank, the locomotive's three wheels, the scotch yoke on two guides, the gripper on rails,
the MotionGen gripper, the hydraulic crosshead twice, the cylinder gripper and the excavator
bucket templates). On the tenth, the Watt six-bar with a grounded rocker joint, it counts −1 and
the machine is simply rigid. These are the cases the cross-check exists for, and the spec asserts
it still sees the first two kinds, so that it cannot pass by both sides falling back to the rank.

### Counts

Of 202 machines, **155 are verified** (thirteen in part) and **43 agree they do not run**; **4
are excluded** whole. 249,312 kinematic samples pass and 40,218 are past the conditioning limit;
155,676 force samples pass and 29,806 are past the conditioning limit; 12,150 samples of either
are left out by the manifest. Forces are compared in 301 machine-modes, 153 that carry a force and
148 that carry none, and the manifest leaves 9 more out entirely. Nothing fails.

## Phase 3 results

Measured on 2026-11-04. Every published machine is now exported in full: none is left out as
unsupported. Of 202 machines, **154 are verified** (twelve of them in part) and **43 agree they
do not run**; **5 are excluded** whole by the manifest. 249,312 kinematic samples and 155,676
force samples pass, and none fails. Forces are compared in 299 machine-modes, 151 that carry a
force and 148 that carry none; the manifest leaves 9 more out entirely. An entry that names parts
leaves out only the forces on those parts: the hood hinge's and the landing gear's forces are
compared everywhere but on their two cylinder members.

### What the exporter now writes down

Each rule is in `src/test-utils/oracle/export-problem.ts`, beside the ones in [Equivalence rules
(Phase 1)](#equivalence-rules-phase-1).

- **An input that turns one link against another.** A floating pin input drives the two bodies
  `resolveActuator` names, the reference and the driven one; a grounded one drives its link against
  the ground. PMKS+'s driver coordinate is read the same way, as the driven body's turn less the
  reference body's (`driverCoordinate` in `pmks-samples.ts`).
- **A floating slot's ends.** The block may travel the channel between the slot's end joints, from
  its midpoint out to half their separation less the inset the slot mark draws, plus PMKS+'s own
  tolerance of 0.2% of the separation (`ridersAreInTheirSlots` in `position-solver.ts`). The
  constants are restated rather than imported, as the units table is, so a change to PMKS+'s rule
  shows up as a disagreement.
- **A cylinder.** Its seal slides along the line from one end joint to the other. The stroke is the
  part's own geometry (`cylinderStrokeAlong`), plus PMKS+'s tolerance of 10⁻³ model units. The
  hidden end N and the seal S are derived, not read: N a barrel length along the line from end A,
  S a rod length back from end B. A driven cylinder is sampled 180 times a stroke
  (`SAMPLES_PER_STROKE`), and its driver coordinate is the change in the span between its ends.
- **Several machines, Slides and frozen cylinders** need nothing new. A frozen cylinder's seal joins
  one body to itself, so its couple is internal and is not compared (decision S25).

### In the oracle: slot ends

`sweep.py` stops the walk where a block reaches the end of its slot. The crossing is bracketed
between two accepted points and bisected on arclength, so the end is found to the solver's
precision, and the limit's kind is `slot-end`. A drawn pose already outside its slot has no travel
in either direction. Two benchmarks check it against closed forms. A driven block stops at its ends,
±100.5 mm from the start on a 1 mm grid. A passive block stops the driver where the bar holding it
reaches its end, at x = 0.4 m and x = √0.0099 m, short of the toggles that would otherwise end the
travel. Where a slot end and a toggle fall in one step, the step is walked again in short steps,
and a slot end reached while the driver is still advancing is the limit: on a 50 mm grid the
passive block stops at x = √0.2499 m, a hair short of the toggle at 0.5 m in the same step. The
refusal of slot limits that Phase 0 added is gone.

### In the comparison

- **The frames PMKS+ solved.** PMKS+'s frame 0, and the closing copy of it, are the decoded
  drawing. Every other frame is solved, and a cylinder stored a hair off its line is straightened
  there. Where frame 0 does not match the exported problem to 10⁻⁹ of the machine's size, its
  poses are not compared (`solvedFrames` in `compare-oracle.ts`). How far PMKS+ travels is still
  read off every frame.
- **Inertia from differenced accelerations.** A force PMKS+ balances against differenced
  accelerations can be no better than they are, so it is held to the differenced acceleration
  budget, 10⁻², instead of 10⁻⁸ (`DIFFERENCED_INERTIA_BUDGET`). It is `undefined` within a sample
  of a reversal, where the difference reaches across the turn. The worst measured is 4.8×10⁻⁵, on
  the telescoping strut.
- **A cycle's first and last frames.** PMKS+ differences them one-sided, to first order, although
  the last frame repeats the first and a central difference across it is available. On the
  hydraulic cylinder that put an angular acceleration 9.9×10⁻³ off at frame 0, where the same pose
  differenced centrally mid-sweep is 1.0×10⁻⁴ off. A differenced rate there, and any force resting
  on one, is `undefined`, and the gap is filed as [#84][i84]: 80 kinematic and 58 force samples.

### The budgets, from the measurement

Unchanged, and still the same for every machine. The worst passing errors over the whole gallery:

| Method | Order | Phase 1 worst | Phase 3 worst | Budget |
| --- | --- | --- | --- | --- |
| Pose | position | 1.8×10⁻⁸ | 6.4×10⁻⁸ (the excavator bucket, at its last sample before a toggle) | 1×10⁻⁷ |
| Analytic | rate | 6.9×10⁻⁹ | 6.2×10⁻⁸ (the leg on a bicycle crank) | 1×10⁻⁷ |
| Analytic | acceleration | 8.3×10⁻⁷ | 5.6×10⁻⁶ (the same, at a condition of 557) | 1×10⁻⁵ |
| Differenced | rate | not exercised | 8.5×10⁻⁵ (the telescoping strut) | 1×10⁻³ |
| Differenced | acceleration | not exercised | 1.7×10⁻³ (the same) | 1×10⁻² |
| Forces, static | — | 1.9×10⁻⁹ | 1.9×10⁻⁹ | 1×10⁻⁸ |
| Forces, dynamic | — | 4.6×10⁻¹⁰ | 1.6×10⁻⁹ (the offset-mount hatch) | 1×10⁻⁸ |

Three of the budgets are no longer five times the worst error, as they were set to be: the pose,
the analytic rate and the analytic acceleration stand at 1.6, 1.6 and 1.8 times. Each worst sits
where the conditioning predicts it: at a toggle for the pose, and near the conditioning limit for
the rates. None was widened. Whether to keep them, or to raise them for every machine alike, is an
open question.

### Return sweeps

A rocking pin input reverses at its toggle and PMKS+ retraces, so one stored state per k serves
both directions (see [The sweep](#the-sweep)), and every return frame is compared pose by pose.
That holds for every published machine. A slider input that reverses at a crank's dead center can
instead carry on: PMKS+ keeps its motion history across that reversal to choose the continuing
branch (`mechanism.ts`; `piston-driven-wheels.spec.ts` is its guard). No published machine does
so: the piston-driven wheels are a spec fixture, not a gallery entry. A machine that did would fail
on its return poses rather than pass, because the oracle stops at the turning point. Storing the
continuing branch as a second segment is not built, and is an open question.

### Disagreements and exclusions

Four new issues, and no PMKS+ solver changed:

| Machine | Kind | What | Issue |
| --- | --- | --- | --- |
| Four-bar driven at its coupler-rocker pin, oscillating fan, walking-beam pumping unit, leg on a bicycle crank | disagreement | A floating pin's motor torque is applied to one body only, so the frame supplies the reaction couple: every reaction and the effort differ. The body totals agree | [#81][i81] |
| Leg on a bicycle crank, and the pedaling-leg template | disagreement | One pose, k = −39, is solved twenty times looser than its neighbors, and at a condition of 557 the angular velocity of BP is 1.3×10⁻⁷ off | [#82][i82] |
| Hood hinge, aircraft landing gear (templates), cylinder riding a slot | disagreement | A cylinder stored a hair off its line: PMKS+ straightens it from frame 1 but carries the members' centers of mass rigidly from the unstraightened frame 0, and on the slot-riding one every analytic rate comes out a uniform 10⁻⁷ high | [#83][i83] |
| Every machine with differenced rates | disagreement | One-sided differences at the first and last frames | [#84][i84] |
| Scotch yoke on two guides | by design | Two guides hold one yoke, a redundant support; PMKS+ refuses its forces | — |
| Cylinder-driven gripper | oracle limitation | Drawn within 10⁻⁵ m of a dead point of its drive; the oracle's projection onto the constraints slides along the nearly free direction | — |

[#83][i83] may describe the test harness rather than the app: `solvedDrawing` decodes a URL and
solves it directly, without the rebuild that `planDerivedInteriors` and `commitEditPlan` run in
the app, which may straighten the cylinder before frame 0 is stored.

The CI `oracle` job is not made a required check. That is the team's to switch on, after the two
weeks green that [CI integration](#ci-integration) asks for. The two nightlies are added
(`oracle-nightly.yml`). The Simbody cross-engine check is not: Simbody passed Phase 0 only
through OpenSim's packaging, with a hand-written velocity projection, and modelling every
published machine in it a second time is a phase of its own.

## Phase 2 results

Measured on 2026-11-04. The references already carried the oracle's inverse dynamics from Phase 0;
Phase 2 compares them (`compare-oracle-forces.ts`, called from `oracle.spec.ts`) in both of PMKS+'s
force modes: `static`, the loads and gravity alone, and `dynamic`, with the inertia of the motion.

### What is compared, and how

- **Reactions** are the force on one body at one joint, from everything else meeting there. One is
  compared only where the oracle marks it **identifiable**: fixed by equilibrium at every stored
  state. Of 1,518 reaction series on verified machines, 84 are not; they belong to a frame drawn
  as a bar, a parallel pair of cranks or another redundant support.
- **Body totals**, the sum of a body's reactions, are always fixed, and are what a redundant
  support is compared by: the resultant, not its split.
- **A Slide's guide couple** is compared on its one rider, and **the input effort** (a torque for a
  pin, a force for a slider) at every frame. A Pin-in-slot's rider turns freely on its block, so the
  couple on it is zero by construction and PMKS+ reports none.
- **Nothing passes by being left out.** A reaction, couple or effort the oracle fixes and PMKS+
  does not report fails the machine, as a blank rate does (`oracle-compare-forces.spec.ts` strips
  each and sees it reported).
- **The frame.** A bar pinned to the ground at two or more joints cannot move, and PMKS+ folds it
  into the frame and reports nothing on it; the oracle's numbers for it are the ground's, and are
  not compared.
- **Scale.** A force error is divided by the largest force anywhere in the machine's cycle, a
  moment's by that times L. A machine nothing loads, which is most of the gallery, is solved and
  compared all the same, on a scale of 1 N: its forces must come out zero to 10⁻⁸ N, and its
  solve must succeed. Above the conditioning limit of 10³ forces are not compared, for the
  reason rates are not.
- **A frame PMKS+ cannot solve** fails the machine unless the oracle's condition there is above the
  limit: a toggle is a reason to have no answer, a regular pose is not.

### The budgets, from the measurement

| Mode | Worst measured | Budget |
| --- | --- | --- |
| Static | 1.9×10⁻⁹ (a reaction on the elliptical crank) | 1×10⁻⁸ |
| Dynamic | 4.6×10⁻¹⁰ (a reaction on the slider-crank with a tracer) | 1×10⁻⁸ |

100,434 force samples pass and none fails; 10,910 are past the conditioning limit. Of the 189
machine-modes compared, 85 carry a force and 104 carry none, so the worst errors above all come
from the 85; five more the manifest leaves out entirely and are not counted as compared.

### Inside the oracle, and against MATLAB

- **Power balance.** `oracle/tests/test_power_balance.py` reads every stored reference as plain
  numbers, without the oracle's equations, and checks that the effort's power, the loads' and
  gravity's add up to the rate of change of kinetic energy (and to zero in the static mode). It
  holds to 10⁻⁷ of the largest power in the cycle on all 79 machines on which something does work.
  An effort with the wrong sign, a local load not turned with its body or a missing block mass
  would each break it.
- **MATLAB dynamics.** `oracle-matlab.spec.ts` compares the oracle's joint forces and input torque
  with gravity to the Watt I and Stephenson III dynamics tables, at the tolerance the MATLAB
  dynamics specs give PMKS+. The worst error is 1.2×10⁻³ of it, and the residual is the gravity
  constant: the oracle uses 9.80665 m/s², the tables 9.81.

### Disagreements and exclusions

No new disagreement. Three manifest entries changed:

| Machine | Kind | What | Issue |
| --- | --- | --- | --- |
| Four-bar with two inputs | disagreement | Its reactions, body totals and effort are left out in the dynamic mode, which needs the wrong rates; its static forces agree | [#78][i78] |
| Parallelogram with a third parallel crank | by design | PMKS+ refuses its forces (`unsupported-topology`): three parallel cranks leave the reactions indeterminate. Its motion is verified | — |
| Locomotive drive wheels | by design | The same refusal: one side rod couples three wheels. It carries no force, and was not solved until unloaded machines were compared | — |

Whether PMKS+ should report the resultants of a redundant support instead of refusing is an open
question, not a disagreement: the oracle can only say what equilibrium fixes.

## Phase 1 results

Measured on 2026-11-04. `npm run oracle` exports every published machine, solves it and writes
`src/test-data/oracle/`; `oracle.spec.ts` compares; the whole regeneration takes about 40 seconds
and the comparison about 10.

### What is compared, and how

- **Published cases.** Every `FIXTURE_GALLERY` entry, as `npm run fixture-urls` links it, and
  every template as the library dialog stores it: 167 drawings (122 gallery entries and 45
  templates), 202 machines. Each machine is exported from its decoded URL by
  `src/test-utils/oracle/export-problem.ts`, which reads the start pose only. Units come from its own table (`si-units.ts`), not the app's.
- **PMKS+ is sampled at whole degrees** (`'degree'`), and each frame is placed on the oracle's grid
  by its driver coordinate. Adaptive sampling adds frames between grid points and agrees with
  `'degree'` on which machines run, for all 202.
- **Whether it runs.** PMKS+ must run exactly the machines the oracle can walk. A full rotation must
  close after the same number of turns. A rocker must reverse at the same grid samples the oracle's
  refined toggles bound, which every rocker does.
- **Scale.** Every error is divided by the machine's own size L, by L·Ω or by L·Ω², so one budget
  serves every machine.
- **Conditioning.** Above a driven-Jacobian condition number of 10³, only positions are compared:
  a rate there is the pose's error amplified once or twice by the conditioning. The oracle's own
  acceleration at such a pose was checked by differencing its velocities, which converges to it as
  δ².
- **Differenced rates** (what PMKS+ fills by `fillRatesByDifference`) are `undefined` at the last
  sample before a reversal, where the difference reaches across the turn.
- **Nothing passes by not being compared.** Every stored oracle sample must be reached by a PMKS+
  frame, every joint and body the oracle reports must be reported back, and every quantity the
  oracle has at a sample PMKS+ must have too, unless the manifest leaves it out. A part PMKS+
  reports at some samples and not others is missing at each sample it skips, every quantity of
  it; one it never reports is said once (`oracle-compare.spec.ts` removes each in turn and sees
  the comparison say so).

### The budgets, from the measurement

| Method | Order | Worst measured | Budget |
| --- | --- | --- | --- |
| Pose | position | 1.8×10⁻⁸ (the last sample before a toggle) | 1×10⁻⁷ |
| Analytic | velocity | 6.9×10⁻⁹ | 1×10⁻⁷ |
| Analytic | acceleration | 8.3×10⁻⁷ (near the conditioning limit) | 1×10⁻⁵ |
| Differenced | velocity | not yet exercised by a verified machine | 1×10⁻³ |
| Differenced | acceleration | not yet exercised by a verified machine | 1×10⁻² |

The median error is about 10⁻¹⁰. The differenced budgets come from the method (a central
difference over 1° is about 5×10⁻⁵ of a sinusoid's speed); the machines that use them are Phase 3's.

### The MATLAB cases, three ways

The five MATLAB v1 cases are problems read straight from their fixtures by
`fixture-problem.ts`, with no PMKS+ model class or codec in between, and `oracle-matlab.spec.ts`
compares the oracle to each table at the precision the table claims for itself. The worst error is
2×10⁻⁵ of that tolerance. With the existing MATLAB specs and the published versions of the same
fixtures in `oracle.spec.ts`, the three agree three ways.

### Reproduction across platforms

The oracle is byte-identical from one run to the next on one platform, but not between macOS and
Linux: their BLAS and LAPACK round differently, so a number that is physically zero comes out as
10⁻¹⁷ on one and −10⁻¹⁷ on the other, and the tenth stored digit of an ordinary one can move. The
first Linux run rewrote every reference that way. Two changes followed:

- **A regeneration keeps what it reproduces.** `pmks_oracle/agree.py` compares a new solve with the
  committed reference: the grid, the limits, the mobility counts, which reactions are
  identifiable, and which parts, columns and force modes it holds must be equal, and every number must agree to one hundredth of the budget PMKS+ is
  held to for it, on the same scales, plus a unit in its last stored digit. Rates and forces past
  the conditioning limit are not compared, as PMKS+'s are not. Because a condition number decides
  that, it must itself reproduce to a thousandth of its size and fall on the same side of the
  limit, so a changed one cannot excuse the rates it would hide; two poses past 10¹⁰ are both
  singular and agree. `run.py` rewrites a reference only when that check fails or its problem or
  generator changed.
- **A toggle on a grid point is not stored.** The two cylinder booms stop exactly at their stroke
  ends, which fall on grid points; whether the refined toggle landed a hair before the last one or
  after it differed between the platforms. A grid point within 10⁻⁹ of a step of a toggle is the
  dead point itself, where no rate is defined, and is left out.

### Disagreements and exclusions

In `src/test-data/oracle/manifest.ts`:

| Machine | Kind | What | Issue |
| --- | --- | --- | --- |
| Slider-crank whose rod comes square to the guide | disagreement | PMKS+ refuses the published URL (`cycle-never-closes`); the oracle and the directly built fixture both close it after two turns | [#77][i77] |
| Four-bar with two inputs | disagreement | The coupler's analytic angular velocity is wrong (0.1625 rad/s where PMKS+'s own joint velocities and the oracle give 0.1745), and the blank joint rates are differenced outside budget | [#78][i78] |
| Four-bar with a second crank on its input | by design | PMKS+ refuses three bodies at a driven pin; the physics runs | — |
| MotionGen gripper | oracle limitation | A first-order freedom that dies at second order; the oracle's rank test is first order | Phase 4 |
| Crank-rocker driven from the rocker at its limit | oracle limitation | The drawn pose is the driver's dead point | — |

The other 68 excluded machines are those whose problem names something the Phase 1 exporter does
not yet write down: a floating slot's ends, a cylinder's stroke, or an input that turns one link
against another. Phase 3 took them (see [Phase 3 results](#phase-3-results)).

## Phase 0 results

Measured on 2026-11-03 on macOS (Apple silicon). Everything the trial used is pinned:
`oracle/uv.lock` for the oracle itself, and `oracle/spike/envs/*.yml` with explicit
`*.osx-arm64.lock` exports for the two conda candidates.

### The trial

Each library solved the Norton four-bar at θ₂ = 40°, ω₂ = 25 rad/s, without integrating in time,
and was compared with the closed form in `closed_form_kinematics.py`.

| | Exudyn 1.13.6 | Simbody 3.8 (OpenSim 4.5.2) | PyChrono 10.0.0 |
| --- | --- | --- | --- |
| Install | `uv`, pip wheel, 1.5 s, 52 MB | conda only, 378 MB environment | conda only, 1.7 GB environment |
| Planar model | Native 2D bodies and joints | Pin joints plus a point constraint to close the loop | 3D bodies with Z-axis revolutes, redundant out of plane |
| Velocities | Exact (machine precision) | Exact, after a projection written by hand: OpenSim's `assemble` leaves the speeds inconsistent and does not bind Simbody's `project` | About 1% off after a full assembly |
| Accelerations | 1×10⁻¹⁴ relative (see below) | 5×10⁻¹³ absolute | Meaningless (errors of 10⁶ rad/s²) |
| By stepping in time instead | Not needed | Not needed | First order in the step: ω₃ off by 0.29, 0.030, 0.0045 at 1, 0.1, 0.01 ms |
| Driving torque | 0.884416355449 N·m | 0.8844163554488235 N·m | Not reached |
| Its own mobility count | `ComputeSystemDegreeOfFreedom`, agrees with the rank | Not exposed through OpenSim | Not tried |
| Reruns | Byte-identical | — | — |

**Why Exudyn.** It is the only candidate that installs from PyPI into the lock CI already uses, it
models planar joints directly, so there is no out-of-plane redundancy to explain, and it exposes
exactly the pieces the textbook method needs. Simbody is as exact, but only through OpenSim's
packaging, with its coordinate ordering and missing bindings to work around. That makes it a good
second witness and a poor first one. PyChrono's assembly is a tolerance-driven step, not a solve,
so its rates would need step-convergence studies on every case.

### How the oracle computes, and what it relies on in Exudyn

The oracle uses Exudyn as the **model and its constraint equations**, and does the kinematic
analysis itself, in the textbook form (Haug 1989, ch. 3 and 6), in `oracle/pmks_oracle/`:

- positions: Newton on Φ(q) = 0 with the driver row d(q) = d\*;
- velocities: J q̇ = [0; ḋ];
- accelerations: J q̈ = −γ + [0; d̈], where γ is a central difference of Exudyn's own velocity-level
  constraints Φ_q q̇ along q̇, extrapolated twice. A first difference of the velocity level keeps
  about 1×10⁻¹⁴ relative accuracy where a second difference of positions keeps only 1×10⁻⁸
  (`oracle/spike/gamma_step.md` has the measurements). The step is a tenth of the machine's size
  along q̇, with a turn rate counted as the speed it gives a point one machine size away, so the
  same machine drawn a hundred times larger gets the same angular accelerations to the stored
  digits;
- forces: inverse dynamics, J^T λ = M q̈ − f for the dynamic case and −f for the static one, with
  M and f from Exudyn. Exudyn solves M q̈ = f + Φ_q^T λ, so Φ_q^T λ is the constraint force on
  each body. Whether a reaction is fixed by equilibrium is read off the null space of J^T.

Two Exudyn behaviors that the oracle works around: `ComputeJacobianAE` and
`ComputeMassMatrix` add into the stored matrix rather than overwrite it, so both are zeroed before
every call; and `InitializeSolver` writes a solution file unless told not to.

### The sweep

A one-freedom mechanism's configuration curve is traced by pseudo-arclength continuation from the
drawn pose, which fixes the assembly branch. A travel limit is where the driver coordinate turns
round, refined by golden-section search over the last two steps, walked again first in sixteen
short steps from their own tangents: a chord across the whole bracket left Newton wandering where
the excavator's curve bends, and it converged in time on Linux and not on macOS. A singular Jacobian and a solver
failure are reported as such and never as a toggle. Grid samples sit at d₀ + k·step, keyed by k.
A rotary cycle closes when the drawing returns to its start after at most three turns. A rocking
pin input reverses at its last solvable sample and PMKS+ retraces the same branch, so for it one
stored state per k serves both directions: velocities change sign on the return and accelerations
and forces do not.

**One state per k does not cover every reversal.** A slider input that reverses at a crank's dead
center may carry on, in PMKS+, onto the other branch (the crank turning through on its momentum,
`mechanism.ts` keeps the motion history for exactly that), and the return then passes through
different poses at the same k. The oracle stops at the turning point and cannot represent that
return. Such a machine fails on its positions rather than passing; none of the verified ones does,
because each retraces. Storing the continuing branch as a second segment, keyed by segment as well
as k, was left to Phase 3, which found no published machine that needs it (see [Return
sweeps](#return-sweeps)).

**A singular pose on the grid stores no state.** The walk carries on through a singular pose on
the branch it is on, as a parallelogram's does where its cranks lie along the frame: the pose is
well defined there, but its rates are not unique, and the minimum-norm ones least squares returns
are not physics (one acceleration comes out at 10⁹ m/s²). Every grid sample is therefore checked
for rank against the drawn pose; one that has lost rank is listed by k in `singularPoses`, and no
state is stored for it. Rank is judged to the pose's own accuracy, not to rounding: Newton holds a
pose along the direction a singularity frees only to about 1e-7 of the machine's size, so the
singular value that should be zero is of that order, and which side of a rounding threshold it
lands on differed between macOS and Linux. The test is made on the Jacobian in the machine's own
units (rotation columns divided by its size, angle rows multiplied by it), so it does not change
with the unit of length: a sample whose singular value there is below 1e-5 of the largest is
singular. On the redundant parallelogram at every size from a millimeter to a kilometer that is
at most 1.1e-7 at a singular pose and 6.4e-4 half a degree from one, so a regular pose loses its
state only within about a hundredth of a degree of a singularity. Its neighbors are stored as usual, with the condition numbers that say
how close they are.

**Slot limits were refused, not ignored.** The problem schema could carry a slider's travel
limits before the walk stopped at them, so `solve` refused a problem that set any, and the
exporter marked such a slot unsupported. Phase 3 brackets and refines the crossings (see [Phase 3
results](#phase-3-results)).

A reference stores about 36 states per cycle, plus the two grid points at each end of travel,
rounded to 10 significant figures, in schema `pmks-oracle-reference/1`.

### The raw benchmark set

Nine cases in `oracle/benchmarks/cases/`, each a problem in schema `pmks-oracle-problem/1` (SI
units) and the values it must reproduce. `cd oracle && uv run pytest` checks all 70 values.

| Case | Source | Covers |
| --- | --- | --- |
| `norton-fourbar` | Norton Ex. 4-1 givens, published answers | Pins; α₂ ≠ 0 |
| `norton-slider-crank` | Norton offset slider-crank, published answers | Grounded slot |
| `ttu-fourbar-circuit-1`, `-2` | TTU worked example, published to 3 decimals | Inverse dynamics with gravity; both assembly circuits |
| `metu-double-slider` | METU ME 301 §6.4, published | A slider as the driver; travel limits |
| `scotch-yoke` | SymPy, `sympy_cases.py` | A Slide (rotation locked) on a moving rider |
| `inverted-slider-crank` | SymPy | A floating slot on a turning carrier |
| `redundant-parallelogram` | SymPy | Redundant supports: only the resultants are fixed |
| `non-grashof-rocker` | SymPy | Toggles at both ends, refined |

A published value is compared to half a unit in its last printed place plus 0.2%. A derived value
is compared to 1×10⁻⁹. The Norton and TTU cases matched every printed digit. METU rounds its
intermediate results and agrees within that allowance, not to every digit: α₃ = 8.3131 against its
8.312 rad/s², the driving force 7.5586 against its 7.555 N, and one reaction 25.978 against its
25.97 N, each within 0.05%.

### The non-solving builder

`buildDrawing` in `src/test-utils/verification/fixture.ts` builds a fixture's joints, links and
forces without constructing a `Mechanism`, and `fixturePayload` now encodes from it. The payloads
are byte-identical to before. `oracle-export-boundary.spec.ts` counts calls into the position,
kinematic and force solvers during a build and an encode of every gallery entry, expects none,
and proves the guard can fail by expecting some from `buildMechanism`.

### Left to later phases

- **Tolerance budgets.** PMKS+ samples at whole degrees and cannot easily be run at ½° or ¼°, so
  the step-refinement experiment moved to Phase 1, where PMKS+ was measured against the oracle per
  method (see [Phase 1 results](#phase-1-results)).
- **Determinism on pinned Linux and the cold CI install time** are measured by the `oracle` CI job
  that Phase 1 adds. There is no Linux machine in this trial.

## Textbook and course benchmark cases

Gathered on 2026-11-03 from openly accessible pages; pirated book scans were avoided. Each case's
published answers were re-derived from its givens by
`oracle/benchmarks/derivations/closed_form_kinematics.py` and `ttu_fourbar_dynamics.py`, so a
transcription error cannot become a reference. "Confirmed" means a published number and the
re-derivation agree. "Derived" means only the re-derivation exists, and the case is labeled that
way.

| Case | Source of givens | Confirmed | Derived only | Can PMKS+ run it directly? |
| --- | --- | --- | --- | --- |
| **Norton four-bar.** a=40, b=120, c=80, d=100 mm, θ₂=40°, ω₂=25 rad/s, α₂=15 rad/s² | Norton, *Design of Machinery*, Ex. 4-1 givens; reproduced in the MIET2510 [Week 2 tutorial][miet] and a MENG450 slide set | θ₃=20.30° and θ₄=57.32° (open circuit); crossed θ₄=−98.01°; ω₃=−4.121 and ω₄=7.00 rad/s | α₃=296.089, α₄=470.134 rad/s² | Position and velocity, yes. Acceleration no: PMKS+ drives at constant speed, so α₂=15 reaches PMKS+ only through the oracle. |
| **Norton offset slider-crank.** a=35, b=110 mm, offset c=−15 mm, θ₂=50°, ω₂=20 rad/s, α₂=12 rad/s² | MIET2510 [Week 2 tutorial][miet] (Norton's convention) | θ₃=157.66°, d=124.24 mm, ω₃=−4.42 rad/s | ḋ=−721.138 mm/s, α₃=94.718 rad/s², d̈=−7350.341 mm/s² | Position and velocity, yes. Acceleration only through the oracle. |
| **TTU four-bar dynamics.** r₁=0.50, r₂=0.15, r₃=0.5, r₄=0.1778 m; masses, inertias and CG offsets on the page; θ₂=150°, ω₂=5, α₂=−5; load torque 5 N·m on link 4 | [TTU Dynamics of Machinery II wiki][ttu] | All pin forces and the driving torque on **both** circuits, to 3 decimals: T₁₂=−5.183 N·m (circuit 1) and 0.195 N·m (circuit 2) | — | Only through the oracle (α₂≠0). **The page uses gravity at 9.81 m/s² without saying so**; without it nothing matches. |
| **METU double slider.** Rod AB=500 mm, 5 kg, uniform; A driven along x at a constant 2 m/s; B on a perpendicular guide; x=200 mm; no gravity | [METU OCW ME 301, §6.4][metu] | θ=113.578°, y=458.258 mm, ẏ=−872.872 mm/s, ω=4.364, α=8.312 rad/s², \|F₂₃\|=27.04 N at −73.78°, F₄₃=7.555 N | — | Yes, as a slider driven at constant speed. The page rounds intermediate values, so its forces agree to about 0.05%. Compare at printed precision. |

Rules for these cases:

- A textbook case is compared **at the precision it was printed to**, with an allowance for
  intermediate rounding. It never sets the oracle's own tolerance.
- The sign conventions are the source's. Fᵢⱼ is the force of link i on link j, and the derivation
  scripts state the conversion. The exporter's equivalence specs prove that conversion.
- The Phase 1 raw benchmark set is these four cases, plus SymPy and closed-form cases for the
  features no textbook covers (floating slots, Slides, cylinders).

## Decisions

Settled with the team on 2026-11-03:

1. **Textbook worked examples become fixtures,** each citing its source (book, edition, example
   number). We enter the numbers ourselves and copy no text or figures. The first four are in
   [Textbook and course benchmark cases](#textbook-and-course-benchmark-cases).
2. **The MATLAB v1 data stays** as a second witness after the oracle covers its five cases. Those
   five then agree three ways.
3. **Tolerances**: the team accepted a starting point of about 1e-9 relative for positions and 1e-6
   for rates and forces. The review showed 1e-6 cannot hold for finite-differenced rates, so those
   numbers now apply only to analytically solved quantities. Phase 0 measures and sets the budgets
   per method (see [Tolerances justified by method](#4-tolerances-justified-by-method)).

## Review history

- **2026-11-03, GPT-6 Astra (external review).** Its verdict: an external oracle is the right
  direction, and Exudyn is a sensible provisional choice, but the comparison contract should be
  defined before the engine is chosen. Taken in full:
  - per-method tolerances;
  - a non-solving exporter and two problem sources;
  - quantity classes, including redundant-support resultants;
  - pin-in-slot versus prismatic constraint counts, weld mass aggregation, and travel limits;
  - alignment by driver coordinate, and the current force API;
  - bracketed toggles and return sweeps;
  - a broader staleness hash, a file inventory check, an always-reporting CI job, and pinned
    versus upstream nightlies;
  - Simbody as the second candidate, and fuller exclusion records.

  One claim was corrected: the 4-decimal rounding it cited applies only to exported CSV, not to
  the solver output under test.

[miet]: https://bamason2.github.io/miet2510-module/tutorials/Week+2+Tutorial.html "MIET2510 Week 2 tutorial"
[ttu]: http://ttu-dom.wikidot.com/example-item-1 "TTU Dynamics of Machinery II: Force Analysis - 4 Bar"
[i77]: https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/77 "Issue 77"
[i78]: https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/78 "Issue 78"
[i81]: https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/81 "Issue 81"
[i82]: https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/82 "Issue 82"
[i83]: https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/83 "Issue 83"
[i84]: https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/84 "Issue 84"
[metu]: https://ocw.metu.edu.tr/pluginfile.php/6467/mod_resource/content/6/ch6/6-5.htm "METU OCW ME 301, 6.4 Dynamic force analysis of machinery"
[exudyn]: https://exudyn.readthedocs.io/ "Exudyn documentation"
[simbody]: https://simbody.github.io/ "Simbody"
[chrono]: https://api.projectchrono.org/ "Project Chrono API documentation"
