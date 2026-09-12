# Structural analysis: S0, S1, and S2

> **Status:** Built — S0/S1 and S2 inverse dynamics implemented on `feature/structural-analysis`, based on `origin/staging` at `acba1b77`. S0/S1 is commit `79a8ef0c`; S3–S7 remain future work.

## Repository audit and design

PMKS already has `Link` / `RealLink` / `SliderBlock`, `Joint` / `RealJoint` /
`RevJoint` / `PrisJoint`, and `Force` with arbitrary application coordinates.
`MechanismService` owns the editable drawing and partitions it into `Mechanism`
instances. Each mechanism has `joints[frame]`, `links[frame]`, and sample times;
there is no `IKinematicAnalysis` interface. Compounds are root `RealLink` bodies
with constituent links in `subset`. A grounded pin anchors a body but lets it
rotate; two distinct grounded pins make a frame body.

`model/mechanism/force-solver.ts` already assembles static and dynamic equilibrium,
returns SI reactions per body and driver effort, and supports slides/cylinders.
It also maintains compatibility static fields and can optionally approximate
load sharing at redundant supports. S1 does not change this existing solver or
the kinematic pipeline. Its strict structural API never chooses a load split
when equilibrium alone cannot determine it.

There is no external matrix dependency on the staging baseline. Existing solvers
use private elimination routines. S1 adds `ml-matrix` for singular value
decomposition rather than extending those routines. Public results expose plain
numbers, counts, residuals, and diagnostic statuses, not library matrix objects.

`unit-conversions.ts` owns conversions and existing force results are SI. The
new domain uses explicitly named SI quantities. The PMKS adapter uses the
existing conversion factors and an explicit coordinate-space argument: internal
model coordinates are **200 times** project length coordinates (`MODEL_SCALE`).
Material and section data stay SI when the project's display units change.
Existing `Link.mass`, `RealLink.massMoI`, and solved `CoM` remain authoritative;
S0 does not create a second editable copy or infer mass from an outline/density.

URL state drives sharing and undo. Optional structural properties travel
in a versioned entry in the existing trailing extension section. Absence writes
nothing and reads as no structural data. The original record layout stays intact.

Dependency flow:

```text
PMKS solved joints/links (chosen partition and sample)
  -> pmks-configuration.ts (units, topology, plain snapshot)
  + LoadCase (explicit point forces, couples, optional gravity)
  -> static-force-solver.ts (three equilibrium rows per moving body)
  -> StaticForceAnalysisResult (body-side reactions, driver effort, residuals)
  -> future internal member loads -> stress -> engineering checks -> UI
```

Concrete files live in `src/app/model/structural/`: `structural-properties.ts`,
`cross-section.ts`, `loads.ts`, `configuration.ts`, `results.ts`,
`pmks-configuration.ts`, and `static-force-solver.ts`. Serialization belongs in
`services/transcoding/structural-codec.ts`; a narrow structural service owns
saved load cases. `Link` gains one optional metadata reference. S1 has no new
screen, stress formula, deformation feedback, or change to existing analysis UI.

The initial compatibility boundary is revolute joints, grounded pins, binary
moving-body pin connections, root rigid compounds, multi-joint rigid bodies,
and a grounded revolute input holding one moving body. Prismatic joints,
cylinders, unresolved welds, ungrounded/ambiguous inputs, and multi-body free
pins are diagnosed explicitly before assembly. Later phases can add their
constraint laws independently of materials and member stress.

## API, coordinates, and units

`analyzeStatic(configuration, loadCase)` is a pure single-pose function:
no Angular dependencies, mutable global solver state, geometry changes, or
UI formatting. `snapshotPmksConfiguration` copies a chosen PMKS partition/sample
into plain structural objects; `analyzePmksFrame` adapts and solves in one call.
`StructuralAnalysisService.analyze` is the service boundary for future UI code.

Only a result with `status === 'ok'` has reactions, driver effort, and body
equilibrium results. Failed results contain diagnostics **without force values**.
Each pin reaction identifies both `jointId` and `linkId`: it is the force
**on that body**, in global axes. Internal binary pins return both sides with
exact opposite signs. Ground feels the negatives of its reported support forces
and holding couples. Positive moment/holding torque is counterclockwise on the
moving body. The moment equation uses `rx * Fy - ry * Fx`, referenced to the
body's first frame pin rather than a rendering centroid.

