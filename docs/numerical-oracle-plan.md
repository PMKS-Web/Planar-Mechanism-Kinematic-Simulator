# An independent numerical oracle for every verification mechanism

> **Status:** Phases 0 and 1 built, 2026-11-04. **Exudyn is chosen**, with Simbody as the
> cross-engine check (see [Phase 0 results](#phase-0-results)). Of 202 published machines, **97
> are verified** against the oracle (one in its poses only) and **33 agree they do not run**; **72
> are excluded**: 68 wait for the Phase 3 exporter and 4 are excluded by the manifest. There are
> **2 disagreements**, each with an issue (see [Phase 1 results](#phase-1-results)). The plan was
> revised on 2026-11-03 after an external review (see [Review history](#review-history)).

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
- **Two nightlies.** A *pinned* regeneration confirms the committed references still reproduce. A
  separate *upstream* run tries the latest Exudyn patch release and files an issue if numbers move.
  Scheduled workflows run off the default branch (`main`, see the note in `e2e-nightly.yml`), so
  both check out `staging` explicitly.

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

## Phase 1 results

Measured on 2026-11-04. `npm run oracle` exports every published machine, solves it and writes
`src/test-data/oracle/`; `oracle.spec.ts` compares; the whole regeneration takes about 40 seconds
and the comparison about 10.

### What is compared, and how

- **Published cases.** Every `FIXTURE_GALLERY` entry, as `npm run fixture-urls` links it, and
  every template as the library dialog stores it: 167 drawings (122 gallery entries and 45
  templates), 202 machines. Each machine is exported from its decoded URL by `src/test-utils/oracle/export-problem.ts`, which reads the start
  pose only. Units come from its own table (`si-units.ts`), not the app's.
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
against another. Phase 3 takes them.

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
round, refined by golden-section search over the last two steps. A singular Jacobian and a solver
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
as k, is Phase 3's, with the other return sweeps.

**A singular pose on the grid stores no state.** The walk carries on through a singular pose on
the branch it is on, as a parallelogram's does where its cranks lie along the frame: the pose is
well defined there, but its rates are not unique, and the minimum-norm ones least squares returns
are not physics (one acceleration comes out at 10⁹ m/s²). Every grid sample is therefore checked
for rank against the drawn pose; one that has lost rank is listed by k in `singularPoses`, and no
state is stored for it. Rank is judged to the pose's own accuracy, not to rounding: Newton holds a
pose along the direction a singularity frees only to about 1e-7 of the machine's size, so the
singular value that should be zero is of that order, and which side of a rounding threshold it
lands on differed between macOS and Linux. A sample whose singular value is below 1e-6 of the
largest is singular; one that is not has a condition number past 1e6, which is never compared. Its neighbors are stored as usual, with the condition numbers that say
how close they are.

**Slot limits are refused, not ignored.** The problem schema can carry a slider's travel limits,
but the walk does not yet stop at them, so `solve` refuses a problem that sets any; the exporter
marks such a slot unsupported instead of writing them. Phase 3 brackets and refines the crossings.

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
[metu]: https://ocw.metu.edu.tr/pluginfile.php/6467/mod_resource/content/6/ch6/6-5.htm "METU OCW ME 301, 6.4 Dynamic force analysis of machinery"
[exudyn]: https://exudyn.readthedocs.io/ "Exudyn documentation"
[simbody]: https://simbody.github.io/ "Simbody"
[chrono]: https://api.projectchrono.org/ "Project Chrono API documentation"
