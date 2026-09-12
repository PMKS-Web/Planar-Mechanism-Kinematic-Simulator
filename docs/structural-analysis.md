# Structural analysis: S0 and S1

> **Status:** Built — S0 and S1 implemented on `feature/structural-analysis`, based on `origin/staging` at `acba1b77`. S2–S7 remain future work.

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

## S2 and later phases

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