| Quantity | New domain units |
| --- | --- |
| Coordinates, local offsets, section dimensions | m |
| Force, applied/holding moment | N, N m |
| Mass, mass moment of inertia | kg, kg m² |
| Global gravity acceleration vector | m/s² |
| Elastic modulus, yield/ultimate strength | Pa |
| Density, Poisson ratio | kg/m³, dimensionless |
| Area, second moment, section modulus | m², m⁴, m³ |

The PMKS adapter calls `siUnitFactorsForLength`. In a centimeter project,
stored mass is grams and **stored inertia is kg cm²**, despite the UI displaying
g cm²; this is the existing URL convention. In an inch project, stored forces
are lbf, mass is lbm, and inertia is lbm in². Metadata in the new API stays SI
when display units change. Density does not silently replace the existing mass.

A point force specifies its application frame and direction frame independently:

- `at.frame: 'global'`: an absolute position in meters in the supplied pose.
- `at.frame: 'link'`: a position in meters relative to the first frame pin.
  Local +x runs from the first frame pin to the second; local +y is to its left.
- `directionFrame: 'global'`: force components fixed in the world.
- `directionFrame: 'link'`: follower-force components that rotate with the body.

A global application point stays in the world when a case is reused. Use a local
point to attach a load to a body across samples. Loads can act off the pin
centerline; S1 does not infer whether their points are inside a rendered outline.

`loadCaseFromPmksForces(frame, forces, name)` converts existing Force objects
into SI point loads. Pass forces from the **same solved sample** as the frame:
their application points and directions already reflect PMKS force transport.
The adapter's `coordinateSpace` is mandatory: `'model'` divides physical
coordinates by `MODEL_SCALE = 200`; `'project'` is for unscaled numerical
fixtures. Both also apply the selected project length-unit conversion.

Rectangular and solid circular sections return area, centroidal second moment
about the out-of-plane z axis, extreme-fiber distance, and section modulus
`S = I / c`. Rectangle height is the in-plane bending depth; width is the
out-of-plane thickness, so `I = width * height³ / 12`. Hollow sections and
stress calculations are deferred. Optional material fields describe an
isotropic material and reject nonphysical strengths/moduli/density or a Poisson
ratio outside `-1 < nu < 0.5`.

## Compatibility matrix

| Case | S1 behavior |
| --- | --- |
| Grounded revolute pin | Fx/Fy on every incident moving body |
| Free pin between two moving bodies | Shared Fx/Fy pair with opposite body-side signs |
| Free pin on one body | Tracer; no reaction |
| Free pin joining more than two moving bodies | Unsupported topology |
| Multi-joint root rigid link | Three equations for the entire body |
| Root welded compound | One body; leaf metadata persists, leaf force recovery is deferred |
| Separate links with multiple shared pins or unresolved welds | Refused; assemble a root compound first |
| Root body with two distinct grounded pins | Adapter excludes it as inertial frame |
| Any pin on that frame | Support for incident moving bodies |
| Grounded revolute input on one moving body | Unknown holding torque, independent of input speed |
| Multiple specified grounded inputs | One torque per input, subject to uniqueness checks |
| Ungrounded/ambiguous PMKS input | Unsupported topology |
| Prismatic joints, slides, blocks, cylinders | Explicit refusal; existing PMKS force analysis is unchanged |
| Gears, friction, distributed loads, elastic supports | Not implemented by S1 |

In the pure API, `bodies` explicitly means the bodies to analyze; frame removal
belongs to the PMKS adapter. Loads on excluded frame bodies or missing root
bodies return `invalid-load`. Loads naming compound leaves are not guessed onto
the root: a future topology-aware structural editor must map them explicitly.

The adapter checks that link membership and coordinates agree with the supplied
joint snapshot. It does not solve or repair positions. Callers must supply a
solved pose. A static structure can have determinate equilibrium without an input
or a motion cycle; its published fixture may show geometry without playback.

Prefer one PMKS partition per call, without assuming partition zero. Independent
supported bodies can be analyzed together, but very disparate scales may lead to
a conservative conditioning refusal.

## Numerical method and diagnostics

Each moving body contributes `sum Fx = 0`, `sum Fy = 0`, and `sum M = 0`.
Shared pin columns enforce Newton's third law. A holding input adds a couple
column. Known forces, applied moments, and gravity contribute to the right-hand
side. Existing masses and solved centers of mass supply gravity forces.

`ml-matrix@6.15.0` provides singular value decomposition (SVD). Zero padding
handles rectangular and zero-unknown systems. A truncated projection diagnoses
whether the applied load lies in the range of the equilibrium matrix; it is
**never returned as a minimum-norm engineering solution**.

Centralized `STRUCTURAL_TOLERANCES`:

