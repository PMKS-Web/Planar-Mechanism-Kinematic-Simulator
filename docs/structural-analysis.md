# Structural analysis: S0 through S3

> **Status:** Built — S0/S1, S2 inverse dynamics, and S3 internal member loads on `feature/structural-analysis`, based on `origin/staging` at `acba1b77`. S0/S1 is commit `79a8ef0c`, S2 is `f97d275a`, and S3 follows separately. S4–S7 remain future work.

## S3 geometry audit and conventions (implementation contract)

The audit inspected `link.ts`, `compound-link-path.ts`, `uniform-body.ts`,
`structural/configuration.ts`, `pmks-configuration.ts`, and the shared
equilibrium assembly. A rigid body has pins and mass properties; it does not
carry a general beam path or a load-transfer graph for its constituent bars.

| PMKS representation | S3 V1 interpretation |
| --- | --- |
| Simple RealLink, exactly two revolute pins | Candidate only: caller explicitly declares a straight prismatic member between those pins |
| Rounded ends / generated SVG hull / object scale | Rendering, not a cross section, mass distribution, or structural boundary |
| Circular/disc drawing or cylinder skin | No automatic straight-member mapping |
| Multi-pin root, including collinear tracers | Refuse automatic mapping; explicit decomposition is future work |
| Welded root with subset leaves | Refuse one-axis recovery, even if it has only two external pins |
| A constituent leaf passed separately | Not an independent root; no inferred reaction transfer from its parent |
| Slider, cylinder, gear | Outside the initial member model |
| Structural metadata on Link/root | Copy material/section data; do not infer them from the outline |
| Joint coordinates and S1 frame | Global y-up SI snapshot; S1 local load frame is its first named pin toward its second |

For member A→B, x=0 at A, x=L at B, e=(B-A)/L, n=(-e.y,e.x).
Always cut the A-side segment. Its exposed face carries **+N along e**,
**positive V opposite n**, and **positive M counterclockwise**. N is positive
in tension; M is positive sagging for the ordinary horizontal simply supported
beam. Thus N=-sum Fx, V=sum Fy, and M=-sum moments about the cut.

```text
      +n ↑                  cut force: N →, V ↓
 A ●───────────────│        cut couple: M ↺
   └──── +e → ─────┘
```

Off-axis point loads transfer at their projection s onto the axis, with
equivalent couple -yOffset*Fx. This explicitly assumes a rigid load arm.
Projections outside [0,L] are refused. A free body-level applied couple has no
spatial location: S3 requires its optional application point to be supplied.
S1/S2 continue to accept unlocated couples.

Events distinguish x-minus (exclude the event) and x-plus (include it).
Endpoints include the exterior limits 0-minus and L-plus, which should be zero
for a balanced member; 0-plus and L-minus are the interior end loads.
Static gravity is explicitly either lumped at the authoritative CoM or uniform
line gravity with validated mass distribution. Lumped gravity is not exact
distributed self-weight.

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
  -> S3 internal member loads -> future stress -> engineering checks -> UI
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

## S3 Internal Loads

S3 implements both static recovery and exact dynamic recovery **within the
explicit uniform-line model**. It consumes reactions from a successful S1/S2
result and the original configuration and LoadCase. It never solves reactions
again. The geometry audit and sign contract at the beginning of this document
were recorded before the section-cut implementation.

### Physical member and public API

`StructuralMember` declares `kind: 'straight-prismatic'`, a member `id`,
`bodyId`, `startJointId`, and `endJointId`. `resolveStructuralMember` produces
copied SI endpoints, unit axial/transverse vectors, length, and a deep copy of
the root's optional material/cross-section metadata. Neither a material nor a
section is required to compute loads. They will be required by the relevant S4
stress calculation. No density-derived mass is substituted.

The member must span one complete two-pin revolute root. The PMKS adapter
records whether its source is simple, multi-pin, compound, or non-beam, so even
a compound with two external pins is refused. A pure caller explicitly takes
responsibility for the declared straight prismatic interpretation. The current
`uniformBodyOf` helper can calculate rod or convex-hull plate mass properties;
that does not supply a structural decomposition for a multi-pin body. Similarly,
the compound outline is a rendering union, not a beam load-transfer graph.

```ts
const member: StructuralMember = {
  kind: 'straight-prismatic', id: 'member-AB', bodyId: 'AB',
  startJointId: 'A', endJointId: 'B',
};
const equilibrium = analyzeStatic(configuration, loadCase);
const diagram = recoverStaticMemberLoads(configuration, member, loadCase, equilibrium);
if (diagram.status === 'ok') {
  const section = evaluateMemberLoads(diagram, { xM: 0.8, side: 'left' });
}
```

For dynamics, use `snapshotPmksMemberMotion(selectedSample)`, pass its
configuration and states to `analyzeDynamic`, then call
`recoverDynamicMemberLoads(configuration, member, loadCase, equilibrium,
selectedBodyMotion, { massDistribution })`. This explicit sequence ensures one
selected partition/sample supplies geometry and all rates. It introduces no
active-selection lookup, global mutable state, or UI dependency.

### Cuts, events, and exact intervals

With local axes e and n from the audit, transform a global force with dot
products: Fx=F dot e and Fy=F dot n. On the A-side segment the exposed cut load
is N e - V n, with moment +M CCW. For effective line loads qx(s), qy(s), point
forces (Fxi,Fyi) at si, and axis couples Ci:

```text
N(x) = -sum Fxi - integral[0,x] qx(s) ds
V(x) =  sum Fyi + integral[0,x] qy(s) ds
M(x) =  sum ((x-si) Fyi - Ci) + integral[0,x] (x-s) qy(s) ds
```

The sums include events strictly before x for a left limit, and events at x
for a right limit. Loads include supplied body-side joint reactions, driver
couples at their actual pins, point forces, and located free couples. The shared
`load-coordinates.ts` resolver gives S1/S2/S3 identical global/link-frame
interpretations. Off-axis application uses the rigid-arm transfer described
above, including its -yOffset*Fx couple; a projection outside the member span
is refused. Explicit free-couple locations are optional for legacy S1/S2 and
mandatory for S3. Their optional `at` field round-trips through existing T1
load-case persistence without a version change.

At each event, jumps are deltaN=-Fx, deltaV=Fy, deltaM=-C. Coincident actions
share an event with their source labels retained. Distinct interior coordinates
remain distinct, including nearby loads. Endpoint projections alone snap within
max(1e-12 m, 1e-12 L). Queries never silently snap; `side` is mandatory.

`events` contain both limits at 0, each load/couple position, and L. `segments`
contain polynomial coefficients in ascending powers of **u=x-startM**. N and V
are at most quadratic and M at most cubic. This supports arbitrary station
queries and future plotting without sampling away a discontinuity or asking a
component to recompute physics. At a constant-load interval, dM/dx=V;
generally dN/dx=-qx and dV/dx=qy.

Each component exposes signed `minimum` and `maximum`, and nonnegative
`absoluteMaximum`, with event-side/interior locations and any whole constant
intervals. Stationary points are found analytically from polynomial derivatives.
Locations matching within 1e-10 times max(1, magnitude) are retained as ties.
Constant intervals describe their interiors; endpoint sides remain explicit.
The zero exterior limits participate in extrema, so no tensile/compressive
demand gives a zero positive/negative envelope. For an absolute maximum, use
the returned station to recover its signed value when S4 needs it.

### Worked static shear/moment diagram

The gallery's supported 4 m beam has a downward 100 N point load at x=1 m.
Its S1 vertical reactions are +75 N at A and +25 N at B, with zero axial load.

| Station | N (N) | V (N) | M (N m) |
| --- | --- | --- | --- |
| 0-minus, exterior | 0 | 0 | 0 |
| 0-plus | 0 | 75 | 0 |
| 1-minus | 0 | 75 | 75 |
| 1-plus | 0 | -25 | 75 |
| 4-minus | 0 | -25 | 0 |
| 4-plus, exterior | 0 | 0 | 0 |

Thus V=75 on (0,1), V=-25 on (1,4), M=75x before the load,
and M=100-25x after it. Maximum |V| is 75 N throughout (0,1), and
maximum |M| is 75 N m at x=1. A +12 N m located couple, independently
tested, produces a -12 N m moment jump with no shear jump.

### Gravity, mass distribution, and dynamics

Gravity requires an explicit `gravityModel`. `lumped-at-com` puts m g at the
authoritative CoM and labels the result accordingly. It represents that lumped
load system, not exact distributed self-weight. `uniform-line` applies mu g
along the axis and requires the same validated distribution as dynamics.

`MemberMassDistribution` currently has only `{ kind: 'uniform-line', memberId }`.
It has **no second mass field**: mu=m/L uses the authoritative root mass. The
line integrates to m, midpoint CoM, and IG=m L²/12. CoM tolerance is
max(1e-12 m, 1e-8 L); inertia tolerance is max(1e-12 kg m²,
1e-8 max(IG, implied IG)). Mismatches report their errors and refuse recovery;
mass properties are never rescaled or relocated. This is a slender line
idealization, not a finite-width mass model. A zero-mass line is permitted only
with consistent zero inertia and its declared midpoint; zero never fills a
missing input.