| Check | Limit |
| --- | --- |
| Minimum coordinate-frame length | 1e-12 m |
| Relative rank threshold | 1e-12 of the largest singular value |
| Maximum accepted condition number | 1e10 |
| Maximum normalized equilibrium residual | 1e-9 |

The characteristic length is the largest distance from a body's first frame
pin to another pin on that body, across the supplied bodies. Moment rows are
divided by this length, and driver unknowns represent torque divided by length.
Thus conditioning does not mix N with N m. The normalized residual is the
largest scaled row imbalance divided by `max(1 N, max(abs(scaled RHS)))`.
Successful results also report separate Fx/Fy residuals in N and moment residuals
in N m for each body.

Diagnostics expose equation/unknown counts, rank, condition number,
`equilibriumDeficiency = rows - rank`, `reactionRedundancy = columns - rank`,
characteristic length, residual, and a message. Incompatible loads are
`inconsistent`. Otherwise a deficient system is `underconstrained`,
`statically-indeterminate`, or `singular` when both deficiencies occur.
An unloaded free mechanism is refused even though zero forces could balance it.
Full-rank but poorly conditioned poses are also refused. Validation and
arithmetic failures have explicit statuses; failures before assembly have zero
counts and make no rank/residual claim.

No stiffness assumptions, regularization, or even-load-sharing approximation
are used. A later elastic model must supply the information needed to split
redundant reactions.

## Worked examples

The published **Structural supported beam** fixture has A=(0,0), B=(4,0),
C=(4,3), grounded A and C, rigid bodies AB and BC, and a 100 N downward load on
AB at (1,0). BC is a vertical two-force hanger. About A,
`4 * By - 100 * 1 = 0`, so By=25 N; vertical balance gives Ay=75 N and
horizontal balance gives Ax=0. BC feels -25 N at B and +25 N at C. Six equations
determine six unknowns without a driver torque.

The **Structural held crank** has A=(0,0), B=(2,0), a grounded input at A, and a
100 N downward tip load. Without gravity it returns Ay=100 N and holding torque
+200 N m. A gravity-only case with its 2 kg mass at (1,0) returns Ay=19.6133 N
and holding torque +19.6133 N m.

Typical use after PMKS has solved a configuration:

```ts
import { analyzePmksFrame } from '../model/structural/pmks-configuration';
import type { LoadCase } from '../model/structural/loads';

const mechanism = mechanismService.mechanisms[partitionIndex];
const frame = {
  joints: mechanism.joints[sampleIndex],
  links: mechanism.links[sampleIndex],
  lengthUnit: settings.lengthUnit.getValue(),
  coordinateSpace: 'model' as const,
};
const loadCase: LoadCase = {
  name: 'Held tip load',
  loads: [{
    kind: 'point-force',
    linkId: 'AB',
    at: { frame: 'link', positionM: { x: 2, y: 0 } },
    directionFrame: 'global',
    forceN: { x: 0, y: -100 },
  }],
};
const result = analyzePmksFrame(frame, loadCase);
if (result.status === 'ok') {
  // Numeric SI values for future arrows, tables, and member-force recovery.
  useResults(result.jointReactions, result.driverReactions, result.linkEquilibrium);
} else {
  showDiagnostic(result.status, result.diagnostics);
}
```

For an undoable metadata edit, validate with `validateStructuralProperties`,
assign `link.structural`, and call `mechanismService.updateMechanism(true)`.
For saved cases, use `structuralAnalysisService.replaceLoadCases(cases)` and the
same save boundary. Analysis itself accepts a specific case and has no history
side effects. The case service copies its input/output to prevent alias mutation.

## Persistence and editing limits

Optional URL entry `T1` carries UTF-8 JSON in base64url:
`{ links: [{ id, properties }], loadCases: [...] }`. It preserves floating-point
precision and Unicode names without colliding with existing delimiters. Empty
structural data writes no entry, so pre-feature mechanisms retain identical URL
bytes. Older documents read as absent metadata and empty saved cases.
MechanismBuilder restores root/leaf metadata; UrlProcessorService restores cases,
including clearing them when a legacy document is loaded. This is also the
undo/redo path.

Missing/repeated metadata targets, duplicate entries, unknown versions, malformed
payloads, and nonphysical properties are rejected before rebuilding geometry.
Cases naming deleted load targets remain saved and later return `invalid-load`;
a save must not silently remove an applied load. New structural URLs require
this feature version; older PMKS readers do not understand T1.