`BodySectionMotionState` extends the acceleration state with signed CCW-positive
`angularVelocityRadPerS`. The PMKS adapter reads the existing analytical
`linkAngVelMap` from the same isolated kinematic evaluation as the accelerations.
It uses neither finite differences nor a fallback zero. S2's public snapshot
shape and acceleration-only requirement remain unchanged. Tests cover both
velocity signs, selected samples, meters/centimeters/inches, and model/project
coordinates with MODEL_SCALE removed at the SI boundary.

For a line point s, r=(s-L/2)e relative to the validated CoM. The material
acceleration is aG + alpha cross r - omega² r. In member axes, the effective
applied-minus-inertial line load is:

```text
qx(s) = mu gx - mu (aGx - omega² (s-L/2))
qy(s) = mu gy - mu (aGy + alpha (s-L/2))
```

Omit the g terms for no gravity or for separately lumped gravity. These affine
fields are integrated in closed form in the cut equations. There is no CoM
lumped-inertia substitute and no visually sampled pseudo-load.

Hand-integrated 2 kg, 2 m rod cases, with x in meters:

| Motion | Internal loads |
| --- | --- |
| Translation aGx=3, omega=alpha=0 | N=-6+3x; V=M=0 |
| Angular acceleration about A: alpha=3, aGy=3, omega=0 | V=6-1.5x²; M=-8+6x-0.5x³ |
| Steady rotation about A: omega=±2, aGx=-4, alpha=0 | N=8-2x²; V=M=0 |

Additional tests combine gravity, both inertial terms, off-axis loading, and a
couple; find an interior cubic-moment maximum and an interior centripetal axial
maximum; and reduce zero-motion dynamic recovery to static recovery.

### Independent verification and diagnostics

The test helper rebuilds original load positions and global forces independently
of the production resolver and diagram coefficients. It checks both sides of
every event, both ends, and four arbitrary interior cuts. For dynamic cuts it
integrates the actual mass acceleration and moment with an independent Simpson
integral (exact for these polynomial integrands). This verifies global force and
moment equilibrium, including off-axis arms, and directly bridges S1/S2 joint
reactions to the member's interior endpoint loads.

Static tests cover A tension, B cantilever tip load, C supported point load,
D couple, E combined loading, F off-axis loading, and G lumped gravity.
Dynamic tests cover H translation, I angular acceleration, J centripetal force,
and K inconsistent mass properties. Other checks cover orientation reversal,
world rotation/translation, event jumps/coincidence, nonzero PMKS samples,
immutable inputs, legacy couple persistence, and interpretation refusals.

Recovery also verifies complete, nonduplicated reaction/driver identities and
whole-member closure. Its closure residual is max(|N(L+)|, |V(L+)|,
|M(L+)|/L), normalized by a force scale from all point/couple and line actions
(at least 1 N); acceptance limit is 1e-8. Tests require less than 1e-10 for
their successful cases. This detects inconsistent supplied reactions/loads/
motion without resolving them. Callers still must supply one matching sample:
whole-body balance alone cannot identify spatially different load systems with
the same resultant.

Failures return only a status and message, never a partial diagram. Added
statuses include `unsupported-member-geometry`, `ambiguous-member-mapping`,
`invalid-station`, `load-not-on-supported-member`, `missing-mass-distribution`,
`mass-distribution-mismatch`, `missing-angular-velocity`, `unsupported-compound`,
`missing-gravity-model`, `invalid-equilibrium-result`, and
`upstream-analysis-failed`. Existing geometry, property, load, dynamic-state,
and numerical-failure diagnoses remain available. Nonfinite input, integration
overflow, unavailable rates, unsupported roots, or unlocated couples fail closed.

### Cost and current limitations

Windows Node 24.21 / Angular Vitest medians, 25 warmups followed by five batches
of 100 operations, with already-computed S1/S2 reactions:

| Interior point loads | Static recovery (ms/member/sample) | Dynamic recovery | One station query |
| --- | --- | --- | --- |
| 1 | 0.0653 | 0.0561 | 0.00100 |
| 10 | 0.1061 | 0.0853 | 0.00060 |

These include validation, event construction, integration, and extrema; exclude
position solving, motion adaptation, and SVD. Small timings include JIT/GC
variation, not a guaranteed ordering or frame budget. Run
`member-performance.spec.ts` with `PMKS_BENCHMARK_MEMBER=1` to reproduce
`artifacts/s3-performance.json`. There is no machine-speed test or shared cache.

PMKS rounds some solved pin coordinates to four decimal places in raw model
coordinates (`PositionSolver.incrementRevInput`). Transported CoM and stored
inertia can then disagree with a uniform line through those pins. A project-meter
2 m rod at sample 30, for example, has midpoint error 0.0000213010 m and inertia
error 0.0000284017 kg m²: S2 succeeds, but exact S3 explicitly refuses that pose.
A nonzero model-centimeter sample that meets the same tolerance is verified
successfully. S3 does not loosen the mass check, move pins, or repair root
properties to hide this limitation. A later precision change needs separate
kinematic verification before promising full-cycle exact recovery.

No branched/multi-pin/compound decomposition, arbitrary distributed loads,
nonuniform or point-mass distributions, sliders/cylinders/gears, finite-width
inertia, stress, deformation, FEA, fatigue, or full-cycle envelope is implemented.
Off-axis loads assume a rigid arm whose own structural loads are not recovered.
The sample adapter retains PMKS's constant-speed drive convention; independently
prescribed consistent motion is available through the pure API. Prismatic section
and material data remain optional metadata and are not inferred from rendering.

### S3 file inventory and S4 recommendation

Added under `src/app/model/structural/`:

- `load-coordinates.ts`: shared body/local load interpretation.
- `member.ts`, `member-mass.ts`, `member-results.ts`: explicit geometry,
  authoritative-mass distribution validation, motion extension, and results.
- `member-diagram.ts`, `member-load-recovery.ts`: event/segment integration,
  arbitrary station evaluation, extrema, and downstream static/dynamic APIs.
- `member-load-recovery.spec.ts`, `member-dynamics.spec.ts`,
  `member-adapter.spec.ts`, `member-performance.spec.ts`.

Also added `src/test-utils/verification/member-verification.ts`, the independent
cut-equilibrium oracle. Modified `configuration.ts` and `pmks-configuration.ts`
to retain geometry provenance; `loads.ts` for optional couple positions;
`equilibrium-solver.ts` to reuse the resolver; `pmks-dynamic-state.ts` and
`model/mechanism/kinematic-snapshot.ts` for the analytical velocity extension.
Updated `structural-fixtures.ts`, generated `docs/fixture-urls.md`, this document,
`docs/README.md`, and `docs/tips-and-tricks.md`. No dependency, legacy force-solver,
component, stylesheet, or hub-service change is part of S3.

S4 should be another pure downstream module: successful S3 result plus validated
cross section/material and explicit section coordinates yields signed stress
at a requested station/side. Reuse `evaluateMemberLoads`, preserve provenance
(`mode`, gravity model, mass model), and keep section-specific axial/bending/shear
relations separate from material failure criteria. Compute combined stress and
factor of safety only for explicitly supported sections/criteria. Load extrema
alone need not locate every combined-stress maximum; S4 should evaluate its own
critical points over S3's exact intervals and both sides of jumps. Keep UI
formatting, future cycle aggregation, and compound load transfer separate.

### S3 verification results

All **188/188** tests in the targeted structural, persistence, verification, and
fixture-gallery run pass. S3 adds 53 tests in four new spec files and two
gallery checks. The full PMKS suite reports **2,672 passed, 3 failed / 2,675**
in 248 files (246 passed, 2 failed). Before any S3 code change, the preserved
S2 commit `f97d275a` was rerun: **2,617 passed, 3 failed / 2,620**. The same
three assertions fail with identical values:

- MotionGen gripper initial gap: 1.036629237211164, expected greater than 2.3.
- MotionGen gripper captured pose error: 1.051501, expected less than 0.0001.
- Stylesheet raw rgba count: 99, expected at most 87.

Production and Storybook builds succeed with existing size/CommonJS warnings.
`npm run check` passes with zero errors, the existing 15 ESLint warnings,
stylelint, and Prettier. `git diff --check` passes.
Browser suites on `http://localhost:4347` pass: `e2e/force-units.mjs` **20/20**,
`e2e/force-analysis-panels.mjs` **15/15**, no reported page errors or issues.
The in-motion joint panel, link force graph, and metric kgf settings screenshots
were inspected. CUA again exposed no app/browser surface, so the tracked suites
used disposable Playwright/Chrome profiles. No animation or gesture changed.

The implementation follows the repository code/style/vocabulary documents
published in the requested PMKS documentation gallery. Verification logs,
benchmark JSON, and browser artifacts are in the worktree's ignored `artifacts/`
directory (`s3-*`, `force-units/`, and `screenshots/s3-force-panels-*`). The S0/S1
and S2 reports above remain historical records. S3 is a separate commit after
`f97d275a`, with no squash or push.