RealLink samples deep-copy structural metadata. The existing solve-cache
signature now includes root and constituent metadata, so a material/section edit
refreshes copied data without changing solved positions. SI metadata is
independent of display units. S1 does not automatically distribute root metadata
to leaves on unweld, or remap load targets after link renaming/merging/deletion.
Those editing policies belong to the future structural UI.

## Roadmap recorded after S0/S1

The following preserves the S0/S1 roadmap. The implemented S2 API is documented below.

S1 uses no velocity, acceleration, or inertia torque. For S2, add an explicit
per-body kinematic state with SI center-of-mass acceleration and angular
acceleration. Reuse topology/equilibrium assembly with `sum F = m aG` and
`sum M_G = I_G alpha`, or an equivalent translated moment equation. Compare
against existing PMKS inverse-dynamics results on supported fixtures, and add
analytical acceleration cases before expanding to sliders/cylinders.

S3 can recover N/V/M from per-body reactions, known loads, couples, and driver
effort. S4 consumes the material/section data for analytical stress and safety
factors. S5 loops over supplied samples and records extrema with their sample
and angle. S6 beam/frame elasticity can resolve specified redundant structures.
S7 fatigue, buckling, pin/bearing checks, and gear-specific tooth/contact analysis
remain separate consumers. S1 introduces no stress solver, FEA, or deformation
feedback.

## Verification and handoff

Four new spec files contain **59 passing tests** for material/section properties,
hand-calculable equilibrium, failure statuses, unit/local-frame conversion,
PMKS sample snapshots/cache invalidation, and URL persistence. Every successful
numerical case checks residuals; hand calculations require normalized residual
below 1e-10 and body force/moment residuals below 1e-9. New and existing strict
force results agree on the supported beam fixture. The three new mechanisms
are registered in the generated gallery, whose round-trip checks pass.

The complete run reports **2,553 passed and 3 failed**, across 241 files.
The failures also occurred before implementation: two MotionGen gripper geometry
assertions and the stylesheet fence (99 raw rgba colors versus its 97 limit).
There are no new failing tests. Baseline Windows CRLF failures in generated text
and template parsing were resolved by normalizing the isolated checkout to Git's
existing LF content. The temporary audit-document inventory failure was resolved
by indexing this page.

`e2e/force-units.mjs` passes **20/20 checks**, covering conversion, editing,
shared-URL reload, torque units, and disabled controls. Its screenshots were
inspected. CUA exposed no browser surface, so the tracked Playwright suite used
a disposable browser profile. No new screen or interaction is introduced.

`npm run check` passes (ESLint, stylelint, and Prettier). The production app
and Storybook builds complete successfully; existing size/CommonJS warnings
remain. `git diff --check` passes. Logs and inspected screenshots are in the
worktree's ignored `artifacts/` directory.

### Files added

- `src/app/model/structural/`: `configuration.ts`, `cross-section.ts`, `loads.ts`,
  `structural-properties.ts`, `results.ts`, `pmks-configuration.ts`, and
  `static-force-solver.ts`.
- Tests in that directory: `structural-properties.spec.ts`,
  `static-force-solver.spec.ts`, and `pmks-configuration.spec.ts`.
- `src/app/services/structural-analysis.service.ts`.
- `src/app/services/transcoding/structural-codec.ts` and `url-structural.spec.ts`.
- `src/test-utils/verification/structural-fixtures.ts` and this document.

### Files modified

- `src/app/model/link.ts`: one optional metadata reference and deep sample copies.
- `src/app/services/mechanism.service.ts`: structural metadata in the existing cache signature.
- `src/app/services/transcoding/{transcoder-interface,string-transcoder,mechanism-builder}.ts`:
  versioned structural URL data, validation, and restoration.
- `src/app/services/{url-generation,url-processor}.service.ts`: persist/restore document cases.
- `src/test-utils/url-encoding.ts`: the new service in the test injection context.
- `src/test-utils/verification/fixture-gallery.ts` and `docs/fixture-urls.md`:
  three published structural verification mechanisms.
- `package.json` and `package-lock.json`: pinned matrix dependency and its dependencies.
- `docs/README.md` and `docs/tips-and-tricks.md`: index and durable integration notes.

## S2: inverse dynamics

S2 extends the same rigid-body equilibrium assembly. The legacy force solver,
URL format, structural metadata, position equations, and existing UI remain
unchanged. This is a model/service API milestone, not a new analysis screen.
The published [code style](https://docs.pmksplus.com/?path=/docs/guides-code-style--docs),
[UI guide](https://docs.pmksplus.com/?path=/docs/guides-ui-style-guide--docs), and
[vocabulary](https://docs.pmksplus.com/?path=/docs/guides-vocabulary--docs)
render the repository guides; the implementation follows their model/service
boundaries and explicit refusal rules.

### Legacy dynamics and acceleration audit

The relevant sources are `model/mechanism/force-solver.ts`,
`kinematic-solver.ts`, `position-solver.ts`, `mechanism.ts`,
`services/analysis-sample.service.ts`, and
`model/mechanism/finite-difference-kinematics.ts`.

| Concern | Existing PMKS behavior | S2 behavior |
| --- | --- | --- |
| CoM acceleration | Force series asks KinematicsSolver for each frame's root `linkAccMap`; missing rates fall back to sampled position differences | Consume analytical root accelerations only; unavailable/nonfinite rates are refused |
| Angular acceleration | `linkAngAccMap` in rad/s²; fallback differentiates unwrapped first-two-pin angles | Consume rad/s² directly, with no degree conversion |
| Mass and inertia | Root RealLink `mass`, `massMoI`; independent nonnegative checks | The same authoritative root properties, copied into SI configuration |
| CoM | Actual RealLink CoM; analytic kinematics rigidly transforms a known pin's acceleration to it | The solved root CoM and the existing transformed CoM acceleration |
| Moment reference | Legacy RealLink equations use CoM directly | Shared S1 assembly uses the first frame pin; translate the inertial moment exactly |
| Revolute joints | Shared pin unknowns; free multiway pin uses a star connection | Binary internal pins only, one unknown pair and its exact negative |
| Prismatic joints | Guide-normal reaction, translating block equations, guide couples for welded sliders | Explicitly unsupported |
| Cylinders and slides | Legacy resolves carrier/rider/root bodies and prismatic driver force | Explicitly unsupported; no partial result from supported bodies |
| Frame bodies | A rigid body with two distinct grounded pins is excluded | Preserve S1's exclusion; frame pins support moving bodies |
| Compounds | Root mass/CoM/inertia; no independent leaf equations | Root only, including multi-joint roots; never derive inertia from section/density |
| Drivers | First recognized input/body; revolute torque or prismatic effort | Explicit grounded revolute driver/body incidence; ambiguous PMKS drivers refused |
| Singular supports | A series can retry with an approximate evenest/ridge support split | SVD diagnostics, no numerical reactions for deficient or ill-conditioned systems |
| Geometry units | Legacy force conversion assumes project coordinates | Explicit project/model distinction; remove MODEL_SCALE where appropriate |

The legacy series computes finite-difference fallback data even when analytical
rates are available, and can mix analytical and approximate values by body.
Its three-point second difference supports unequal time steps but substitutes
timestamps for invalid/nonmonotonic input, and uses the nearest interior stencil
at endpoints. Fewer than three samples cannot supply a second derivative.
These are useful display fallbacks, not S2 engineering conventions. S2 neither
repairs timestamps nor substitutes zero for a missing body acceleration.

The existing analytical kinematics uses the loop route for ordinary grounded
cranks, a constant-speed rigid-root route for loopless cranks/compounds, and
differentiated position constraints for coupled mechanisms. It computes
`aG = aP + alpha cross rPG - omega² rPG` using the root's actual CoM.
Angular **position** is stored in degrees; angular acceleration is **rad/s²**.
The drive speed is signed rad/s and PMKS's commanded angular acceleration is
zero. Driven rockers/couplers can nevertheless have nonzero angular acceleration.
No velocity is required by the new pure inverse-dynamics API.

### State, equations, and results

`analyzeDynamic(configuration, states, loadCase)` is pure. Its inputs are:

- The S1 `StructuralConfiguration`, with mandatory `massProperties` on every
  moving body: `massKg`, `centerOfMassM`, and `inertiaKgM2` about CoM.
- Exactly one `BodyDynamicState` per moving root ID, in any order:
  `centerOfMassAccelerationMPerS2` and `angularAccelerationRadPerS2`.
- An ordinary SI `LoadCase`, including optional `gravityMPerS2`.

Keeping mass and CoM in the supplied configuration avoids two competing copies.
The two inputs together are the complete dynamic snapshot. The solver never
reads PMKS links, displayed samples, materials, or rendered geometry.

For a body with first frame pin O and CoM G:

```text
sum Fx = m aGx
sum Fy = m aGy
sum M_O = I_G alpha + (xG - xO) m aGy - (yG - yO) m aGx
```

Gravity is the **known applied force** `m g` at G. It is not subtracted from
or added to the supplied kinematic acceleration. Point loads (global or
link-relative), applied couples, gravity, and inertia all participate in the
required driver torque. Positive x/right, y/up, and counterclockwise moments
are unchanged from S1.

`equilibrium-solver.ts` factors S1's existing topology, load assembly, scaling,
SVD, reaction extraction, and diagnostics. Dynamics supplies inertial targets;
static analysis supplies none. The public `analyzeStatic` function and its
result shape remain unchanged.

`DynamicForceAnalysisResult` is explicitly tagged `mode: 'dynamic'`, including
failures. Success returns `jointReactions`, `driverReactions`, and
`bodyEquilibrium`. The neutral `driverReactions[].momentNm` field means the
required **driver torque**, not a static holding torque. Binary-pin forces are
reported on both bodies as exact negatives of one shared solved unknown.

Each body record contains its moment reference, known applied force/moment,
inertial force/moment target, and force/moment residuals. All those moments use
the stated reference O. Joint/driver records identify the body, so a caller can
reconstruct the complete free-body balance. To recover spatial internal loads
later, retain the configuration and LoadCase as well: a resultant alone cannot
locate multiple point loads.

### Explicit PMKS sample adapter

```typescript
const sample = {
  mechanism: selectedPartition,
  sampleIndex: chosenIndex,
  lengthUnit: LengthUnit.METER,
  coordinateSpace: 'model' as const,
};
const snapshot = snapshotPmksDynamicState(sample);
const result = analyzePmksDynamicFrame(sample, selectedLoadCase);
// Or: structuralAnalysisService.analyzeDynamic(sample, selectedLoadCase)
```

The caller supplies the **Mechanism object representing the selected partition**;
there is no implicit `mechanisms[0]`, displayed time, or singleton lookup.
A successful snapshot also identifies its sample index, time in seconds, and
`accelerationSource: 'pmks-analytical'`. LoadCase forces stay explicit; the
call does not silently collect the drawing's forces. Use
`loadCaseFromPmksForces` with the same sample if those are the intended loads.

`Mechanism.snapshotAccelerations` delegates to `kinematic-snapshot.ts`.
The helper evaluates the existing equations in fresh subclasses of the
kinematic and position solvers, initialized from that mechanism's saved drive
state and loops. A narrow overridable position-rate provider in KinematicsSolver
allows those contexts to remain isolated. It neither resets nor saves/restores
the UI's global maps. Loop and constraint routes are tested out of order with
other mechanisms; frozen source geometry and constraints remain unchanged.
No cache, serialization, undo entry, geometry edit, or asynchronous shared-state
window is introduced.

| Quantity crossing the adapter | Conversion |
| --- | --- |
| Position and CoM | raw coordinate × meters/project-unit ÷ MODEL_SCALE in model space |
| Linear acceleration | raw acceleration × the same distance factor; seconds already apply |
| Angular acceleration | unchanged rad/s² |
| Mass | PMKS mass × existing unit system's massToKg |
| Inertia about CoM | PMKS massMoI × existing inertiaToKgM2; no model-scale factor |

The project unit systems are meters/kg/kg·m², centimeters/g/kg·cm², and
inches/lbm/lbm·in², matching `siUnitFactorsForLength`. In particular, centimeter
mass and inertia have different factors (0.001 and 0.0001). The six combinations
of length unit and coordinate space are tested for CoM, acceleration, mass,
inertia, and reactions. Nonzero angular acceleration is separately verified
against differentiated four-bar closure equations: at the fixture's initial
pose, alphaBC = 0.04544290973869205 and alphaCDL = 0.6462922334444641 rad/s².
Changing sample timestamps does not rescale analytical accelerations.

### Analytical and legacy validation

The pure prescribed-state tests verify equilibrium independently of a position
solver. Such a supplied state is not a proof of kinematic compatibility with
the supports; that remains the responsibility of the upstream kinematic solve.

| Case | Expected result |
| --- | --- |
| A: axial CoM acceleration, m=2 kg, ax=3 m/s² | Rx=6 N, Ry=0, torque=0 |
| B: m=2 kg, ay=4 m/s², G=(1,0) m | Without gravity Ry=8 N and torque=8 N·m; with g=(0,-9.80665), Ry=27.6133 N and torque=27.6133 N·m |
| C: CoM at the grounded pivot, IG=3, alpha=4 | Zero pin force, driver torque=12 N·m |
| D: m=2, G=(1,0.5), IG=0.75, omega=2, alpha=3 | aG=(-5.5,1), pin force=(-11,2) N, driver torque=9.75 N·m |
| D with gravity, -100 N tip load at (2,0), +7 N·m applied couple | Pin force=(-11,121.6133) N; driver torque=222.3633 N·m |
| E: AB/BC two-body assembly | B on AB=(11/3,29/6) N, exact negative on BC; A=(7/3,19/6), C=(-7/3,47/6) N; external force=(0,11) N |
| F: existing welded bell crank, root mass=7, inertia=1.3 | One CDE body, actual solved CoM, no CD/DE leaf states despite deliberately different leaf properties |
| G: zero acceleration, same configuration and LoadCase | S1 and S2 reactions, driver moments, and diagnostics agree |

For D, the worked moment balance is:
`0.75*3 + 1*2 - 0.5*(-11) = 9.75 N·m`.
The additional load/gravity contribution is
`200 + 19.6133 - 7 = 212.6133 N·m`.
For E, the external moment about A is
`4*(47/6) - 3*(-7/3) = 115/3 N·m`, equal to the sum of the two bodies'
inertial moments about A. Tests independently sum every pin, known load, driver
couple, and inertial target and check body residuals.

Legacy comparisons explicitly prepare the existing analytical kinematic solver,
then use `ForceSolver.analyzeFrame(..., 'dynamic', ...)` with no evenest retry.
Crank, loaded four-bar, and bell-crank fixtures are compared at samples 0, 30,
and 90, with gravity both enabled and disabled: 18 complete reaction/driver
comparisons. Both equilibrium solvers consume the same physical kinematics, so
this independently checks force assembly and solution, not the kinematic source.
The hand cases and differentiated loop equations provide the independent
physics references. Agreement uses 1e-8 × max(1, abs(reference)) tolerance.

| Initial eccentric crank quantity | Legacy | S2 | Difference |
| --- | --- | --- | --- |
| Project/SI coordinates, Rx | -8 N | -8 N | <1e-8 N |
| Project/SI, tip load -100 N, gravity off, Ry | 96 N | 96 N | <9.6e-7 N |
| Project/SI, tip load and gravity, driver torque | 219.6133 N·m | 219.6133 N·m | <2.20e-6 N·m |
| Model coordinates, no applied loads, Rx | -1600 N | -8 N | -1592 N (legacy minus S2) |

The last row is intentional. The legacy force path treats model acceleration
as physical project acceleration; its displayed torque correction does not
repair that force error. Multiplying both translational acceleration and lever
arms by MODEL_SCALE can also multiply the translated inertial torque by its
square, while the separately stored IG alpha term is not scaled that way.
S2 removes the coordinate scale at the adapter boundary. It does not alter the
legacy solver or copy its display corrections.

### Diagnostics and limits

S2 retains all S1 topology, rank, residual, and conditioning checks. It adds
`invalid-dynamic-state` for missing/duplicate/wrong body IDs, missing analytical
rates, nonfinite accelerations, unavailable drive state, and invalid sample
selection/time/rate metadata. Missing or negative/nonfinite mass/inertia/CoM
is `invalid-properties`; assembly overflow is `numerical-failure`.
Nonfinite geometry and invalid loads retain their separate statuses.

Zero mass and zero inertia are **explicit idealizations**, independently allowed
as in PMKS: massless links, point masses, and ideal rotational-inertia elements.
Zero is never a substitute for missing data. Structural density/sections do not
fill absent properties or override the PMKS mass model.

Unknown/equation counts, rank, equilibrium deficiency, reaction redundancy,
condition number, characteristic length, and normalized residual remain exposed.
Rank tolerance is 1e-12 relative to the largest singular value, maximum accepted
condition number 1e10, and normalized residual limit 1e-9. Tests include
underconstraint, inconsistent inertia, redundant supports, a singular toggle,
and a full-rank near-toggle rejected for conditioning. Failures carry no
numerical force or driver result.

Supported topology is still revolute rigid roots with binary free pins and
grounded rotational drivers. Sliders, cylinders, friction, flexibility,
impact impulses, redundant reaction sharing, and floating/ambiguous drivers
remain unsupported. PMKS sample adaptation assumes the existing constant-speed
drive convention; prescribed nonzero input angular acceleration is supported
through the pure state API, not invented by the sample adapter.

### Per-sample cost

A diagnostic benchmark runs 25 warmups, then five batches of 50 evaluations,
cycling over five solved samples. These are Windows Node 24.21 / Angular Vitest
measurements, not browser or real-time performance guarantees. Medians in ms:

| Moving bodies | Pure equilibrium | Adapter only | Adapter + equilibrium |
| --- | --- | --- | --- |
| 1, eccentric crank | 0.036 | 0.102 | 0.148 |
| 3, loaded four-bar | 0.117 | 0.118 | 0.264 |
| 5, welded bell crank | 0.113 | 0.168 | 0.319 |

Independent batches include JIT/GC effects, so columns need not add exactly.
Setup/position solving is excluded. Re-run `structural-performance.spec.ts`
with `PMKS_BENCHMARK_STRUCTURAL=1` to write `artifacts/s2-performance.json`.
There is no timing assertion and no premature matrix cache.

### S3 recommendation

Keep N/V/M recovery as a pure downstream consumer of the configuration, complete
LoadCase, and successful S1/S2 result. First define section stations, cut-side
signs, and a mapping from a real body to supported beam segments. Share the
global point-load resolver with equilibrium, retain jumps at point forces and
couples, and validate both ends and independent cut balances. Do not infer a
beam axis for every multi-joint compound.

For **dynamic** cut recovery, m, CoM, and IG alone do not define the distributed
inertial loading. Require an explicit mass distribution and angular velocity
for `a(r) = aG + alpha cross r - omega² r`, or state a deliberate lumped-mass
approximation. That extra velocity input belongs to S3 when it is needed.
Do not silently apply all inertia at CoM and call the resulting diagram exact.
Keep S4 stress, FEA, fatigue, and full-cycle envelopes outside S3.

### S2 verification and file inventory

The targeted run covers the new S2 tests, S0/S1 structural and persistence tests,
and generated fixture gallery: **119/119 passing**. There are 62 tests in the
three new S2 spec files, plus two gallery checks for the additional fixture.
The complete suite reports **2,617 passed, 3 failed / 2,620**, in 244 files
(242 passed, 2 failed).

The baseline was rerun at `79a8ef0c` before S2 edits: **2,553 passed, 3 failed**.
The same assertions fail after S2:

- MotionGen gripper initial gap: 1.036629237211164, expected greater than 2.3.
- MotionGen gripper captured pose error: 1.051501, expected less than 0.0001.
- Raw-color fence: 99 rgba colors, with the actual ceiling **87**. The S0/S1
  prose above reported 97; the fresh baseline log confirms 87. This is a
  correction to that report, not a new stylesheet change.

An initial full-bundle failure in the new snapshot helper was fixed, then the
full suite was rerun. Angular lazy initialization plus Vite's imported-superclass
transform required resolving the constructors locally at invocation time.
The equations did not change. The durable explanation is in tips-and-tricks.

Browser regressions on the worktree server:
`e2e/force-units.mjs` **20/20**, and `e2e/force-analysis-panels.mjs` **15/15**,
with no reported browser errors/issues. Screenshots of the in-motion joint
panel, link force graph, and force-unit settings were inspected. CUA exposed
no browser surface; the tracked suites used disposable Playwright/Chrome
profiles. No motion or gesture behavior was changed.

Final `npm run check` passes (zero errors, the existing 15 ESLint warnings,
stylelint, and Prettier). Production and Storybook builds complete successfully;
existing bundle-size/CommonJS warnings remain. `git diff --check` passes.
The baseline, final full-suite, targeted, build, check, browser, and benchmark
logs are in the worktree's ignored `artifacts/s2-*` files. S2 is kept as a
separate commit after `79a8ef0c`; this work is not pushed.

Added:

- `model/mechanism/kinematic-snapshot.ts`: isolated analytical acceleration context.
- `model/structural/equilibrium-solver.ts`: shared S1/S2 assembly and strict solve.
- `model/structural/dynamic-state.ts`, `dynamic-force-solver.ts`,
  `pmks-dynamic-state.ts`: explicit SI dynamics and selected-sample adapter.
- `model/structural/dynamic-force-solver.spec.ts`,
  `pmks-dynamic-state.spec.ts`, `structural-performance.spec.ts`.

Modified:

- `model/mechanism/kinematic-solver.ts`: overridable position-rate provider only;
  `mechanism.ts`: explicit sample delegation.
- `model/structural/static-force-solver.ts`: stable public wrapper over the shared core;
  `results.ts`: dynamic result, per-body balance, and invalid-state status.
- `services/structural-analysis.service.ts`: explicit dynamic analysis method.
- `test-utils/verification/structural-fixtures.ts` and generated
  `docs/fixture-urls.md`: eccentric dynamic crank in the public gallery.
- This document, `docs/README.md`, and `docs/tips-and-tricks.md`.

All `model/` and `services/` paths above are under `src/app/`;
`test-utils/` is under `src/`. No dependency, persistence, legacy force-solver,
component, stylesheet, or hub-service changes are part of S2.
